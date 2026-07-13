import { useState, useEffect } from "react";
import { useScadStore, FileItem } from "@/store/scadStore";
import {
  isFileSystemAccessSupported,
  syncDirectoryHandleToBrowserFS,
} from "@/lib/fs/fileSystemAccess";
import JSZip from "jszip";

const getBfs = () => {
  const windowObj = (typeof window === "object" ? window : self) as any;
  return windowObj.BrowserFS ? windowObj.BrowserFS.BFSRequire("fs") : null;
};

export function Sidebar() {
  const { filesList, setFilesList, activeFilePath, openFile, closeFile, setScadCode } =
    useScadStore();

  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedFolderForNewItem, setSelectedFolderForNewItem] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const bfs = getBfs();

  const refreshFileTree = () => {
    if (!bfs) return;
    const tree = readBfsDirectoryTree(bfs, "/");
    setFilesList(tree);
  };

  useEffect(() => {
    refreshFileTree();
  }, []);

  const readBfsDirectoryTree = (fs: any, dirPath = "/"): FileItem[] => {
    const items: FileItem[] = [];
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        if (
          entry === "tmp" ||
          entry === "locale" ||
          entry === "libraries" ||
          entry === "lost+found" ||
          entry.startsWith(".")
        ) {
          continue;
        }
        const fullPath = dirPath === "/" ? `/${entry}` : `${dirPath}/${entry}`;
        const stat = fs.lstatSync(fullPath);
        const isDir = stat.isDirectory();
        items.push({
          name: entry,
          path: fullPath,
          isDir,
          children: isDir ? readBfsDirectoryTree(fs, fullPath) : undefined,
        });
      }
    } catch (e) {
      console.error("Error reading BFS directory tree:", e);
    }
    return items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const handleOpenLocalDirectory = async () => {
    if (!isFileSystemAccessSupported) {
      alert(
        "File System Access API is not supported in this browser. Please map files individually or use Chrome/Edge for local folder mapping.",
      );
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (bfs) {
        await syncDirectoryHandleToBrowserFS(handle, bfs, "/");
        refreshFileTree();
        const rootFiles = bfs.readdirSync("/");
        const scadFile = rootFiles.find((f: string) => f.endsWith(".scad"));
        if (scadFile) {
          handleOpenFile(`/${scadFile}`);
        }
      }
    } catch (err) {
      console.error("Error choosing directory:", err);
    }
  };

  const handleOpenFile = (path: string) => {
    if (!bfs) return;
    try {
      const content = bfs.readFileSync(path, { encoding: "utf8" });
      openFile(path);
      setScadCode(content);
    } catch (e) {
      console.error("Error opening file:", e);
    }
  };

  const handleCreateFile = () => {
    if (!bfs || !newFileName) return;
    const cleanName = newFileName.trim();
    const parent = selectedFolderForNewItem === "/" ? "" : selectedFolderForNewItem;
    const fullPath = `${parent}/${cleanName}`;

    try {
      bfs.writeFileSync(fullPath, "");
      setNewFileName("");
      setIsCreatingFile(false);
      refreshFileTree();
      handleOpenFile(fullPath);
    } catch (e: any) {
      alert(`Failed to create file: ${e.message}`);
    }
  };

  const handleCreateFolder = () => {
    if (!bfs || !newFileName) return;
    const cleanName = newFileName.trim();
    const parent = selectedFolderForNewItem === "/" ? "" : selectedFolderForNewItem;
    const fullPath = `${parent}/${cleanName}`;

    try {
      bfs.mkdirSync(fullPath);
      setNewFileName("");
      setIsCreatingFolder(false);
      refreshFileTree();
    } catch (e: any) {
      alert(`Failed to create folder: ${e.message}`);
    }
  };

  const handleDeleteItem = (path: string, isDir: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bfs) return;
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;

    try {
      if (isDir) {
        bfs.rmdirSync(path);
      } else {
        bfs.unlinkSync(path);
        closeFile(path);
      }
      refreshFileTree();
    } catch (err: any) {
      alert(`Failed to delete item: ${err.message}`);
    }
  };

  const addZipFolder = async (fs: any, currentPath: string, zipFolder: JSZip) => {
    const entries = fs.readdirSync(currentPath);
    for (const entry of entries) {
      if (
        entry === "tmp" ||
        entry === "locale" ||
        entry === "libraries" ||
        entry === "lost+found" ||
        entry.startsWith(".")
      ) {
        continue;
      }
      const fullPath = currentPath === "/" ? `/${entry}` : `${currentPath}/${entry}`;
      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        const nextZipFolder = zipFolder.folder(entry);
        if (nextZipFolder) {
          await addZipFolder(fs, fullPath, nextZipFolder);
        }
      } else {
        const content = fs.readFileSync(fullPath);
        zipFolder.file(entry, content);
      }
    }
  };

  const handleExportZip = async () => {
    if (!bfs) return;
    const zip = new JSZip();
    await addZipFolder(bfs, "/", zip);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "project.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleFolderCollapse = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Filter items based on search query
  const filterTree = (nodes: FileItem[], query: string): FileItem[] => {
    if (!query) return nodes;
    const lowerQuery = query.toLowerCase();
    return nodes
      .map((node) => {
        if (node.isDir && node.children) {
          const filteredChildren = filterTree(node.children, query);
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lowerQuery)) {
            return { ...node, children: filteredChildren };
          }
        } else if (node.name.toLowerCase().includes(lowerQuery)) {
          return node;
        }
        return null;
      })
      .filter((node): node is FileItem => node !== null);
  };

  const renderTreeNodes = (nodes: FileItem[]) => {
    return nodes.map((node) => {
      const isCollapsed = collapsedFolders[node.path] ?? false;
      const isActive = activeFilePath === node.path;

      return (
        <div key={node.path} className="pl-1 select-none">
          <div
            className={`group/item flex items-center justify-between py-1 px-3 rounded cursor-pointer transition-all duration-100 ${
              isActive
                ? "bg-[#2a2015] text-scad-amber font-semibold border-none"
                : "text-zinc-400 hover:text-zinc-250 hover:bg-[#131924]/20"
            }`}
            onClick={(e) => {
              if (node.isDir) {
                toggleFolderCollapse(node.path, e);
              } else {
                handleOpenFile(node.path);
              }
            }}
          >
            <div className="flex items-center space-x-2 truncate flex-1 text-[11px] font-mono">
              {/* Amber Dot indicator matching the ScadForge file row style */}
              <span className="text-scad-amber text-[10px] leading-none select-none">●</span>
              <span className="truncate">{node.name}</span>
            </div>

            {/* Flat delete action button */}
            <div className="flex items-center space-x-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleDeleteItem(node.path, node.isDir, e)}
                className={`p-0.5 rounded transition-colors ${
                  isActive
                    ? "text-scad-amber/80 hover:text-scad-amber hover:bg-white/5"
                    : "text-zinc-650 hover:text-red-400 hover:bg-[#1a2232]"
                }`}
                title="Delete"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
          {node.isDir && !isCollapsed && node.children && node.children.length > 0 && (
            <div className="border-l border-zinc-800 ml-1.5 mt-0.5 pl-0.5">
              {renderTreeNodes(node.children)}
            </div>
          )}
        </div>
      );
    });
  };

  const filteredTree = filterTree(filesList, searchQuery);

  return (
    <div className="flex flex-col h-full bg-panel-bg w-full text-zinc-350">
      {/* File Action Buttons Panel matching the design mock */}
      <div className="p-3 border-b border-border-figma flex space-x-2">
        <button
          onClick={() => {
            setSelectedFolderForNewItem("/");
            setIsCreatingFile(true);
            setIsCreatingFolder(false);
          }}
          className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
        >
          + New
        </button>
        <button
          onClick={handleOpenLocalDirectory}
          className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
        >
          ↑ Upload
        </button>
      </div>

      {/* Creation fields modal */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-3 bg-[#141822] border-b border-border-figma space-y-2">
          <span className="text-[9px] text-scad-amber font-bold uppercase tracking-wider block">
            New {isCreatingFile ? "File" : "Folder"}
          </span>
          <div className="flex items-center space-x-1">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={isCreatingFile ? "model.scad" : "components"}
              className="bg-[#0b0e14] border border-border-figma text-zinc-150 rounded py-0.5 px-2 text-[11px] flex-1 focus:outline-none focus:border-scad-amber"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (isCreatingFile) {
                    handleCreateFile();
                  } else {
                    handleCreateFolder();
                  }
                } else if (e.key === "Escape") {
                  setIsCreatingFile(false);
                  setIsCreatingFolder(false);
                  setNewFileName("");
                }
              }}
            />
          </div>
          <div className="flex justify-end space-x-1.5">
            <button
              onClick={() => {
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
                setNewFileName("");
              }}
              className="py-0.5 px-2 bg-zinc-800 hover:bg-[#383838] text-zinc-400 rounded text-[9px]"
            >
              Cancel
            </button>
            <button
              onClick={isCreatingFile ? handleCreateFile : handleCreateFolder}
              className="py-0.5 px-2 bg-scad-amber text-[#0b0e14] font-bold rounded text-[9px]"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Sources Flat Section List */}
      <div className="p-3 select-none">
        <h3 className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase font-sans mb-2">
          SOURCES
        </h3>
        <div className="space-y-0.5">
          {filteredTree.length === 0 ? (
            <div className="text-zinc-650 italic text-[10px] pl-3 py-1">No files available</div>
          ) : (
            renderTreeNodes(filteredTree)
          )}
        </div>
      </div>

      {/* References Info block matching mockup */}
      <div className="p-3 border-t border-border-figma/40 bg-[#0d1117]/30 select-none">
        <h3 className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase font-sans mb-1.5">
          REFERENCES
        </h3>
        <p className="text-[10px] text-zinc-550 leading-relaxed font-sans">
          Upload STL/OFF/DXF/SVG/PNG to include or import from your .scad code.
        </p>
      </div>

      {/* Search and Backup options */}
      <div className="mt-auto p-3 border-t border-border-figma bg-[#0d1117]/20 flex flex-col space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search Sources"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#131720] border border-border-figma hover:border-zinc-700 focus:border-scad-amber text-zinc-200 rounded py-0.5 pl-6 text-[10px] focus:outline-none transition-colors font-sans"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-1.5 top-1 h-3 w-3 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <button
          onClick={handleExportZip}
          className="w-full text-center flex items-center justify-center space-x-1 bg-[#131924] hover:bg-[#1a2232] text-zinc-400 font-semibold py-1 rounded text-[10px] border border-border-figma hover:text-zinc-250 transition-colors"
        >
          <span>Backup ZIP</span>
        </button>
      </div>
    </div>
  );
}

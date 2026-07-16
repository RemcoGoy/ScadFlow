import { useState, useEffect } from "react";
import { useScadStore, FileItem } from "@/store/scadStore";
import { isFileSystemAccessSupported, syncDirectoryHandleToOpfs } from "@/lib/fs/fileSystemAccess";
import { opfs } from "@/lib/fs/opfs";
import JSZip from "jszip";

export function Sidebar() {
  const { filesList, setFilesList, activeFilePath, openFile, closeFile, setScadCode } =
    useScadStore();

  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedFolderForNewItem, setSelectedFolderForNewItem] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Renaming state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [isDragging, setIsDragging] = useState(false);

  const refreshFileTree = async () => {
    const tree = await readOpfsDirectoryTree("/");
    setFilesList(tree);
  };

  useEffect(() => {
    refreshFileTree();

    const handleUpdate = () => refreshFileTree();
    window.addEventListener("fs-update", handleUpdate);
    return () => window.removeEventListener("fs-update", handleUpdate);
  }, []);

  const readOpfsDirectoryTree = async (dirPath = "/"): Promise<FileItem[]> => {
    try {
      const items = await opfs.readdirTree(dirPath);
      // Filter out internal directories
      return filterInternalNodes(items);
    } catch (e) {
      console.error("Error reading OPFS directory tree:", e);
      return [];
    }
  };

  const filterInternalNodes = (nodes: FileItem[]): FileItem[] => {
    return nodes.filter((node) => {
      const name = node.name;
      if (
        name === "tmp" ||
        name === "locale" ||
        name === "libraries" ||
        name === "lost+found" ||
        name.startsWith(".")
      ) {
        return false;
      }
      if (node.children) {
        node.children = filterInternalNodes(node.children);
      }
      return true;
    });
  };

  const handleOpenLocalDirectory = async () => {
    if (!isFileSystemAccessSupported) {
      alert(
        "File System Access API is not supported in this browser. Please use Drag and Drop to upload files.",
      );
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker();
      await syncDirectoryHandleToOpfs(handle, "/");
      await refreshFileTree();
    } catch (err) {
      console.error("Error choosing directory:", err);
    }
  };

  const handleOpenFile = async (path: string) => {
    try {
      const content = await opfs.readFile(path);
      openFile(path);
      setScadCode(content);
    } catch (e) {
      console.error("Error opening file:", e);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName) return;
    const cleanName = newFileName.trim();
    const parent = selectedFolderForNewItem === "/" ? "" : selectedFolderForNewItem;
    const fullPath = `${parent}/${cleanName}`;

    try {
      await opfs.writeFile(fullPath, "");
      setNewFileName("");
      setIsCreatingFile(false);
      await refreshFileTree();
      await handleOpenFile(fullPath);
    } catch (e: any) {
      alert(`Failed to create file: ${e.message}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFileName) return;
    const cleanName = newFileName.trim();
    const parent = selectedFolderForNewItem === "/" ? "" : selectedFolderForNewItem;
    const fullPath = `${parent}/${cleanName}`;

    try {
      await opfs.mkdir(fullPath);
      setNewFileName("");
      setIsCreatingFolder(false);
      await refreshFileTree();
    } catch (e: any) {
      alert(`Failed to create folder: ${e.message}`);
    }
  };

  const handleDeleteItem = async (path: string, isDir: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;

    try {
      if (isDir) {
        await opfs.rmdir(path);
      } else {
        await opfs.unlink(path);
        closeFile(path);
      }
      await refreshFileTree();
    } catch (err: any) {
      alert(`Failed to delete item: ${err.message}`);
    }
  };

  const handleRenameSubmit = async (oldPath: string) => {
    if (!renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const parentDir = oldPath.split("/").slice(0, -1).join("/");
    const newPath = `${parentDir}/${renameValue.trim()}`;

    if (newPath === oldPath) {
      setRenamingPath(null);
      return;
    }

    try {
      await opfs.rename(oldPath, newPath);
      setRenamingPath(null);

      // Update open files state if renaming an open file
      if (activeFilePath === oldPath) {
        closeFile(oldPath);
        openFile(newPath);
      }

      await refreshFileTree();
    } catch (err: any) {
      alert(`Rename failed: ${err.message}`);
    }
  };

  const addZipFolder = async (nodes: FileItem[], zipFolder: JSZip) => {
    for (const node of nodes) {
      if (node.isDir && node.children) {
        const nextZipFolder = zipFolder.folder(node.name);
        if (nextZipFolder) {
          await addZipFolder(node.children, nextZipFolder);
        }
      } else {
        const content = await opfs.readFileBuffer(node.path);
        zipFolder.file(node.name, content);
      }
    }
  };

  const handleExportZip = async () => {
    const zip = new JSZip();
    const tree = await readOpfsDirectoryTree("/");
    await addZipFolder(tree, zip);

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

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.items) {
      const promises = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            promises.push(
              (async () => {
                const buffer = await file.arrayBuffer();
                const fullPath = `/${file.name}`;
                await opfs.writeFile(fullPath, buffer);
              })(),
            );
          }
        }
      }
      await Promise.all(promises);
      await refreshFileTree();
    }
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
      const isRenaming = renamingPath === node.path;

      return (
        <div key={node.path} className="pl-1 select-none">
          <div
            className={`group/item flex items-center justify-between py-1 px-3 rounded cursor-pointer transition-all duration-100 ${
              isActive
                ? "bg-[#2a2015] text-scad-amber font-semibold border-none"
                : "text-zinc-400 hover:text-zinc-250 hover:bg-[#131924]/20"
            }`}
            onClick={(e) => {
              if (isRenaming) return;
              if (node.isDir) {
                toggleFolderCollapse(node.path, e);
              } else {
                handleOpenFile(node.path);
              }
            }}
          >
            <div className="flex items-center space-x-2 truncate flex-1 text-[11px] font-mono">
              <span className="text-scad-amber text-[10px] leading-none select-none">●</span>

              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameSubmit(node.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(node.path);
                    if (e.key === "Escape") setRenamingPath(null);
                  }}
                  autoFocus
                  className="bg-[#0b0e14] text-zinc-100 border border-scad-amber rounded px-1 py-0.5 outline-none flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate">{node.name}</span>
              )}
            </div>

            {/* Actions */}
            {!isRenaming && (
              <div className="flex items-center space-x-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                {/* Rename Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameValue(node.name);
                    setRenamingPath(node.path);
                  }}
                  className={`p-0.5 rounded transition-colors ${
                    isActive
                      ? "text-scad-amber/80 hover:text-scad-amber hover:bg-white/5"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-[#1a2232]"
                  }`}
                  title="Rename"
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>

                {/* Delete Button */}
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
            )}
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
    <div
      className={`flex flex-col h-full bg-panel-bg w-full text-zinc-350 transition-colors ${isDragging ? "bg-[#1d2737] ring-inset ring-2 ring-scad-amber/50" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
          + File
        </button>
        <button
          onClick={() => {
            setSelectedFolderForNewItem("/");
            setIsCreatingFolder(true);
            setIsCreatingFile(false);
          }}
          className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
        >
          + Folder
        </button>
        <button
          onClick={handleOpenLocalDirectory}
          className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
        >
          ↑ Sync Dir
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

      {/* Drag overlay indicator */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none border-2 border-scad-amber border-dashed">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-scad-amber mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm font-semibold text-white">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Sources Flat Section List */}
      <div className="p-3 select-none flex-1 overflow-y-auto">
        <h3 className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase font-sans mb-2">
          SOURCES
        </h3>
        <div className="space-y-0.5">
          {filteredTree.length === 0 ? (
            <div className="text-zinc-650 italic text-[10px] pl-3 py-1">
              No files available. Drag & drop files here.
            </div>
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

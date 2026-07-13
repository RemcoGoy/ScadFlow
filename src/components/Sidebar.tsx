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
  const { filesList, setFilesList, activeFilePath, setActiveFilePath, setScadCode } =
    useScadStore();

  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedFolderForNewItem, setSelectedFolderForNewItem] = useState("/");

  const bfs = getBfs();

  const refreshFileTree = () => {
    if (!bfs) return;
    const tree = readBfsDirectoryTree(bfs, "/");
    setFilesList(tree);
  };

  useEffect(() => {
    refreshFileTree();
  }, []);

  // Scan BrowserFS tree recursively
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
        "File System Access API is not supported in this browser. Please use a Chromium-based browser (Chrome, Edge, Opera) for local folder mapping.",
      );
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (bfs) {
        await syncDirectoryHandleToBrowserFS(handle, bfs, "/");
        refreshFileTree();
        // Set default main.scad or input.scad if exists
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
      setActiveFilePath(path);
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
        if (activeFilePath === path) {
          setActiveFilePath("");
          setScadCode("");
        }
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
    link.download = "scadflow_project.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderTreeNodes = (nodes: FileItem[]) => {
    return nodes.map((node) => (
      <div key={node.path} className="pl-3">
        <div
          className={`flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer hover:bg-zinc-800 transition-colors ${
            activeFilePath === node.path
              ? "bg-blue-600/30 text-blue-400 font-medium"
              : "text-zinc-300"
          }`}
          onClick={() => {
            if (node.isDir) {
              setSelectedFolderForNewItem(node.path);
            } else {
              handleOpenFile(node.path);
            }
          }}
        >
          <div className="flex items-center space-x-2 truncate">
            {node.isDir ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4.5 w-4.5 text-yellow-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4.5 w-4.5 text-blue-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
            <span className="text-sm truncate select-none">{node.name}</span>
          </div>

          <button
            onClick={(e) => handleDeleteItem(node.path, node.isDir, e)}
            className="text-zinc-500 hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-700/50 rounded transition-opacity"
            title="Delete"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
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
        {node.children && node.children.length > 0 && (
          <div className="border-l border-zinc-800 ml-3.5 mt-0.5 pl-1.5">
            {renderTreeNodes(node.children)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 w-full text-zinc-300">
      {/* Workspace controls */}
      <div className="p-4 border-b border-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Workspace
          </h2>
          <div className="flex space-x-1.5">
            <button
              onClick={() => {
                setSelectedFolderForNewItem("/");
                setIsCreatingFile(true);
                setIsCreatingFolder(false);
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              title="New File"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
            <button
              onClick={() => {
                setSelectedFolderForNewItem("/");
                setIsCreatingFolder(true);
                setIsCreatingFile(false);
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              title="New Folder"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
            </button>
            <button
              onClick={refreshFileTree}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              title="Refresh"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleOpenLocalDirectory}
          className="w-full text-center flex items-center justify-center space-x-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 font-medium py-1.5 px-3 rounded-md text-xs hover:border-zinc-700 transition-all active:scale-[0.98]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5M5 19v-4m14 4v-4m0 0l-3-3m3 3l3-3"
            />
          </svg>
          <span>Map Local Folder</span>
        </button>
      </div>

      {/* Creation modals inline */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-3 bg-zinc-900/50 border-b border-zinc-900 space-y-2">
          <span className="text-[10px] text-zinc-400 font-semibold uppercase block">
            New {isCreatingFile ? "File" : "Folder"} under {selectedFolderForNewItem}
          </span>
          <div className="flex items-center space-x-1.5">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={isCreatingFile ? "model.scad" : "components"}
              className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded py-1 px-2 text-xs flex-1 focus:outline-none focus:border-blue-500"
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
          <div className="flex justify-end space-x-1">
            <button
              onClick={() => {
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
                setNewFileName("");
              }}
              className="py-0.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px]"
            >
              Cancel
            </button>
            <button
              onClick={isCreatingFile ? handleCreateFile : handleCreateFolder}
              className="py-0.5 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px]"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Files List Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 group">
        {filesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <span className="text-zinc-500 text-xs italic">Workspace is empty</span>
            <span className="text-[10px] text-zinc-600 mt-1">
              Create a file or map a local directory to begin.
            </span>
          </div>
        ) : (
          renderTreeNodes(filesList)
        )}
      </div>

      {/* Sidebar Footer options */}
      <div className="p-3 border-t border-zinc-900 bg-zinc-950 flex flex-col space-y-1.5">
        <button
          onClick={handleExportZip}
          className="w-full text-center flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 px-3 rounded-md text-xs transition-all active:scale-[0.98]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
            />
          </svg>
          <span>Export Workspace ZIP</span>
        </button>
      </div>
    </div>
  );
}

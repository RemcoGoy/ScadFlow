import { useState, useEffect, useCallback, useRef } from "react";
import { useScadStore, FileItem } from "@/store/scadStore";
import { importFileListToOpfs } from "@/lib/fs/fileSystemAccess";
import {
  isLinkingSupported,
  linkFolder,
  reconnectFolder,
  syncLinkedFolder,
  unlinkFolder,
} from "@/lib/fs/linkedFolder";
import { workspace } from "@/lib/fs/workspace";
import { updateIncludePaths } from "@/lib/fs/includePaths";
import { opfs, getParentDir } from "@/lib/fs/opfs";
import JSZip from "jszip";
import { flushSaves } from "@/lib/fs/saveQueue";
import {
  Copy,
  FileCode,
  FilePlus,
  FolderPlus,
  FolderSync,
  Link2,
  RefreshCw,
  Unlink,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";

// dataTransfer type used for dragging tree items, to tell them apart from OS file drops
const TREE_ITEM_MIME = "application/x-scadflow-path";

export function Sidebar() {
  const {
    filesList,
    setFilesList,
    activeFilePath,
    mainFilePath,
    setMainFilePath,
    bumpFsVersion,
    openFile,
    closeFile,
    renameOpenPath,
    linkedFolder,
  } = useScadStore();

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
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileItem | null;
  } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const refreshFileTree = async () => {
    const tree = await readOpfsDirectoryTree("/");
    setFilesList(tree);
    // Files may have been added, moved or deleted; re-render the main file
    bumpFsVersion();
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

  // Fallback folder picker for browsers without the File System Access API (Firefox, Safari)
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleDirectoryInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!input.files || input.files.length === 0) return;
    try {
      await importFileListToOpfs(input.files, "/");
      await refreshFileTree();
    } catch (err: any) {
      alert(`Failed to import folder: ${err.message}`);
    } finally {
      // Allow picking the same folder again
      input.value = "";
    }
  };

  // Chromium links the folder for two-way sync; other browsers can only import a copy
  const handleOpenLocalDirectory = async () => {
    if (!isLinkingSupported) {
      directoryInputRef.current?.click();
      return;
    }
    try {
      await linkFolder();
    } catch (err: any) {
      if (err?.name !== "AbortError") alert(`Failed to link folder: ${err.message}`);
    }
  };

  const handleUnlinkFolder = async () => {
    if (!linkedFolder) return;
    const ok = confirm(
      `Unlink "${linkedFolder.name}"?\n\nThe files stay in the browser workspace, but changes are no longer written to the folder.`,
    );
    if (ok) await unlinkFolder();
  };

  // The editor loads the file contents when the active file changes
  const handleOpenFile = (path: string) => openFile(path);

  const handleCreateFile = async () => {
    if (!newFileName) return;
    const cleanName = newFileName.trim();
    const parent = selectedFolderForNewItem === "/" ? "" : selectedFolderForNewItem;
    const fullPath = `${parent}/${cleanName}`;

    try {
      await workspace.writeFile(fullPath, "");
      setNewFileName("");
      setIsCreatingFile(false);
      await refreshFileTree();
      handleOpenFile(fullPath);
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
      await workspace.mkdir(fullPath);
      setNewFileName("");
      setIsCreatingFolder(false);
      await refreshFileTree();
    } catch (e: any) {
      alert(`Failed to create folder: ${e.message}`);
    }
  };

  const handleDeleteItem = async (path: string, isDir: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;
    // Write pending edits first so a delayed autosave can't recreate the file
    await flushSaves();

    try {
      if (isDir) {
        await workspace.rmdir(path);
        // Close tabs of files that were inside the folder
        for (const openPath of useScadStore.getState().openFiles) {
          if (openPath.startsWith(`${path}/`)) closeFile(openPath);
        }
      } else {
        await workspace.unlink(path);
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
      if (await opfs.exists(newPath)) {
        alert(`${newPath} already exists`);
        return;
      }
      await flushSaves();
      await workspace.rename(oldPath, newPath);
      setRenamingPath(null);
      renameOpenPath(oldPath, newPath);
      await updateIncludePaths(oldPath, newPath);
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

  const startCreating = (kind: "file" | "folder", folder: string) => {
    setSelectedFolderForNewItem(folder);
    setIsCreatingFile(kind === "file");
    setIsCreatingFolder(kind === "folder");
    if (folder !== "/") {
      setCollapsedFolders((prev) => ({ ...prev, [folder]: false }));
    }
  };

  const moveItem = async (srcPath: string, destDir: string) => {
    const name = srcPath.split("/").pop();
    if (!name || getParentDir(srcPath) === destDir) return;
    if (destDir === srcPath || destDir.startsWith(`${srcPath}/`)) return;

    const newPath = destDir === "/" ? `/${name}` : `${destDir}/${name}`;
    try {
      if (await opfs.exists(newPath)) {
        alert(`${newPath} already exists`);
        return;
      }
      await flushSaves();
      await workspace.rename(srcPath, newPath);
      renameOpenPath(srcPath, newPath);
      await updateIncludePaths(srcPath, newPath);
      await refreshFileTree();
    } catch (err: any) {
      alert(`Move failed: ${err.message}`);
    }
  };

  const uploadFiles = async (dataTransfer: DataTransfer, destDir: string) => {
    const parent = destDir === "/" ? "" : destDir;
    const promises = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          promises.push(
            (async () => {
              const buffer = await file.arrayBuffer();
              await workspace.writeFile(`${parent}/${file.name}`, buffer);
            })(),
          );
        }
      }
    }
    await Promise.all(promises);
    await refreshFileTree();
  };

  const handleDropOn = async (e: React.DragEvent, destDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDropTargetPath(null);

    const srcPath = e.dataTransfer.getData(TREE_ITEM_MIME);
    if (srcPath) {
      await moveItem(srcPath, destDir);
    } else if (e.dataTransfer.items) {
      await uploadFiles(e.dataTransfer, destDir);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Only show the upload overlay for files coming from outside the app
    setIsDragging(e.dataTransfer.types.includes("Files"));
    setDropTargetPath(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => handleDropOn(e, "/");

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

  const startRenaming = (node: FileItem) => {
    setRenameValue(node.name);
    setRenamingPath(node.path);
  };

  const folderMenuItems = (): ContextMenuItem[] => {
    if (!linkedFolder) {
      return [
        {
          label: isLinkingSupported ? "Link Local Folder" : "Import Local Folder",
          icon: isLinkingSupported ? <Link2 /> : <FolderSync />,
          onSelect: handleOpenLocalDirectory,
        },
      ];
    }
    return [
      linkedFolder.connected
        ? { label: "Sync with Folder Now", icon: <RefreshCw />, onSelect: () => syncLinkedFolder() }
        : { label: "Reconnect Folder", icon: <RefreshCw />, onSelect: reconnectFolder },
      { label: "Link a Different Folder", icon: <Link2 />, onSelect: handleOpenLocalDirectory },
      { label: "Unlink Folder", icon: <Unlink />, onSelect: handleUnlinkFolder },
    ];
  };

  const getContextMenuItems = (node: FileItem | null): ContextMenuItem[] => {
    // Empty space in the tree: create at the root
    if (!node) {
      return [
        { label: "New File", icon: <FilePlus />, onSelect: () => startCreating("file", "/") },
        { label: "New Folder", icon: <FolderPlus />, onSelect: () => startCreating("folder", "/") },
        "separator",
        ...folderMenuItems(),
      ];
    }

    const common: ContextMenuItem[] = [
      { label: "Rename", icon: <Pencil />, onSelect: () => startRenaming(node) },
      {
        label: "Copy Path",
        icon: <Copy />,
        onSelect: () => navigator.clipboard?.writeText(node.path.replace(/^\//, "")),
      },
      "separator",
      {
        label: "Delete",
        icon: <Trash2 />,
        danger: true,
        onSelect: () => handleDeleteItem(node.path, node.isDir),
      },
    ];

    if (node.isDir) {
      return [
        { label: "New File", icon: <FilePlus />, onSelect: () => startCreating("file", node.path) },
        {
          label: "New Folder",
          icon: <FolderPlus />,
          onSelect: () => startCreating("folder", node.path),
        },
        "separator",
        ...common,
      ];
    }

    const isScad = node.name.endsWith(".scad");
    return [
      { label: "Open", icon: <FileCode />, onSelect: () => handleOpenFile(node.path) },
      ...(isScad
        ? [
            {
              label: node.path === mainFilePath ? "Main File" : "Set as Main File",
              icon: <Play />,
              disabled: node.path === mainFilePath,
              onSelect: () => setMainFilePath(node.path),
            },
          ]
        : []),
      "separator",
      ...common,
    ];
  };

  const renderTreeNodes = (nodes: FileItem[]) => {
    return nodes.map((node) => {
      const isCollapsed = collapsedFolders[node.path] ?? false;
      const isActive = activeFilePath === node.path;
      const isRenaming = renamingPath === node.path;
      const isDropTarget = node.isDir && dropTargetPath === node.path;

      return (
        <div key={node.path} className="pl-1 select-none">
          <div
            draggable={!isRenaming}
            onDragStart={(e) => {
              e.dataTransfer.setData(TREE_ITEM_MIME, node.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDropTargetPath(null)}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Dropping on a file targets the folder that contains it
              setDropTargetPath(node.isDir ? node.path : null);
            }}
            onDrop={(e) => handleDropOn(e, node.isDir ? node.path : getParentDir(node.path))}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isRenaming) return;
              setContextMenu({ x: e.clientX, y: e.clientY, node });
            }}
            className={`group/item flex items-center justify-between py-1 px-3 rounded cursor-pointer transition-all duration-100 ${
              isDropTarget
                ? "bg-[#1d2737] ring-1 ring-inset ring-scad-amber/60 text-zinc-200"
                : isActive
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
                <>
                  <span className="truncate">{node.name}</span>
                  {node.path === mainFilePath && (
                    <span
                      className="text-[8px] font-sans font-bold uppercase tracking-wider text-scad-amber/80 border border-scad-amber/40 rounded px-1 leading-tight"
                      title="Main file: this file is rendered"
                    >
                      main
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            {!isRenaming && (
              <div className="flex items-center space-x-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                {!node.isDir && node.path !== mainFilePath && node.name.endsWith(".scad") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMainFilePath(node.path);
                    }}
                    className={`p-0.5 rounded transition-colors ${
                      isActive
                        ? "text-scad-amber/80 hover:text-scad-amber hover:bg-white/5"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-[#1a2232]"
                    }`}
                    title="Set as main file"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                )}
                {node.isDir && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startCreating("file", node.path);
                      }}
                      className="p-0.5 rounded transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-[#1a2232]"
                      title="New file in folder"
                    >
                      <FilePlus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startCreating("folder", node.path);
                      }}
                      className="p-0.5 rounded transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-[#1a2232]"
                      title="New folder in folder"
                    >
                      <FolderPlus className="h-3 w-3" />
                    </button>
                  </>
                )}
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
      <input
        ref={directoryInputRef}
        type="file"
        className="hidden"
        onChange={handleDirectoryInputChange}
        {...{ webkitdirectory: "", directory: "" }}
      />

      {/* File Action Buttons Panel matching the design mock */}
      <div className="p-3 border-b border-border-figma flex space-x-2">
        <button
          onClick={() => startCreating("file", "/")}
          className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
        >
          + File
        </button>
        <button
          onClick={() => startCreating("folder", "/")}
          className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
        >
          + Folder
        </button>
        {!linkedFolder && (
          <button
            onClick={handleOpenLocalDirectory}
            title={
              isLinkingSupported
                ? "Open a folder on disk and keep it in sync with the workspace"
                : "Copy a folder from disk into the workspace (two-way sync needs Chrome or Edge)"
            }
            className="flex-1 text-center py-1 px-3 bg-[#131924] hover:bg-[#1d2737] border border-border-figma text-zinc-200 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
          >
            {isLinkingSupported ? "↔ Link Dir" : "↑ Import"}
          </button>
        )}
      </div>

      {/* Linked folder status */}
      {linkedFolder && (
        <div className="px-3 py-1.5 border-b border-border-figma flex items-center space-x-2 text-[10px] font-sans">
          <Link2
            className={`h-3 w-3 flex-shrink-0 ${linkedFolder.connected ? "text-scad-amber" : "text-zinc-600"}`}
          />
          <span
            className="truncate flex-1 text-zinc-400"
            title={
              linkedFolder.connected
                ? "Changes are saved to this folder; changes on disk are pulled in when the app regains focus"
                : "Permission is needed again after reloading"
            }
          >
            {linkedFolder.connected ? "Synced with " : "Not connected: "}
            <span className="font-mono text-zinc-200">{linkedFolder.name}</span>
          </span>
          {linkedFolder.connected ? (
            <button
              onClick={() => syncLinkedFolder()}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-[#1a2232]"
              title="Sync now"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={reconnectFolder}
              className="py-0.5 px-1.5 rounded bg-scad-amber text-[#0b0e14] font-bold text-[9px]"
            >
              Reconnect
            </button>
          )}
          <button
            onClick={handleUnlinkFolder}
            className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-[#1a2232]"
            title="Unlink folder"
          >
            <Unlink className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Creation fields modal */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-3 bg-[#141822] border-b border-border-figma space-y-2">
          <span className="text-[9px] text-scad-amber font-bold uppercase tracking-wider block">
            New {isCreatingFile ? "File" : "Folder"}
            {selectedFolderForNewItem !== "/" && (
              <span className="text-zinc-500 normal-case font-mono font-normal tracking-normal">
                {" "}
                in {selectedFolderForNewItem}
              </span>
            )}
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
      <div
        className="p-3 select-none flex-1 overflow-y-auto"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, node: null });
        }}
      >
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
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.node)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

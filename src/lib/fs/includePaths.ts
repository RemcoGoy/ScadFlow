import { opfs } from "@/lib/fs/opfs";
import { workspace } from "@/lib/fs/workspace";
import { INTERNAL_NAMES } from "@/lib/fs/linkedFolder";
import { markSaved } from "@/lib/fs/saveQueue";
import { useScadStore, type FileItem } from "@/store/scadStore";

// Keeps `include <...>` / `use <...>` statements working after a file or folder moves.

const INCLUDE_RE = /\b(include|use)(\s*)<([^>\n]+)>/g;

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

// Resolve a reference the way OpenSCAD does: relative to the including file's folder
export function resolvePath(dir: string, ref: string): string {
  const out: string[] = [];
  for (const part of (ref.startsWith("/") ? ref : `${dir}/${ref}`).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

export function relativePath(fromDir: string, to: string): string {
  const from = fromDir.split("/").filter(Boolean);
  const target = to.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && common < target.length - 1 && from[common] === target[common]) {
    common++;
  }
  return [...Array(from.length - common).fill(".."), ...target.slice(common)].join("/");
}

// Replace the oldPath prefix of a path with newPath (paths outside oldPath are unchanged)
export const movePrefix = (path: string, oldPath: string, newPath: string) =>
  path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;

/**
 * Rewrite the include/use statements of one file after oldPath was moved to newPath.
 * `file` is the file's current path and `existing` the workspace files after the move.
 */
export function rewriteIncludes(
  content: string,
  file: string,
  oldPath: string,
  newPath: string,
  existing: Set<string>,
): string {
  // Where this file was before the move; references were written relative to that
  const oldFile = movePrefix(file, newPath, oldPath);
  return content.replace(INCLUDE_RE, (match, keyword, space, rawRef) => {
    const ref = rawRef.trim();
    const oldTarget = resolvePath(dirOf(oldFile), ref);
    const target = movePrefix(oldTarget, oldPath, newPath);
    if (!existing.has(target)) return match;
    if (target === oldTarget && file === oldFile) return match;
    const newRef = ref.startsWith("/") ? target : relativePath(dirOf(file), target);
    return newRef === ref ? match : `${keyword}${space}<${newRef}>`;
  });
}

async function listWorkspaceFiles(): Promise<string[]> {
  const files: string[] = [];
  const walk = (nodes: FileItem[], topLevel: boolean) => {
    for (const node of nodes) {
      if (node.name.startsWith(".") || (topLevel && INTERNAL_NAMES.has(node.name))) continue;
      if (node.isDir) walk(node.children ?? [], false);
      else files.push(node.path);
    }
  };
  walk(await opfs.readdirTree("/"), true);
  return files;
}

/**
 * Rewrite include/use paths after oldPath (a file or folder) was moved to newPath.
 * Updates references to the moved files, and relative references made from inside
 * the moved files. References that don't point at a workspace file (libraries,
 * already broken paths) are left alone. Returns the number of files changed.
 */
export async function updateIncludePaths(oldPath: string, newPath: string): Promise<number> {
  const files = await listWorkspaceFiles();
  const existing = new Set(files);
  let changedFiles = 0;

  for (const file of files) {
    if (!file.endsWith(".scad")) continue;
    const content = await opfs.readFile(file);
    const updated = rewriteIncludes(content, file, oldPath, newPath, existing);

    if (updated === content) continue;
    await workspace.writeFile(file, updated);
    changedFiles++;

    // Keep the editor in sync when the open file was rewritten
    const { codeFilePath, loadFile } = useScadStore.getState();
    if (file === codeFilePath) {
      markSaved(file, updated);
      loadFile(file, updated);
    }
  }

  if (changedFiles > 0) {
    useScadStore
      .getState()
      .addLog(
        `Updated include/use paths in ${changedFiles} file${changedFiles === 1 ? "" : "s"} after moving ${oldPath}`,
        "info",
      );
  }
  return changedFiles;
}

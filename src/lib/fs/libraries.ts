import JSZip from "jszip";
import { deployedArchiveNames, zipArchives } from "./zip-archives";
import { opfs } from "./opfs";
import { useScadStore } from "@/store/scadStore";

export async function extractLibrariesToOpfs() {
  const store = useScadStore.getState();

  // Check if libraries already exist
  const exists = await opfs.exists("/libraries");
  if (exists) {
    const libs = await opfs.readdirTree("/libraries");
    if (libs.length > 0) {
      console.log("Libraries already extracted in OPFS.");
      return;
    }
  }

  await opfs.mkdir("/libraries");
  store.addLog("Extracting OpenSCAD libraries to OPFS...", "info");

  for (const name of deployedArchiveNames) {
    try {
      const response = await fetch(`./libraries/${name}.zip`);
      if (!response.ok) {
        console.warn(`Failed to fetch library ${name}.zip`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      const zip = await new JSZip().loadAsync(buffer);

      // Extract files
      const promises: Promise<void>[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
          promises.push(
            (async () => {
              const fileData = await zipEntry.async("uint8array");
              const fullPath = `/libraries/${name}/${relativePath}`;
              await opfs.writeFile(fullPath, fileData);
            })(),
          );
        }
      });

      await Promise.all(promises);

      // Handle symlinks by copying the file since OPFS doesn't support symlinks natively
      const archiveDef = zipArchives[name];
      if (archiveDef.symlinks) {
        for (const from in archiveDef.symlinks) {
          const to = archiveDef.symlinks[from];
          const targetPath = to === "." ? `/libraries/${name}` : `/libraries/${name}/${to}`;

          try {
            const isDir = await opfs.exists(targetPath); // naive check
            if (isDir) {
              const fileData = await opfs.readFileBuffer(targetPath);
              // Write a copy to act as symlink
              const aliasPath = from.startsWith("/") ? from : `/libraries/${from}`;
              await opfs.writeFile(aliasPath, fileData);
            }
          } catch (e) {
            console.warn(`Could not create alias for ${targetPath}`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Error extracting library ${name}:`, e);
    }
  }

  store.addLog("Libraries extracted successfully.", "info");
}

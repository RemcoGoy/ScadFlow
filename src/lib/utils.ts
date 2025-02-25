export function readFileAsDataURL(file: File) {
  return new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      res(reader.result as string);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

export const listFilesystem = (scadInstance: any, directory = "/") => {
  try {
    console.log(`Listing contents of directory: ${directory}`);

    // Get all entries in the directory
    const entries = scadInstance.FS.readdir(directory);

    // Filter out the . and .. entries
    const filteredEntries = entries.filter(
      (entry: string) => entry !== "." && entry !== ".."
    );

    // Log each entry and check if it's a directory
    filteredEntries.forEach((entry: string) => {
      const path = directory === "/" ? `/${entry}` : `${directory}/${entry}`;
      const stat = scadInstance.FS.stat(path);
      const isDirectory = scadInstance.FS.isDir(stat.mode);

      console.log(`${path} ${isDirectory ? "(directory)" : "(file)"}`);

      // Recursively list subdirectories if needed
      if (isDirectory) {
        listFilesystem(scadInstance, path);
      }
    });

    if (filteredEntries.length === 0) {
      console.log(`Directory ${directory} is empty`);
    }
  } catch (error) {
    console.error(`Error listing filesystem at ${directory}:`, error);
  }
};

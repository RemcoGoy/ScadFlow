// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

declare interface FS {
  writeFile(path: string, content: string): void;
  readdir(path: string, cb: (err: any, files: string[]) => void): void;
  readdirSync(path: string): string[];
  symlink(target: string, source: string): void;
  readFileSync(path: string): BufferSource;
  lstatSync(path: string): { isDirectory(): boolean };
}

declare interface BrowserFSInterface {
  FS: any;
  BFSRequire: (module: string) => any;
  install: (obj: any) => void;
  configure: (config: any, cb: (e?: Error) => void) => void;
  FileSystem: {
    InMemory: any;
    ZipFS: any;
    MountableFileSystem: any;
    LocalStorage: any;
    XmlHttpRequest: any;
  };
  Buffer: {
    from: (data: any, encoding?: string) => any;
    alloc: (size: number) => any;
  };
  initialize: (config: any) => Promise<void>;
  WorkerFS?: any;
}

declare let BrowserFS: BrowserFSInterface;

declare module "browserfs" {
  export = BrowserFS;
}

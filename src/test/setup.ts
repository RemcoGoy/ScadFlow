// Node 25+ defines a global localStorage that is undefined unless Node runs with
// --localstorage-file, and Vitest won't replace an existing global with happy-dom's.
// Install an in-memory one so the persisted store works in every Node version.
if (typeof globalThis.localStorage === "undefined") {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

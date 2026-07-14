import "@testing-library/jest-dom";

const globalObject = globalThis as typeof globalThis & {
  matchMedia?: (query: string) => MediaQueryList;
  localStorage?: Storage;
};

if (typeof globalObject.matchMedia !== "function") {
  Object.defineProperty(globalObject, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalObject.localStorage === "undefined") {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalObject, "localStorage", {
    configurable: true,
    enumerable: true,
    value: localStorageMock,
    writable: true,
  });
}

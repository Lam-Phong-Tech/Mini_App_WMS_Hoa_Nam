/** Browser adapter: giữ storage đồng bộ như MMKV bằng localStorage. */

export interface StorageBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
}

export interface KeyValueStorage {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  getBoolean(key: string): boolean | undefined;
  setBoolean(key: string, value: boolean): void;
  getNumber(key: string): number | undefined;
  setNumber(key: string, value: number): void;
  getObject<T>(key: string): T | undefined;
  setObject(key: string, value: unknown): void;
  remove(key: string): void;
  has(key: string): boolean;
  keys(): string[];
}

export function createStorage(backend: StorageBackend): KeyValueStorage {
  return {
    getString: key => backend.getString(key),
    setString: (key, value) => backend.set(key, value),
    getBoolean: key => {
      const raw = backend.getString(key);
      return raw === undefined ? undefined : raw === 'true';
    },
    setBoolean: (key, value) => backend.set(key, value ? 'true' : 'false'),
    getNumber: key => {
      const raw = backend.getString(key);
      const value = raw === undefined ? Number.NaN : Number(raw);
      return Number.isFinite(value) ? value : undefined;
    },
    setNumber: (key, value) => backend.set(key, String(value)),
    getObject: <T,>(key: string): T | undefined => {
      const raw = backend.getString(key);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    setObject: (key, value) => backend.set(key, JSON.stringify(value)),
    remove: key => backend.delete(key),
    has: key => backend.contains(key),
    keys: () => backend.getAllKeys(),
  };
}

export function createMemoryBackend(seed: Record<string, string> = {}): StorageBackend {
  const map = new Map(Object.entries(seed));
  return {
    getString: key => map.get(key),
    set: (key, value) => map.set(key, value),
    delete: key => map.delete(key),
    contains: key => map.has(key),
    getAllKeys: () => Array.from(map.keys()),
  };
}

function createBrowserBackend(id: string): StorageBackend {
  const prefix = id + ':';
  const local = globalThis.localStorage;
  return {
    getString: key => local.getItem(prefix + key) ?? undefined,
    set: (key, value) => local.setItem(prefix + key, value),
    delete: key => local.removeItem(prefix + key),
    contains: key => local.getItem(prefix + key) !== null,
    getAllKeys: () => {
      const keys: string[] = [];
      for (let index = 0; index < local.length; index += 1) {
        const full = local.key(index);
        if (full?.startsWith(prefix)) keys.push(full.slice(prefix.length));
      }
      return keys;
    },
  };
}

let appStorageInstance: KeyValueStorage | undefined;

export function getAppStorage(): KeyValueStorage {
  if (appStorageInstance === undefined) {
    appStorageInstance = createStorage(createBrowserBackend('wms.app'));
  }
  return appStorageInstance;
}

export function setAppStorageForTesting(storage: KeyValueStorage | undefined): void {
  appStorageInstance = storage;
}

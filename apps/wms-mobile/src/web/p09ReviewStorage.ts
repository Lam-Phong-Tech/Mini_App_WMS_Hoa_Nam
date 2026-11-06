// Review-only memory storage; never imported by Android or regular app entry.
export function createMMKV() {
  const values = new Map<string, string>();
  return {
    getString: (k: string) => values.get(k),
    set: (k: string, v: string) => values.set(k, v),
    delete: (k: string) => values.delete(k),
    contains: (k: string) => values.has(k),
    getAllKeys: () => [...values.keys()],
  };
}

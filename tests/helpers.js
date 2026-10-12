// @ts-check

/**
 * テスト用インメモリストレージ
 * @param {Record<string, string>} [initial]
 * @returns {import('../src/storage.js').StorageLike}
 */
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) ?? null : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

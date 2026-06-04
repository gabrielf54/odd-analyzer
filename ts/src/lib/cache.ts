// Cache TTL em memória. Simplifica o file-cache do Python (cached_get): para um
// servidor de longa duração, memória basta. Só cacheia se shouldCache(valor).
interface Entry { value: unknown; exp: number; }
const store = new Map<string, Entry>();

export async function cachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlSeconds?: number | null; shouldCache?: (d: T) => boolean } = {},
): Promise<T> {
  const { ttlSeconds = null, shouldCache = (d: T) => Boolean(d) } = opts;
  const hit = store.get(key);
  if (hit && (hit.exp === 0 || hit.exp > Date.now())) return hit.value as T;
  const value = await fetcher();
  if (shouldCache(value)) {
    const exp = ttlSeconds == null ? 0 : Date.now() + ttlSeconds * 1000;
    store.set(key, { value, exp });
  }
  return value;
}

export function clearCache(): void {
  store.clear();
}

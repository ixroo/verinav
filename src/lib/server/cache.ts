export interface CacheEntry<T> {
  data: T;
  fetchedAtMs: number;
  lastError?: string;
}

export interface SwrResult<T> {
  data: T;
  fetchedAtMs: number;
  isStale: boolean;
  ageLabel: string;
  sourceNote?: string;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function formatAgeLabel(fetchedAtMs: number, nowMs = Date.now()): string {
  const sec = Math.max(0, Math.round((nowMs - fetchedAtMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

export async function cachedFetch<T>(
  key: string,
  freshMs: number,
  fetcher: () => Promise<T>,
  fallbackData?: T
): Promise<SwrResult<T>> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing && now - existing.fetchedAtMs < freshMs) {
    return {
      data: existing.data,
      fetchedAtMs: existing.fetchedAtMs,
      isStale: false,
      ageLabel: formatAgeLabel(existing.fetchedAtMs, now),
    };
  }

  let promise = inflight.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = fetcher()
      .then((fresh) => {
        store.set(key, { data: fresh, fetchedAtMs: Date.now() });
        inflight.delete(key);
        return fresh;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, promise);
  }

  try {
    const data = await promise;
    const saved = store.get(key) as CacheEntry<T>;
    return {
      data,
      fetchedAtMs: saved.fetchedAtMs,
      isStale: false,
      ageLabel: "just now",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream error";
    if (existing) {
      return {
        data: existing.data,
        fetchedAtMs: existing.fetchedAtMs,
        isStale: true,
        ageLabel: `Cached · ${formatAgeLabel(existing.fetchedAtMs)}`,
        sourceNote: msg,
      };
    }
    if (fallbackData !== undefined) {
      return {
        data: fallbackData,
        fetchedAtMs: now,
        isStale: true,
        ageLabel: "Reference snapshot",
        sourceNote: msg,
      };
    }
    throw err;
  }
}

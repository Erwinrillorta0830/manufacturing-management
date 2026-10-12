export function getCachedPromise<K, T>(
    cache: Map<K, Promise<T>>,
    key: K,
    load: () => Promise<T>
): Promise<T> {
    const cached = cache.get(key);
    if (cached) return cached;

    const request = Promise.resolve()
        .then(load)
        .catch((error) => {
            if (cache.get(key) === request) cache.delete(key);
            throw error;
        });
    cache.set(key, request);
    return request;
}

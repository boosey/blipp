import { useCallback, useEffect, useState } from "react";
import { getApiBase } from "./api-base";

interface UsePublicFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Data-fetching hook for public, unauthenticated endpoints (`/api/public/*`).
 *
 * No Clerk token attached — these endpoints serve cacheable, scrubbed payloads
 * regardless of auth state and rate-limit per IP. Use for the `/browse/*`
 * surface and the landing-page rails.
 */
export function usePublicFetch<T>(
  path: string,
  options?: { enabled?: boolean }
): UsePublicFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api${path}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as any)?.error || res.statusText);
      }
      const json = (await res.json()) as T;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (options?.enabled === false) return;
    refetch();
  }, [refetch, options?.enabled]);

  return { data, loading, error, refetch };
}

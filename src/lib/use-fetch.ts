import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "./api-client";

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic data-fetching hook that wraps useApiFetch with loading/error state.
 * Fetches on mount and whenever the endpoint changes.
 */
export function useFetch<T>(
  endpoint: string,
  options?: { enabled?: boolean }
): UseFetchResult<T> {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(endpoint);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, endpoint]);

  useEffect(() => {
    if (options?.enabled === false) return;
    refetch();
  }, [refetch, options?.enabled]);

  return { data, loading, error, refetch };
}

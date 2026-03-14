import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

/**
 * Fetches from the admin API with JSON content type and Clerk auth.
 * All paths are prefixed with /api/admin.
 */
async function adminFetch<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/** Hook returning an admin API fetcher bound to the current Clerk session. */
export function useAdminFetch() {
  const { getToken } = useAuth();

  const fetcher = useCallback(
    async function <T>(path: string, options?: RequestInit): Promise<T> {
      const token = await getToken();
      try {
        return await adminFetch<T>(path, { ...options, token: token ?? undefined });
      } catch (err) {
        // Retry once with a forced token refresh on auth errors
        if (err instanceof Error && err.message.includes("expired")) {
          const freshToken = await getToken({ skipCache: true });
          return adminFetch<T>(path, { ...options, token: freshToken ?? undefined });
        }
        throw err;
      }
    },
    [getToken]
  );

  return fetcher;
}

/** Convenience hooks for common admin API operations. */
export function useAdminGet<T>(path: string) {
  const apiFetch = useAdminFetch();
  return useCallback(() => apiFetch<T>(path), [apiFetch, path]);
}

export function useAdminPost<T>(path: string) {
  const apiFetch = useAdminFetch();
  return useCallback(
    (body?: unknown) =>
      apiFetch<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    [apiFetch, path]
  );
}

export function useAdminPatch<T>(path: string) {
  const apiFetch = useAdminFetch();
  return useCallback(
    (body: unknown) =>
      apiFetch<T>(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    [apiFetch, path]
  );
}

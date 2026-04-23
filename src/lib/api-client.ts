import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Capacitor } from "@capacitor/core";
import { getApiBase } from "./api-base";

/** Options for the internal fetch utility. */
interface FetchOptions extends RequestInit {
  token?: string;
  prefix?: string;
}

/** Internal generic fetch utility with JSON support and Clerk auth headers. */
async function internalFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, prefix = "/api", ...rest } = options;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Platform": Capacitor.getPlatform(),
    ...(rest.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBase()}${prefix}${path}`, {
    ...rest,
    headers,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(err.error || res.statusText);
  }

  if (res.status === 204 || res.headers?.get?.("content-length") === "0") {
    return undefined as T;
  }

  return res.json();
}

/** Fetches from the standard Blipp API (/api/*). */
export async function apiFetch<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> {
  return internalFetch<T>(path, { ...options, prefix: "/api" });
}

/** Fetches from the Blipp Admin API (/api/admin/*). */
export async function adminFetch<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> {
  return internalFetch<T>(path, { ...options, prefix: "/api/admin" });
}

/** Hook that returns an API fetcher bound with the current Clerk session token. */
function useBaseAuthFetch(prefix: string) {
  const { getToken } = useAuth();

  return useCallback(
    async function <T>(path: string, options?: RequestInit): Promise<T> {
      const token = await getToken();
      try {
        return await internalFetch<T>(path, { ...options, token: token ?? undefined, prefix });
      } catch (err) {
        // Retry once with a forced token refresh on auth errors (common if session expired)
        if (err instanceof Error && err.message.toLowerCase().includes("expired")) {
          const freshToken = await getToken({ skipCache: true });
          return internalFetch<T>(path, { ...options, token: freshToken ?? undefined, prefix });
        }
        throw err;
      }
    },
    [getToken, prefix]
  );
}

/** Hook for fetching from the standard API (/api/*). */
export function useApiFetch() {
  return useBaseAuthFetch("/api");
}

/** Hook for fetching from the Admin API (/api/admin/*). */
export function useAdminFetch() {
  return useBaseAuthFetch("/api/admin");
}

/** Convenience hooks for common admin API operations. */
export function useAdminGet<T>(path: string) {
  const fetcher = useAdminFetch();
  return useCallback(() => fetcher<T>(path), [fetcher, path]);
}

export function useAdminPost<T>(path: string) {
  const fetcher = useAdminFetch();
  return useCallback(
    (body?: unknown) =>
      fetcher<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    [fetcher, path]
  );
}

export function useAdminPatch<T>(path: string) {
  const fetcher = useAdminFetch();
  return useCallback(
    (body: unknown) =>
      fetcher<T>(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    [fetcher, path]
  );
}

export function useAdminDelete<T>(path: string) {
  const fetcher = useAdminFetch();
  return useCallback(
    () =>
      fetcher<T>(path, {
        method: "DELETE",
      }),
    [fetcher, path]
  );
}

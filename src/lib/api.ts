import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { getApiBase } from "./api-base";

/** Fetches from the Blipp API with JSON content type and Clerk auth. Throws on non-OK responses. */
export async function apiFetch<T>(
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
  const res = await fetch(`${getApiBase()}/api${path}`, {
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

/** Hook that returns an apiFetch bound with the current Clerk session token. */
export function useApiFetch() {
  const { getToken } = useAuth();

  return useCallback(
    async function <T>(path: string, options?: RequestInit): Promise<T> {
      const token = await getToken();
      return apiFetch<T>(path, { ...options, token: token ?? undefined });
    },
    [getToken]
  );
}

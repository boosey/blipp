import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "../lib/api-client";
import { usePolling } from "./use-polling";
import type { PaginatedResponse } from "../types/admin";

interface UseAdminListOptions<T, D> {
  basePath: string;
  pageSize?: number;
  pollingInterval?: number;
  onDetailLoad?: (detail: D) => void;
}

export function useAdminList<T, D = any>({
  basePath,
  pageSize = 50,
  pollingInterval,
  onDetailLoad,
}: UseAdminListOptions<T, D>) {
  const apiFetch = useAdminFetch();

  const [items, setItems] = useState<T[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const loadItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("pageSize", pageSize.toString());
    if (search) params.set("search", search);
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "all") params.set(key, value);
    }

    try {
      const response = await apiFetch<PaginatedResponse<T>>(`${basePath}?${params}`);
      setItems(response.data);
    } catch (e) {
      console.error(`Failed to load items from ${basePath}:`, e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, basePath, pageSize, search, filters]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setSelectedId(id);
    try {
      const response = await apiFetch<{ data: D }>(`${basePath}/${id}`);
      setSelectedDetail(response.data);
      onDetailLoad?.(response.data);
    } catch (e) {
      console.error(`Failed to load detail from ${basePath}/${id}:`, e);
    } finally {
      setDetailLoading(false);
    }
  }, [apiFetch, basePath, onDetailLoad]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  usePolling(() => {
    if (pollingInterval) loadItems();
  }, pollingInterval ?? 0);

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const refresh = useCallback(() => {
    loadItems();
    if (selectedId) loadDetail(selectedId);
  }, [loadItems, loadDetail, selectedId]);

  return {
    items,
    selectedId,
    selectedDetail,
    loading,
    detailLoading,
    search,
    setSearch,
    filters,
    setFilter,
    loadDetail,
    setSelectedDetail,
    refresh,
  };
}

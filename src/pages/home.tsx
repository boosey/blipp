import { useEffect, useState, useCallback } from "react";
import { useApiFetch } from "../lib/api";
import { RequestItem } from "../components/request-item";
import type { UserRequest } from "../types/user";

export function Home() {
  const apiFetch = useApiFetch();
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await apiFetch<{ requests: UserRequest[] }>("/requests");
      setRequests(data.requests);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Poll for status updates on active requests
  useEffect(() => {
    const hasActive = requests.some(
      (r) => r.status === "PENDING" || r.status === "PROCESSING"
    );
    if (!hasActive) return;

    const interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, [requests, fetchRequests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-zinc-400 text-center">No briefings yet.</p>
        <p className="text-zinc-500 text-sm text-center">
          Head to Discover to find podcasts and create your first briefing.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Your Briefings</h1>
      <div className="space-y-2">
        {requests.map((req) => (
          <RequestItem key={req.id} request={req} />
        ))}
      </div>
    </div>
  );
}

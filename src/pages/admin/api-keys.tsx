import { useState, useEffect } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import { toast } from "sonner";
import { Key, Copy, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function AdminApiKeys() {
  const adminFetch = useAdminFetch();
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState("health:read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const data = await adminFetch<{ data: ApiKeyEntry[] }>("/api-keys");
      setKeys(data.data || []);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    try {
      const data = await adminFetch<{ data: { key: string } }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: newKeyName,
          scopes: newKeyScopes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setCreatedKey(data.data.key);
      toast.success("API key created");
      setNewKeyName("");
      setShowCreate(false);
      loadKeys();
    } catch {
      toast.error("Failed to create key");
    }
  }

  async function revokeKey(id: string) {
    try {
      await adminFetch(`/api-keys/${id}`, { method: "DELETE" });
      toast.success("Key revoked");
      loadKeys();
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-[#3B82F6]" />
          <h1 className="text-lg font-semibold">API Keys</h1>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Key
        </Button>
      </div>

      {/* One-time key display */}
      {createdKey && (
        <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-lg p-4">
          <p className="text-sm text-[#10B981] font-medium mb-2">
            New API Key (copy now — shown only once):
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-[#0F1D32] px-3 py-1.5 rounded flex-1 truncate font-mono text-[#F9FAFB]">
              {createdKey}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                toast.success("Copied");
              }}
              className="text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-[#9CA3AF] mt-2 hover:text-[#F9FAFB]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-[#1A2942] border border-white/5 rounded-lg p-4 space-y-3">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Monitoring)"
            className="bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60"
          />
          <Input
            value={newKeyScopes}
            onChange={(e) => setNewKeyScopes(e.target.value)}
            placeholder="Scopes (comma-separated)"
            className="bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60"
          />
          <Button
            size="sm"
            onClick={createKey}
            disabled={!newKeyName.trim()}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            Create
          </Button>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <p className="text-[#9CA3AF] text-sm">Loading...</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between bg-[#1A2942] border border-white/5 rounded-lg p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Key className="h-4 w-4 text-[#9CA3AF] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#F9FAFB]">
                    {k.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-[#9CA3AF] font-mono">
                      {k.keyPrefix}...
                    </span>
                    {k.scopes?.map((s) => (
                      <Badge
                        key={s}
                        className="bg-white/5 text-[#9CA3AF] text-[10px] px-1.5"
                      >
                        {s}
                      </Badge>
                    ))}
                    <Badge
                      className={
                        k.revokedAt
                          ? "bg-[#EF4444]/10 text-[#EF4444] text-[10px]"
                          : "bg-[#10B981]/10 text-[#10B981] text-[10px]"
                      }
                    >
                      {k.revokedAt ? "Revoked" : "Active"}
                    </Badge>
                  </div>
                  {k.lastUsedAt && (
                    <p className="text-[10px] text-[#9CA3AF]/60 mt-0.5">
                      Last used:{" "}
                      {new Date(k.lastUsedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {!k.revokedAt && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => revokeKey(k.id)}
                  className="text-[#EF4444] hover:bg-[#EF4444]/10 shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {keys.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <Key className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-sm">No API keys yet</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

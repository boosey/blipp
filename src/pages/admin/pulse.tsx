import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAdminFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type PostStatus = "DRAFT" | "REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
type PostMode = "HUMAN" | "AI_ASSISTED";

interface PulsePostListRow {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  mode: PostMode;
  wordCount: number | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  editor: { id: string; slug: string; name: string; status: string } | null;
}

interface ListResponse {
  data: PulsePostListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const STATUS_FILTERS: ("ALL" | PostStatus)[] = ["ALL", "DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

function statusBadge(status: PostStatus) {
  const map: Record<PostStatus, string> = {
    DRAFT: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    REVIEW: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    SCHEDULED: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    PUBLISHED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    ARCHIVED: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
  };
  return map[status];
}

function modeBadge(mode: PostMode) {
  return mode === "HUMAN"
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30";
}

export default function Pulse() {
  const adminFetch = useAdminFetch();
  const [filter, setFilter] = useState<"ALL" | PostStatus>("ALL");
  const [posts, setPosts] = useState<PulsePostListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorsCount, setEditorsCount] = useState<{ ready: number; total: number }>({ ready: 0, total: 0 });

  const queryPath = useMemo(
    () => `/pulse${filter === "ALL" ? "" : `?status=${filter}`}`,
    [filter]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [list, editors] = await Promise.all([
          adminFetch<ListResponse>(queryPath),
          adminFetch<{ data: { id: string; status: string }[] }>("/pulse/editors"),
        ]);
        if (cancelled) return;
        setPosts(list.data);
        setEditorsCount({
          ready: editors.data.filter((e) => e.status === "READY").length,
          total: editors.data.length,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetch, queryPath]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Pulse</h1>
          <p className="text-sm text-[#9CA3AF] mt-1 max-w-prose">
            Editorial review queue for the Pulse blog. Phase 4.0 hardened rules apply: every post
            must be attributed to a READY editor, sourced (≤50 words/source), pass the 3:1 ratio
            attestation, and ship with a Sources footer before publish.
          </p>
        </div>
        <Link
          to="/admin/pulse/editors"
          className="text-xs px-3 py-2 rounded-md border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5"
        >
          Editors ({editorsCount.ready}/{editorsCount.total} READY)
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md border transition-colors",
              filter === s
                ? "bg-[#3B82F6]/10 border-[#3B82F6]/40 text-white"
                : "border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-5 w-5 animate-spin text-[#9CA3AF]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center text-sm text-[#6B7280] py-12">
            No posts {filter === "ALL" ? "yet" : `with status ${filter}`}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Editor</th>
                <th className="px-4 py-3">Words</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/pulse/${p.id}`}
                      className="text-white hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">/pulse/{p.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded border", statusBadge(p.status))}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded border", modeBadge(p.mode))}>
                      {p.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#D1D5DB]">{p.editor?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-[#9CA3AF]">{p.wordCount ?? 0}</td>
                  <td className="px-4 py-3 text-[#6B7280]">
                    {new Date(p.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

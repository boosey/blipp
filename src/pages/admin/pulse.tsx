import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { useAdminFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type PostStatus = "DRAFT" | "REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
type PostMode = "HUMAN" | "AI_ASSISTED";
type EditorStatus = "NOT_READY" | "READY" | "RETIRED";

interface EditorOption {
  id: string;
  name: string;
  status: EditorStatus;
}

const EMPTY_NEW = {
  slug: "",
  title: "",
  subtitle: "",
  editorId: "",
  mode: "HUMAN" as PostMode,
  heroImageUrl: "",
  topicTags: "",
};

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
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"ALL" | PostStatus>("ALL");
  const [posts, setPosts] = useState<PulsePostListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editors, setEditors] = useState<EditorOption[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const editorsCount = useMemo(
    () => ({
      ready: editors.filter((e) => e.status === "READY").length,
      total: editors.length,
    }),
    [editors]
  );

  const queryPath = useMemo(
    () => `/pulse${filter === "ALL" ? "" : `?status=${filter}`}`,
    [filter]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [list, editorsRes] = await Promise.all([
          adminFetch<ListResponse>(queryPath),
          adminFetch<{ data: EditorOption[] }>("/pulse/editors"),
        ]);
        if (cancelled) return;
        setPosts(list.data);
        setEditors(editorsRes.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetch, queryPath]);

  async function createPost() {
    const slug = newForm.slug.trim();
    const title = newForm.title.trim();
    const editorId = newForm.editorId.trim();
    if (!slug || !title || !editorId) {
      setCreateError("slug, title, and editor are required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await adminFetch<{ data: { id: string } }>("/pulse", {
        method: "POST",
        body: JSON.stringify({
          slug,
          title,
          subtitle: newForm.subtitle.trim() || null,
          editorId,
          mode: newForm.mode,
          heroImageUrl: newForm.heroImageUrl.trim() || null,
          topicTags: newForm.topicTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      navigate(`/admin/pulse/${res.data.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

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
        <div className="flex items-center gap-2">
          <Link
            to="/admin/pulse/editors"
            className="text-xs px-3 py-2 rounded-md border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5"
          >
            Editors ({editorsCount.ready}/{editorsCount.total} READY)
          </Link>
          <button
            onClick={() => {
              setShowNew((v) => !v);
              setCreateError(null);
            }}
            className="text-xs px-3 py-2 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            {showNew ? "Cancel" : "New post"}
          </button>
        </div>
      </header>

      {showNew && (
        <div className="rounded-lg border border-white/10 bg-[#0F1D32] p-4 space-y-3">
          {editors.length === 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              No editors yet. Create an editor first — every post must be attributed to one.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Slug *" hint="URL-safe; final URL is /pulse/<slug>.">
              <input
                value={newForm.slug}
                onChange={(e) => setNewForm({ ...newForm, slug: e.target.value })}
                placeholder="why-podcast-curation-matters"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Title *">
              <input
                value={newForm.title}
                onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                placeholder="Why podcast curation actually matters"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Editor *">
              <select
                value={newForm.editorId}
                onChange={(e) => setNewForm({ ...newForm, editorId: e.target.value })}
                disabled={editors.length === 0}
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                <option value="">— select editor —</option>
                {editors.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.status})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mode *" hint="Phase 4.0: first 4–6 posts must be HUMAN.">
              <select
                value={newForm.mode}
                onChange={(e) => setNewForm({ ...newForm, mode: e.target.value as PostMode })}
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              >
                <option value="HUMAN">HUMAN</option>
                <option value="AI_ASSISTED">AI_ASSISTED</option>
              </select>
            </Field>
            <Field label="Subtitle">
              <input
                value={newForm.subtitle}
                onChange={(e) => setNewForm({ ...newForm, subtitle: e.target.value })}
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Hero image URL">
              <input
                value={newForm.heroImageUrl}
                onChange={(e) => setNewForm({ ...newForm, heroImageUrl: e.target.value })}
                placeholder="https://…"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
          </div>
          <Field label="Topic tags (comma-separated)">
            <input
              value={newForm.topicTags}
              onChange={(e) => setNewForm({ ...newForm, topicTags: e.target.value })}
              placeholder="AI, curation, podcast industry"
              className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>
          {createError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {createError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowNew(false);
                setNewForm({ ...EMPTY_NEW });
                setCreateError(null);
              }}
              className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-[#9CA3AF] hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={createPost}
              disabled={creating || editors.length === 0}
              className="text-xs px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create draft"}
            </button>
          </div>
          <p className="text-[11px] text-[#6B7280]">
            Creates a DRAFT. You'll fill in body, sources, and quotes on the next page, then walk it
            through Review → Publish.
          </p>
        </div>
      )}

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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-[#6B7280] mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#6B7280]">{hint}</p>}
    </div>
  );
}

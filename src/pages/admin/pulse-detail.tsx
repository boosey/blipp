import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useAdminFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type PostStatus = "DRAFT" | "REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
type PostMode = "HUMAN" | "AI_ASSISTED";

interface ValidationFinding {
  rule: string;
  severity: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

interface ValidationReport {
  ok: boolean;
  publishBlocking: ValidationFinding[];
  warnings: ValidationFinding[];
  computed: {
    wordCount: number;
    quotedWordCount: number;
    quoteCounts: Record<string, number>;
    ratio: number | null;
  };
}

interface PulsePostDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  sourcesMarkdown: string | null;
  status: PostStatus;
  mode: PostMode;
  editorId: string;
  heroImageUrl: string | null;
  topicTags: string[];
  wordCount: number | null;
  quotedWordCount: number | null;
  ratioCheckPassed: boolean;
  generationMeta: any;
  scheduledAt: string | null;
  publishedAt: string | null;
  editorReviewedAt: string | null;
  editorRejectedReason: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  editor: { id: string; slug: string; name: string; status: string } | null;
  episodes: {
    episodeId: string;
    pulsePostId: string;
    displayOrder: number;
    episode: {
      id: string;
      slug: string;
      title: string;
      podcast: { id: string; slug: string; title: string };
    };
  }[];
}

interface DetailResponse {
  data: PulsePostDetail;
  validation: ValidationReport;
}

interface QuoteRow {
  sourceId: string;
  words: number;
}

const PULSE_RATIO_MIN = 3.0;
const PULSE_PER_SOURCE_QUOTE_CAP = 50;

export default function PulseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adminFetch = useAdminFetch();

  const [post, setPost] = useState<PulsePostDetail | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [sourcesMarkdown, setSourcesMarkdown] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [topicTags, setTopicTags] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ratioCheckPassed, setRatioCheckPassed] = useState(false);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [citationIds, setCitationIds] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await adminFetch<DetailResponse>(`/pulse/${id}`);
      const p = res.data;
      setPost(p);
      setValidation(res.validation);
      setTitle(p.title);
      setSubtitle(p.subtitle ?? "");
      setBody(p.body);
      setSourcesMarkdown(p.sourcesMarkdown ?? "");
      setHeroImageUrl(p.heroImageUrl ?? "");
      setTopicTags((p.topicTags ?? []).join(", "));
      setScheduledAt(p.scheduledAt ? new Date(p.scheduledAt).toISOString().slice(0, 16) : "");
      setSeoTitle(p.seoTitle ?? "");
      setSeoDescription(p.seoDescription ?? "");
      setRatioCheckPassed(p.ratioCheckPassed);
      setCitationIds(p.episodes.map((e) => e.episode.id).join(", "));
      const incomingQuotes = Array.isArray(p.generationMeta?.quotes)
        ? (p.generationMeta.quotes as QuoteRow[])
        : Object.entries(p.generationMeta?.quoteCounts ?? {}).map(([sourceId, words]) => ({
            sourceId,
            words: Number(words) || 0,
          }));
      setQuotes(incomingQuotes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!post) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title,
        subtitle: subtitle || null,
        body,
        sourcesMarkdown: sourcesMarkdown || null,
        heroImageUrl: heroImageUrl || null,
        topicTags: topicTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        ratioCheckPassed,
        quotes: quotes.filter((q) => q.sourceId.trim() && q.words > 0),
      };
      const res = await adminFetch<DetailResponse>(`/pulse/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setPost(res.data);
      setValidation(res.validation);

      // Persist citations as a separate call (replace-set semantics).
      const ids = citationIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await adminFetch(`/pulse/${post.id}/citations`, {
        method: "PUT",
        body: JSON.stringify({ episodeIds: ids }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function transition(action: string, body?: Record<string, unknown>) {
    if (!post) return;
    setTransitioning(action);
    setError(null);
    try {
      await adminFetch(`/pulse/${post.id}/transitions/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (err) {
      // adminFetch throws Error with the server's `error` field. Re-fetch to
      // surface the latest validation report alongside the error.
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setTransitioning(null);
    }
  }

  const liveQuoteCounts = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    for (const q of quotes) {
      if (!q.sourceId.trim() || q.words <= 0) continue;
      map[q.sourceId] = (map[q.sourceId] ?? 0) + q.words;
      total += q.words;
    }
    return { map, total };
  }, [quotes]);

  const liveWordCount = useMemo(() => approximateWordCount(body), [body]);
  const liveRatio =
    liveQuoteCounts.total > 0 ? (liveWordCount - liveQuoteCounts.total) / liveQuoteCounts.total : null;

  if (loading || !post) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link to="/admin/pulse" className="text-xs text-[#9CA3AF] hover:text-white">
            ← Back to Pulse
          </Link>
          <h1 className="text-2xl font-semibold text-white mt-2">{post.title || "(untitled)"}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#9CA3AF]">
            <span>{post.status}</span>
            <span>·</span>
            <span>{post.mode}</span>
            <span>·</span>
            <span>
              Editor: {post.editor?.name ?? "—"}{" "}
              {post.editor?.status !== "READY" && (
                <span className="text-amber-300">({post.editor?.status})</span>
              )}
            </span>
            {post.status === "PUBLISHED" && (
              <a
                href={`/pulse/${post.slug}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-1 underline hover:text-white"
              >
                View live <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => transition("review")}
            disabled={transitioning !== null || post.status !== "DRAFT"}
            className="text-xs px-3 py-1.5 rounded-md border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 disabled:opacity-30"
          >
            Send to review
          </button>
          <button
            onClick={() =>
              transition("schedule", scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {})
            }
            disabled={transitioning !== null}
            className="text-xs px-3 py-1.5 rounded-md border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 disabled:opacity-30"
          >
            Approve & schedule
          </button>
          <button
            onClick={() => transition("publish")}
            disabled={transitioning !== null}
            className="text-xs px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30"
          >
            Publish now
          </button>
          <button
            onClick={() => {
              if (!rejectReason.trim()) {
                setError("Provide a rejection reason in the field below.");
                return;
              }
              void transition("reject", { reason: rejectReason });
            }}
            disabled={transitioning !== null || post.status === "ARCHIVED"}
            className="text-xs px-3 py-1.5 rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-30"
          >
            Reject
          </button>
          <button
            onClick={() => transition("archive")}
            disabled={transitioning !== null}
            className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-[#9CA3AF] hover:bg-white/5 disabled:opacity-30"
          >
            Archive
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {validation && (
        <ValidationPanel validation={validation} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field label="Subtitle">
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field
            label="Body (markdown)"
            hint={`Live word count ${liveWordCount} · target 800–1500. Live ratio ${liveRatio?.toFixed(2) ?? "—"} (≥${PULSE_RATIO_MIN}:1).`}
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={28}
              className="w-full font-mono text-xs bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-white"
            />
          </Field>

          <Field
            label="Sources footer (markdown)"
            hint="Required at publish — Phase 4.0 Rule 5."
          >
            <textarea
              value={sourcesMarkdown}
              onChange={(e) => setSourcesMarkdown(e.target.value)}
              rows={6}
              className="w-full font-mono text-xs bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-white"
            />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Hero image URL">
            <input
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="https://… (R2 URL or external)"
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field label="Topic tags (comma-separated)">
            <input
              value={topicTags}
              onChange={(e) => setTopicTags(e.target.value)}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field label="Scheduled at (UTC)">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field label="Cited episode IDs (comma-separated)">
            <input
              value={citationIds}
              onChange={(e) => setCitationIds(e.target.value)}
              placeholder="ep-abc, ep-def, …"
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
            {post.episodes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {post.episodes.map((e) => (
                  <li key={e.episodeId} className="text-[11px] text-[#9CA3AF]">
                    <a
                      href={`/p/${e.episode.podcast.slug}/${e.episode.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {e.episode.title}
                    </a>{" "}
                    <span className="text-[#6B7280]">— {e.episode.podcast.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field label="Quoted-words tracker">
            <p className="text-[11px] text-[#9CA3AF] mb-2">
              Per-source cap: {PULSE_PER_SOURCE_QUOTE_CAP} words. Each row counts toward the 3:1 ratio.
            </p>
            {quotes.map((q, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input
                  value={q.sourceId}
                  onChange={(e) => {
                    const next = [...quotes];
                    next[i] = { ...next[i], sourceId: e.target.value };
                    setQuotes(next);
                  }}
                  placeholder="ep-id or url"
                  className="flex-1 bg-[#0F1D32] border border-white/10 rounded-md px-2 py-1 text-xs text-white"
                />
                <input
                  type="number"
                  min={0}
                  value={q.words}
                  onChange={(e) => {
                    const next = [...quotes];
                    next[i] = { ...next[i], words: Number(e.target.value) || 0 };
                    setQuotes(next);
                  }}
                  className={cn(
                    "w-20 bg-[#0F1D32] border rounded-md px-2 py-1 text-xs text-white",
                    (liveQuoteCounts.map[q.sourceId] ?? 0) > PULSE_PER_SOURCE_QUOTE_CAP
                      ? "border-red-500/40 text-red-300"
                      : "border-white/10"
                  )}
                />
                <button
                  onClick={() => setQuotes(quotes.filter((_, idx) => idx !== i))}
                  className="text-xs text-[#6B7280] hover:text-red-300 px-2"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => setQuotes([...quotes, { sourceId: "", words: 0 }])}
              className="text-xs text-[#9CA3AF] hover:text-white border border-white/10 rounded-md px-2 py-1"
            >
              + add quote span
            </button>
            <p className="mt-2 text-[11px] text-[#9CA3AF]">
              Total quoted: {liveQuoteCounts.total} words.
            </p>
          </Field>

          <Field label="Ratio attestation">
            <label className="flex items-start gap-2 text-xs text-[#D1D5DB]">
              <input
                type="checkbox"
                checked={ratioCheckPassed}
                onChange={(e) => setRatioCheckPassed(e.target.checked)}
                className="mt-1"
              />
              I confirm the analysis-to-quotation ratio is ≥{PULSE_RATIO_MIN}:1 and no source exceeds the {PULSE_PER_SOURCE_QUOTE_CAP}-word cap (Phase 4.0 Rule 2 + 3).
            </label>
          </Field>

          <Field label="SEO title override">
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field label="SEO description override">
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>

          <Field label="Rejection reason (used by Reject button)">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full bg-[#0F1D32] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
            {post.editorRejectedReason && (
              <p className="mt-2 text-[11px] text-amber-300">
                Last rejection: {post.editorRejectedReason}
              </p>
            )}
          </Field>
        </div>
      </div>

      <button
        onClick={() => navigate("/admin/pulse")}
        className="text-xs text-[#9CA3AF] hover:text-white"
      >
        ← Back to list
      </button>
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

function ValidationPanel({ validation }: { validation: ValidationReport }) {
  const blocking = validation.publishBlocking;
  const warnings = validation.warnings;
  return (
    <div className="rounded-lg border border-white/5 bg-[#0F1D32] p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        {validation.ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        )}
        <span className="text-white font-medium">
          {validation.ok ? "Ready to publish" : "Cannot publish until issues are resolved"}
        </span>
        <span className="text-[#6B7280] ml-auto">
          {validation.computed.wordCount} words · {validation.computed.quotedWordCount} quoted ·
          ratio {validation.computed.ratio?.toFixed(2) ?? "—"}:1
        </span>
      </div>
      {blocking.length > 0 && (
        <ul className="space-y-1">
          {blocking.map((f, i) => (
            <li key={i} className="text-xs text-red-300 pl-6 list-disc list-inside">
              <span className="text-red-200">[{f.rule}]</span> {f.message}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((f, i) => (
            <li key={i} className="text-xs text-amber-300 pl-6 list-disc list-inside">
              <span className="text-amber-200">[{f.rule}]</span> {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rough word count to mirror the server-side validator's output. */
function approximateWordCount(md: string): number {
  if (!md) return 0;
  let stripped = md.replace(/```[\s\S]*?```/g, " ");
  stripped = stripped.replace(/^##+\s*sources[\s\S]*$/im, "");
  stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  stripped = stripped.replace(/`([^`]+)`/g, "$1");
  return stripped
    .replace(/[#*_>~|-]/g, " ")
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t))
    .length;
}

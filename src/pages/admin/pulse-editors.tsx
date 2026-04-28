import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, ExternalLink } from "lucide-react";
import { useAdminFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type EditorStatus = "NOT_READY" | "READY" | "RETIRED";
const EDITOR_STATUSES: EditorStatus[] = ["NOT_READY", "READY", "RETIRED"];

interface PulseEditor {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  twitterHandle: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  expertiseAreas: string[];
  status: EditorStatus;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: PulseEditor[];
}

const EMPTY_NEW = {
  slug: "",
  name: "",
  bio: "",
  avatarUrl: "",
  twitterHandle: "",
  linkedinUrl: "",
  websiteUrl: "",
  expertiseAreas: "",
};

function statusBadge(status: EditorStatus) {
  const map: Record<EditorStatus, string> = {
    NOT_READY: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    READY: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    RETIRED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  };
  return map[status];
}

function approxBioWords(md: string | null | undefined): number {
  if (!md) return 0;
  return md
    .replace(/[#*_>~|`-]/g, " ")
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

function sameAsCount(e: { twitterHandle: string | null; linkedinUrl: string | null; websiteUrl: string | null }) {
  return [e.twitterHandle, e.linkedinUrl, e.websiteUrl].filter((v) => v && v.trim().length > 0).length;
}

export default function PulseEditors() {
  const adminFetch = useAdminFetch();
  const [editors, setEditors] = useState<PulseEditor[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch<ListResponse>("/pulse/editors");
      setEditors(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createEditor() {
    if (!newForm.slug.trim() || !newForm.name.trim()) {
      setError("slug and name are required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await adminFetch<{ data: PulseEditor }>("/pulse/editors", {
        method: "POST",
        body: JSON.stringify({
          slug: newForm.slug.trim(),
          name: newForm.name.trim(),
          bio: newForm.bio || null,
          avatarUrl: newForm.avatarUrl || null,
          twitterHandle: newForm.twitterHandle || null,
          linkedinUrl: newForm.linkedinUrl || null,
          websiteUrl: newForm.websiteUrl || null,
          expertiseAreas: newForm.expertiseAreas
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      setNewForm({ ...EMPTY_NEW });
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Link to="/admin/pulse" className="text-xs text-[#9CA3AF] hover:text-white">
            ← Back to Pulse
          </Link>
          <h1 className="text-2xl font-semibold text-white mt-2">Pulse editors</h1>
          <p className="text-sm text-[#9CA3AF] mt-1 max-w-prose">
            Editors are the bylines on every Pulse post. Phase 4.0 Rule 1: an editor must be{" "}
            <span className="text-emerald-300">READY</span> (bio ≥200 words + at least one same-as link) before
            their posts can be published.
          </p>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-xs px-3 py-2 rounded-md border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5 inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          {showNew ? "Cancel" : "New editor"}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {showNew && (
        <div className="rounded-lg border border-white/10 bg-[#0F1D32] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Slug *">
              <input
                value={newForm.slug}
                onChange={(e) => setNewForm({ ...newForm, slug: e.target.value })}
                placeholder="alex-boudreaux"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Name *">
              <input
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                placeholder="Alex Boudreaux"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Avatar URL">
              <input
                value={newForm.avatarUrl}
                onChange={(e) => setNewForm({ ...newForm, avatarUrl: e.target.value })}
                placeholder="https://…"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Twitter handle (no @)">
              <input
                value={newForm.twitterHandle}
                onChange={(e) => setNewForm({ ...newForm, twitterHandle: e.target.value })}
                placeholder="alex"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="LinkedIn URL">
              <input
                value={newForm.linkedinUrl}
                onChange={(e) => setNewForm({ ...newForm, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/…"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Website URL">
              <input
                value={newForm.websiteUrl}
                onChange={(e) => setNewForm({ ...newForm, websiteUrl: e.target.value })}
                placeholder="https://…"
                className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              />
            </Field>
          </div>
          <Field label="Expertise areas (comma-separated)">
            <input
              value={newForm.expertiseAreas}
              onChange={(e) => setNewForm({ ...newForm, expertiseAreas: e.target.value })}
              placeholder="AI, podcast industry"
              className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </Field>
          <Field label="Bio (markdown)" hint="≥200 words is required for READY status (E-E-A-T).">
            <textarea
              value={newForm.bio}
              onChange={(e) => setNewForm({ ...newForm, bio: e.target.value })}
              rows={6}
              className="w-full font-mono text-xs bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-white"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowNew(false);
                setNewForm({ ...EMPTY_NEW });
              }}
              className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-[#9CA3AF] hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={createEditor}
              disabled={creating}
              className="text-xs px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create editor"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-[#9CA3AF]" />
        </div>
      ) : editors.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-[#0F1D32] text-center text-sm text-[#6B7280] py-12">
          No editors yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {editors.map((e) => (
            <EditorCard key={e.id} editor={e} onChanged={load} adminFetch={adminFetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function EditorCard({
  editor,
  onChanged,
  adminFetch,
}: {
  editor: PulseEditor;
  onChanged: () => Promise<void>;
  adminFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
  const [name, setName] = useState(editor.name);
  const [bio, setBio] = useState(editor.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(editor.avatarUrl ?? "");
  const [twitterHandle, setTwitterHandle] = useState(editor.twitterHandle ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(editor.linkedinUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(editor.websiteUrl ?? "");
  const [expertiseAreas, setExpertiseAreas] = useState((editor.expertiseAreas ?? []).join(", "));
  const [status, setStatus] = useState<EditorStatus>(editor.status);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setName(editor.name);
    setBio(editor.bio ?? "");
    setAvatarUrl(editor.avatarUrl ?? "");
    setTwitterHandle(editor.twitterHandle ?? "");
    setLinkedinUrl(editor.linkedinUrl ?? "");
    setWebsiteUrl(editor.websiteUrl ?? "");
    setExpertiseAreas((editor.expertiseAreas ?? []).join(", "));
    setStatus(editor.status);
  }, [editor]);

  const bioWords = approxBioWords(bio);
  const liveSameAs = sameAsCount({
    twitterHandle: twitterHandle || null,
    linkedinUrl: linkedinUrl || null,
    websiteUrl: websiteUrl || null,
  });
  const eligibleForReady = bioWords >= 200 && liveSameAs >= 1;

  async function save(nextStatus?: EditorStatus) {
    setSaving(true);
    setLocalError(null);
    try {
      await adminFetch<{ data: PulseEditor }>(`/pulse/editors/${editor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          bio: bio || null,
          avatarUrl: avatarUrl || null,
          twitterHandle: twitterHandle || null,
          linkedinUrl: linkedinUrl || null,
          websiteUrl: websiteUrl || null,
          expertiseAreas: expertiseAreas
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          ...(nextStatus ? { status: nextStatus } : {}),
        }),
      });
      setSavedAt(Date.now());
      await onChanged();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/5 bg-[#0F1D32] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{editor.name}</h3>
            <span className={cn("text-[10px] px-2 py-0.5 rounded border", statusBadge(editor.status))}>
              {editor.status}
            </span>
          </div>
          <div className="text-[11px] text-[#6B7280] mt-1 flex items-center gap-2 flex-wrap">
            <span>/pulse/by/{editor.slug}</span>
            <span>·</span>
            <span>{bioWords} bio words</span>
            <span>·</span>
            <span>{liveSameAs} same-as link{liveSameAs === 1 ? "" : "s"}</span>
            <a
              href={`/pulse/by/${editor.slug}`}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 hover:text-white"
            >
              view archive <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EditorStatus)}
            className="text-xs bg-[#0B1628] border border-white/10 rounded-md px-2 py-1 text-white"
          >
            {EDITOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {status !== editor.status && (
            <button
              onClick={() => save(status)}
              disabled={saving || (status === "READY" && !eligibleForReady)}
              className="text-xs px-2 py-1 rounded-md border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 disabled:opacity-30"
              title={
                status === "READY" && !eligibleForReady
                  ? "Need bio ≥200 words + at least one same-as link before promoting to READY"
                  : undefined
              }
            >
              Apply status
            </button>
          )}
        </div>
      </div>

      {status === "READY" && !eligibleForReady && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          This editor will fail Phase 4.0 Rule 1 if kept READY: needs bio ≥200 words and at least one same-as
          link (twitter, linkedin, or website).
        </div>
      )}

      {localError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {localError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="Avatar URL">
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="Twitter handle (no @)">
          <input
            value={twitterHandle}
            onChange={(e) => setTwitterHandle(e.target.value)}
            className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="LinkedIn URL">
          <input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="Website URL">
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="Expertise areas (comma-separated)">
          <input
            value={expertiseAreas}
            onChange={(e) => setExpertiseAreas(e.target.value)}
            className="w-full bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-sm text-white"
          />
        </Field>
      </div>

      <Field
        label="Bio (markdown)"
        hint={`${bioWords} words · ${bioWords >= 200 ? "meets" : "below"} 200-word minimum.`}
      >
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={8}
          className="w-full font-mono text-xs bg-[#0B1628] border border-white/10 rounded-md px-3 py-2 text-white"
        />
      </Field>

      <div className="flex items-center justify-end gap-2">
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="text-[11px] text-emerald-300">Saved.</span>
        )}
        <button
          onClick={() => save()}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/5 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
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

# Prompt Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add version history to admin prompts so admins can create multiple versions, annotate them with notes, and activate any version for pipeline use.

**Architecture:** New `PromptVersion` model stores every saved prompt state. The existing `PlatformConfig` key-value store continues to hold the active prompt value — pipeline code (`getConfig()` in `distillation.ts`) is untouched. Saving a prompt auto-creates a version. Activating a version copies its value into `PlatformConfig`.

**Tech Stack:** Prisma 7, Hono v4, React 19, Tailwind v4, shadcn/ui

---

### Task 1: Add PromptVersion model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma:728` (after PlatformConfig model)
- Modify: `tests/helpers/mocks.ts` (add promptVersion to mock factory)

- [ ] **Step 1: Add PromptVersion model**

Add after the `PlatformConfig` model block (line 729) in `prisma/schema.prisma`:

```prisma
model PromptVersion {
  id        String   @id @default(cuid())
  promptKey String
  version   Int
  label     String?
  value     String
  notes     String?
  createdAt DateTime @default(now())
  createdBy String?

  @@unique([promptKey, version])
  @@index([promptKey])
}
```

- [ ] **Step 2: Add promptVersion to mock factory**

In `tests/helpers/mocks.ts`, add `promptVersion: modelMethods(),` after the existing model entries (e.g. after `recommendationDismissal`).

- [ ] **Step 3: Add PromptVersion type to admin types**

In `src/types/admin.ts`, add:

```typescript
// ── Prompt Versioning ──

export interface PromptVersionEntry {
  id: string;
  promptKey: string;
  version: number;
  label: string | null;
  value: string;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  isActive: boolean;
}
```

- [ ] **Step 4: Generate Prisma client and push schema**

```bash
npx prisma generate
npx prisma db push
```

Then copy the barrel export:
```bash
cp src/generated/prisma/index.ts src/generated/prisma/index.ts.bak 2>/dev/null; echo 'export * from "./client";' > src/generated/prisma/index.ts
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma tests/helpers/mocks.ts src/types/admin.ts
git commit -m "feat(schema): add PromptVersion model for prompt versioning"
```

---

### Task 2: Add version endpoints to prompts route

**Files:**
- Modify: `worker/routes/admin/prompts.ts`

The existing route file handles GET `/`, PATCH `/:key`, DELETE `/:key`. We need to:
1. Modify PATCH `/:key` to also create a PromptVersion row
2. Add GET `/:key/versions` to list versions
3. Add PATCH `/:key/versions/:id/activate` to activate a version
4. Add PATCH `/:key/versions/:id/notes` to update notes
5. Modify GET `/` to include `activeVersionId`

- [ ] **Step 1: Add helper to get next version number**

At the top of `worker/routes/admin/prompts.ts`, after the `VALID_KEYS` const, add:

```typescript
async function getNextVersion(prisma: any, promptKey: string): Promise<number> {
  const latest = await prisma.promptVersion.findFirst({
    where: { promptKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}
```

- [ ] **Step 2: Modify PATCH /:key to create a PromptVersion on save**

In the existing `promptsRoutes.patch("/:key", ...)` handler, after the successful `platformConfig.update` or `platformConfig.create`, add version creation:

```typescript
const nextVersion = await getNextVersion(prisma, key);
await prisma.promptVersion.create({
  data: {
    promptKey: key,
    version: nextVersion,
    value: body.value,
    label: body.label ?? null,
    createdBy: auth?.userId ?? null,
  },
});
```

Also update the request body type to accept optional `label`:
```typescript
const body = await c.req.json<{ value: string; label?: string }>();
```

- [ ] **Step 3: Add GET /:key/versions endpoint**

```typescript
/** GET /:key/versions — List all versions for a prompt key. */
promptsRoutes.get("/:key/versions", async (c) => {
  const prisma = c.get("prisma") as any;
  const key = decodeURIComponent(c.req.param("key"));

  if (!VALID_KEYS.has(key)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  const versions = await prisma.promptVersion.findMany({
    where: { promptKey: key },
    orderBy: { version: "desc" },
  });

  // Determine which version is active by comparing value to current config
  const config = await prisma.platformConfig.findUnique({ where: { key } });
  const activeValue = config ? (config.value as string) : null;

  const data = versions.map((v: any) => ({
    id: v.id,
    promptKey: v.promptKey,
    version: v.version,
    label: v.label,
    value: v.value,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy,
    isActive: activeValue !== null && v.value === activeValue,
  }));

  return c.json({ data });
});
```

- [ ] **Step 4: Add PATCH /:key/versions/:id/activate endpoint**

```typescript
/** PATCH /:key/versions/:id/activate — Activate a specific version. */
promptsRoutes.patch("/:key/versions/:id/activate", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const key = decodeURIComponent(c.req.param("key"));
  const versionId = c.req.param("id");

  if (!VALID_KEYS.has(key)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.promptKey !== key) {
    return c.json({ error: "Version not found" }, 404);
  }

  const meta = PROMPT_METADATA[key];
  await prisma.platformConfig.upsert({
    where: { key },
    create: {
      key,
      value: version.value,
      description: meta?.description,
      updatedBy: auth?.userId ?? null,
    },
    update: {
      value: version.value,
      description: meta?.description,
      updatedBy: auth?.userId ?? null,
    },
  });

  writeAuditLog(prisma, {
    actorId: auth?.userId ?? "unknown",
    action: "prompt.activate_version",
    entityType: "PromptVersion",
    entityId: versionId,
    after: { promptKey: key, version: version.version },
  }).catch(() => {});

  return c.json({ data: { key, versionId, version: version.version } });
});
```

- [ ] **Step 5: Add PATCH /:key/versions/:id/notes endpoint**

```typescript
/** PATCH /:key/versions/:id/notes — Update notes on a version. */
promptsRoutes.patch("/:key/versions/:id/notes", async (c) => {
  const prisma = c.get("prisma") as any;
  const key = decodeURIComponent(c.req.param("key"));
  const versionId = c.req.param("id");
  const body = await c.req.json<{ notes: string }>();

  if (!VALID_KEYS.has(key)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.promptKey !== key) {
    return c.json({ error: "Version not found" }, 404);
  }

  await prisma.promptVersion.update({
    where: { id: versionId },
    data: { notes: body.notes },
  });

  return c.json({ data: { id: versionId, notes: body.notes } });
});
```

- [ ] **Step 6: Commit**

```bash
git add worker/routes/admin/prompts.ts
git commit -m "feat(admin): add prompt versioning endpoints"
```

---

### Task 3: Update frontend prompt section with version history

**Files:**
- Modify: `src/pages/admin/stage-configuration.tsx`

The prompt section currently shows a textarea per prompt with save/reset buttons. Add a version history panel below each prompt editor.

- [ ] **Step 1: Import PromptVersionEntry type and add state**

At top of file, add import:
```typescript
import type { PromptVersionEntry } from "@/types/admin";
```

Add new icons to lucide import:
```typescript
import { History, Play, StickyNote } from "lucide-react";
```

Add state variables inside `StageConfiguration()`:
```typescript
const [versions, setVersions] = useState<Record<string, PromptVersionEntry[]>>({});
const [expandedVersions, setExpandedVersions] = useState<string | null>(null);
const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
const [savingNotes, setSavingNotes] = useState<string | null>(null);
```

- [ ] **Step 2: Add loadVersions function**

```typescript
const loadVersions = useCallback(async (promptKey: string) => {
  try {
    const res = await apiFetch<{ data: PromptVersionEntry[] }>(
      `/prompts/${encodeURIComponent(promptKey)}/versions`
    );
    setVersions((prev) => ({ ...prev, [promptKey]: res.data }));
  } catch {
    toast.error("Failed to load versions");
  }
}, [apiFetch]);
```

- [ ] **Step 3: Add handler functions**

```typescript
const handleActivateVersion = async (promptKey: string, versionId: string) => {
  setSaving(`activate:${versionId}`);
  try {
    await apiFetch(
      `/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}/activate`,
      { method: "PATCH" }
    );
    toast.success("Version activated");
    await load();
    await loadVersions(promptKey);
  } catch {
    toast.error("Failed to activate version");
  } finally {
    setSaving(null);
  }
};

const handleSaveNotes = async (promptKey: string, versionId: string) => {
  setSavingNotes(versionId);
  try {
    await apiFetch(
      `/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}/notes`,
      {
        method: "PATCH",
        body: JSON.stringify({ notes: editingNotes[versionId] ?? "" }),
      }
    );
    toast.success("Notes saved");
    await loadVersions(promptKey);
  } catch {
    toast.error("Failed to save notes");
  } finally {
    setSavingNotes(null);
  }
};

const toggleVersionHistory = (promptKey: string) => {
  if (expandedVersions === promptKey) {
    setExpandedVersions(null);
  } else {
    setExpandedVersions(promptKey);
    loadVersions(promptKey);
  }
};
```

- [ ] **Step 4: Add version history UI below each prompt's save/reset buttons**

Inside the prompt `stagePrompts.map(...)` render, after the existing save/reset button `<div>`, add version history toggle and panel:

```tsx
{/* Version History */}
<div className="border-t border-white/5 pt-2 mt-2">
  <button
    onClick={() => toggleVersionHistory(prompt.key)}
    className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors"
  >
    <History className="h-3 w-3" />
    Version History
    {expandedVersions === prompt.key ? (
      <ChevronDown className="h-3 w-3" />
    ) : (
      <ChevronRight className="h-3 w-3" />
    )}
  </button>

  {expandedVersions === prompt.key && (
    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
      {(versions[prompt.key] ?? []).length === 0 ? (
        <p className="text-[10px] text-[#6B7280] italic">No versions saved yet</p>
      ) : (
        (versions[prompt.key] ?? []).map((v) => (
          <div
            key={v.id}
            className={cn(
              "rounded-lg border p-2.5 space-y-1.5",
              v.isActive
                ? "bg-[#10B981]/5 border-[#10B981]/30"
                : "bg-[#0F1D32] border-white/5"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold text-[#F9FAFB]">
                  v{v.version}
                </span>
                {v.label && (
                  <span className="text-[10px] text-[#9CA3AF]">{v.label}</span>
                )}
                {v.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981]">
                    active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!v.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleActivateVersion(prompt.key, v.id)}
                    disabled={saving === `activate:${v.id}`}
                    className="h-6 text-[10px] text-[#10B981] hover:bg-[#10B981]/10 gap-1 px-2"
                  >
                    <Play className="h-2.5 w-2.5" />
                    Activate
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditValues((prev) => ({ ...prev, [prompt.key]: v.value }));
                  }}
                  className="h-6 text-[10px] text-[#3B82F6] hover:bg-[#3B82F6]/10 px-2"
                >
                  Load
                </Button>
              </div>
            </div>

            <div className="text-[10px] text-[#6B7280]">
              {new Date(v.createdAt).toLocaleString()}
            </div>

            {/* Notes */}
            <div className="flex items-start gap-1.5">
              <StickyNote className="h-3 w-3 text-[#6B7280] mt-0.5 shrink-0" />
              <textarea
                value={editingNotes[v.id] ?? v.notes ?? ""}
                onChange={(e) =>
                  setEditingNotes((prev) => ({ ...prev, [v.id]: e.target.value }))
                }
                placeholder="Add notes about this version..."
                className="flex-1 bg-transparent border-none text-[10px] text-[#9CA3AF] placeholder:text-[#4B5563] resize-none focus:outline-none min-h-[20px]"
                rows={1}
              />
              {(editingNotes[v.id] !== undefined && editingNotes[v.id] !== (v.notes ?? "")) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSaveNotes(prompt.key, v.id)}
                  disabled={savingNotes === v.id}
                  className="h-5 text-[10px] text-[#F59E0B] hover:bg-[#F59E0B]/10 px-1.5"
                >
                  {savingNotes === v.id ? "..." : "Save"}
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/stage-configuration.tsx
git commit -m "feat(admin): add prompt version history UI"
```

---

### Task 4: Verify and test

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Fix any type errors.

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run worker/routes/__tests__/ --reporter=verbose 2>/dev/null; npx vitest run src/__tests__/ --reporter=verbose
```

Fix any broken tests (the mock factory change could affect some).

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

1. Open admin → Stage Configuration
2. Expand a stage with prompts (Distillation or Narrative)
3. Edit a prompt, save → verify version appears in history
4. Save again with different text → verify v2 appears
5. Click "Activate" on v1 → verify prompt reverts and v1 shows "active"
6. Add notes to a version → verify save works
7. Click "Load" on a version → verify textarea updates
8. Reset to default → verify prompt returns to code default

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: prompt versioning polish"
```

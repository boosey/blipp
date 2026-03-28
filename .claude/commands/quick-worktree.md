---
name: quick-worktree
description: Create a lightweight git worktree for isolated changes that will be merged directly to main. Skips database isolation, dev server setup, and session restart. Uses junction-linked node_modules for instant setup. Use when the user needs branch isolation for straightforward changes across parallel sessions but doesn't need a full dev environment.
---

# Quick Worktree

Create a minimal git worktree for isolated source changes, test verification, and direct merge back to main. No dev environment setup — just enough to edit, test, and ship.

**Announce at start:** "Quick worktree for [feature-name]."

## Phase 1: Branch Name

Determine the branch name from context. Use conventional prefixes in kebab-case:

| Prefix | When to use |
|--------|-------------|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `refactor/` | Code restructuring, no behavior change |
| `chore/` | Maintenance, deps, CI, config |
| `docs/` | Documentation only |
| `test/` | Test additions or changes |

**Format:** `<prefix>/<short-kebab-description>` — e.g., `feat/podcast-search`, `fix/queue-retry-logic`

If the prefix is obvious from context, confirm rather than ask: "I'll create `feat/podcast-search` — sound right?"

If the user already specified a branch name, use it as-is.

## Phase 2: Create Worktree

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)

# Ensure .worktrees/ exists and is gitignored
mkdir -p "$REPO_ROOT/.worktrees"
if ! git check-ignore -q "$REPO_ROOT/.worktrees" 2>/dev/null; then
  echo ".worktrees/" >> "$REPO_ROOT/.gitignore"
  git add "$REPO_ROOT/.gitignore"
  git commit -m "chore: add .worktrees/ to .gitignore"
fi

# Directory name: replace / with - (feat/auth → feat-auth)
DIR_NAME=$(echo "$BRANCH_NAME" | tr '/' '-')
TREE="$REPO_ROOT/.worktrees/$DIR_NAME"

git worktree add "$TREE" -b "$BRANCH_NAME"
```

### CRITICAL: Path Discipline

**From this point forward, ALL file operations (Read, Edit, Write, Grep, Glob) MUST use `$TREE` as the base path.** Never touch files via the main repo path.

## Phase 3: Link node_modules

Junction-link `node_modules` from main instead of running `npm install`. This is instant and safe when the worktree starts from the same commit (identical `package.json` and lockfile).

```bash
# Windows: directory junction (instant, transparent to Node)
cmd.exe /c "mklink /J \"$(cygpath -w "$TREE/node_modules")\" \"$(cygpath -w "$REPO_ROOT/node_modules")\""
```

For non-Windows:
```bash
ln -s "$REPO_ROOT/node_modules" "$TREE/node_modules"
```

**If you change `package.json` in this worktree**, you must break the junction and do a real install:
```bash
# Windows
cmd.exe /c "rmdir \"$(cygpath -w "$TREE/node_modules")\""
cd "$TREE" && npm install --legacy-peer-deps
```

## Phase 4: Copy Env Files

Copy from **main repo** (`$REPO_ROOT`), never from old worktrees.

```bash
# Discover gitignored files that need copying
cd "$REPO_ROOT"
git ls-files --others --ignored --exclude-standard | grep -v node_modules | grep -v '.worktrees' | grep -v '.vite' | head -30
```

Common patterns — copy everything that exists:

```bash
for f in .env .env.local .env.total .dev.vars neon-config.env; do
  [ -f "$REPO_ROOT/$f" ] && cp "$REPO_ROOT/$f" "$TREE/$f"
done
```

Check CLAUDE.md for any additional project-specific files.

## Phase 5: Copy Generated Files

Copy gitignored generated files that the build/test pipeline needs. Do NOT run generators — main's output is identical (same commit).

```bash
# Prisma barrel export (gitignored, required by bundler)
BARREL="src/generated/prisma/index.ts"
if [ -f "$REPO_ROOT/$BARREL" ]; then
  mkdir -p "$TREE/$(dirname "$BARREL")"
  cp "$REPO_ROOT/$BARREL" "$TREE/$BARREL"
fi
```

Check CLAUDE.md for other generated files specific to this project.

## Phase 6: Smoke Check

Do a quick sanity check — NOT the full test suite. The worktree is forked from a known-good main, so a full run is wasted time. Just confirm the link/copy setup works:

```bash
cd "$TREE"
# Verify node_modules resolves correctly
node -e "require('typescript')" 2>&1
```

If the smoke check fails, investigate the junction/copy setup. Do NOT run `npm run typecheck` or `npm test` here — save that for after making changes.

## Phase 7: Report

```
Quick worktree ready at: $TREE
Branch: $BRANCH_NAME
node_modules: junction-linked from main
Env files: [list copied]

Ready for changes. When done: merge to main and push.
```

## Phase 8: Switch to Worktree and Clear Context

After the report, switch into the worktree directory and clear the conversation context so the session starts fresh with the worktree as the working directory.

```bash
cd "$TREE"
```

Then immediately run `/clear` to reset the conversation context.

## Phase 9: Enter Plan Mode

After clearing context, call `EnterPlanMode` so the user lands in a planning state, ready to think through their implementation before writing code.

## Post-Work: Merge and Cleanup

When the user is done with changes, use the `/teardown-worktree` skill. It handles: commit check, full typecheck + tests, merge to main, junction removal, worktree + branch cleanup, prisma regeneration if needed, and push confirmation.

## Rules

1. **Use the worktree path for everything.** After Phase 2, the main repo path is off-limits for file operations.
2. **Copy env files from main, not old worktrees.** Main has the latest secrets.
3. **CLAUDE.md overrides this skill.** Project-specific instructions always win.
4. **Skip full test/typecheck during setup.** The worktree forks from a known-good main — run tests after making changes, not before.
5. **Junction-linked node_modules is read-only in spirit.** If you need to change deps, break the junction first and do a real install.

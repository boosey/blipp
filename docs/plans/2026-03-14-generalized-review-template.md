# Generalized SaaS Codebase Review Template

**Purpose:** A reusable 12-step framework for comprehensive code review, refactoring planning, and SaaS launch readiness assessment. Designed to be run by AI agents in parallel where possible.

---

## Overview

This template produces 6 analysis documents and 1 master plan. It can be executed by a team of 5 agents plus a team lead in ~2 hours, or sequentially in ~8 hours.

### Agent Structure

```
Team Lead (you)
  ├── docs-reviewer      → Task 0 (architecture & docs)
  ├── code-analyst       → Tasks 4, 5, 6, 7, 8 (code quality)
  ├── error-analyst      → Tasks 3, 9 (error handling & AI errors)
  ├── security-reviewer  → Task 10 (security)
  └── ux-reviewer        → Task 11 (UX/frontend)

Team Lead handles: Tasks 1 (fix errors), 2 (tests), 12 (master plan)
```

### Execution Order

1. **Launch agents in parallel** for analysis tasks (0, 3-11)
2. **Fix typecheck errors** while agents run (Task 1) — establishes clean baseline
3. **Synthesize findings** when agents complete → master plan (Task 12)
4. **Expand tests** based on findings (Task 2)

---

## The 12 Steps

### Step 0: Architecture & Documentation Review

**Agent:** docs-reviewer (general-purpose, full write access)
**Output:** Updated docs + `saas-readiness-gaps.md`

Instructions for agent:
1. Read ALL source files across the codebase
2. Update each existing doc to reflect CURRENT state:
   - Architecture docs — tech stack, file structure, data flow
   - API reference — all endpoints with request/response shapes
   - Data model — all database tables, relationships, enums
   - Development guide — setup, scripts, known issues
3. Document architectural DECISIONS and LESSONS LEARNED
4. Evaluate missing SaaS functionality:
   - Governance (audit logs, compliance, data retention)
   - Administration (user management, system health, alerts)
   - Performance (caching, CDN, cold starts, query optimization)
   - Reliability (circuit breakers, graceful degradation, backups)
   - Observability (metrics, dashboards, tracing, alerting)
   - Operations (deployment, rollback, feature flags)
   - Billing (usage tracking, metering, limits)
   - Multi-tenancy and data isolation
   - Rate limiting and abuse prevention

### Step 1: Fix All Existing Errors

**Agent:** Team lead (direct)
**Output:** Clean typecheck, no regressions

1. Run `typecheck` / `lint` / `build`
2. Fix all errors — categorize as:
   - Type mismatches (interface drift, missing types)
   - Import errors (removed exports, renamed modules)
   - Test signature mismatches (API changes not reflected in tests)
   - Missing type declarations
3. Verify no regressions with full test suite
4. Document pre-existing test failures vs new ones

### Step 2: Test Coverage Review

**Agent:** Team lead or dedicated test agent
**Output:** Test expansion plan + new tests

1. Map current coverage (which modules have tests, which don't)
2. Identify critical untested paths:
   - Auth/authz edge cases
   - Error/failure paths in all API routes
   - External service failure simulation
   - Webhook handlers
   - State machine transitions
   - Race conditions in async code
3. Add exhaustive tests for:
   - Edge cases: empty inputs, max values, boundary conditions
   - Exceptional conditions: network failures, timeout, malformed responses
   - Error paths: invalid auth, missing resources, constraint violations

### Step 3: External Service Error System Design

**Agent:** error-analyst (general-purpose, write access)
**Output:** `error-capture-design.md`

For applications that call external services (AI, payment, messaging, etc.):
1. Catalog all external service call sites
2. Design a structured error capture system:
   - Error class with: service, operation, input context, raw error, timing, retry count
   - Database table for queryable error history
   - Error classification (transient vs permanent)
   - Recovery strategies (retry, fallback, circuit breaker)
   - Admin dashboard integration
   - AI-analyzable structured format for pattern detection

### Step 4: Brittleness Review

**Agent:** code-analyst (general-purpose, write access)
**Output:** Section in `code-quality-analysis.md`

Scan for:
- [ ] Hardcoded values that should be configurable
- [ ] Fragile string parsing or regex without validation
- [ ] Assumptions about data shapes without schema validation
- [ ] Missing null/undefined checks on external data
- [ ] Race conditions in async code
- [ ] Implicit ordering dependencies
- [ ] Magic numbers without named constants
- [ ] Time-based heuristics that could fail under load
- [ ] Module-level state in serverless/request-scoped environments

### Step 5: Coupling Evaluation

**Agent:** code-analyst
**Output:** Section in `code-quality-analysis.md`

Identify where modules are tightly coupled:
- [ ] Backend response shapes hardcoded in frontend types (no shared schema)
- [ ] Queue/event message shapes defined only at consumer (not shared)
- [ ] Boilerplate patterns copy-pasted instead of abstracted
- [ ] Cross-boundary imports (frontend importing from backend or vice versa)
- [ ] Config key names as string literals scattered across files
- [ ] Naming conventions that differ across contexts for the same concept

### Step 6: Abstraction Opportunity Analysis

**Agent:** code-analyst
**Output:** Section in `code-quality-analysis.md`

For each external integration, rate on 5 dimensions (1-5):

| Dimension | Description |
|-----------|-------------|
| Risk of abstracting | Complexity cost of adding an abstraction layer |
| Risk of NOT abstracting | Vendor lock-in cost if you need to switch |
| Probability of change | How likely you'll need to switch (next 2 years) |
| Implementation effort | How much work to add the abstraction |
| Value delivered | How much it simplifies the codebase |

Common integration points to evaluate:
- Auth provider
- Database / ORM
- Object storage
- Runtime / deployment platform
- Payment processor
- AI/ML services
- Messaging / queues
- Email / notifications
- External data sources

**Verdict framework:**
- Score > 15 → Abstract now
- Score 10-15 → Plan abstraction
- Score < 10 → Don't abstract

### Step 7: Refactoring Opportunities

**Agent:** code-analyst
**Output:** Section in `code-quality-analysis.md`

Find:
- [ ] Duplicate code patterns (same logic in 2+ places)
- [ ] Overly long functions (>100 lines)
- [ ] Dead/unreferenced code
- [ ] Unnecessary abstractions (wrappers that add no value)
- [ ] Similar-but-different patterns that should be unified
- [ ] Stub/placeholder code that was never completed

### Step 8: Code Quality Assessment

**Agent:** code-analyst
**Output:** Section in `code-quality-analysis.md`

Assess:
- [ ] Naming consistency (functions, variables, files, types)
- [ ] Function length and cyclomatic complexity
- [ ] File organization and module boundaries
- [ ] Type safety gaps (`any` usage, untyped parameters)
- [ ] Error message quality (actionable? contextual?)
- [ ] Configuration management (centralized? typed? validated?)
- [ ] Test quality and mock patterns

### Step 9: Error Handling & Logging Review

**Agent:** error-analyst
**Output:** `error-handling-review.md`

Evaluate:
- [ ] Is there structured logging? Or just `console.log`?
- [ ] Can you trace a request through the entire system?
- [ ] Are there silent failures (caught errors that are swallowed)?
- [ ] Are error responses consistent and helpful?
- [ ] Is there differentiation between transient vs permanent failures?
- [ ] Are there monitoring gaps where failures go unnoticed?
- [ ] Is retry behavior clear and documented?
- [ ] Is there a global error handler?
- [ ] Are correlation/request IDs propagated?

### Step 10: Security Review

**Agent:** security-reviewer (general-purpose, read-only preferred)
**Output:** `security-review.md`

Checklist:
- [ ] Auth: All routes properly protected?
- [ ] Authz: Role-based access correctly enforced?
- [ ] Data exposure: API responses leaking sensitive data?
- [ ] User isolation: Can user A see user B's data?
- [ ] Input validation: Bodies, params, headers validated?
- [ ] Injection: SQL, XSS, command injection vectors?
- [ ] CORS: Properly restricted to known origins?
- [ ] CSRF: Protected?
- [ ] Rate limiting: Present?
- [ ] Secrets management: No hardcoded secrets?
- [ ] Webhook verification: Signatures validated?
- [ ] Error verbosity: Production errors leaking internals?
- [ ] PII handling: Data retention, export, deletion?
- [ ] Dependency security: Known vulnerabilities in deps?

Rate findings as: CRITICAL / HIGH / MEDIUM / LOW

### Step 11: UX/Frontend Review

**Agent:** ux-reviewer (general-purpose, read-only)
**Output:** `ux-improvement-plan.md`

Evaluate:
- [ ] User journey from signup to daily use
- [ ] Onboarding experience (first-time users)
- [ ] Core interaction patterns (the thing users do most)
- [ ] Loading states, skeletons, transitions
- [ ] Empty states with clear CTAs
- [ ] Error states that help users recover
- [ ] Mobile responsiveness
- [ ] Accessibility (screen readers, keyboard, contrast)
- [ ] Performance (bundle size, lazy loading, caching)

Prioritize as:
- **P0 (Launch Blockers)**: Must-have for public launch
- **P1 (Launch Quality)**: Expected by users
- **P2 (Delight)**: Differentiators
- **P3 (Future)**: Post-launch

### Step 12: Master Plan & Synthesis

**Agent:** Team lead
**Output:** `master-review-plan.md` + this template

1. Compile all findings into a phased implementation plan
2. Order phases by:
   - Security first (vulnerabilities before any production traffic)
   - Observability second (can't manage what you can't measure)
   - Quality third (reduce runtime failure risk)
   - Tests fourth (lock in quality improvements)
   - UX fifth (make it usable after the infrastructure is solid)
   - Operations last (scaling features before scaling)
3. Document architectural decisions and lessons learned
4. Save the generalized template for reuse

---

## Tips for Running This Review

### Parallelization
Steps 0, 3-11 can all run in parallel via agents. Step 1 (fix errors) can run concurrently since it operates on different files. Steps 2, 12 are sequential and depend on analysis completion.

### Agent Prompting
- Give each agent the WORKING DIRECTORY explicitly
- Tell agents to write findings to specific file paths
- Tell agents to use TaskUpdate to mark completion
- Use `run_in_background: true` for all analysis agents

### Scope Management
- For large codebases (>500 files), scope analysis agents to specific directories
- For monorepos, run one review per package/service
- Time-box agent execution to prevent runaway analysis

### Adapting to Different Stacks
- Replace "Prisma" references with your ORM
- Replace "Hono" references with your HTTP framework
- Replace "Cloudflare Workers" with your runtime
- The security checklist and code quality assessment are stack-agnostic
- The UX review applies to any user-facing application

### When to Re-Run
- Before major releases
- After large feature merges
- Quarterly maintenance cycles
- When onboarding new team members (the output documents serve as codebase orientation)

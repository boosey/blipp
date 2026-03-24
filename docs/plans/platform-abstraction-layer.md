# Platform Abstraction Layer

## Context
Blipp runs on Cloudflare Workers and is tightly coupled to CF-specific APIs (Queues, R2, Workers AI). To enable future platform migration without a big-bang rewrite, we're introducing thin interfaces over the three highest-coupling areas and splitting the entry point. CF remains the primary target — abstractions should be zero-cost on CF (structural conformance, no runtime wrapping).

**Key insight**: CF's `Queue<T>` and `MessageBatch<T>` already structurally conform to the proposed queue interfaces. For storage, we use S3-shaped method names (the industry standard) with the native R2 binding under the hood — no HTTP overhead on CF, but a future swap to `@aws-sdk/client-s3` is trivial since R2 is S3-compatible.

## Phase 1: Define Interfaces (new files, no existing changes)

Create `worker/lib/platform/types.ts`:

### Queue interfaces
```typescript
export interface QueueProducer<T = unknown> {
  send(body: T, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch(messages: { body: T; delaySeconds?: number }[]): Promise<void>;
}

export interface QueueMessage<T = unknown> {
  id: string;
  timestamp: Date;
  body: T;
  ack(): void;
  retry(): void;
}

export interface QueueBatch<T = unknown> {
  queue: string;
  messages: readonly QueueMessage<T>[];
}
```

### Storage interface (S3-shaped, backed by native R2)
```typescript
export interface StorageService {
  putObject(key: string, data: ArrayBuffer | string | ReadableStream, options?: {
    contentType?: string;
  }): Promise<void>;
  getObject(key: string): Promise<StorageObject | null>;
  headObject(key: string): Promise<StorageObjectMeta | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(options: { prefix?: string; cursor?: string; limit?: number }): Promise<StorageListResult>;
}

export interface StorageObject {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  size: number;
  contentType?: string;
}

export interface StorageObjectMeta {
  size: number;
  contentType?: string;
}

export interface StorageListResult {
  objects: { key: string; size: number }[];
  truncated: boolean;
  cursor?: string;
}
```

### Embedding interface
```typescript
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
```

Create `worker/lib/platform/cloudflare.ts` — CF-specific adapters:
- `cfStorage(r2: R2Bucket): StorageService` — wraps R2 native binding with S3-shaped methods
- `cfEmbeddingProvider(ai: Ai): EmbeddingProvider` — wraps CF AI binding

Queue interfaces need no CF adapter — `Queue<T>` and `MessageBatch<T>` already structurally conform.

## Phase 2: Split Entry Point

### Current state
`worker/index.ts` (244 lines) mixes CF-specific glue (`export default { fetch, queue, scheduled }`, `MessageBatch`, `ScheduledEvent`) with platform-agnostic app setup (Hono app, middleware, routes).

### Split into:
- **`worker/app.ts`** — Hono app construction, all middleware registration, route mounting, error handlers (lines 30-228 of current index.ts). Exports `app`. Fully portable.
- **`worker/index.ts`** — Thin CF adapter (~20 lines). Imports `app`, `handleQueue`, `scheduled`, wraps in Sentry, exports `{ fetch, queue, scheduled }`. CF-specific only.

This means migrating to Node/Express = write a new `worker/index-node.ts` that imports `app` and does `app.listen()`.

## Phase 3: Queue abstraction (~12 files)

### 3a. `worker/types.ts`
- Change 9 queue bindings from `Queue<T>` to `QueueProducer<T>`
- CF's `Queue<T>` satisfies `QueueProducer<T>` structurally — no runtime adapter

### 3b. `worker/queues/index.ts`
- Change `handleQueue` param from `MessageBatch` to `QueueBatch`
- Update typed casts in queue dispatcher

### 3c. 9 queue consumer handler signatures
- `MessageBatch<T>` → `QueueBatch<T>` in: `feed-refresh.ts`, `catalog-refresh.ts`, `content-prefetch.ts`, `transcription.ts`, `distillation.ts`, `narrative-generation.ts`, `audio-generation.ts`, `briefing-assembly.ts`, `orchestrator.ts`

### 3d. `worker/lib/local-queue.ts`
- `createFakeBatch` return type → `QueueBatch<T>`

### 3e. `worker/lib/queue-helpers.ts`
- Update `checkStageEnabled` / `ackAll` param types

### 3f. Test files
- `tests/helpers/mocks.ts` and queue test files: `MessageBatch` → `QueueBatch` type refs

## Phase 4: Storage abstraction (~15 files)

### 4a. `worker/types.ts`
- Change `R2: R2Bucket` to `storage: StorageService`

### 4b. Entry point / queue consumers
- Wrap `env.R2` with `cfStorage(env.R2)` at initialization so downstream code receives `StorageService`

### 4c. Update helpers taking `R2Bucket` param
- `worker/lib/work-products.ts` — `r2: R2Bucket` → `storage: StorageService`, `.put()`→`.putObject()`, `.get()`→`.getObject()`
- `worker/lib/content-prefetch.ts` — same
- `worker/lib/user-data.ts` — same
- `worker/queues/catalog-refresh.ts` — `wipeCatalogData` param

### 4d. Queue consumers using `env.R2.head()`
- `transcription.ts`, `distillation.ts`, `narrative-generation.ts`, `audio-generation.ts` — `.head()` → `.headObject()`

### 4e. Route files using `c.env.R2`
- `clips.ts`, `briefings.ts`, `assets.ts` — `.get()` → `.getObject()`
- `admin/clean-r2.ts`, `admin/catalog-seed.ts`, `admin/episodes.ts` — `.list()`/`.delete()` → `.listObjects()`/`.deleteObject()`

### 4f. `worker/lib/health.ts` — update health check

### 4g. Test mocks — update `createMockEnv` R2 mock to `StorageService` shape

## Phase 5: Embeddings abstraction (2 files)

### 5a. `worker/lib/embeddings.ts`
- `computeEmbedding(ai: Ai, text)` → `computeEmbedding(provider: EmbeddingProvider, text)`

### 5b. `worker/lib/recommendations.ts`
- `computeEmbedding(env.AI, text)` → `computeEmbedding(cfEmbeddingProvider(env.AI), text)`

## Critical Files

| File | Changes |
|------|---------|
| `worker/lib/platform/types.ts` | **NEW** — all interfaces |
| `worker/lib/platform/cloudflare.ts` | **NEW** — `cfStorage()`, `cfEmbeddingProvider()` |
| `worker/app.ts` | **NEW** — extracted from index.ts (Hono app + middleware) |
| `worker/index.ts` | Slim down to ~20 line CF adapter |
| `worker/types.ts` | Queue types (`QueueProducer`) + storage type (`StorageService`) |
| `worker/queues/index.ts` | Queue dispatcher signature |
| `worker/queues/*.ts` (9 files) | Handler signatures: `MessageBatch` → `QueueBatch` |
| `worker/lib/local-queue.ts` | Fake batch return type |
| `worker/lib/queue-helpers.ts` | Helper param types |
| `worker/lib/work-products.ts` | `R2Bucket` → `StorageService`, method renames |
| `worker/lib/content-prefetch.ts` | `R2Bucket` → `StorageService` |
| `worker/lib/user-data.ts` | `R2Bucket` → `StorageService` |
| `worker/lib/health.ts` | Storage type update |
| Route files (~6) | `.get()`→`.getObject()`, etc. |
| `worker/lib/embeddings.ts` | `Ai` → `EmbeddingProvider` |
| `worker/lib/recommendations.ts` | Pass provider wrapper |
| `tests/helpers/mocks.ts` | Update mock shapes |

## Verification

1. `npx tsc --noEmit` — all type changes must pass
2. `npx vitest run worker/` — all existing tests pass (may need mock method renames for storage)
3. `npm run dev` — local-queue shim + storage wrapper work in dev
4. No runtime behavior changes — same code paths, same CF performance

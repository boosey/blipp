# Episode Recommendation Engine — Backend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Episode-level topic fingerprinting, embedding-based semantic similarity, and curated recommendation API returning both episode and podcast recommendations.

**Architecture:** Topics extracted from distillation claims (R2 WorkProducts) via frequency-based NLP, normalized into canonical clusters. Workers AI embeddings enable semantic scoring. New API returns named curated rows (Netflix-style) plus episode/podcast browse.

**Tech Stack:** Prisma 7, Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`), Hono, existing rec engine.

**Worktree:** `C:\Users\boose\Projects\blipp\.worktrees\feat-episode-recommendations`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add Episode.topicTags, PodcastProfile.embedding, UserRecommendationProfile.embedding |
| `worker/lib/topic-extraction.ts` | Create | Frequency-based topic extraction from claim text |
| `worker/lib/embeddings.ts` | Create | Workers AI embedding computation + vector math |
| `worker/lib/recommendations.ts` | Modify | Topic Jaccard + embedding cosine scoring, episode scoring, curated row generation |
| `worker/lib/cron/recommendations.ts` | Modify | Add topic + embedding computation to cron |
| `worker/routes/recommendations.ts` | Modify | GET /curated, GET /episodes endpoints |
| `worker/routes/admin/recommendations.ts` | Modify | GET /topics, GET /embeddings/status, GET+PATCH /config |
| `worker/queues/index.ts` | Modify | Pass env to recommendations cron |
| `tests/helpers/mocks.ts` | Modify | Add AI mock |
| `worker/lib/__tests__/topic-extraction.test.ts` | Create | Topic extraction tests |
| `worker/lib/__tests__/embeddings.test.ts` | Create | Embedding helper tests |
| `worker/lib/__tests__/recommendations.test.ts` | Modify | Tests for new scoring signals |
| `worker/routes/__tests__/recommendations-curated.test.ts` | Create | Curated API route tests |

---

### Task 1: Schema Changes

**Files:** `prisma/schema.prisma`

- [ ] Add `topicTags String[]` to Episode model (after `transcriptR2Key`)
- [ ] Add `embedding Json?` to PodcastProfile (after `subscriberCount`)
- [ ] Add `embedding Json?` to UserRecommendationProfile (after `listenCount`)
- [ ] Run `npx prisma generate` + write barrel `src/generated/prisma/index.ts`
- [ ] Run `npx prisma db push`
- [ ] Commit: `feat: add topicTags to Episode, embedding to profile models`

---

### Task 2: Topic Extraction Module

**Files:** `worker/lib/topic-extraction.ts`, `worker/lib/__tests__/topic-extraction.test.ts`

- [ ] Write tests: extraction from claims, stopword filtering, importance weighting, bigram extraction, 20-topic cap, normalization/dedup
- [ ] Run tests — verify FAIL
- [ ] Implement `extractTopicsFromClaims(claims)`: tokenize, stopword filter, unigram + bigram frequency (weighted by claim importance), top 20
- [ ] Implement `normalizeTopics(topics)`: lowercase, collapse hyphens, dedup
- [ ] Implement `fingerprint(claims)`: extract then normalize pipeline
- [ ] Run tests — verify PASS
- [ ] Commit: `feat: add topic extraction module`

---

### Task 3: Embeddings Module

**Files:** `worker/lib/embeddings.ts`, `worker/lib/__tests__/embeddings.test.ts`, `tests/helpers/mocks.ts`

- [ ] Write tests: `cosineSimilarityVec` (identical, orthogonal, mismatched, null), `averageEmbeddings` (multi, empty, single), `buildEmbeddingText` (combine, null desc, truncation)
- [ ] Run tests — verify FAIL
- [ ] Implement `cosineSimilarityVec(a, b)`: dot product / norms, null-safe
- [ ] Implement `averageEmbeddings(embeddings)`: element-wise mean
- [ ] Implement `buildEmbeddingText(title, desc, topics)`: concat + truncate to 512 chars
- [ ] Implement `computeEmbedding(ai, text)`: call `@cf/baai/bge-base-en-v1.5`, return 768-dim array
- [ ] Add `AI: { run: vi.fn() }` to `createMockEnv()` in mocks.ts
- [ ] Run tests — verify PASS
- [ ] Commit: `feat: add embeddings module with Workers AI`

---

### Task 4: Profile Computation with Topics + Embeddings

**Files:** `worker/lib/recommendations.ts`, `worker/lib/cron/recommendations.ts`, `worker/queues/index.ts`

**Key insight:** Claims are in R2 via WorkProduct (key pattern: `wp/claims/{episodeId}/default.json`), NOT in `Distillation.claimsJson`. The cron needs `env` for R2 + AI access.

- [ ] Update `computePodcastProfiles` signature to accept `env` parameter
- [ ] For each podcast, fetch episodes with completed WorkProducts of type CLAIMS
- [ ] Read claims JSON from R2 for each episode
- [ ] Call `fingerprint(claims)` and store on `Episode.topicTags`
- [ ] Aggregate episode topics into podcast-level `topicTags` on PodcastProfile (recency-weighted)
- [ ] If `recommendations.embeddings.enabled` config true and `env.AI` exists: compute embedding via `buildEmbeddingText` + `computeEmbedding`, store on PodcastProfile
- [ ] Update `computeUserProfile` to aggregate topics from subscribed/upvoted podcast profiles, compute user embedding as centroid
- [ ] Update cron job + scheduled handler to pass `env` through
- [ ] Update existing tests for new signatures
- [ ] Commit: `feat: topic extraction and embeddings in profile computation`

---

### Task 5: Scoring with Topics + Embeddings

**Files:** `worker/lib/recommendations.ts`, `worker/lib/__tests__/recommendations.test.ts`

- [ ] Add `jaccardSimilarity(a, b)` helper
- [ ] Import `cosineSimilarityVec` from embeddings module
- [ ] Add config weights: `recommendations.weights.topic` (0.15), `recommendations.weights.embedding` (0.15)
- [ ] Rebalance defaults: category 0.25, topic 0.15, embedding 0.15, popularity 0.20, freshness 0.10, overlap 0.15
- [ ] In scoring loop: compute topicScore via Jaccard, embScore via cosine
- [ ] If embedding null: redistribute weight proportionally to other signals
- [ ] Add reason strings: "Both cover {topic}", "Semantically similar to podcasts you enjoy"
- [ ] Add `scoreEpisodeRecommendations(userId, prisma, env)`: score recent episodes (30 days) from unsubscribed podcasts against user topic profile, return top episodes with podcast context, group 3+ matches into podcast suggestion
- [ ] Write tests for all new scoring paths
- [ ] Commit: `feat: topic Jaccard and embedding cosine scoring`

---

### Task 6: Curated Recommendation API

**Files:** `worker/routes/recommendations.ts`, `worker/routes/__tests__/recommendations-curated.test.ts`

- [ ] Write route tests for GET /curated and GET /episodes
- [ ] Implement `GET /curated?genre=X`:
  - `generateCuratedRows(userId, prisma, env, genre)` builds rows:
    - "Because you liked {podcast}" — episodes from topic-similar podcasts
    - "Trending in {category}" — popular recent episodes in user's top categories
    - "New on topics you follow" — recent episodes matching user topics
    - "Popular with listeners like you" — collaborative filtering
  - Response: `{ rows: [{ title, type, items }], podcastSuggestions: [...] }`
  - Genre param filters items within each row; empty rows hidden
- [ ] Implement `GET /episodes?genre=X&search=Y&page=N`:
  - Recent episodes across catalog, scored by user relevance
  - Genre + search filtering, paginated
  - Returns episodes with podcast context
- [ ] Run tests — verify PASS
- [ ] Commit: `feat: curated recommendation rows and episode browse API`

---

### Task 7: Admin API Extensions

**Files:** `worker/routes/admin/recommendations.ts`

- [ ] Add `GET /topics?page=N&pageSize=M&search=X`: paginated podcast topic tags browser
- [ ] Add `GET /embeddings/status`: enabled flag, counts, model name, last compute
- [ ] Add `POST /embeddings/recompute`: trigger embedding recomputation
- [ ] Add `GET /config`: return all `recommendations.*` config keys structured
- [ ] Add `PATCH /config`: bulk update recommendation config keys
- [ ] Commit: `feat: admin endpoints for topics, embeddings, config`

---

### Task 8: Integration Tests + Verification

- [ ] Full 6-weight scoring integration test
- [ ] Episode recommendation test (user interested in AI gets AI episode from unsubscribed podcast)
- [ ] Curated rows generation test with genre filtering
- [ ] Run full rec test suite
- [ ] Typecheck: `npx tsc --noEmit`
- [ ] Commit: `test: integration tests for episode recommendation engine`

---

## Test Plan

| File | Count | Coverage |
|------|-------|----------|
| `topic-extraction.test.ts` | ~8 | Claim parsing, stopwords, importance weighting, bigrams, cap, normalization |
| `embeddings.test.ts` | ~8 | Vector cosine, averaging, text building, truncation, null handling |
| `recommendations.test.ts` | ~18 | All 6 weights, Jaccard, embedding cosine, redistribution, episode scoring, engagement, cold start, dismissals |
| `recommendations-curated.test.ts` | ~6 | Row generation, genre filtering, episode browse, pagination |
| `routes/recommendations.test.ts` | ~10 | Existing + dismiss + curated + episodes |
| **Total** | **~50** | |

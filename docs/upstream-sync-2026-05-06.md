# Upstream Sync Analysis

**Date:** 2026-05-06
**Upstream Repository:** https://github.com/Sanket9225/UsenetStreamer
**Fork Repository:** https://github.com/dgherman/UsenetStreamer
**Previous sync:** `5c9ab8a` (2026-04-12) — see `docs/upstream-sync-2026-04-12.md`

## Current State

| Branch | Latest Commit | Date |
|--------|---------------|------|
| Fork (myfork/master) | `92c2ed5` fix: abort overlapping streams instead of serializing them | 2026-05-06 |
| Upstream (origin/master) | `0734441` version edit | 2026-05-02 |

**New upstream commits since last sync:** 18 commits (2026-04-26 – 2026-05-02)

---

## Changes Implemented

### 1. X-Addon-Token header priority (from upstream `4b1d5d9`)

| Fork Commit | Description |
|-------------|-------------|
| `0ff292b` | fix: prioritize X-Addon-Token header over Authorization header |

- 1-line fix in `src/middleware/auth.js`: swapped `authorization || x-addon-token` to `x-addon-token || authorization`

### 2. TMDB/TVDB season/episode off-by-one fix (from upstream `7b4aff5`)

| Fork Commit | Description |
|-------------|-------------|
| `f4a796e` | fix: TMDB/TVDB season/episode off-by-one in ID parsing |

- `src/utils/parsers.js` `parseRequestedEpisode`: now uses `parts[parts.length-2]` / `parts[parts.length-1]` to handle `tmdb:<id>:S:E` format correctly

### 3. SceneNZBs TVDB strict episode filtering + String() fix (from upstream `5528fff` + `6baacdc`)

| Fork Commit | Description |
|-------------|-------------|
| `b98c525` | fix: SceneNZBs TVDB strict episode filtering + String() for numeric indexer IDs |

- Added `isTvdbPlan` / `isSceneNzbs` guard at top of `resultMatchesStrictPlan` in `server.js`
- `String()` coercion before `toLowerCase()` on indexer ID for Prowlarr numeric ID compatibility

### 4. Skip TMDb fetch when cache hit (from upstream `6e7cc5f`)

| Fork Commit | Description |
|-------------|-------------|
| `8c07464` | perf: skip TMDb metadata fetch when search cache is hit |

- Changed `skipMetadataFetch = Boolean(cachedSearchMeta?.triageComplete)` → `Boolean(cachedSearchMeta)` in `server.js`

### 5. Skip Hydra search when IMDB present (from upstream `5f2bc1f`)

| Fork Commit | Description |
|-------------|-------------|
| `cf0e30f` | feat: skip Hydra search when IMDB present (skipHydra plan flag) |

- `executeManagerPlanWithBackoff` now returns early when `plan.skipHydra && INDEXER_MANAGER === 'nzbhydra'`
- `addPlan` now accepts and forwards `skipHydra` to plan records

### 6. NZB_MIN_RESULT_SIZE_MB (from upstream `9aff46e`)

| Fork Commit | Description |
|-------------|-------------|
| `04b3bea` | feat: NZB_MIN_RESULT_SIZE_MB config to filter noise results (default 45 MB) |

- Added `toSizeBytesFromMb` to `src/utils/config.js`
- `INDEXER_MIN_RESULT_SIZE_BYTES` declared and updated in `rebuildRuntimeConfig`
- Filter applied after `prepareSortedResults` in `streamHandler`
- `.env.example` updated with the new variable

### 7. Dedup by title when usenet group absent (from upstream `a0edf48`)

| Fork Commit | Description |
|-------------|-------------|
| `5eac3e0` | fix: dedup by title alone when usenet group is absent |

- `dedupeResultsByTitle` in `server.js`: changed bucket key from skipping (push to deduped) to `usenetGroup ? title|group : title`

### 8. True sliding-window rate limiter (from upstream `ac665f1`, partial)

| Fork Commit | Description |
|-------------|-------------|
| `2a6af50` | fix: upgrade rate limiter to true sliding window, increase cap to 180 req/min |

- `src/middleware/auth.js`: `rateLimitBuckets` is now `Map<ip, number[]>` (timestamps array)
- Sliding window eviction instead of fixed-window reset
- Limit increased from 60 → 180 req/min
- **Skipped**: upstream removed rate limiting from `ensureStreamToken` entirely; fork already exempts stream requests via `isStreamRequest` check

### 9. Easynews multi-title parallel search (from upstream `e6e1c30`, adapted)

| Fork Commit | Description |
|-------------|-------------|
| `2625ff6` | feat: Easynews multi-title parallel search via queryBuilder |

- Created `src/services/easynews/queryBuilder.js` — pure function `buildEasynewsSearchParams` that builds multiple query variants (all TMDb titles, anime titles, text fallback)
- Replaced single-query easynews integration in `server.js` with `Promise.all` over all query variants, deduped by GUID
- **Adaptation**: `isAnimeRequest`/`animeSearchableTitles` hardcoded to `false`/`[]` since fork has no anime database
- Imported `normalizeToAscii` from `src/services/tmdb`

### 10. Help documentation page (from upstream `a2747a0` + `080ba2e` partial)

| Fork Commit | Description |
|-------------|-------------|
| `11eaefc` | feat: add help.html documentation page + link from control panel |
| `c98a1f1` | feat: cache section in help.html, cache-cleared note in save confirmation |

- New `admin/help.html` with full reference documentation
- `admin/index.html`: "? Help & Reference" link in header
- Cache section added to help.html TOC and body
- Save confirmation message updated to note cache is cleared

### 11. Indexer manager UI hints (from upstream `ab1eea2`)

| Fork Commit | Description |
|-------------|-------------|
| `2a3d49e` | feat: Prowlarr/Hydra contextual placeholder hints in indexer manager UI |

- `admin/app.js` `syncManagerControls`: sets context-aware placeholder text and hints for `INDEXER_MANAGER_INDEXERS` and `NZB_TRIAGE_PRIORITY_INDEXERS` based on whether Prowlarr or Hydra is selected
- `admin/index.html`: improved catalog history hint text

---

## Deliberately Skipped

| Feature | Upstream Commits | Reason |
|---------|------------------|--------|
| Code refactor into route/util modules | `4024647` | Massive structural change: creates `src/routes/`, `src/utils/resultUtils.js`, `src/utils/credentialMask.js` etc. Fork has diverged architecture; no new functionality, just reorganization |
| Recommended option labels in stream protection | `30e746c` | Fork does not have the `NZB_STREAM_PROTECTION` setting or smart-play UI |
| Version bumps (1.7.8 → 1.7.9) | `5c7ed10`, `0734441` | Fork has own versioning |
| Merge commit | `9fc9082` | Merge only |
| `easynew to search all titles` admin/app.js change | part of `e6e1c30` | Only the 1-line `admin/app.js` change was skipped (unclear purpose without reviewing full app.js context); `queryBuilder.js` and server.js changes adopted |

---

## Pickup Point

Next sync starts from upstream commit `0734441` (2026-05-02).

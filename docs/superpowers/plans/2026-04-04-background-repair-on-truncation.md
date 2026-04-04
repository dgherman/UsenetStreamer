# Background Repair on Mid-Stream Truncation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a mid-stream truncation is detected, automatically search for a replacement NZB and queue it to nzbdav2 so the next stream list view shows it as ⚡ Instant.

**Architecture:** Two helper functions are extracted into testable modules (`findStreamCacheEntryByIds` in streamCache.js, `selectBestRepairCandidate` in helpers.js). Three fire-and-forget functions (`triggerBackgroundRepair`, `runBackgroundRepair`, `queueRepairCandidate`) are added to server.js alongside the existing prefetch machinery. The truncation catch block in `handleNzbdavStream` calls `triggerBackgroundRepair` after marking the cache entry failed.

**Tech Stack:** Node.js, Jest (existing test runner), existing `executeManagerPlanWithBackoff` + `executeNewznabPlan` for fresh searches, existing `addNzbToNzbdav` for queueing.

---

## File Structure

| File | Change |
|------|--------|
| `src/cache/streamCache.js` | Add `findStreamCacheEntryByIds` — scans cache by type/id/episode ignoring query params |
| `src/utils/helpers.js` | Add `selectBestRepairCandidate` — pure scoring function; add `REPAIR_MIN_SIZE_BYTES` constants |
| `server.js` | Add `repairInFlight` Map; add `queueRepairCandidate`, `runBackgroundRepair`, `triggerBackgroundRepair`; update `handleNzbdavStream` catch block |
| `tests/cache/streamCache.findByIds.test.js` | New — unit tests for `findStreamCacheEntryByIds` |
| `tests/utils/helpers.selectBestRepairCandidate.test.js` | New — unit tests for `selectBestRepairCandidate` |
| `IMPROVEMENTS.md` | Add entry for background repair feature |
| `README.md` | Add changelog bullet |

---

## Background: stream cache key format

`buildStreamCacheKey` (server.js:1215) produces a JSON key including the full `req.query` from the Stremio stream list request:

```javascript
JSON.stringify({ type, id, requestedEpisode: normalizedEpisode, query: normalizedQuery })
```

When `handleNzbdavStream` fires (NZB stream request), it doesn't have the original stream list `req.query`. So background repair cannot reconstruct the exact key. `findStreamCacheEntryByIds` solves this by scanning all entries and matching on `type`, `id`, and `requestedEpisode` only.

---

### Task 1: Add `findStreamCacheEntryByIds` to streamCache.js

**Files:**
- Modify: `src/cache/streamCache.js`
- Create: `tests/cache/streamCache.findByIds.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/cache/streamCache.findByIds.test.js`:

```javascript
'use strict';

const streamCache = require('../../src/cache/streamCache');

// Reproduces what buildStreamCacheKey (server.js:1215) produces
function makeCacheKey({ type, id, requestedEpisode = null, query = {} }) {
  const normalizedQuery = {};
  Object.keys(query).sort().forEach((k) => { normalizedQuery[k] = query[k]; });
  const normalizedEpisode = requestedEpisode
    ? { season: requestedEpisode.season ?? null, episode: requestedEpisode.episode ?? null }
    : null;
  return JSON.stringify({ type, id, requestedEpisode: normalizedEpisode, query: normalizedQuery });
}

beforeEach(() => {
  streamCache.clearStreamResponseCache('test');
});

describe('findStreamCacheEntryByIds', () => {
  it('returns null on empty cache', () => {
    expect(streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null)).toBeNull();
  });

  it('finds a matching movie entry', () => {
    const key = makeCacheKey({ type: 'movie', id: 'tt1234' });
    streamCache.setStreamCacheEntry(key, { streams: [] }, { version: 1, finalNzbResults: [] });
    const result = streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null);
    expect(result).not.toBeNull();
    expect(result.payload).toEqual({ streams: [] });
  });

  it('returns null when type does not match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234' }), {}, null
    );
    expect(streamCache.findStreamCacheEntryByIds('series', 'tt1234', null)).toBeNull();
  });

  it('returns null when id does not match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234' }), {}, null
    );
    expect(streamCache.findStreamCacheEntryByIds('movie', 'tt9999', null)).toBeNull();
  });

  it('matches series entry with correct episode', () => {
    const ep = { season: 2, episode: 5 };
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'series', id: 'tt5678', requestedEpisode: ep }), { streams: [] }, null
    );
    expect(streamCache.findStreamCacheEntryByIds('series', 'tt5678', ep)).not.toBeNull();
  });

  it('returns null when episode does not match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'series', id: 'tt5678', requestedEpisode: { season: 2, episode: 5 } }),
      { streams: [] }, null
    );
    expect(streamCache.findStreamCacheEntryByIds('series', 'tt5678', { season: 2, episode: 6 })).toBeNull();
  });

  it('finds entry regardless of original query params', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234', query: { title: 'WALL-E', year: '2008' } }),
      { streams: ['x'] }, null
    );
    const result = streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null);
    expect(result).not.toBeNull();
    expect(result.payload.streams).toEqual(['x']);
  });

  it('returns most recently accessed when multiple keys match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234', query: { a: '1' } }),
      { streams: ['A'] }, null
    );
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234', query: { b: '2' } }),
      { streams: ['B'] }, null
    );
    const result = streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null);
    expect(result).not.toBeNull();
    expect(result.payload.streams).toEqual(['B']); // B was accessed last (set last)
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npx jest tests/cache/streamCache.findByIds.test.js --no-coverage
```

Expected: `TypeError: streamCache.findStreamCacheEntryByIds is not a function`

- [ ] **Step 3: Implement `findStreamCacheEntryByIds` in streamCache.js**

Add this function to `src/cache/streamCache.js`, before the `module.exports` block:

```javascript
function findStreamCacheEntryByIds(type, id, requestedEpisode) {
  cleanupStreamCache();
  const now = Date.now();
  let bestEntry = null;
  let bestAccess = -1;

  for (const [key, entry] of streamResponseCache.entries()) {
    if (entry.expiresAt && entry.expiresAt <= now) continue;
    let parsed;
    try {
      parsed = JSON.parse(key);
    } catch {
      continue;
    }
    if (parsed.type !== type || parsed.id !== id) continue;

    const ep = parsed.requestedEpisode;
    if (!requestedEpisode && !ep) {
      // Both null — match, continue to access-time check
    } else if (!requestedEpisode || !ep) {
      continue; // One is null, other is not
    } else if (ep.season !== requestedEpisode.season || ep.episode !== requestedEpisode.episode) {
      continue;
    }

    const access = entry.lastAccess || 0;
    if (access > bestAccess) {
      bestAccess = access;
      bestEntry = entry;
    }
  }

  return bestEntry;
}
```

Then add `findStreamCacheEntryByIds` to `module.exports` in `src/cache/streamCache.js`:

```javascript
module.exports = {
  cleanupStreamCache,
  clearStreamResponseCache,
  getStreamCacheEntry,
  setStreamCacheEntry,
  updateStreamCacheMeta,
  getStreamCacheStats,
  findStreamCacheEntryByIds,
};
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx jest tests/cache/streamCache.findByIds.test.js --no-coverage
```

Expected: All 8 tests pass.

- [ ] **Step 5: Confirm existing tests still pass**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cache/streamCache.js tests/cache/streamCache.findByIds.test.js
git commit -m "feat: add findStreamCacheEntryByIds to scan stream cache by type/id/episode"
```

---

### Task 2: Add `selectBestRepairCandidate` to helpers.js

**Files:**
- Modify: `src/utils/helpers.js`
- Create: `tests/utils/helpers.selectBestRepairCandidate.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/helpers.selectBestRepairCandidate.test.js`:

```javascript
'use strict';

const { selectBestRepairCandidate } = require('../../src/utils/helpers');

// Helper: build a result object
function makeResult(overrides = {}) {
  return {
    downloadUrl: 'https://indexer.example/nzb/1',
    title: 'WALL-E 2008 1080p BluRay x264',
    size: 200 * 1024 * 1024, // 200 MB
    resolution: '1080p',
    language: 'english',
    indexerId: 'nzbgeek',
    ...overrides,
  };
}

describe('selectBestRepairCandidate', () => {
  it('returns null for empty array', () => {
    expect(selectBestRepairCandidate([], { type: 'movie' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(selectBestRepairCandidate(null, { type: 'movie' })).toBeNull();
  });

  it('returns the single viable result', () => {
    const r = makeResult();
    expect(selectBestRepairCandidate([r], { type: 'movie' })).toBe(r);
  });

  it('filters results below movie size floor (100 MB) when alternatives exist', () => {
    const small = makeResult({ title: 'WALL-E small', size: 50 * 1024 * 1024, downloadUrl: 'url-small' });
    const big   = makeResult({ title: 'WALL-E big',   size: 200 * 1024 * 1024, downloadUrl: 'url-big' });
    const result = selectBestRepairCandidate([small, big], { type: 'movie' });
    expect(result.downloadUrl).toBe('url-big');
  });

  it('filters results below series size floor (20 MB) when alternatives exist', () => {
    const small = makeResult({ title: 'Show S01E01 tiny', size: 5 * 1024 * 1024, downloadUrl: 'url-tiny' });
    const ok    = makeResult({ title: 'Show S01E01 ok',   size: 30 * 1024 * 1024, downloadUrl: 'url-ok' });
    const result = selectBestRepairCandidate([small, ok], { type: 'series' });
    expect(result.downloadUrl).toBe('url-ok');
  });

  it('falls back to below-floor results when ALL results are under the floor', () => {
    const small = makeResult({ size: 10 * 1024 * 1024 }); // 10 MB — under any floor
    const result = selectBestRepairCandidate([small], { type: 'movie' });
    // Best-effort: returns the only result rather than null
    expect(result).toBe(small);
  });

  it('results with unknown size (no size field) pass the floor', () => {
    const noSize = makeResult({ size: undefined });
    const result = selectBestRepairCandidate([noSize], { type: 'movie' });
    expect(result).toBe(noSize);
  });

  it('filters by allowed resolutions when configured', () => {
    const hd  = makeResult({ resolution: '1080p', downloadUrl: 'url-hd' });
    const sd  = makeResult({ resolution: '720p',  downloadUrl: 'url-sd' });
    const result = selectBestRepairCandidate([hd, sd], {
      type: 'movie',
      allowedResolutions: ['720p'],
    });
    expect(result.downloadUrl).toBe('url-sd');
  });

  it('falls back to all results when resolution filter eliminates everything', () => {
    const hd = makeResult({ resolution: '1080p', downloadUrl: 'url-hd' });
    const result = selectBestRepairCandidate([hd], {
      type: 'movie',
      allowedResolutions: ['720p'], // only 720p allowed, but we only have 1080p
    });
    // Best-effort: returns 1080p rather than null
    expect(result).toBe(hd);
  });

  it('prefers paid indexer results over free ones', () => {
    const free = makeResult({ title: 'free result',  downloadUrl: 'url-free',  indexerId: 'nzbgeek' });
    const paid = makeResult({ title: 'paid result',  downloadUrl: 'url-paid',  indexerId: 'nzbplanet' });
    const result = selectBestRepairCandidate([free, paid], {
      type: 'movie',
      isPaidIndexer: (r) => r.indexerId === 'nzbplanet',
    });
    expect(result.downloadUrl).toBe('url-paid');
  });

  it('prefers language-matched results over unmatched ones', () => {
    const english = makeResult({ title: 'WALL-E english', language: 'english', downloadUrl: 'url-en' });
    const french  = makeResult({ title: 'WALL-E french',  language: 'french',  downloadUrl: 'url-fr' });
    const result = selectBestRepairCandidate([english, french], {
      type: 'movie',
      preferredLanguages: ['french'],
    });
    expect(result.downloadUrl).toBe('url-fr');
  });

  it('paid indexer rank beats language preference', () => {
    const paidNoLang = makeResult({ title: 'paid no-lang', language: 'english', downloadUrl: 'url-paid', indexerId: 'nzbplanet' });
    const freeLang   = makeResult({ title: 'free lang',    language: 'french',  downloadUrl: 'url-free', indexerId: 'nzbgeek' });
    const result = selectBestRepairCandidate([paidNoLang, freeLang], {
      type: 'movie',
      preferredLanguages: ['french'],
      isPaidIndexer: (r) => r.indexerId === 'nzbplanet',
    });
    expect(result.downloadUrl).toBe('url-paid');
  });

  it('preserves indexer order when no preferences configured', () => {
    const first  = makeResult({ title: 'first',  downloadUrl: 'url-1' });
    const second = makeResult({ title: 'second', downloadUrl: 'url-2' });
    const result = selectBestRepairCandidate([first, second], { type: 'movie' });
    expect(result.downloadUrl).toBe('url-1');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx jest tests/utils/helpers.selectBestRepairCandidate.test.js --no-coverage
```

Expected: `TypeError: selectBestRepairCandidate is not a function`

- [ ] **Step 3: Implement `selectBestRepairCandidate` in helpers.js**

Add the constants and function before the `module.exports` block in `src/utils/helpers.js`:

```javascript
const REPAIR_MIN_SIZE_BYTES = {
  movie: 100 * 1024 * 1024,  // 100 MB — guards against stubs/samples
  series: 20 * 1024 * 1024,  // 20 MB
};

function selectBestRepairCandidate(viable, { type = 'movie', allowedResolutions = [], preferredLanguages = [], isPaidIndexer = () => false } = {}) {
  if (!Array.isArray(viable) || viable.length === 0) return null;

  // Apply size floor — unknown sizes (no .size field) pass
  const minBytes = REPAIR_MIN_SIZE_BYTES[type] ?? REPAIR_MIN_SIZE_BYTES.series;
  const aboveFloor = viable.filter((r) => !Number.isFinite(r.size) || r.size >= minBytes);
  const sizePool = aboveFloor.length > 0 ? aboveFloor : viable; // best-effort: use all if all under floor

  // Apply resolution filter — best-effort: fall back to sizePool if filter removes everything
  const resFiltered = filterByAllowedResolutions(sizePool, allowedResolutions);
  const pool = resFiltered.length > 0 ? resFiltered : sizePool;

  if (pool.length === 0) return null;

  // Sort: paid indexer first, then language preference; preserve indexer order for ties
  const sorted = [...pool].sort((a, b) => {
    const aPaid = isPaidIndexer(a);
    const bPaid = isPaidIndexer(b);
    if (aPaid && !bPaid) return -1;
    if (!aPaid && bPaid) return 1;

    const aLang = preferredLanguages.length > 0 ? getPreferredLanguageMatch(a, preferredLanguages) : null;
    const bLang = preferredLanguages.length > 0 ? getPreferredLanguageMatch(b, preferredLanguages) : null;
    if (aLang && !bLang) return -1;
    if (!aLang && bLang) return 1;

    return 0;
  });

  return sorted[0] ?? null;
}
```

Then add `selectBestRepairCandidate` to `module.exports` in `src/utils/helpers.js`:

```javascript
module.exports = {
  sleep,
  annotateNzbResult,
  applyMaxSizeFilter,
  filterByAllowedResolutions,
  applyResolutionLimits,
  resultMatchesPreferredLanguage,
  getPreferredLanguageMatches,
  getPreferredLanguageMatch,
  compareQualityThenSize,
  sortAnnotatedResults,
  prepareSortedResults,
  triageStatusRank,
  buildTriageTitleMap,
  prioritizeTriageCandidates,
  triageDecisionsMatchStatuses,
  sanitizeDecisionForCache,
  serializeFinalNzbResults,
  restoreFinalNzbResults,
  safeStat,
  selectBestRepairCandidate,
};
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx jest tests/utils/helpers.selectBestRepairCandidate.test.js --no-coverage
```

Expected: All 12 tests pass.

- [ ] **Step 5: Confirm all tests still pass**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/helpers.js tests/utils/helpers.selectBestRepairCandidate.test.js
git commit -m "feat: add selectBestRepairCandidate helper with language/resolution/size/tier scoring"
```

---

### Task 3: Add repair functions to server.js

**Files:**
- Modify: `server.js`

All four additions go in server.js. No new test file — these functions are covered by the unit tests in Tasks 1 and 2, and by manual smoke testing in Task 5.

- [ ] **Step 1: Add `selectBestRepairCandidate` to the helpers destructure**

On line 47, the current line is:

```javascript
const { sleep, annotateNzbResult, applyMaxSizeFilter, prepareSortedResults, getPreferredLanguageMatch, getPreferredLanguageMatches, triageStatusRank, buildTriageTitleMap, prioritizeTriageCandidates, triageDecisionsMatchStatuses, sanitizeDecisionForCache, serializeFinalNzbResults, restoreFinalNzbResults, safeStat } = require('./src/utils/helpers');
```

Replace it with:

```javascript
const { sleep, annotateNzbResult, applyMaxSizeFilter, prepareSortedResults, getPreferredLanguageMatch, getPreferredLanguageMatches, triageStatusRank, buildTriageTitleMap, prioritizeTriageCandidates, triageDecisionsMatchStatuses, sanitizeDecisionForCache, serializeFinalNzbResults, restoreFinalNzbResults, safeStat, selectBestRepairCandidate } = require('./src/utils/helpers');
```

(`findStreamCacheEntryByIds` is already available via `cache.findStreamCacheEntryByIds` because `src/cache/index.js` spreads `...streamCache`.)

- [ ] **Step 2: Add the `repairInFlight` Map**

After line 81 (`const prefetchNzoIdIndex = new Map(); // nzoId → downloadUrl reverse index`), add:

```javascript
const repairInFlight = new Map(); // key: "type:id:S01E02" → Promise; prevents duplicate concurrent repairs
```

- [ ] **Step 3: Add `queueRepairCandidate` function**

Add this function immediately after `prunePrefetchedNzbdavJobs` (currently ends around line 100) and before `resolvePrefetchedNzbdavJob` (line 106):

```javascript
async function queueRepairCandidate(candidate, category) {
  const cachedEntry = cache.getVerifiedNzbCacheEntry(candidate.downloadUrl);
  const added = await nzbdavService.addNzbToNzbdav({
    downloadUrl: candidate.downloadUrl,
    cachedEntry,
    category,
    jobLabel: candidate.title,
  });
  nzbdavService.trackInFlightDownload(candidate.title, added.nzoId, candidate.downloadUrl, category);
  prefetchedNzbdavJobs.set(candidate.downloadUrl, {
    nzoId: added.nzoId, category, jobName: candidate.title, createdAt: Date.now(),
  });
  if (added.nzoId) prefetchNzoIdIndex.set(added.nzoId, candidate.downloadUrl);
  console.log(`[REPAIR] Queued replacement nzoId=${added.nzoId}: "${candidate.title}"`);
}
```

- [ ] **Step 4: Add `runBackgroundRepair` function**

Add immediately after `queueRepairCandidate`:

```javascript
async function runBackgroundRepair({ type, id, requestedEpisode, title, category }) {
  console.log(`[REPAIR] Starting background repair for "${title}"`);

  // ── Phase 1: stream cache ────────────────────────────────────────────────
  // findStreamCacheEntryByIds scans all entries by type/id/episode, ignoring
  // the original query params that we no longer have at this call site.
  const cachedEntry = cache.findStreamCacheEntryByIds(type, id, requestedEpisode);
  const snapshot = cachedEntry?.meta?.triageDecisionsSnapshot;

  if (snapshot) {
    const triageDecisions = restoreTriageDecisions(snapshot);
    const finalNzbResults = restoreFinalNzbResults(cachedEntry.meta.finalNzbResults || []);

    const viable = finalNzbResults.filter((r) => {
      if (!r.downloadUrl) return false;
      if (BLOCKLIST_CHECKER.test(r.title)) return false;
      if (cache.isDownloadUrlFailed(r.downloadUrl)) return false;
      const decision = triageDecisions.get(r.downloadUrl);
      return decision?.status === 'verified';
    });

    const best = selectBestRepairCandidate(viable, {
      type,
      allowedResolutions: ALLOWED_RESOLUTIONS,
      preferredLanguages: INDEXER_PREFERRED_LANGUAGES,
      isPaidIndexer: isResultFromPaidIndexer,
    });

    if (best) {
      console.log(`[REPAIR] Phase 1: queuing cached candidate "${best.title}"`);
      await queueRepairCandidate(best, category);
      return;
    }
    console.log('[REPAIR] Phase 1: no viable verified candidate in stream cache, falling through to fresh search');
  } else {
    console.log('[REPAIR] Phase 1: stream cache cold, falling through to fresh search');
  }

  // ── Phase 2: fresh ID-based indexer search ───────────────────────────────
  const imdbMatch = /^tt\d+$/i.test(id) ? id : null;
  const tvdbMatch = /^tvdb:(\d+)/i.exec(id)?.[1] ?? null;

  if (!imdbMatch && !tvdbMatch) {
    console.warn(`[REPAIR] Cannot build ID-based search plan for id="${id}", giving up`);
    return;
  }

  const searchType = type === 'series' ? 'tvsearch' : 'movie';
  const idToken = tvdbMatch ? `{TvdbId:${tvdbMatch}}` : `{ImdbId:${imdbMatch}}`;
  const tokens = [idToken];
  if (type === 'series' && requestedEpisode) {
    tokens.push(`{Season:${requestedEpisode.season}}`, `{Episode:${requestedEpisode.episode}}`);
  }
  const plan = { type: searchType, query: tokens.join(' '), tokens };

  console.log('[REPAIR] Phase 2: executing fresh indexer search', plan);
  const settled = await Promise.allSettled([
    executeManagerPlanWithBackoff(plan),
    executeNewznabPlan(plan),
  ]);

  const rawResults = settled.flatMap((s) => (s.status === 'fulfilled' ? (s.value?.data ?? []) : []));
  const viableFresh = dedupeResultsByTitle(rawResults).filter((r) => {
    if (!r.downloadUrl) return false;
    if (BLOCKLIST_CHECKER.test(r.title)) return false;
    if (cache.isDownloadUrlFailed(r.downloadUrl)) return false;
    return true;
  });

  const best = selectBestRepairCandidate(viableFresh, {
    type,
    allowedResolutions: ALLOWED_RESOLUTIONS,
    preferredLanguages: INDEXER_PREFERRED_LANGUAGES,
    isPaidIndexer: isResultFromPaidIndexer,
  });

  if (!best) {
    console.warn(`[REPAIR] Phase 2: no viable replacement found for "${title}"`);
    return;
  }

  console.log(`[REPAIR] Phase 2: queuing fresh candidate "${best.title}"`);
  await queueRepairCandidate(best, category);
}
```

- [ ] **Step 5: Add `triggerBackgroundRepair` function**

Add immediately after `runBackgroundRepair`:

```javascript
function triggerBackgroundRepair({ type, id, requestedEpisode, title, category }) {
  const key = `${type}:${id}:${requestedEpisode ? `S${requestedEpisode.season}E${requestedEpisode.episode}` : ''}`;
  if (repairInFlight.has(key)) {
    console.log(`[REPAIR] Background repair already in-flight for ${key}`);
    return;
  }

  const promise = new Promise((resolve) => {
    setImmediate(async () => {
      try {
        await runBackgroundRepair({ type, id, requestedEpisode, title, category });
      } catch (err) {
        console.error('[REPAIR] Unhandled error in background repair:', err.message);
      } finally {
        repairInFlight.delete(key);
        resolve();
      }
    });
  });

  repairInFlight.set(key, promise);
  console.log(`[REPAIR] Background repair triggered for "${title}" (${key})`);
}
```

- [ ] **Step 6: Confirm all tests still pass**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat: add background repair functions (triggerBackgroundRepair, runBackgroundRepair, queueRepairCandidate)"
```

---

### Task 4: Wire call site in handleNzbdavStream

**Files:**
- Modify: `server.js` (catch block around line 3982)

- [ ] **Step 1: Update the `isUpstreamTruncation` branch**

Find this block in the `handleNzbdavStream` catch block (currently around line 3982):

```javascript
    if (error?.isUpstreamTruncation) {
      console.warn('[NZBDAV] Upstream truncated stream mid-response - marking for next retry:', error.message);
      if (effectiveCacheKey) {
        cache.markDownloadUrlFailed(effectiveCacheKey, error.message, 'upstream_truncated');
      }
      return;
    }
```

Replace it with:

```javascript
    if (error?.isUpstreamTruncation) {
      console.warn('[NZBDAV] Upstream truncated stream mid-response - marking for next retry:', error.message);
      if (effectiveCacheKey) {
        cache.markDownloadUrlFailed(effectiveCacheKey, error.message, 'upstream_truncated');
      }
      // Proactively search for and queue a replacement while the user sees the error.
      // type, id, title come from req.query destructuring at the top of handleNzbdavStream.
      // category and repairEpisode are recomputed here (they're block-scoped to the try block above).
      const repairEpisode = parseRequestedEpisode(type, id, req.query || {});
      const repairCategory = nzbdavService.getNzbdavCategory(type);
      triggerBackgroundRepair({ type, id, requestedEpisode: repairEpisode, title, category: repairCategory });
      return;
    }
```

- [ ] **Step 2: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: trigger background repair on mid-stream truncation"
```

---

### Task 5: Changelog and push

**Files:**
- Modify: `IMPROVEMENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Add entry to IMPROVEMENTS.md**

After the `### Mid-stream truncation fallback - FIXED` section (after line 263, before the next `---`), add:

```markdown
### Background repair on truncation - IMPLEMENTED

**Problem:** After a corrupt release is detected and marked in the negative cache, the user still had to manually return to the stream list and wait for a fresh indexer search before a replacement appeared. There was no proactive download preparation.

**Solution:** When `handleNzbdavStream` detects a mid-stream truncation and marks the release as failed, it immediately fires a background repair job (`triggerBackgroundRepair`) in a `setImmediate`. The repair has two phases:

1. **Phase 1 (stream cache):** Checks if the stream cache already has a triage-verified, non-blocked candidate for the same `{type, id, episode}`. If found, queues it to nzbdav2 immediately (zero network cost).
2. **Phase 2 (fresh search):** If Phase 1 finds nothing, fires an ID-based indexer search (`{ImdbId:...}` or `{TvdbId:...}` + season/episode tokens for series) using the same `executeManagerPlanWithBackoff` + `executeNewznabPlan` machinery used by the main search handler. Picks the best non-blocked candidate using language/resolution/size/indexer-tier scoring and queues it to nzbdav2.

A `repairInFlight` Map prevents duplicate concurrent repairs for the same title.

**Implementation details:**
- `findStreamCacheEntryByIds(type, id, requestedEpisode)` added to `src/cache/streamCache.js` — scans all stream cache entries by type/id/episode, ignoring the original request query params (which aren't available at truncation time)
- `selectBestRepairCandidate(viable, opts)` added to `src/utils/helpers.js` — pure function; applies size floor (100 MB movie / 20 MB series), `ALLOWED_RESOLUTIONS` filter, paid-indexer preference, language preference; best-effort fallback ensures something is returned even when no result perfectly matches all preferences
- `queueRepairCandidate`, `runBackgroundRepair`, `triggerBackgroundRepair` added to `server.js` near the prefetch machinery they mirror

---
```

- [ ] **Step 2: Add bullet to README.md changelog**

Find the `### 🆕 Recent Enhancements (1.3.x → 1.4.x)` section and add a bullet at the top:

```markdown
- **Background repair on truncation** — when a corrupt NZB truncates mid-stream, UsenetStreamer immediately searches for a replacement and queues it to nzbdav2, so the next stream list view shows a new ⚡ Instant option without any manual action.
```

- [ ] **Step 3: Commit**

```bash
git add IMPROVEMENTS.md README.md
git commit -m "docs: add background repair on truncation to changelog"
```

- [ ] **Step 4: Push to master**

```bash
git push origin master
```

- [ ] **Step 5: Smoke test on NAS**

After CI builds and deploys (takes ~30s):

```bash
ssh -o RemoteCommand=none syno "docker compose -f /volume1/docker/usenetstreamer/docker-compose.yml pull && docker compose -f /volume1/docker/usenetstreamer/docker-compose.yml up -d"
```

Then trigger a truncation (open WALL-E in Stremio using a known-corrupt release) and tail logs:

```bash
ssh -o RemoteCommand=none syno "docker logs usenetstreamer -f --since=0s 2>&1 | grep -E 'REPAIR|NZBDAV|TRUNCAT'"
```

Expected log sequence:
```
[NZBDAV] Upstream truncated stream mid-response - marking for next retry: ...
[REPAIR] Background repair triggered for "WALL-E 2008 ..." (movie:tt0910970:)
[REPAIR] Starting background repair for "WALL-E 2008 ..."
[REPAIR] Phase 1: stream cache cold, falling through to fresh search   ← OR Phase 1 hit
[REPAIR] Phase 2: executing fresh indexer search ...                   ← if Phase 2
[REPAIR] Queued replacement nzoId=XXXXXXXX: "WALL-E 2008 ..."
```

---

## Self-Review Checklist

- Spec coverage: ✅ `findStreamCacheEntryByIds` (Task 1), `selectBestRepairCandidate` (Task 2), `queueRepairCandidate` / `runBackgroundRepair` / `triggerBackgroundRepair` (Task 3), call site (Task 4), changelog (Task 5)
- No placeholders: ✅ all code blocks are concrete
- Type consistency: ✅ `selectBestRepairCandidate` takes `viable[]` in both Task 2 and Task 3 calls; `findStreamCacheEntryByIds` returns entry object (or null) in all usages
- Edge cases covered: dedup guard (in-flight Map), special catalog IDs (Phase 2 gives up cleanly), best-effort size/resolution fallback (tested in Task 2), `requestedEpisode: null` for movies (tested in Task 1)

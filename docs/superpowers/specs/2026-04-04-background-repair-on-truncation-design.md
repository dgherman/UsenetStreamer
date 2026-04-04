# Background Repair on Mid-Stream Truncation Design

**Date:** 2026-04-04
**Status:** Approved

## Problem

When a corrupt Usenet release truncates mid-stream, the negative cache prevents the same NZB from being served again. However, UsenetStreamer takes no proactive action — the user must open the stream list again and manually pick another release, which may not exist in nzbdav2 history yet.

The goal is to automatically find and queue a replacement to nzbdav2 the moment a truncation is detected, so that by the user's next stream list view the replacement is already downloading (or downloaded) and shows as ⚡ Instant.

## Design

### Overview

Two trigger points, one new helper function, one call site:

```
Truncation detected (handleNzbdavStream catch)
  markDownloadUrlFailed(effectiveCacheKey)     ← existing
  triggerBackgroundRepair(ctx)                 ← NEW (fire-and-forget, setImmediate)
      ↓
  repairInFlight Map  ← dedup: key = "type:id:S01E02"
      ↓ not already running
  Phase 1: check stream cache
    getStreamCacheEntry({type, id, requestedEpisode})
    → triageDecisions → filter (verified, not blocklisted, not negative-cached)
    → apply language / resolution / size / indexer-tier scoring
    → addNzbToNzbdav(best candidate)  DONE
      ↓ nothing viable in cache
  Phase 2: ID-based fresh indexer search
    parse id → imdbId or tvdbId
    build plan: { type: 'movie'|'tvsearch', query: '{ImdbId:ttXXXX}' + season/ep tokens }
    executeManagerPlanWithBackoff(plan) + executeNewznabPlan(plan)
    dedupeResultsByTitle(results)
    filter + score (language, resolution, size floor, indexer tier)
    → pick top viable candidate (verified preferred, unverified as fallback)
    → addNzbToNzbdav(candidate) + trackInFlightDownload()  DONE
      ↓ nothing found
    log "[REPAIR] No viable replacement found for {title}" and exit
  remove from repairInFlight Map
```

### New globals (server.js, near prefetchedNzbdavJobs)

```javascript
const repairInFlight = new Map(); // key → Promise; prevents duplicate concurrent repairs
```

### `triggerBackgroundRepair({ type, id, requestedEpisode, title, category })`

Dedup guard + fire-and-forget launcher. Defined near `prunePrefetchedNzbdavJobs`.

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

### `runBackgroundRepair({ type, id, requestedEpisode, title, category })`

Contains the Phase 1 and Phase 2 logic.

#### Phase 1 — stream cache lookup

```javascript
const streamCacheKey = buildStreamCacheKey({ type, id, requestedEpisode });
const cachedEntry = streamCacheKey ? cache.getStreamCacheEntry(streamCacheKey) : null;
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

  const best = selectBestRepairCandidate(viable, { type, requestedEpisode });
  if (best) {
    console.log(`[REPAIR] Phase 1: queuing cached candidate "${best.title}"`);
    await queueRepairCandidate(best, category);
    return;
  }
  console.log('[REPAIR] Phase 1: no viable verified candidate in stream cache, falling through');
} else {
  console.log('[REPAIR] Phase 1: stream cache cold, falling through to fresh search');
}
```

Phase 1 only considers triage-`verified` candidates. If all cached candidates are unverified, it falls through to Phase 2 rather than queuing an unverified result from a potentially stale cache.

#### Phase 2 — fresh ID-based indexer search

```javascript
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

const settled = await Promise.allSettled([
  executeManagerPlanWithBackoff(plan),
  executeNewznabPlan(plan),
]);

const rawResults = settled.flatMap((s) => (s.status === 'fulfilled' ? (s.value?.data ?? []) : []));
const deduped = dedupeResultsByTitle(rawResults);

const viable = deduped.filter((r) => {
  if (!r.downloadUrl) return false;
  if (BLOCKLIST_CHECKER.test(r.title)) return false;
  if (cache.isDownloadUrlFailed(r.downloadUrl)) return false;
  return true;
});

const best = selectBestRepairCandidate(viable, { type, requestedEpisode });
if (!best) {
  console.warn(`[REPAIR] Phase 2: no viable replacement found for "${title}"`);
  return;
}

console.log(`[REPAIR] Phase 2: queuing fresh candidate "${best.title}"`);
await queueRepairCandidate(best, category);
```

Phase 2 accepts unverified candidates (no prior triage available). If the queued candidate is also corrupt, the next truncation fires another repair cycle.

### `selectBestRepairCandidate(viable, { type, requestedEpisode })`

Applies the same scoring signals used in the main triage prefetch selection:

1. **Language preference** — respects `PREFERRED_LANGUAGES` env var; results whose title contains a preferred-language token are ranked above others
2. **Resolution preference** — respects `ALLOWED_RESOLUTIONS` / `MAX_RESOLUTION`; results exceeding the configured max are filtered out; results matching a preferred resolution are ranked higher
3. **Size floor** — skips results below a hardcoded minimum size (100 MB for movies, 20 MB for TV episodes); guards against stub/sample results. No env var controls this — the Newznab search path has no existing size floor concept, so these constants are defined locally in `selectBestRepairCandidate`
4. **Indexer tier** — results from paid/direct indexers (`isResultFromPaidIndexer()`) rank above free Newznab results

Returns the highest-ranked result, or `null` if none pass.

Best-effort: if no result matches language or resolution perfectly, the filter falls back to returning the highest-ranked overall viable result rather than returning nothing.

### `queueRepairCandidate(candidate, category)`

Shared by both phases:

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

### Call site — `handleNzbdavStream` catch block

Immediately after `markDownloadUrlFailed()`:

```javascript
if (error?.isUpstreamTruncation) {
  console.warn('[NZBDAV] Upstream truncated stream mid-response - marking for next retry:', error.message);
  if (effectiveCacheKey) {
    cache.markDownloadUrlFailed(effectiveCacheKey, error.message, 'upstream_truncated');
  }
  // Proactively find and queue a replacement while the user sees the error
  const repairEpisode = parseRequestedEpisode(type, id, req.query || {});
  const repairCategory = nzbdavService.getNzbdavCategory(type);
  triggerBackgroundRepair({ type, id, requestedEpisode: repairEpisode, title, category: repairCategory });
  return;
}
```

`type`, `id`, and `title` are already in scope from `req.query` destructuring at the top of `handleNzbdavStream`. `repairEpisode` and `repairCategory` are cheap synchronous calls, recomputed here because they are block-scoped to the `try`.

### Files changed

| File | Change |
|------|--------|
| `server.js` | Add `repairInFlight` Map; add `triggerBackgroundRepair()`, `runBackgroundRepair()`, `selectBestRepairCandidate()`, `queueRepairCandidate()`; update `handleNzbdavStream` catch block |
| `tests/server.backgroundRepair.test.js` | New test file: in-flight dedup, Phase 1 stream cache hit, Phase 1 all-blocked fallthrough, Phase 2 fresh search hit, Phase 2 no results |

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Repair already in-flight for same title | `repairInFlight` check returns early — one repair per `type:id:episode` at a time |
| Fresh search returns 0 results | Log `[REPAIR] No viable replacement found` and exit silently |
| `queueRepairCandidate` throws (nzbdav2 unreachable) | Caught in `runBackgroundRepair` try/catch — logged, not re-thrown |
| `requestedEpisode` is `null` (movie) | Season/episode tokens omitted; dedup key uses `type:id:` |
| `id` is special catalog format (not IMDB/TVDB) | Phase 2 logs "cannot build ID-based plan" and exits — Phase 1 still runs |
| No perfect language/resolution match in Phase 2 | Best-effort: pick highest-ranked overall viable result rather than queue nothing |
| Repair queues a candidate that is also corrupt | Next truncation marks it failed → repair fires again → picks the next candidate |
| Phase 1 finds only unverified triage results | Skips Phase 1 (verified-only gate) → falls through to Phase 2 |

## Out of Scope

- Updating the instant cache to point at the queued replacement (the existing fuzzy-match history scan handles that automatically once the replacement finishes downloading)
- Retry limits on the repair chain (each truncation is an independent event)
- User notification that a replacement is being prepared (Stremio has no stream list push mechanism)

## User Experience

- **Truncation detected:** nzbdav2 drops connection, stream stops. Negative cache marks the release. Background repair fires immediately in `setImmediate`.
- **While user sees the error:** repair queries the stream cache or fires a fresh indexer search, picks the best replacement, and queues it to nzbdav2.
- **Next stream list view:** if the replacement has finished downloading it shows as ⚡ Instant; if still downloading it may show as a regular indexer result or not yet appear.
- **No manual action required** beyond dismissing the error and returning to the stream list.

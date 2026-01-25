# UsenetStreamer Improvement Ideas

## High Impact

### 1. Language-aware prefetch - IMPLEMENTED

**Status:** Implemented in commit `0420362`

**Behavior:** Prefetch now prioritizes candidates matching user's `NZB_PREFERRED_LANGUAGE` settings. If no language match is found among verified candidates, falls back to the first verified candidate.

**Implementation details:**
- Both prefetch selection paths (triage-complete and early-prefetch) use language-aware selection
- Uses existing `getPreferredLanguageMatch()` helper from utils
- Logs `[PREFETCH] Selected language-matched candidate: <title>` when a language match is found

**Note:** This may be redundant if results are already sorted by preferred language before triage. The sorting would naturally place preferred-language results first, and triage selects from the top. This implementation adds an extra safety net.

---

### 2. Automatic fallback on failure - IMPLEMENTED

**Status:** Implemented in commit `ef451f4`

**Behavior:** When a stream request fails with an explicit nzbdav2 failure or NO_VIDEO_FILES error, automatically tries the next verified candidate from the fallback list.

**Limitation:** This only works for explicit failures reported by nzbdav2, NOT for Stremio client-side timeouts. When Stremio times out waiting, it closes the connection and UsenetStreamer cannot respond with a fallback. This feature helps with:
- nzbdav2 reports "failed" status (incomplete posts, password protected, etc.)
- NZB completes but contains no playable video files
- nzbdav2 API errors

It does NOT help with slow downloads where Stremio gives up waiting.

**Implementation details:**
- Stream URLs include up to 2 fallback candidate URLs (pipe-separated in `fallbackUrls` param)
- On explicit failure, tries next fallback (max 3 total attempts)
- Logs: `[NZBDAV] Trying fallback candidate (attempt X/Y): <url>`
- Fallback candidates are other verified, non-blocklisted results from the same search

**Benefit:** Higher success rate for playback when nzbdav2 reports explicit failures, less manual intervention required from users.

---

## Medium Impact

### 3. Negative caching - IMPLEMENTED

**Status:** Implemented

**Behavior:** Download URLs that fail with explicit nzbdav2 failures or NO_VIDEO_FILES errors are cached in a negative cache. Subsequent requests for the same URL are immediately skipped and fall back to alternatives.

**Implementation details:**
- Added `failedDownloadUrlCache` Map in `nzbdavCache.js` with configurable TTL
- New functions: `isDownloadUrlFailed()`, `markDownloadUrlFailed()`, `clearFailedDownloadUrl()`, `clearAllFailedDownloadUrls()`, `getNegativeCacheStats()`
- URLs are marked failed on `isNzbdavFailure` (incomplete posts, password protected, etc.) and `NO_VIDEO_FILES` errors
- Before streaming, checks if URL is in negative cache - skips directly to fallback if so
- Fallback candidate selection also filters out known-failed URLs
- Cache stats exposed via `getAllCacheStats()` under `nzbdav.negativeCache`
- Cleared when all caches are cleared (`clearAllCaches()`)

**Configuration:**
- `NZBDAV_NEGATIVE_CACHE_TTL_HOURS`: How long to remember failed URLs (default: 24 hours, set to 0 to disable)

**Benefit:** Avoids wasting time on known-bad NZBs, faster fallback to working candidates.

---

### 4. Prefetch multiple candidates

**Current behavior:** Only the first verified candidate is prefetched.

**Proposed:** Prefetch top N verified candidates (configurable, default 2-3) so backups are ready.

**Implementation:**
- Add `NZB_PREFETCH_COUNT` environment variable (default: 1 for current behavior)
- Modify prefetch loop to queue multiple candidates
- Track all prefetched jobs in `prefetchedNzbdavJobs` and `inFlightDownloads`
- Consider download queue depth to avoid overwhelming nzbdav2

**Benefit:** If the first download fails, the backup is already downloading or complete, enabling faster fallback.

---

### 5. Smarter history matching

**Current behavior:** History lookup uses exact normalized title match to detect already-downloaded content.

**Proposed:** Use fuzzy matching or token-based similarity for better detection.

**Implementation:**
- Extract key tokens from title (movie name, year, quality, codec)
- Match on core tokens (name + year) with optional quality match
- Use Levenshtein distance or Jaccard similarity for fuzzy matching
- Configurable similarity threshold
- Handle edge cases: different release groups, repack vs original

**Benefit:** Better detection of already-downloaded content even when release names differ slightly, reducing duplicate downloads.

---

## Quality of Life

### 6. Admin dashboard stats

**Current behavior:** Limited visibility into system performance and cache effectiveness.

**Proposed:** Add statistics to the admin dashboard showing operational metrics.

**Implementation:**
- Track and expose metrics:
  - Prefetch hit rate (prefetched job used vs. new download queued)
  - Instant cache hit rate
  - Triage success rate (verified vs. failed)
  - Average download time
  - Blocklist filter counts
- Add `/admin/stats` endpoint or section in existing admin page
- Optional: time-series data for charts (last 24h, 7d)

**Benefit:** Visibility into system health, helps identify issues and tune configuration.

---

### 7. Configurable blocklist

**Current behavior:** REMUX/ISO blocklist is hardcoded in server.js as regex patterns.

**Proposed:** Move blocklist to configuration (environment variable or config file).

**Implementation:**
- Add `NZB_BLOCKLIST_PATTERNS` environment variable (comma-separated patterns)
- Support both simple substring match and regex patterns
- Provide sensible defaults (remux, iso, img, bin, exe)
- Allow empty value to disable blocklist
- Hot-reload on config change via admin panel

**Example config:**
```
NZB_BLOCKLIST_PATTERNS=remux,/\.iso$/i,bdmv,disc
```

**Benefit:** Users can customize blocklist without code changes, easier to add/remove patterns.

---

### 8. Health check endpoint

**Current behavior:** No dedicated endpoint for monitoring system health and dependencies.

**Proposed:** Add `/health` endpoint that checks connectivity to all dependencies.

**Implementation:**
- Create `/health` endpoint returning JSON status
- Check connectivity to:
  - nzbdav2 API (queue/history endpoints)
  - nzbdav2 WebDAV (list operation)
  - Indexer manager or direct indexers (search endpoint)
  - Cinemeta (metadata fetch)
- Return overall status (healthy/degraded/unhealthy)
- Include response times for each dependency
- Support `?verbose=true` for detailed diagnostics

**Example response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T12:00:00Z",
  "dependencies": {
    "nzbdav2_api": { "status": "up", "latency_ms": 45 },
    "nzbdav2_webdav": { "status": "up", "latency_ms": 12 },
    "indexer": { "status": "up", "latency_ms": 230 },
    "cinemeta": { "status": "up", "latency_ms": 180 }
  }
}
```

**Benefit:** Easy integration with monitoring tools (Uptime Kuma, Prometheus, etc.), quick diagnosis of connectivity issues.

---

## Priority Matrix

| Improvement | Impact | Effort | Priority | Status |
|-------------|--------|--------|----------|--------|
| 1. Language-aware prefetch | High | Low | P1 | DONE |
| 2. Automatic fallback | High | Medium | P1 | DONE |
| 3. Negative caching | Medium | Low | P2 | DONE |
| 7. Configurable blocklist | Low | Low | P2 | |
| 8. Health check endpoint | Low | Low | P2 | |
| 4. Prefetch multiple | Medium | Medium | P3 | |
| 6. Admin dashboard stats | Low | Medium | P3 | |
| 5. Smarter history matching | Medium | High | P4 | |

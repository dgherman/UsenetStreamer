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

### 2b. Smarter unverified candidate handling - IMPLEMENTED

**Status:** Implemented in commit `f9689ca`

**Problem:** When all triaged candidates returned `unverified` (e.g., due to `stat-error`), the system was stuck retrying the same failing candidates instead of exploring further down the pool. With 79 candidates in the pool but only 4 being triaged, valid candidates were never tried.

**Solution:**
1. **Explore new candidates first:** On retry, prefer candidates that haven't been tried yet over retrying unverified ones. This explores more of the pool instead of getting stuck on the first batch.
2. **Prefetch unverified as fallback:** If no verified candidates exist, select the best unverified candidate for prefetch anyway. This gives the user something to try rather than nothing.

**Implementation details:**
- Changed candidate selection priority: new candidates → unverified retries
- Added unverified fallback to early prefetch with language-aware selection
- Logs `[PREFETCH] No verified candidates - selected unverified fallback: <title>`

**Benefit:** More of the candidate pool gets explored, and users get a prefetched result even when verification fails.

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

### 4. Prefetch multiple candidates - IMPLEMENTED

**Status:** Implemented

**Behavior:** Prefetches top N verified candidates (configurable) so backup downloads are ready if the first one fails.

**Configuration:**
- `NZB_PREFETCH_COUNT`: Number of candidates to prefetch (default: 1 for current behavior, recommended: 2-3)

**Implementation details:**
- Candidates are sorted by language preference before selection
- Each candidate is tracked in `prefetchedNzbdavJobs` and `inFlightDownloads`
- Candidates already in history or already prefetching are skipped
- Unverified fallback only prefetches 1 candidate (to be conservative)

**Benefit:** If the first download fails, the backup is already downloading or complete, enabling faster fallback.

---

### 5. Smarter history matching - IMPLEMENTED

**Status:** Implemented

**Behavior:** History matching now uses smart token-based similarity instead of exact title matching. This finds all related downloads even when release names differ (e.g., "28 Days Later DVDrip" vs "28 Days Later 2002 1080p BluRay").

**Implementation details:**
- `parseReleaseTokens()` extracts structured components: title words, year, resolution, source, codec, group
- `calculateReleaseSimilarity()` computes Jaccard similarity between title word sets
- `findMatchingHistoryItems()` finds all history items above similarity threshold
- Configurable via `minSimilarity` (default 0.5) and `requireAllWords` options
- Handles releases without year, different quality markers, various naming conventions
- Debug with `DEBUG_HISTORY_MATCHING=true` to see match scores

**Benefit:** Better detection of already-downloaded content even when release names differ significantly, reducing duplicate downloads and ensuring all instant streams are shown.

---

## Quality of Life

### 6. Admin dashboard stats - IMPLEMENTED

**Status:** Implemented

**Behavior:** Admin dashboard now displays operational statistics including request counts, instant cache hit rate, prefetch hit rate, triage success rate, and blocklist filter counts.

**Implementation details:**
- Created `src/stats/index.js` module for tracking operational metrics
- Added `/admin/api/stats` endpoint to retrieve current statistics
- Added `/admin/api/stats/reset` endpoint to reset statistics
- Tracks the following metrics:
  - **Uptime:** Server running time since start
  - **Requests:** Total requests, split by movies/series
  - **Instant Cache:** Hit rate (cached entry found vs. indexer search required)
  - **Prefetch:** Hit rate (prefetched download used vs. new download started)
  - **Triage:** Success rate (verified vs. blocked/error)
  - **Blocklist:** Filter counts by type (remux, ISO/IMG/BIN, adult content)
- UI displays stats with color-coded rates (green for good, yellow for warning)
- Stats are in-memory and reset on server restart

**Benefit:** Visibility into system health, helps identify issues and tune configuration.

---

### 7. Configurable blocklist - IMPLEMENTED

**Status:** Implemented

**Behavior:** Blocklist patterns are now configurable via the `NZB_BLOCKLIST_PATTERNS` environment variable. Supports three pattern types:
- Simple substring match: `remux` (case-insensitive, matches anywhere)
- Word boundary match: `[xxx]` (matches whole word only)
- Regex pattern: `/\.iso$/i` (full regex with flags)

**Default patterns:** Block ISO/IMG/BIN/CUE/EXE file types, REMUX releases, and adult content markers. Leave empty to disable blocklist entirely.

**Implementation details:**
- Created `src/blocklist/index.js` module for pattern parsing and matching
- Patterns are comma-separated in the environment variable
- Hot-reload supported via admin panel config save
- Stats tracking categorizes hits as: iso, remux, adult, or other
- Admin panel includes textarea for editing patterns with syntax hints

**Configuration:**
- `NZB_BLOCKLIST_PATTERNS`: Comma-separated patterns (default: comprehensive list matching original behavior)

**Example config:**
```
NZB_BLOCKLIST_PATTERNS=remux,[xxx],/\.iso$/i,bdmv,disc
```

**Benefit:** Users can customize blocklist without code changes, easier to add/remove patterns.

---

### 8. Health check endpoint - IMPLEMENTED

**Status:** Implemented

**Behavior:** The `/health` endpoint checks connectivity to all dependencies and returns JSON status.

**Endpoints:**
- `GET /health` - Basic health check (no auth required)
- `GET /health?verbose=true` - Detailed diagnostics

**Checks performed:**
- nzbdav2 API (queue endpoint with limit=1)
- nzbdav2 WebDAV (PROPFIND with Depth:0)
- Indexer manager (Prowlarr system/status or NZBHydra caps)
- Cinemeta (known stable movie metadata)
- TMDb (configuration endpoint)
- Usenet provider (NNTP connection + auth via NZB_TRIAGE_NNTP_* settings)

**Status determination:**
- `healthy`: All configured dependencies responding
- `degraded`: Some non-critical dependencies down or unconfigured
- `unhealthy`: Critical dependencies (nzbdav2 API or WebDAV) down

**Example response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T12:00:00Z",
  "dependencies": {
    "nzbdav_api": { "status": "up", "latency_ms": 45 },
    "nzbdav_webdav": { "status": "up", "latency_ms": 12 },
    "indexer": { "status": "up", "latency_ms": 230 },
    "cinemeta": { "status": "up", "latency_ms": 180 },
    "tmdb": { "status": "up", "latency_ms": 95 },
    "usenet": { "status": "up", "latency_ms": 450 }
  }
}
```

**Note:** The usenet check performs an NNTP connection with TLS handshake and authentication, so it has higher latency (~400-500ms) than HTTP checks. Consider longer polling intervals if monitoring frequently.

**HTTP Status Codes:**
- 200: healthy or degraded
- 503: unhealthy
- 500: error running checks

**Benefit:** Easy integration with monitoring tools (Uptime Kuma, Prometheus, etc.), quick diagnosis of connectivity issues.

---

## Priority Matrix

| Improvement | Impact | Effort | Priority | Status |
|-------------|--------|--------|----------|--------|
| 1. Language-aware prefetch | High | Low | P1 | DONE |
| 2. Automatic fallback | High | Medium | P1 | DONE |
| 2b. Unverified candidate handling | High | Low | P1 | DONE |
| 3. Negative caching | Medium | Low | P2 | DONE |
| 4. Prefetch multiple | Medium | Medium | P2 | DONE |
| 6. Admin dashboard stats | Low | Medium | P2 | DONE |
| 7. Configurable blocklist | Low | Low | P3 | DONE |
| 8. Health check endpoint | Low | Low | P3 | DONE |
| 5. Smarter history matching | Medium | High | P4 | DONE |

---

## Bug Fixes

### Smart matching claiming exact match nzoIds - FIXED

**Problem:** When smart matching ran before exact matches were processed, it would claim nzoIds that should belong to exact matches. For example, if the search results included both:
- "shrinking s01e01 multi 1080p web h264 higgsboson" (no exact history match)
- "shrinking s01e01 1080p web h264 truffle" (has exact history match)

The first result would run smart matching, find "truffle" in history (matching title words), and claim its nzoId. When the second result was processed, the exact match was found but already claimed, so it showed as "no match".

**Solution:** Added a pre-pass that reserves nzoIds for exact matches BEFORE processing any results. Smart matching now skips nzoIds that are reserved for exact matches, ensuring exact matches always have priority.

**Implementation:**
- Added `exactMatchNzoIds` Set populated during a pre-pass over all results
- Smart matching skips any nzoId found in `exactMatchNzoIds`
- This ensures exact matches are always claimed by their corresponding results

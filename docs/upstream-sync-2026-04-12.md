# Upstream Sync Analysis

**Date:** 2026-04-12
**Upstream Repository:** https://github.com/Sanket9225/UsenetStreamer
**Fork Repository:** https://github.com/dgherman/UsenetStreamer
**Previous sync:** `659ce56` (2026-03-11) — see `docs/upstream-sync-2026-03-15.md`

## Current State

| Branch | Latest Commit | Date |
|--------|---------------|------|
| Fork (myfork/master) | `bc4fb67` fix: cap prefetched episodes | 2026-04-10 |
| Upstream (origin/master) | `5c9ab8a` github sponsor | 2026-04-11 |

**New upstream commits since last sync:** ~20 commits (2026-03-11 → 2026-04-11)

---

## Changes Implemented

### 1. Pool Hang-Up Fix (from upstream `392770c`)

| Fork Commit | Description |
|-------------|-------------|
| `d74ff41` | Pool hang up — acquire timeout, prewarm timeout, TRIAGE_ENABLED guards |

- Default NNTP connections reduced from 60 to 12
- 15s acquire timeout prevents indefinite waiter hang
- 30s prewarm timeout with race pattern
- `needsFreshPool` pattern discards stale pool builders
- TRIAGE_ENABLED guards prevent pool operations when triage is disabled

### 2. Security Hardening (from upstream `3e75d88` + `e473adc`)

| Fork Commit | Description |
|-------------|-------------|
| `0c3ceee` | Header allowlist, error sanitization, credential masking, lockout, CSRF |

- NZBDav proxy: header allowlist instead of blocklist
- `sanitizeErrorForClient()` strips URLs from error messages
- Credential masking with sentinel values in admin API (GET/POST /config)
- FROZEN_KEYS prevents modifying ADDON_SHARED_SECRET, STREAMING_MODE via API
- Failed-login lockout: 10 attempts → 15min lockout per IP
- CSRF Origin checking for mutating admin requests
- runtime-env.json: file permissions set to 0o600

### 3. Extended Attributes, File Count Sorting, Dedup (from upstream `004ed78` + `b8fb0dd` + `b3ea762`)

| Fork Commit | Description |
|-------------|-------------|
| `3d14506` | Extended attrs, file count sorting, Usenet group dedup |

- Newznab: request extended=1 with attrs for files, grabs, group, usenetdate, etc.
- NZBHydra normalizer: extract files, grabs, group, publishDateMs
- Easynews: fix post date field (entry[5] not entry[8]), add Usenet group
- `deriveSortOrder()` provides sensible defaults (resolution, size, files) when NZB_SORT_ORDER is unset
- Date and files sort criteria with backward-compat aliases
- Dedup: title+group bucket key (prevents false dedup across different groups), prefer fewer-files releases

### 4. NZBDav Stream Caching (from upstream `e19c375`)

| Fork Commit | Description |
|-------------|-------------|
| `6e187c6` | Keep-alive agents, file size cache, real HEAD requests |

- HTTP/HTTPS keep-alive agents (maxSockets: 50) reuse TCP connections
- File size cache (30min TTL) avoids repeated HEAD probes
- Real HEAD requests instead of GET+Range:0-0 emulation
- Cached HEAD fast-path serves responses without upstream round-trip
- NZBDAV_STREAM_PREFETCH_HEAD config (default on) controls HEAD pre-flight
- Server keepAliveTimeout=65s, headersTimeout=70s
- Preserves fork's truncation detection (byteCounter Transform pipeline)

### 5. Indexer Caps Filtering (from upstream `e6da82e` + `66e917a`)

| Fork Commit | Description |
|-------------|-------------|
| `3173d5b` | Caps filtering — skip indexers missing required ID params |

- Full caps infrastructure: normalizeCapsType, parseSupportedParamsFromXml, fetchNewznabCaps, getSupportedParams, refreshCapsCache
- Per-indexer caps cache with env-based pre-seeding (NEWZNAB_CAPS_CACHE)
- extractRequiredIdParams identifies imdbid/tvdbid/tmdbid from search tokens
- searchNewznabIndexers filters indexers missing required ID params
- fetchIndexerResults filters unsupported tokens from search plans
- DEFAULT_CAPS: tvsearch supports tvdbid (not imdbid), movie supports imdbid

### 6. Dependency Updates (from upstream `202145b`)

| Fork Commit | Description |
|-------------|-------------|
| `9e63b0a` | Pin axios to 1.14.0 |

---

## Deliberately Skipped

| Feature | Upstream Commits | Reason |
|---------|------------------|--------|
| Smart play fixes | `4f5cfe3`, `f7a1a6c` | Fork uses prefetch/fallback pipeline, not smart play / auto-advance |
| Smart play additional downloads | `f7a1a6c` | Fork doesn't use auto-advance |
| Token-based stream naming (NZB_NAMING_PATTERN) | `b3ea762` (partial) | Fork uses hardcoded name/description; full template system is a separate large feature |
| Zyclops integration updates | various | Fork doesn't use Zyclops |
| Version bumps (1.7.x → 1.8.x) | various | Fork has own versioning |
| GitHub sponsor badge | `5c9ab8a` | Non-functional change |
| diskNzbCache import in nzbdav.js | `e19c375` | Fork doesn't use disk NZB cache module |
| nzbdavWs (WebSocket) removal from nzbdav.js | `e19c375` | Fork still uses WebSocket polling |

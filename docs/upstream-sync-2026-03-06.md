# Upstream Sync Analysis

**Date:** 2026-03-06
**Upstream Repository:** https://github.com/Sanket9225/UsenetStreamer
**Fork Repository:** https://github.com/dgherman/UsenetStreamer
**Previous sync:** `a74c8dc` (2026-02-24) — see `docs/upstream-sync-2026-02-25.md`

## Current State

| Branch | Latest Commit | Date |
|--------|---------------|------|
| Fork (myfork/master) | `74bf6ef` Add .worktrees/ to .gitignore | 2026-03-06 |
| Upstream (origin/master) | `d28e9c4` stream token | 2026-03-05 |

**New upstream commits since last sync:** 5 commits (2026-02-24 → 2026-03-05)

---

## New Upstream Commits

| Commit | Description | Action |
|--------|-------------|--------|
| `0e6b2a4` | background triage, auto-advance queue, smart play, disk NZB cache | **SKIP** — architecturally incompatible with fork's reliability stack (prefetch/fallback/negative cache). Selectively cherry-picked non-conflicting pieces (see below). |
| `d28e9c4` | stream token | **CHERRY-PICKED** — auth token separation concept adopted and independently implemented |
| `24dd73c` | version bump 1.8.0 | **SKIP** — fork has its own versioning |
| `f36a80c` | version bump 1.8.1 | **SKIP** — fork has its own versioning |
| `bcee2ec` | version bump 1.8.2 | **SKIP** — fork has its own versioning |

---

## Changes Implemented

### Reliability Hardening (inspired by upstream, independently written)

| Commit | Description |
|--------|-------------|
| `2f862e5` | Filter previously-failed NZBs out of search results |
| `4cd8b43` | Harden error handling: process guards, stream safety, response checks |
| `1644dc6` | Unify NO_VIDEO_FILES with isNzbdavFailure error path |

### Upstream Cherry-Picks (non-conflicting pieces from `0e6b2a4` and `d28e9c4`)

| Commit | Description | Source |
|--------|-------------|--------|
| `6129740` | Separate admin secret from stream token with auth hardening | `d28e9c4` |
| `e0983e5` | Export isLikelyNzb from newznab service | `0e6b2a4` |
| `1ad7f45` | Strip Usenet upload tags before release title parsing | `0e6b2a4` |
| `4cf8c35` | Add updateStreamCacheMeta to stream cache | `0e6b2a4` |
| `58ce163` | Add onDecision callback to triage runner | `0e6b2a4` |
| `e36295f` | Bump default cache TTLs from 24h to 72h | `0e6b2a4` |

---

## Deliberately Skipped from `0e6b2a4`

These upstream features are architecturally incompatible with the fork's existing reliability stack:

| Feature | Reason |
|---------|--------|
| Background triage queue | Fork uses multi-candidate prefetch with URL-based fallback instead |
| Auto-advance queue | Fork's negative cache + fallback URLs achieve the same goal differently |
| Smart play orchestration | Fork's prefetch pipeline handles candidate selection differently |
| Disk-based NZB cache | Fork uses in-memory verified NZB cache with configurable size limits |
| Custom parse-torrent-title fork | Fork uses npm package with pre-processing regex for usenet tags |

---

## New Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ADDON_STREAM_TOKEN` | Separate token for stream/manifest URLs (if leaked, can't access admin) | Falls back to `ADDON_SHARED_SECRET` |

---

## Cache TTL Changes

All default cache TTLs bumped from 24 hours to 72 hours:
- Stream response cache (`STREAM_CACHE_TTL_MINUTES`)
- NZBDav stream cache (`NZBDAV_CACHE_TTL_MINUTES`)
- Verified NZB cache (`VERIFIED_NZB_CACHE_TTL_MINUTES`)
- NZBDav history cache (server.js)
- TMDb metadata cache (hardcoded)

All remain configurable via their respective environment variables.

# Upstream Sync Analysis

**Date:** 2026-03-15
**Upstream Repository:** https://github.com/Sanket9225/UsenetStreamer
**Fork Repository:** https://github.com/dgherman/UsenetStreamer
**Previous sync:** `d28e9c4` (2026-03-05) — see `docs/upstream-sync-2026-03-06.md`

## Current State

| Branch | Latest Commit | Date |
|--------|---------------|------|
| Fork (myfork/master) | `3186612` Update dependencies | 2026-03-15 |
| Upstream (origin/master) | `659ce56` updated dependencies | 2026-03-11 |

**New upstream commits since last sync:** 5 commits (2026-03-05 → 2026-03-11)

---

## New Upstream Commits

| Commit | Description | Action |
|--------|-------------|--------|
| `cfdeecf` | smart play fix | **SKIP** — smart play / auto-advance / background triage; fork uses prefetch/fallback instead |
| `6fe3c7f` | stream protection/smart-play fixes, triage+NZB filtering, OMG+Tabula presets | **CHERRY-PICKED** — selectively adopted non-conflicting pieces (see below) |
| `0badf71` | zyclops fix | **SKIP** — Zyclops admin validation and autoAdvanceQueue maxAttempts; fork doesn't use Zyclops or auto-advance |
| `75fec89` | better timeouts | **PARTIALLY ADOPTED** — NZBDav poll timeout increase adopted; smart play / auto-advance timeout changes skipped |
| `659ce56` | updated dependencies | **ADOPTED** — Node 22, dependency bumps, security overrides |

---

## Changes Implemented

### Blu-ray Detection (from `6fe3c7f`)

| Commit | Description |
|--------|-------------|
| `9ada1ad` | Detect Blu-ray m2ts disc clips as non-playable video |

Numbered m2ts files (e.g. 00004.m2ts) are Blu-ray STREAM clips that Stremio cannot play. Now treated as disc images. Removed `.m2ts`/`.mts` from VIDEO_EXTENSIONS and isVideoContainer regex.

### Newznab Improvements (from `6fe3c7f`)

| Commit | Description |
|--------|-------------|
| `459732a` | OMGWTFNZBs preset, Tabula Rasa API path fix, Cloudflare 403 detection, isLikelyNzb enhancement |

### NZBDav Hardening (from `6fe3c7f` and `75fec89`)

| Commit | Description |
|--------|-------------|
| `bb45527` | Download NZBs ourselves with SABnzbd UA then addfile, setMaxListeners, poll timeout 80s→240s |

### Triage Runner (from `6fe3c7f`)

| Commit | Description |
|--------|-------------|
| `aabff9d` | NZB payload cache to avoid re-downloading on retries |

### Ignore Files (from `6fe3c7f`)

| Commit | Description |
|--------|-------------|
| `64e223c` | Add cache/nzb_payloads and temp_nzbs to .gitignore/.dockerignore |

### Dependencies (from `659ce56`)

| Commit | Description |
|--------|-------------|
| `3186612` | Node 22, apk upgrade, form-data 4.0.4, webdav 5.9.0, npm security overrides |

---

## Deliberately Skipped

| Feature | Reason |
|---------|--------|
| Smart play fixes (`cfdeecf`, parts of `6fe3c7f`) | Fork uses prefetch/fallback pipeline, not smart play / auto-advance |
| Background triage `selectionReady` flag | Smart play specific optimization |
| `getInstantCandidate()` | Smart play specific |
| `upfrontNzbPayloadCache` in server.js | Fork uses different triage invocation path |
| `unverified` moved to TRANSIENT_STATUSES | backgroundTriage.js specific; fork's retry logic handles this differently |
| Zyclops admin validation (`0badf71`) | Fork doesn't use Zyclops |
| autoAdvanceQueue maxAttempts (`0badf71`) | Fork doesn't use auto-advance |
| Smart play / auto-advance timeout increases (`75fec89`) | Fork doesn't use smart play |
| NZB-only filter refactor in server.js | Fork already filters correctly at the newznab service level |
| `historyByTitle` passed to background triage | Smart play specific |
| Version bumps (1.7.4 → 1.7.5) | Fork has own versioning |

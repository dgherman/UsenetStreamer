# Upstream Sync Implementation Plan

**Date:** 2026-02-09
**Upstream Repository:** https://github.com/Sanket9225/UsenetStreamer
**Fork Repository:** https://github.com/dgherman/UsenetStreamer

## Current State

| Branch | Latest Commit | Date |
|--------|---------------|------|
| Fork (origin/master) | `56568a5` Fix NNTP health check crash from race condition | 2026-01-27 |
| Upstream (upstream/master) | `ffca39c` UI bug fixed | 2026-02-08 |

**Divergence:** 54 commits in fork not in upstream, 33 commits in upstream not in fork.

---

## Decisions

### Excluded Features

| Feature | Commits | Reason |
|---------|---------|--------|
| **Zyclops Integration** | `811b304` | Designed for ElfHosted users. Fork uses NzbHydra2 which already provides indexer aggregation. Zyclops would add latency with minimal benefit for self-hosted setups. |
| **TVDB Support** | `bbe1da8` (partial), `src/services/tvdb.js` | Already using TMDB for ID resolution. Standard Stremio/Cinemeta uses IMDb IDs, not TVDB. Indexers behind Hydra support TVDB search via caps, but source TVDB IDs are rarely provided by Stremio addons. |

### Included Features

Organized by implementation phase.

---

## Phase 1: Low-Risk Bug Fixes

Isolated commits with minimal conflict risk. Cherry-pick directly.

| Commit | Description | Files Affected |
|--------|-------------|----------------|
| `0465b2d` | Video codec fix | `src/services/metadata/releaseParser.js` |
| `41e2fa8` | Fixed ISO inside archive | `server.js` |
| `25bbf9c` | Fix newznab API searches (#50) | `src/services/newznab.js` |
| `04db49c` | TMDB search fix | `src/services/tmdb.js` |
| `3822b9f` | Incorrect title fix | `server.js` |
| `ffca39c` | UI bug fixed | `admin/app.js` |

---

## Phase 2: Stability Improvements

Independent changes improving reliability.

| Commit | Description | Files Affected |
|--------|-------------|----------------|
| `9a7a259` | Add log rotation (#49) | `server.js`, `package.json` |
| `78497ae` | Newznab timeout | `src/services/newznab.js` |
| `27ff421` | Better timeouts overall | `server.js`, `src/services/*.js` |
| `ce1fdb8` | Caps fallback | `src/services/newznab.js` |

---

## Phase 3: Indexer Capabilities — SKIPPED

**Skipped:** Fork uses NzbHydra2 which already handles indexer caps detection, API hit tracking, and disables indexers at their limits. Caps detection and per-indexer grab limits would be redundant.

| Commit | Description | Status |
|--------|-------------|--------|
| `bbe1da8` | Support to TVDB and indexer caps | Skipped |
| `ce1fdb8` | Caps fallback | Skipped |
| `c84028d` | Indexer level grab limit | Skipped |
| `83e14cc` | Grab limit for indexer from manager | Skipped |
| `cad5405` | Grab limit from 1 | Skipped |

---

## Phase 4: Text Matching & Parsing — SKIPPED

**Skipped:** Fork does not use the Easynews provider. These changes only affect `src/services/easynews/index.js`.

| Commit | Description | Status |
|---------|-------------|--------|
| `fd3b57b` | Refined text matching | Skipped |
| `cdf0526` | Easynews text matching fix | Skipped |
| `a023fe7` | Easynews text matching fix | Skipped |

---

## Phase 5: Admin UI Enhancements — DEFERRED (large refactor)

Higher conflict risk with fork's existing UI changes (cache management UI, stats dashboard).

| Commit | Description | Status |
|--------|-------------|--------|
| `8e55217` | Refactor filtering logic and improve Admin UI (#52) | **Deferred** — large UI refactor with high conflict risk |
| `800438b` | TMDB enable button fixed | **Skipped** — fork uses `TMDB_SEARCH_MODE` not `TMDB_ENABLED`; fix doesn't apply |
| `e930f90` | TMDB UI updates | Already incorporated in earlier phases |

---

## Phase 6: Optional Features — Cherry-Picked

| Feature | Commits | Status |
|---------|---------|--------|
| **Random User Agent** | `1b38ceb`→`28626db`→`e1be914` | **Applied** — final state only (`SABnzbd/4.5.5` constant in `src/utils/userAgent.js`); no npm dep needed |
| **PWA Support** | `4906dea` | **Applied** — manifest, service worker, meta tags, responsive CSS; skipped server.js TMDB/sampling changes |
| NZBDAV as Catalog | `94e525c` | **Deferred** — potential conflict with fork's instant cache feature |
| External Player Fix | `942e59a`, `df4ec43` | **Deferred** — only needed if using external players |

---

## Conflict Zones

Files with significant changes on both sides requiring manual merge:

| File | Fork Changes | Upstream Changes |
|------|--------------|------------------|
| `server.js` | Blocklist, health checks, stats, instant cache, prefetch | Caps, catalog, timeouts, TMDB/TVDB integration |
| `src/services/newznab.js` | Blocklist integration | Caps detection, grab limits, Zyclops |
| `src/services/nzbdav.js` | Caching improvements, stream handling | Catalog feature |
| `admin/app.js` | Cache management UI, stats dashboard | Filtering UI, language search, TMDB/TVDB controls |
| `admin/index.html` | Cache management section | Filtering controls, PWA meta tags |

---

## Fork-Specific Features to Preserve

These features exist only in the fork and must not be lost during merge:

- Health check endpoint (`/health`) with NNTP monitoring
- Configurable blocklist patterns (`src/blocklist/`)
- Operational statistics dashboard (`src/stats/`)
- Persistent instant cache (`src/cache/instantCache.js`)
- Multi-candidate prefetch (`NZB_PREFETCH_COUNT`)
- Cache management UI in admin panel
- Negative caching for failed downloads
- Language-aware prefetch selection
- Smart matching improvements (many bug fixes)
- Docker build workflow (`.github/workflows/docker-build.yml`)

---

## Implementation Strategy

1. **Create feature branch:** `git checkout -b upstream-sync-2026-02`
2. **Cherry-pick by phase:** Start with Phase 1, test, proceed to next
3. **Manual merge for conflicts:** Use 3-way merge, preserve fork features
4. **Test after each phase:** Run application, verify admin UI, test search flow
5. **Skip Phase 6 initially:** Incorporate later if needed

---

## Verification Checklist

After each phase:

- [ ] Application starts without errors
- [ ] Admin UI loads and saves configuration
- [ ] Search returns results from indexers
- [ ] Existing fork features still work (health check, blocklist, stats, cache)
- [ ] No regressions in streaming functionality

---

## Post-Merge Commits

After successful merge, the fork will be synchronized with upstream through commit `ffca39c` (2026-02-08), excluding:
- Zyclops integration (`811b304`)
- TVDB service (`src/services/tvdb.js`, TVDB portions of `bbe1da8`)

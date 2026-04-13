# Stream Naming Template System — Design Spec

**Date:** 2026-04-12
**Goal:** Port the upstream token-based stream naming template system so Stremio stream cards show rich, configurable metadata instead of hardcoded strings.

## Current State

The fork hardcodes stream display in `server.js`:
- **Name:** `${addonLabel} ${qualitySummary}` → e.g. "UsenetStreamer 2160p"
- **NZBDav title:** `${result.title}\n${tags.join(' • ')}\n${result.indexer}`
- **Native description:** `${result.title}\n${result.indexer} • ${sizeString}\n${tags.join(' • ')}`

Additionally, `parseReleaseMetadata()` in `releaseParser.js` discards most fields from `parse-torrent-title` — only returns `resolution`, `languages`, `qualityLabel`, `qualityScore`.

## Architecture

Three changes, each with a single clear responsibility:

### 1. Template Engine (`src/utils/templateEngine.js`) — NEW FILE

Port from upstream as-is. Self-contained 182-line class, no external dependencies. Supports:
- Path-based context resolution: `{stream.title}`, `{addon.name}`
- Modifiers: `::exists`, `::istrue`, `::bytes`, `::join()`, `::>0`, `::lower`, `::upper`, etc.
- Conditional output: `[trueVal||falseVal]`
- Chained `::and` logic
- Empty line cleanup (blank lines from missing values are stripped)

`formatStreamTitle(pattern, data, defaultPattern)` in `helpers.js` wraps this engine.

### 2. Release Metadata Enrichment (`src/services/metadata/releaseParser.js`) — MODIFY

Expand `parseReleaseMetadata()` to return all fields from `parse-torrent-title` that the template system needs:

```
parsedTitle, parsedTitleDisplay, resolution, languages, qualityLabel, qualityScore,
source, codec, group, audio, audioList, hdrList, visualTags,
season, episode, year, container, complete, proper, repack, extended,
hardcoded, hdr, remastered, unrated, remux, retail, upscaled, convert,
documentary, dubbed, subbed, edition, region, bitDepth
```

`visualTags` is derived from the existing `QUALITY_FEATURE_PATTERNS` array (DV, HDR10+, HDR10, HDR, SDR) — moved from `server.js` to `releaseParser.js` so the parser owns the full metadata extraction.

### 3. Server.js — MODIFY

**New env vars:**
- `NZB_NAMING_PATTERN` — controls the stream description/title (multi-line body)
- `NZB_DISPLAY_NAME_PATTERN` — controls the stream name (short bold label)

Both added to initial declaration, `rebuildRuntimeConfig()`, and admin config key list.

**namingContext construction:** Before building the stream object, assemble a context object from existing variables:

```js
const namingContext = {
  addon: { name: addonLabel },
  stream: {
    title: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
    filename: normalizedFilename || '',
    resolution: detectedResolutionToken || '',
    source: result.source || releaseInfo.source || '',
    encode: result.codec || releaseInfo.codec || '',
    visualTags: result.hdrList || releaseInfo.hdrList || [],
    audioTags: result.audioList || releaseInfo.audioList || [],
    releaseGroup: result.group || releaseInfo.group || '',
    size: result.size || 0,
    indexer: result.indexer || '',
    languages: releaseLanguageLabels || [],
    health: triageTag || '',
    instant: isInstant,
    cached: isInstant,
    files: result.files || null,
    grabs: result.grabs || null,
    date: result.publishDateMs ? new Date(result.publishDateMs).toISOString().slice(0, 10) : null,
    usenetGroup: result.group || null,
    streamQuality: quality || '',
    parsedTitleDisplay: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
  },
  service: { shortName: 'Usenet', cached: isInstant, instant: isInstant },
  tags: tagsString,
  // Flat aliases for simpler patterns
  title: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
  indexer: result.indexer || '',
  resolution: detectedResolutionToken || '',
  quality: quality || '',
  health: triageTag || '',
  // ... (remaining flat aliases mirror stream.* for backward compat)
};
```

**buildPatternFromTokenList():** Inline function that converts simple token lists (`"title,resolution,size,indexer"`) into template expressions using `shortTokenMap` (for name) or `longTokenMap` (for description). If the raw pattern already contains `{`, it's passed through as a raw template. This lets users choose between simple token mode or full template expressions.

**Token maps:** `shortTokenMap` maps token names to compact expressions (no emoji). `longTokenMap` maps to emoji-prefixed expressions. Both maps cover: `title`, `filename`, `source`, `codec`, `resolution`, `visual`, `audio`, `group`, `size`, `languages`, `indexer`, `health`, `instant`, `files`, `grabs`, `date`, `quality`, `tags`.

**Replace hardcoded strings:** Both native and NZBDav stream objects use `formattedName` and `formattedTitle` instead of the current hardcoded template literals.

## Default Patterns

**Name** (short bold label):
```
{addon.name} {stream.health::exists["{stream.health} "||""]}{stream.instant::istrue["⚡ "||""]}{stream.resolution::exists["{stream.resolution}"||""]}
```
→ `UsenetStreamer ✓ Healthy ⚡ 2160p`

**Description** (multi-line body — style C, minimal emoji):
```
{stream.parsedTitleDisplay::exists["{stream.parsedTitleDisplay}\n"||""]}
{stream.resolution::exists["🖥️ {stream.resolution}"||""]}{stream.source::exists[" {stream.source}"||""]}{stream.encode::exists[" {stream.encode}"||""]}{stream.visualTags::join(" ")::exists[" | {stream.visualTags::join(\" \")}"||""]}\n
{stream.size::>0["📦 {stream.size::bytes}"||""]}{stream.indexer::exists[" | 🔎 {stream.indexer}"||""]}\n
{stream.health::exists["🧪 {stream.health}"||""]}
```
→
```
The Batman (2022)
🖥️ 2160p BluRay x265 | HDR DV
📦 14.2 GB | 🔎 NZBGeek
🧪 ✓ Healthy
```

Empty lines are automatically stripped by the template engine, so missing fields don't leave blank gaps.

## User Configuration

Users override defaults via env vars. Two modes:

1. **Token list mode:** `NZB_NAMING_PATTERN=title,resolution,source,codec,size,indexer,health` — maps each token to a `longTokenMap` expression with emoji prefix.

2. **Raw template mode:** `NZB_NAMING_PATTERN={stream.title}\n{stream.resolution} {stream.source}` — passed directly to the engine. Supports the full expression language.

Newlines in env vars create multi-line output (each line's tokens joined with spaces, lines joined with `\n`).

`NZB_DISPLAY_NAME_PATTERN` works the same way but uses `shortTokenMap` (no emoji).

## Files Changed

| File | Action | What |
|------|--------|------|
| `src/utils/templateEngine.js` | Create | Template engine class (port from upstream) |
| `src/utils/helpers.js` | Modify | Add `formatStreamTitle()`, import TemplateEngine |
| `src/services/metadata/releaseParser.js` | Modify | Expand `parseReleaseMetadata()` return, add `QUALITY_FEATURE_PATTERNS`, add `visualTags` |
| `server.js` | Modify | Add env vars, namingContext, buildPatternFromTokenList, token maps, replace hardcoded stream display |

## Testing

- TemplateEngine: unit tests for modifier evaluation, conditional output, nested paths, empty line cleanup, edge cases (missing paths, null values, arrays)
- formatStreamTitle: integration test with a realistic namingContext
- parseReleaseMetadata: verify new fields are populated from typical release titles
- End-to-end: `npm test` must pass; manual verification in Stremio after deployment

## Not In Scope

- Admin UI for pattern editing (env var / config API is sufficient)
- Preview/live-preview of pattern changes
- Audio channel parsing (not reliably extracted by parse-torrent-title)

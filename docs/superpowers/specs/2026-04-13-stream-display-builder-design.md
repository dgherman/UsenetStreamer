# Stream Display Builder — Design Spec

**Date:** 2026-04-13
**Goal:** Add a visual drag-and-drop token builder to the admin dashboard so users can configure stream naming patterns (NZB_NAMING_PATTERN and NZB_DISPLAY_NAME_PATTERN) without writing template expressions by hand.

## Current State

The template system (shipped in the previous commit batch) supports two configuration modes:
1. **Token list mode:** `NZB_NAMING_PATTERN=title,resolution,size,indexer` — maps each token via `buildPatternFromTokenList()`.
2. **Raw template mode:** `NZB_NAMING_PATTERN={stream.title}\n{stream.resolution}` — passed directly to the engine.

Both are set via env vars or the admin API. There is no UI for them — the admin dashboard has no fields for these two keys despite them being in `ADMIN_CONFIG_KEYS`.

## Architecture

One new section in `admin/index.html` with supporting JS in `admin/app.js` and CSS in `admin/styles.css`. No new files. No external dependencies.

### Section: "Stream Display"

Placed between the "Result Sorting & Filters" section and the "Addon Metadata" section in the admin form. Contains:

1. **Name Builder** — vertical list of draggable token rows for `NZB_DISPLAY_NAME_PATTERN`
2. **Description Builder** — vertical list of draggable token rows for `NZB_NAMING_PATTERN`, with line break separators
3. **Live Preview** — renders both Name and Description using sample data, updates on every change

### Row Design (Descriptive)

Each token row contains:
- **Drag handle** (`⋮⋮`) on the left — uses HTML5 native drag-and-drop (`draggable="true"`)
- **Label + hint** in the middle — token name with emoji prefix (for description tokens) and a short example value
- **Toggle switch** on the right — CSS-only toggle, enabled rows have full opacity, disabled rows are dimmed (opacity 0.5, muted colors)

### Line Break Separators (Description only)

Special draggable rows with a dashed border and `── LINE BREAK ──` label. They can be:
- Dragged to any position in the description list
- Removed via a `✕` button on the row
- Added via a `+ Add Line Break` button below the description list

The Name builder does not have line breaks — all enabled name tokens render on a single line separated by spaces.

### Token Definitions

**Name tokens** (short, no emoji):

| Token Key | Label | Hint |
|-----------|-------|------|
| `addon` | Addon Name | e.g. "UsenetStreamer" |
| `health` | Health | e.g. "✓ Healthy" |
| `instant` | Instant | ⚡ when stream is cached |
| `resolution` | Resolution | e.g. "2160p" |
| `quality` | Quality | e.g. "2160p" (alias for resolution) |
| `source` | Source | e.g. "BluRay" |
| `codec` | Codec | e.g. "x265" |
| `size` | Size | e.g. "14.2 GB" |
| `indexer` | Indexer | e.g. "NZBGeek" |
| `languages` | Languages | e.g. "English French" |
| `group` | Release Group | e.g. "FraMeSToR" |

**Description tokens** (emoji-prefixed):

| Token Key | Label | Hint |
|-----------|-------|------|
| `title` | 🎬 Title | Parsed release title — e.g. "The Batman 2022" |
| `filename` | 📄 Filename | Raw release filename |
| `resolution` | 🖥️ Resolution | e.g. "2160p" |
| `source` | 🎥 Source | e.g. "BluRay", "WEB-DL" |
| `codec` | 🎞️ Codec | e.g. "x265", "H.264" |
| `visual` | 📺 Visual Tags | e.g. "HDR DV" |
| `audio` | 🎧 Audio | e.g. "DTS-HD MA" |
| `group` | 👥 Release Group | e.g. "FraMeSToR" |
| `size` | 📦 Size | e.g. "14.2 GB" |
| `languages` | 🌎 Languages | e.g. "English French" |
| `indexer` | 🔎 Indexer | e.g. "NZBGeek" |
| `health` | 🧪 Health | e.g. "✓ Healthy" |
| `instant` | ⚡ Instant | Shows when stream is cached |
| `files` | 📁 Files | e.g. "12 files" |
| `grabs` | ⬇️ Grabs | e.g. "847 grabs" |
| `date` | 📅 Date | e.g. "2026-04-10" |
| `quality` | 🖥️ Quality | Alias for resolution |
| `tags` | 🏷️ Tags | Combined status/language/size tags |

### Default Token Order and State

**Name defaults** (all enabled): `addon`, `health`, `instant`, `resolution`

**Description defaults** (all enabled, with line breaks):
```
title
── LINE BREAK ──
resolution, source, codec, visual
── LINE BREAK ──
size, indexer
── LINE BREAK ──
health
```

Tokens not in the default are appended at the bottom, disabled. This way all available tokens are always visible — the user just toggles them on and drags them where they want.

### Serialization

Each builder serializes its state into a hidden `<input>` that participates in the normal form submission.

**Name builder** writes to `<input name="NZB_DISPLAY_NAME_PATTERN">`:
- Comma-separated list of enabled token keys in order
- Example: `addon,health,instant,resolution`

**Description builder** writes to `<input name="NZB_NAMING_PATTERN">`:
- Comma-separated enabled token keys, with `\n` literal for line breaks
- Example: `title\nresolution,source,codec,visual\nsize,indexer\nhealth`

Disabled tokens are omitted from the serialized string. Their position is preserved in the DOM but they don't affect the output.

When the form loads config from the server, the builders parse the stored pattern string back into ordered rows with enabled/disabled states. Tokens present in the pattern are enabled and ordered as stored. Tokens absent from the pattern are appended at the end, disabled.

If the stored pattern contains `{` (raw template mode), the builder shows a notice: "Custom template detected — visual builder is disabled" and hides the drag-and-drop UI, showing only the raw string in a read-only display. This preserves the user's hand-crafted template without the builder overwriting it.

### Live Preview

The preview section renders both Name and Description using hardcoded sample data:

```js
const PREVIEW_DATA = {
  addon: { name: 'UsenetStreamer' },
  stream: {
    title: 'The Batman 2022',
    resolution: '2160p',
    source: 'BluRay',
    encode: 'x265',
    visualTags: ['HDR', 'DV'],
    audioTags: ['DTS-HD MA'],
    releaseGroup: 'FraMeSToR',
    size: 15032385536,
    indexer: 'NZBGeek',
    health: '✓ Healthy',
    instant: true,
    files: 1,
    grabs: 847,
    date: '2026-04-10',
    streamQuality: '2160p',
    parsedTitleDisplay: 'The Batman 2022',
    languages: ['English'],
    filename: 'The.Batman.2022.2160p.UHD.BluRay.x265.HDR.DV.DTS-HD.MA.7.1-FraMeSToR.nzb',
  },
  tags: '✓ Healthy • ⚡ Instant • 14.2 GB',
};
```

The preview converts the current builder state into a token list pattern (same logic as server.js's `buildPatternFromTokenList`, reimplemented in app.js), then renders it using the existing `TemplateEngine` class. The engine is already UMD-compatible — its IIFE wrapper exports to `window.TemplateEngine` when loaded via `<script>` tag. To make it available in the admin page, add one Express static route in server.js: `app.use('/admin/lib', express.static(path.join(__dirname, 'src/utils')));` — then load it in index.html with `<script src="lib/templateEngine.js"></script>`. Both token maps (`shortTokenMap` and `longTokenMap`) are duplicated in app.js as static lookup objects — they must stay in sync with the server.js maps.

Preview updates on every drag-end, toggle change, or line break add/remove.

### Reset to Defaults

A "Reset to Defaults" button below the preview restores both builders to their default token order and enabled states, clears the hidden inputs, and refreshes the preview.

### Drag-and-Drop Implementation

Uses the HTML5 Drag and Drop API (no libraries):
- `draggable="true"` on each row
- `dragstart`: store the dragged row reference, add a visual drag class
- `dragover`: determine drop position via mouse Y relative to row centers, show a drop indicator line
- `drop`: move the dragged row to the new position via `insertBefore()`
- `dragend`: clean up visual states, re-serialize, update preview

Rows can only be dragged within their own builder (name rows stay in name, description rows stay in description).

## CSS

New classes follow the existing dashboard conventions:
- `.token-builder` — container for the token list (similar to `.sort-order-builder`)
- `.token-row` — individual token row
- `.token-row.disabled` — dimmed state for toggled-off tokens
- `.token-row.dragging` — visual feedback during drag
- `.token-row.separator` — line break separator row (dashed border)
- `.token-toggle` — CSS-only toggle switch
- `.token-preview` — preview card with cyan accent border

All colors use the existing CSS custom properties (`--accent`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-panel`, `--border-soft`, etc.).

## Files Changed

| File | Action | What |
|------|--------|------|
| `admin/index.html` | Modify | Add "Stream Display" section with token builder HTML, load templateEngine.js |
| `admin/app.js` | Modify | Add drag-and-drop logic, serialization/deserialization, preview rendering, token maps |
| `admin/styles.css` | Modify | Add token builder CSS classes |
| `server.js` | Modify | Add one static route: `/admin/lib` → `src/utils/` (serves templateEngine.js to browser) |

## Testing

- Manual: load admin dashboard, verify builders render with defaults, drag tokens, toggle tokens, add/remove line breaks, verify preview updates, save config, reload and verify state persists
- Manual: set a raw template via env var, load dashboard, verify builder shows "custom template" notice
- Manual: reset to defaults, verify both builders restore to factory state
- `npm test` must still pass (no server.js changes in this task)

## Not In Scope

- Server-side changes (template system is already complete)
- Raw template editing textarea
- Per-token emoji customization
- Mobile touch drag-and-drop (HTML5 DnD works on desktop; mobile users can still toggle tokens)

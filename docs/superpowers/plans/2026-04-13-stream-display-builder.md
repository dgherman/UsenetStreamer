# Stream Display Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual drag-and-drop token builder to the admin dashboard for configuring stream naming patterns without writing template expressions.

**Architecture:** Three edits to the existing admin dashboard files (HTML section, JS logic, CSS classes) plus one one-liner in server.js to serve templateEngine.js to the browser. The JS logic follows the existing `sortOrder` pattern: hidden inputs hold the serialized state, a sync function rebuilds the UI from the hidden value, and event listeners keep everything in sync.

**Tech Stack:** Vanilla HTML5 / JS / CSS, HTML5 Drag and Drop API, existing TemplateEngine (UMD)

---

### Task 1: Serve templateEngine.js to the browser

**Files:**
- Modify: `server.js:323`

- [ ] **Step 1: Add static route for admin/lib**

In `server.js`, after line 323 (`app.use('/assets', express.static(path.join(__dirname, 'assets')));`), add:

```js
app.use('/admin/lib', express.static(path.join(__dirname, 'src', 'utils')));
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — all 60 tests still pass

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: serve src/utils/ as /admin/lib for browser access to templateEngine"
```

---

### Task 2: Add CSS for token builder

**Files:**
- Modify: `admin/styles.css`

- [ ] **Step 1: Add token builder CSS classes**

Append the following at the end of `admin/styles.css` (after the last rule, currently around line 1115):

```css
/* ── Stream Display Token Builder ── */
.token-builder {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px;
  background: rgba(8, 16, 26, 0.8);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(86, 110, 135, 0.28);
  min-height: 48px;
}

.token-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 12px;
  background: var(--bg-panel);
  border-radius: 7px;
  border: 1px solid var(--border-soft);
  cursor: default;
  transition: opacity 150ms ease, background 150ms ease;
}

.token-row.disabled {
  opacity: 0.5;
  background: rgba(18, 30, 45, 0.52);
  border-color: rgba(86, 110, 135, 0.2);
}

.token-row.dragging {
  opacity: 0.4;
}

.token-row.drag-over-above {
  border-top: 2px solid var(--accent);
  padding-top: 7px;
}

.token-row.drag-over-below {
  border-bottom: 2px solid var(--accent);
  padding-bottom: 7px;
}

.token-row .drag-handle {
  color: rgba(180, 200, 220, 0.6);
  cursor: grab;
  font-size: 1rem;
  user-select: none;
  flex-shrink: 0;
}

.token-row .drag-handle:hover {
  color: rgba(180, 200, 220, 0.95);
}

.token-row .token-info {
  flex: 1;
  min-width: 0;
}

.token-row .token-label {
  color: var(--text-primary);
  font-size: 0.85rem;
}

.token-row.disabled .token-label {
  color: var(--text-muted);
}

.token-row .token-hint {
  color: var(--text-muted);
  font-size: 0.68rem;
}

.token-row.disabled .token-hint {
  color: rgba(151, 168, 188, 0.6);
}

.token-toggle {
  position: relative;
  width: 34px;
  height: 18px;
  flex-shrink: 0;
}

.token-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.token-toggle .toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(86, 110, 135, 0.35);
  border-radius: 9px;
  transition: background 150ms ease;
  cursor: pointer;
}

.token-toggle input:checked + .toggle-track {
  background: var(--accent);
}

.token-toggle .toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: rgba(180, 200, 220, 0.5);
  border-radius: 50%;
  transition: transform 150ms ease, background 150ms ease;
}

.token-toggle input:checked ~ .toggle-thumb {
  transform: translateX(16px);
  background: white;
}

.token-row.separator {
  background: transparent;
  border: 1px dashed var(--border-soft);
  padding: 6px 12px;
  justify-content: center;
}

.token-row.separator .separator-label {
  flex: 1;
  text-align: center;
  color: rgba(151, 168, 188, 0.5);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
}

.token-row.separator .separator-remove {
  background: none;
  border: none;
  color: rgba(255, 141, 155, 0.6);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 2px 6px;
  flex-shrink: 0;
}

.token-row.separator .separator-remove:hover {
  color: var(--danger);
}

.token-builder-actions {
  margin-top: 4px;
}

.token-builder-actions button {
  background: none;
  border: 1px dashed rgba(86, 110, 135, 0.4);
  color: var(--text-muted);
  font-size: 0.78rem;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}

.token-builder-actions button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.token-section-label {
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.token-section-label .token-section-subtitle {
  font-weight: 400;
  text-transform: none;
  color: var(--text-muted);
}

.token-preview {
  padding: 16px;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(53, 201, 255, 0.3);
}

.token-preview .preview-sublabel {
  color: var(--text-muted);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.token-preview .preview-name {
  color: var(--accent);
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 14px;
}

.token-preview .preview-description {
  color: var(--text-primary);
  font-size: 0.88rem;
  line-height: 1.7;
}

.token-preview-hint {
  color: rgba(151, 168, 188, 0.5);
  font-size: 0.72rem;
  font-style: italic;
  margin-top: 8px;
}

.token-reset {
  margin-top: 16px;
}

.token-reset button {
  background: none;
  border: 1px solid rgba(255, 141, 155, 0.3);
  color: rgba(255, 141, 155, 0.7);
  font-size: 0.78rem;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}

.token-reset button:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.token-raw-notice {
  padding: 12px 16px;
  background: rgba(255, 209, 102, 0.1);
  border: 1px solid rgba(255, 209, 102, 0.3);
  border-radius: var(--radius-sm);
  color: var(--warning);
  font-size: 0.82rem;
}

.token-raw-notice code {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 0.78rem;
  word-break: break-all;
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/styles.css
git commit -m "feat: add token builder CSS for stream display section"
```

---

### Task 3: Add HTML section to admin dashboard

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: Add templateEngine.js script tag**

In `admin/index.html`, after line 13 (`<link rel="stylesheet" href="styles.css" />`), add:

```html
  <script src="lib/templateEngine.js"></script>
```

- [ ] **Step 2: Add the Stream Display section**

In `admin/index.html`, find line 558 (the closing `</section>` tag after the TMDb section, just before the "Addon Metadata" section at line 559). Insert the following new section between them:

```html
        <section class="group" id="streamDisplayGroup">
          <h3>Stream Display</h3>
          <p class="hint">Customize how streams appear in Stremio. Drag to reorder, toggle to include/exclude. Insert line breaks to control multi-line layout. Changes are reflected in the preview below.</p>

          <div id="streamDisplayRawNotice" class="token-raw-notice hidden">
            Custom template detected — visual builder is disabled.<code id="streamDisplayRawValue"></code>
          </div>

          <div id="streamDisplayBuilders">
            <input type="hidden" name="NZB_DISPLAY_NAME_PATTERN" data-token-name-hidden />
            <input type="hidden" name="NZB_NAMING_PATTERN" data-token-desc-hidden />

            <div class="token-section-label">Stream Name <span class="token-section-subtitle">(bold label in Stremio)</span></div>
            <div class="token-builder" id="tokenBuilderName" data-builder="name"></div>

            <div style="margin-top: 16px;">
              <div class="token-section-label">Stream Description <span class="token-section-subtitle">(multi-line body)</span></div>
              <div class="token-builder" id="tokenBuilderDesc" data-builder="desc"></div>
              <div class="token-builder-actions">
                <button type="button" id="addLineBreak">+ Add Line Break</button>
              </div>
            </div>

            <div style="margin-top: 16px;">
              <div class="token-section-label">Live Preview</div>
              <div class="token-preview">
                <div class="preview-sublabel">Name</div>
                <div class="preview-name" id="previewName"></div>
                <div class="preview-sublabel">Description</div>
                <div class="preview-description" id="previewDesc"></div>
              </div>
              <div class="token-preview-hint">Preview uses sample data. Actual values depend on the release.</div>
            </div>

            <div class="token-reset">
              <button type="button" id="resetTokenBuilders">Reset to Defaults</button>
            </div>
          </div>
        </section>
```

- [ ] **Step 3: Commit**

```bash
git add admin/index.html
git commit -m "feat: add Stream Display section HTML to admin dashboard"
```

---

### Task 4: Add token builder JavaScript logic

**Files:**
- Modify: `admin/app.js`

This is the largest task. The JS goes inside the existing IIFE in `app.js`. All code is appended before the final initialization block (before line 1551, `const pathToken = extractTokenFromPath();`).

- [ ] **Step 1: Add token definitions and state variables**

At the top of the IIFE (after line 47, `let activeSortOrder = [];`), add the DOM references and token definition data:

```js
  const tokenNameHidden = configForm.querySelector('[data-token-name-hidden]');
  const tokenDescHidden = configForm.querySelector('[data-token-desc-hidden]');
  const tokenBuilderName = document.getElementById('tokenBuilderName');
  const tokenBuilderDesc = document.getElementById('tokenBuilderDesc');
  const addLineBreakBtn = document.getElementById('addLineBreak');
  const resetTokenBtn = document.getElementById('resetTokenBuilders');
  const previewNameEl = document.getElementById('previewName');
  const previewDescEl = document.getElementById('previewDesc');
  const streamDisplayBuilders = document.getElementById('streamDisplayBuilders');
  const streamDisplayRawNotice = document.getElementById('streamDisplayRawNotice');
  const streamDisplayRawValue = document.getElementById('streamDisplayRawValue');

  const NAME_TOKEN_DEFS = [
    { key: 'addon', label: 'Addon Name', hint: 'e.g. "UsenetStreamer"' },
    { key: 'health', label: 'Health', hint: 'e.g. "✓ Healthy"' },
    { key: 'instant', label: 'Instant', hint: '⚡ when stream is cached' },
    { key: 'resolution', label: 'Resolution', hint: 'e.g. "2160p"' },
    { key: 'source', label: 'Source', hint: 'e.g. "BluRay"' },
    { key: 'codec', label: 'Codec', hint: 'e.g. "x265"' },
    { key: 'size', label: 'Size', hint: 'e.g. "14.2 GB"' },
    { key: 'indexer', label: 'Indexer', hint: 'e.g. "NZBGeek"' },
    { key: 'languages', label: 'Languages', hint: 'e.g. "English French"' },
    { key: 'group', label: 'Release Group', hint: 'e.g. "FraMeSToR"' },
    { key: 'quality', label: 'Quality', hint: 'e.g. "2160p" (alias for resolution)' },
  ];

  const DESC_TOKEN_DEFS = [
    { key: 'title', label: '\u{1F3AC} Title', hint: 'Parsed release title — e.g. "The Batman 2022"' },
    { key: 'filename', label: '\u{1F4C4} Filename', hint: 'Raw release filename' },
    { key: 'resolution', label: '\u{1F5A5}\uFE0F Resolution', hint: 'e.g. "2160p"' },
    { key: 'source', label: '\u{1F3A5} Source', hint: 'e.g. "BluRay", "WEB-DL"' },
    { key: 'codec', label: '\u{1F39E}\uFE0F Codec', hint: 'e.g. "x265", "H.264"' },
    { key: 'visual', label: '\u{1F4FA} Visual Tags', hint: 'e.g. "HDR DV"' },
    { key: 'audio', label: '\u{1F3A7} Audio', hint: 'e.g. "DTS-HD MA"' },
    { key: 'group', label: '\u{1F465} Release Group', hint: 'e.g. "FraMeSToR"' },
    { key: 'size', label: '\u{1F4E6} Size', hint: 'e.g. "14.2 GB"' },
    { key: 'languages', label: '\u{1F30E} Languages', hint: 'e.g. "English French"' },
    { key: 'indexer', label: '\u{1F50E} Indexer', hint: 'e.g. "NZBGeek"' },
    { key: 'health', label: '\u{1F9EA} Health', hint: 'e.g. "✓ Healthy"' },
    { key: 'instant', label: '\u26A1 Instant', hint: 'Shows when stream is cached' },
    { key: 'files', label: '\u{1F4C1} Files', hint: 'e.g. "12 files"' },
    { key: 'grabs', label: '\u2B07\uFE0F Grabs', hint: 'e.g. "847 grabs"' },
    { key: 'date', label: '\u{1F4C5} Date', hint: 'e.g. "2026-04-10"' },
    { key: 'tags', label: '\u{1F3F7}\uFE0F Tags', hint: 'Combined status/language/size tags' },
  ];

  const DEFAULT_NAME_TOKENS = ['addon', 'health', 'instant', 'resolution'];
  const DEFAULT_DESC_PATTERN = 'title\nresolution,source,codec,visual\nsize,indexer\nhealth';
```

- [ ] **Step 2: Add token map definitions for preview rendering**

Immediately after the previous block, add the token maps (matching the server.js maps):

```js
  const SHORT_TOKEN_MAP = {
    addon: '{addon.name}',
    title: '{stream.title::exists["{stream.title}"||""]}',
    instant: '{stream.instant::istrue["⚡"||""]}',
    health: '{stream.health::exists["{stream.health}"||""]}',
    quality: '{stream.resolution::exists["{stream.resolution}"||""]}',
    resolution: '{stream.resolution::exists["{stream.resolution}"||""]}',
    source: '{stream.source::exists["{stream.source}"||""]}',
    codec: '{stream.encode::exists["{stream.encode}"||""]}',
    group: '{stream.releaseGroup::exists["{stream.releaseGroup}"||""]}',
    size: '{stream.size::>0["{stream.size::bytes}"||""]}',
    languages: '{stream.languages::join(" ")::exists["{stream.languages::join(\\" \\")}"||""]}',
    indexer: '{stream.indexer::exists["{stream.indexer}"||""]}',
    filename: '{stream.filename::exists["{stream.filename}"||""]}',
    tags: '{tags::exists["{tags}"||""]}',
    files: '{stream.files::exists["{stream.files} files"||""]}',
    grabs: '{stream.grabs::exists["{stream.grabs} grabs"||""]}',
    date: '{stream.date::exists["{stream.date}"||""]}',
  };

  const LONG_TOKEN_MAP = {
    title: '{stream.title::exists["\u{1F3AC} {stream.title}"||""]}',
    filename: '{stream.filename::exists["\u{1F4C4} {stream.filename}"||""]}',
    source: '{stream.source::exists["\u{1F3A5} {stream.source}"||""]}',
    codec: '{stream.encode::exists["\u{1F39E}\uFE0F {stream.encode}"||""]}',
    resolution: '{stream.resolution::exists["\u{1F5A5}\uFE0F {stream.resolution}"||""]}',
    visual: '{stream.visualTags::join(" | ")::exists["\u{1F4FA} {stream.visualTags::join(\\" | \\")}"||""]}',
    audio: '{stream.audioTags::join(" ")::exists["\u{1F3A7} {stream.audioTags::join(\\" \\")}"||""]}',
    group: '{stream.releaseGroup::exists["\u{1F465} {stream.releaseGroup}"||""]}',
    size: '{stream.size::>0["\u{1F4E6} {stream.size::bytes}"||""]}',
    languages: '{stream.languages::join(" ")::exists["\u{1F30E} {stream.languages::join(\\" \\")}"||""]}',
    indexer: '{stream.indexer::exists["\u{1F50E} {stream.indexer}"||""]}',
    health: '{stream.health::exists["\u{1F9EA} {stream.health}"||""]}',
    instant: '{stream.instant::istrue["\u26A1 Instant"||""]}',
    files: '{stream.files::exists["\u{1F4C1} {stream.files} files"||""]}',
    grabs: '{stream.grabs::exists["\u2B07\uFE0F {stream.grabs} grabs"||""]}',
    date: '{stream.date::exists["\u{1F4C5} {stream.date}"||""]}',
    quality: '{stream.resolution::exists["\u{1F5A5}\uFE0F {stream.resolution}"||""]}',
    tags: '{tags::exists["\u{1F3F7}\uFE0F {tags}"||""]}',
  };

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
      health: '\u2713 Healthy',
      instant: true,
      files: 1,
      grabs: 847,
      date: '2026-04-10',
      streamQuality: '2160p',
      parsedTitleDisplay: 'The Batman 2022',
      languages: ['English'],
      filename: 'The.Batman.2022.2160p.UHD.BluRay.x265.HDR.DV.DTS-HD.MA.7.1-FraMeSToR.nzb',
    },
    tags: '\u2713 Healthy \u2022 \u26A1 Instant \u2022 14.2 GB',
    title: 'The Batman 2022',
    indexer: 'NZBGeek',
    resolution: '2160p',
    quality: '2160p',
    health: '\u2713 Healthy',
    size: 15032385536,
    source: 'BluRay',
    codec: 'x265',
    group: 'FraMeSToR',
  };
```

- [ ] **Step 3: Add DOM builder and serialization functions**

After the previous block, add the core functions:

```js
  function createTokenRow(tokenKey, label, hint, enabled) {
    const row = document.createElement('div');
    row.className = 'token-row' + (enabled ? '' : ' disabled');
    row.draggable = true;
    row.dataset.tokenKey = tokenKey;
    row.innerHTML =
      '<span class="drag-handle">\u22EE\u22EE</span>' +
      '<div class="token-info">' +
        '<div class="token-label">' + label + '</div>' +
        '<div class="token-hint">' + hint + '</div>' +
      '</div>' +
      '<label class="token-toggle">' +
        '<input type="checkbox"' + (enabled ? ' checked' : '') + ' />' +
        '<span class="toggle-track"></span>' +
        '<span class="toggle-thumb"></span>' +
      '</label>';
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', function () {
      row.classList.toggle('disabled', !this.checked);
      syncTokenBuilders();
    });
    return row;
  }

  function createSeparatorRow() {
    const row = document.createElement('div');
    row.className = 'token-row separator';
    row.draggable = true;
    row.dataset.separator = 'true';
    row.innerHTML =
      '<span class="drag-handle">\u22EE\u22EE</span>' +
      '<span class="separator-label">\u2500\u2500 LINE BREAK \u2500\u2500</span>' +
      '<button type="button" class="separator-remove">\u2715</button>';
    row.querySelector('.separator-remove').addEventListener('click', function () {
      row.remove();
      syncTokenBuilders();
    });
    return row;
  }

  function serializeBuilder(container, tokenMap) {
    const rows = Array.from(container.children);
    const lines = [];
    let currentLine = [];
    for (const row of rows) {
      if (row.dataset.separator) {
        if (currentLine.length > 0) {
          lines.push(currentLine.join(','));
          currentLine = [];
        }
        continue;
      }
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) {
        currentLine.push(row.dataset.tokenKey);
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.join(','));
    }
    return lines.join('\n');
  }

  function buildPatternFromTokens(serialized, tokenMap) {
    if (!serialized) return '';
    const lines = serialized.split('\n');
    const patternLines = lines.map(function (line) {
      var tokens = line.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      return tokens.map(function (t) { return tokenMap[t] || null; }).filter(Boolean).join(' ');
    });
    return patternLines.join('\n');
  }

  function populateBuilder(container, tokenDefs, serialized) {
    container.innerHTML = '';
    var enabledKeys = [];
    var lineBreakPositions = [];

    if (serialized) {
      var lines = serialized.split('\n');
      for (var li = 0; li < lines.length; li++) {
        var tokens = lines[li].split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        enabledKeys = enabledKeys.concat(tokens);
        if (li < lines.length - 1) {
          lineBreakPositions.push(enabledKeys.length);
        }
      }
    }

    var orderedKeys = [];
    var seen = {};
    enabledKeys.forEach(function (k) {
      if (!seen[k] && tokenDefs.some(function (d) { return d.key === k; })) {
        orderedKeys.push(k);
        seen[k] = true;
      }
    });
    tokenDefs.forEach(function (d) {
      if (!seen[d.key]) {
        orderedKeys.push(d.key);
        seen[d.key] = true;
      }
    });

    var inserted = 0;
    orderedKeys.forEach(function (key, idx) {
      var def = tokenDefs.find(function (d) { return d.key === key; });
      if (!def) return;
      var enabled = enabledKeys.indexOf(key) !== -1;
      container.appendChild(createTokenRow(key, def.label, def.hint, enabled));
      inserted++;
      var enabledIdx = enabledKeys.indexOf(key);
      if (enabledIdx !== -1 && lineBreakPositions.indexOf(enabledIdx + 1) !== -1) {
        container.appendChild(createSeparatorRow());
      }
    });
  }

  function syncTokenBuilders() {
    if (!tokenBuilderName || !tokenBuilderDesc) return;

    var nameSerialized = serializeBuilder(tokenBuilderName);
    var descSerialized = serializeBuilder(tokenBuilderDesc);

    if (tokenNameHidden) tokenNameHidden.value = nameSerialized;
    if (tokenDescHidden) tokenDescHidden.value = descSerialized;

    updateTokenPreview(nameSerialized, descSerialized);
  }

  function updateTokenPreview(nameSerialized, descSerialized) {
    if (!previewNameEl || !previewDescEl) return;
    if (typeof window.TemplateEngine === 'undefined') {
      previewNameEl.textContent = nameSerialized || '';
      previewDescEl.textContent = descSerialized || '';
      return;
    }
    var namePattern = buildPatternFromTokens(nameSerialized, SHORT_TOKEN_MAP);
    var descPattern = buildPatternFromTokens(descSerialized, LONG_TOKEN_MAP);

    var nameEngine = new window.TemplateEngine(PREVIEW_DATA);
    var descEngine = new window.TemplateEngine(PREVIEW_DATA);

    previewNameEl.textContent = namePattern ? nameEngine.render(namePattern) : '';
    var descResult = descPattern ? descEngine.render(descPattern) : '';
    previewDescEl.innerHTML = descResult.split('\n').map(function (line) {
      return line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }).join('<br>');
  }

  function applyTokenBuildersFromHidden() {
    if (!tokenBuilderName || !tokenBuilderDesc) return;

    var nameVal = tokenNameHidden ? tokenNameHidden.value : '';
    var descVal = tokenDescHidden ? tokenDescHidden.value : '';

    var isRawName = nameVal.indexOf('{') !== -1;
    var isRawDesc = descVal.indexOf('{') !== -1;

    if (isRawName || isRawDesc) {
      if (streamDisplayBuilders) streamDisplayBuilders.classList.add('hidden');
      if (streamDisplayRawNotice) {
        streamDisplayRawNotice.classList.remove('hidden');
        if (streamDisplayRawValue) {
          streamDisplayRawValue.textContent = isRawName ? nameVal : descVal;
        }
      }
      return;
    }

    if (streamDisplayBuilders) streamDisplayBuilders.classList.remove('hidden');
    if (streamDisplayRawNotice) streamDisplayRawNotice.classList.add('hidden');

    populateBuilder(tokenBuilderName, NAME_TOKEN_DEFS, nameVal || DEFAULT_NAME_TOKENS.join(','));
    populateBuilder(tokenBuilderDesc, DESC_TOKEN_DEFS, descVal || DEFAULT_DESC_PATTERN);

    syncTokenBuilders();
  }

  function resetTokenBuildersToDefaults() {
    if (tokenNameHidden) tokenNameHidden.value = '';
    if (tokenDescHidden) tokenDescHidden.value = '';
    populateBuilder(tokenBuilderName, NAME_TOKEN_DEFS, DEFAULT_NAME_TOKENS.join(','));
    populateBuilder(tokenBuilderDesc, DESC_TOKEN_DEFS, DEFAULT_DESC_PATTERN);
    syncTokenBuilders();
  }
```

- [ ] **Step 4: Add drag-and-drop logic**

After the previous block, add the drag-and-drop handlers:

```js
  function initTokenDragAndDrop(container) {
    var draggedRow = null;

    container.addEventListener('dragstart', function (e) {
      var row = e.target.closest('.token-row');
      if (!row || !container.contains(row)) return;
      draggedRow = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });

    container.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!draggedRow) return;

      var rows = Array.from(container.querySelectorAll('.token-row'));
      rows.forEach(function (r) {
        r.classList.remove('drag-over-above', 'drag-over-below');
      });

      var target = e.target.closest('.token-row');
      if (!target || target === draggedRow || !container.contains(target)) return;

      var rect = target.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        target.classList.add('drag-over-above');
      } else {
        target.classList.add('drag-over-below');
      }
    });

    container.addEventListener('dragleave', function (e) {
      var target = e.target.closest('.token-row');
      if (target) {
        target.classList.remove('drag-over-above', 'drag-over-below');
      }
    });

    container.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!draggedRow) return;

      var rows = Array.from(container.querySelectorAll('.token-row'));
      rows.forEach(function (r) {
        r.classList.remove('drag-over-above', 'drag-over-below');
      });

      var target = e.target.closest('.token-row');
      if (!target || target === draggedRow || !container.contains(target)) return;

      var rect = target.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        container.insertBefore(draggedRow, target);
      } else {
        container.insertBefore(draggedRow, target.nextSibling);
      }

      syncTokenBuilders();
    });

    container.addEventListener('dragend', function () {
      if (draggedRow) {
        draggedRow.classList.remove('dragging');
        draggedRow = null;
      }
      var rows = Array.from(container.querySelectorAll('.token-row'));
      rows.forEach(function (r) {
        r.classList.remove('drag-over-above', 'drag-over-below');
      });
    });
  }
```

- [ ] **Step 5: Add event listeners and initialization call**

Before line 1551 (`const pathToken = extractTokenFromPath();`), add event listeners and the init call:

```js
  if (addLineBreakBtn) {
    addLineBreakBtn.addEventListener('click', function () {
      if (tokenBuilderDesc) {
        tokenBuilderDesc.appendChild(createSeparatorRow());
        syncTokenBuilders();
      }
    });
  }

  if (resetTokenBtn) {
    resetTokenBtn.addEventListener('click', resetTokenBuildersToDefaults);
  }

  if (tokenBuilderName) initTokenDragAndDrop(tokenBuilderName);
  if (tokenBuilderDesc) initTokenDragAndDrop(tokenBuilderDesc);
```

- [ ] **Step 6: Add applyTokenBuildersFromHidden to loadConfiguration**

In `loadConfiguration()` (around line 808, after `applySortOrderFromHidden();`), add:

```js
      applyTokenBuildersFromHidden();
```

- [ ] **Step 7: Verify in browser**

Run the server (`node server.js`), open the admin dashboard, and verify:
1. Stream Display section appears between TMDb and Addon Metadata
2. Name builder shows 4 enabled rows (addon, health, instant, resolution) + remaining disabled
3. Description builder shows default tokens with 3 line break separators
4. Preview shows "UsenetStreamer ✓ Healthy ⚡ 2160p" and the multi-line description
5. Dragging rows reorders them and updates preview
6. Toggling a row on/off updates preview
7. "+ Add Line Break" adds a separator
8. "✕" on separator removes it
9. "Reset to Defaults" restores factory state
10. Save config, reload — state persists

- [ ] **Step 8: Commit**

```bash
git add admin/app.js
git commit -m "feat: add token builder drag-and-drop logic, serialization, and preview rendering"
```

---

### Task 5: Changelog and push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add changelog entry**

In `README.md`, in the `[next]` section, add:

```
- Feature: visual stream display builder in admin dashboard — drag-and-drop token ordering, enable/disable toggles, line break separators, and live preview for stream naming pattern configuration
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: add stream display builder to changelog"
git push myfork upstream-sync-2026-04-12
```

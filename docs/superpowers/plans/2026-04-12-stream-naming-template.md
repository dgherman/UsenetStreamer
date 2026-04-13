# Stream Naming Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the upstream token-based stream naming template system so Stremio stream cards show rich, configurable metadata instead of hardcoded strings.

**Architecture:** Three layers — a self-contained template engine (new file), enriched release metadata parsing (expand existing parser), and template-driven stream rendering in server.js (replace hardcoded strings with configurable patterns).

**Tech Stack:** Node.js, parse-torrent-title, existing Jest test infrastructure

---

### Task 1: Template Engine

**Files:**
- Create: `src/utils/templateEngine.js`
- Test: `tests/utils/templateEngine.test.js`

- [ ] **Step 1: Write tests for the template engine**

Create `tests/utils/templateEngine.test.js`:

```js
'use strict';

const TemplateEngine = require('../../src/utils/templateEngine');

describe('TemplateEngine', () => {
  describe('basic rendering', () => {
    test('resolves simple path', () => {
      const engine = new TemplateEngine({ title: 'Test Movie' });
      expect(engine.render('{title}')).toBe('Test Movie');
    });

    test('resolves nested path', () => {
      const engine = new TemplateEngine({ stream: { title: 'Nested' } });
      expect(engine.render('{stream.title}')).toBe('Nested');
    });

    test('returns empty string for missing path', () => {
      const engine = new TemplateEngine({});
      expect(engine.render('{missing}')).toBe('');
    });

    test('preserves literal text', () => {
      const engine = new TemplateEngine({ name: 'Addon' });
      expect(engine.render('Hello {name}!')).toBe('Hello Addon!');
    });
  });

  describe('modifiers', () => {
    test('::exists with conditional', () => {
      const engine = new TemplateEngine({ stream: { title: 'Movie' } });
      expect(engine.render('{stream.title::exists["yes"||"no"]}')).toBe('yes');
    });

    test('::exists false when empty string', () => {
      const engine = new TemplateEngine({ stream: { title: '' } });
      expect(engine.render('{stream.title::exists["yes"||"no"]}')).toBe('no');
    });

    test('::istrue with boolean true', () => {
      const engine = new TemplateEngine({ stream: { instant: true } });
      expect(engine.render('{stream.instant::istrue["⚡"||""]}')).toBe('⚡');
    });

    test('::istrue with boolean false', () => {
      const engine = new TemplateEngine({ stream: { instant: false } });
      expect(engine.render('{stream.instant::istrue["⚡"||""]}')).toBe('');
    });

    test('::bytes formats number', () => {
      const engine = new TemplateEngine({ stream: { size: 15032385536 } });
      expect(engine.render('{stream.size::bytes}')).toBe('14 GB');
    });

    test('::join joins array', () => {
      const engine = new TemplateEngine({ stream: { languages: ['English', 'French'] } });
      expect(engine.render('{stream.languages::join(", ")}')).toBe('English, French');
    });

    test('::>0 comparison', () => {
      const engine = new TemplateEngine({ stream: { size: 1000 } });
      expect(engine.render('{stream.size::>0["has size"||"no size"]}')).toBe('has size');
    });

    test('::>0 with zero', () => {
      const engine = new TemplateEngine({ stream: { size: 0 } });
      expect(engine.render('{stream.size::>0["has size"||"no size"]}')).toBe('no size');
    });

    test('::lower converts to lowercase', () => {
      const engine = new TemplateEngine({ name: 'HELLO' });
      expect(engine.render('{name::lower}')).toBe('hello');
    });

    test('::upper converts to uppercase', () => {
      const engine = new TemplateEngine({ name: 'hello' });
      expect(engine.render('{name::upper}')).toBe('HELLO');
    });
  });

  describe('empty line cleanup', () => {
    test('strips blank lines from output', () => {
      const engine = new TemplateEngine({ a: 'line1', b: '', c: 'line3' });
      const pattern = '{a}\n{b}\n{c}';
      expect(engine.render(pattern)).toBe('line1\nline3');
    });
  });

  describe('chained modifiers', () => {
    test('join then exists', () => {
      const engine = new TemplateEngine({ stream: { visualTags: ['HDR', 'DV'] } });
      expect(engine.render('{stream.visualTags::join(" ")::exists["vis: {stream.visualTags::join(\" \")}"||""]}')).toBe('vis: HDR DV');
    });

    test('join then exists with empty array', () => {
      const engine = new TemplateEngine({ stream: { visualTags: [] } });
      expect(engine.render('{stream.visualTags::join(" ")::exists["vis"||"none"]}')).toBe('none');
    });
  });

  describe('complex patterns', () => {
    test('renders full stream card pattern', () => {
      const ctx = {
        addon: { name: 'UsenetStreamer' },
        stream: {
          title: 'The Batman (2022)',
          resolution: '2160p',
          source: 'BluRay',
          encode: 'x265',
          visualTags: ['HDR', 'DV'],
          size: 15032385536,
          indexer: 'NZBGeek',
          health: '✓ Healthy',
          instant: false,
        },
      };
      const engine = new TemplateEngine(ctx);
      const namePattern = '{addon.name} {stream.health::exists["{stream.health} "||""]}{stream.instant::istrue["⚡ "||""]}{stream.resolution::exists["{stream.resolution}"||""]}';
      expect(engine.render(namePattern)).toBe('UsenetStreamer ✓ Healthy 2160p');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/utils/templateEngine.test.js --no-coverage`
Expected: FAIL — `Cannot find module '../../src/utils/templateEngine'`

- [ ] **Step 3: Create the template engine**

Create `src/utils/templateEngine.js`:

```js
(function (window) {

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatDuration(ms) {
        if (!ms || ms <= 0) return '';
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)));

        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m ${seconds}s`;
    }

    function titleCase(str) {
        if (!str) return '';
        return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    class TemplateEngine {
        constructor(context) {
            this.context = context;
        }

        get(path) {
            if (!path) return undefined;
            return path.split('.').reduce((acc, part) => acc && acc[part], this.context);
        }

        evaluateModifier(value, modifier) {
            const parts = modifier.match(/([a-zA-Z0-9]+)(?:\((.*)\))?/);
            if (!parts) return value;

            const name = parts[1].toLowerCase();
            const argsStr = parts[2];
            let args = [];

            if (argsStr) {
                const argRegex = /'([^']*)'|"([^"]*)"|([^,]+)/g;
                let match;
                while ((match = argRegex.exec(argsStr)) !== null) {
                    if (match[1] !== undefined) args.push(match[1]);
                    else if (match[2] !== undefined) args.push(match[2]);
                    else if (match[3] !== undefined) args.push(match[3].trim());
                }
            }

            switch (name) {
                case 'istrue': return !!value;
                case 'isfalse': return !value;
                case 'exists': return value !== undefined && value !== null && value !== '';
                case 'length': return Array.isArray(value) ? value.length : String(value || '').length;
                case 'lower': return String(value || '').toLowerCase();
                case 'upper': return String(value || '').toUpperCase();
                case 'title': return titleCase(String(value || ''));
                case 'bytes': return formatBytes(Number(value) || 0);
                case 'time': return formatDuration(Number(value) || 0);
                case 'join': return Array.isArray(value) ? value.join(args[0] || ', ') : value;
                case 'replace': {
                    const search = args[0];
                    const replace = args[1] || '';
                    return String(value || '').split(search).join(replace);
                }
                case 'and': return value;
                default:
                    if (name.startsWith('>')) {
                        const threshold = parseFloat(name.substring(1));
                        return Number(value) > threshold;
                    }
                    if (name.startsWith('<')) {
                        const threshold = parseFloat(name.substring(1));
                        return Number(value) < threshold;
                    }
                    if (name.startsWith('=')) {
                        const threshold = parseFloat(name.substring(1));
                        return Number(value) === threshold;
                    }
                    return value;
            }
        }

        processBlock(blockContent) {
            const blockRegex = /^(.*?)(?:\[(.*)\])?$/s;
            const match = blockContent.match(blockRegex);
            if (!match) return '';

            const expression = match[1];
            const conditional = match[2];

            const parts = expression.split('::');

            let value = this.get(parts[0]);
            let accumulator = null;

            for (let i = 1; i < parts.length; i++) {
                const mod = parts[i];

                if (mod === 'and') {
                    const currentBool = !!value;
                    if (accumulator === null) accumulator = currentBool;
                    else accumulator = accumulator && currentBool;

                    if (i + 1 < parts.length) {
                        i++;
                        const nextKey = parts[i];
                        value = this.get(nextKey);
                    }
                    continue;
                }

                value = this.evaluateModifier(value, mod);
            }

            if (accumulator !== null) {
                value = accumulator && !!value;
            }

            if (conditional !== undefined) {
                const delim = '||';
                const condParts = conditional.split(delim);

                const stripQuotes = (s) => {
                    s = s.trim();
                    let params = s;
                    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                        params = s.substring(1, s.length - 1);
                    }
                    return params.replace(/\\n/g, '\n');
                };

                const trueVal = stripQuotes(condParts[0] || '');
                const falseVal = stripQuotes(condParts.slice(1).join(delim) || '');

                return value ? trueVal : falseVal;
            }

            return value !== undefined && value !== null ? String(value) : '';
        }

        render(template) {
            let result = template;
            const maxIterations = 50;
            let iteration = 0;

            while (result.match(/\{[^{}]+\}/) && iteration < maxIterations) {
                result = result.replace(/\{([^{}]+)\}/g, (match, content) => {
                    return this.processBlock(content);
                });
                iteration++;
            }

            return result.split('\n')
                .filter(line => line.trim() !== '')
                .join('\n');
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TemplateEngine;
    } else {
        window.TemplateEngine = TemplateEngine;
    }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/utils/templateEngine.test.js --no-coverage`
Expected: PASS — all 16 tests green

- [ ] **Step 5: Commit**

```bash
git add src/utils/templateEngine.js tests/utils/templateEngine.test.js
git commit -m "feat: add template engine for configurable stream naming (port from upstream)"
```

---

### Task 2: Add formatStreamTitle to helpers.js

**Files:**
- Modify: `src/utils/helpers.js`

- [ ] **Step 1: Add TemplateEngine import and formatStreamTitle function**

At the top of `src/utils/helpers.js`, after the existing require for `releaseParser`, add:

```js
const TemplateEngine = require('./templateEngine');
```

Before `module.exports`, add:

```js
function formatStreamTitle(pattern, data, defaultPattern = '{title}') {
  let effectivePattern = (pattern && typeof pattern === 'string' && pattern.trim().length > 0)
    ? pattern
    : defaultPattern;

  const engine = new TemplateEngine(data);
  return engine.render(effectivePattern);
}
```

Add `formatStreamTitle` to the `module.exports` object.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — all existing tests still pass, plus the new templateEngine tests

- [ ] **Step 3: Commit**

```bash
git add src/utils/helpers.js
git commit -m "feat: add formatStreamTitle wrapper in helpers.js"
```

---

### Task 3: Enrich parseReleaseMetadata

**Files:**
- Modify: `src/services/metadata/releaseParser.js`
- Test: `tests/services/metadata/releaseParser.test.js`

- [ ] **Step 1: Write tests for the enriched parseReleaseMetadata**

Create `tests/services/metadata/releaseParser.test.js`:

```js
'use strict';

const { parseReleaseMetadata } = require('../../../src/services/metadata/releaseParser');

describe('parseReleaseMetadata', () => {
  test('extracts source, codec, group from typical release title', () => {
    const result = parseReleaseMetadata('The.Batman.2022.2160p.UHD.BluRay.x265.HDR.DTS-HD.MA.7.1-GROUP');
    expect(result.resolution).toBe('2160p');
    expect(result.source).toBeTruthy();
    expect(result.codec).toBe('x265');
    expect(result.group).toBe('GROUP');
  });

  test('extracts parsedTitle and parsedTitleDisplay', () => {
    const result = parseReleaseMetadata('The.Batman.2022.1080p.BluRay.x264-GROUP');
    expect(result.parsedTitle).toBe('The Batman');
    expect(result.parsedTitleDisplay).toBe('The Batman 2022');
    expect(result.year).toBe(2022);
  });

  test('parsedTitleDisplay includes season and episode', () => {
    const result = parseReleaseMetadata('Severance.S02E04.1080p.WEB.H264-GROUP');
    expect(result.parsedTitle).toBe('Severance');
    expect(result.parsedTitleDisplay).toMatch(/Severance S02E04/);
    expect(result.season).toBe(2);
    expect(result.episode).toBe(4);
  });

  test('returns audioList as array', () => {
    const result = parseReleaseMetadata('Movie.2024.2160p.BluRay.x265.DTS-HD.MA.7.1-GROUP');
    expect(Array.isArray(result.audioList)).toBe(true);
  });

  test('returns hdrList as array', () => {
    const result = parseReleaseMetadata('Movie.2024.2160p.UHD.BluRay.HDR10.DV-GROUP');
    expect(Array.isArray(result.hdrList)).toBe(true);
  });

  test('returns visualTags from QUALITY_FEATURE_PATTERNS', () => {
    const result = parseReleaseMetadata('Movie.2024.2160p.BluRay.HDR.DV-GROUP');
    expect(Array.isArray(result.visualTags)).toBe(true);
    expect(result.visualTags).toContain('HDR');
    expect(result.visualTags).toContain('DV');
  });

  test('returns empty visualTags when no quality features', () => {
    const result = parseReleaseMetadata('Movie.2024.1080p.BluRay.x264-GROUP');
    expect(result.visualTags).toEqual([]);
  });

  test('strips Usenet upload suffixes before parsing group', () => {
    const result = parseReleaseMetadata('Movie.2024.1080p.BluRay.x264-GROUP-Obfuscated');
    // Should not have 'GROUP-Obfuscated' as group; 'Obfuscated' stripped
    expect(result.group).not.toMatch(/obfuscated/i);
  });

  test('handles empty string gracefully', () => {
    const result = parseReleaseMetadata('');
    expect(result.resolution).toBeNull();
    expect(result.parsedTitle).toBeNull();
    expect(result.source).toBeNull();
    expect(result.codec).toBeNull();
    expect(result.group).toBeNull();
    expect(result.audioList).toEqual([]);
    expect(result.hdrList).toEqual([]);
    expect(result.visualTags).toEqual([]);
    expect(result.languages).toEqual([]);
  });

  test('preserves backward-compatible fields', () => {
    const result = parseReleaseMetadata('Movie.2024.1080p.BluRay.x264-GROUP');
    expect(result).toHaveProperty('resolution');
    expect(result).toHaveProperty('languages');
    expect(result).toHaveProperty('qualityLabel');
    expect(result).toHaveProperty('qualityScore');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/services/metadata/releaseParser.test.js --no-coverage`
Expected: FAIL — `parsedTitle` etc. not in result

- [ ] **Step 3: Expand parseReleaseMetadata and add QUALITY_FEATURE_PATTERNS**

In `src/services/metadata/releaseParser.js`, add `QUALITY_FEATURE_PATTERNS` after the `QUALITY_SCORE_MAP` block (around line 147):

```js
const QUALITY_FEATURE_PATTERNS = [
  { label: 'DV', regex: /\b(dolby\s*vision|dolbyvision|dv)\b/i },
  { label: 'HDR10+', regex: /hdr10\+/i },
  { label: 'HDR10', regex: /hdr10(?!\+)/i },
  { label: 'HDR', regex: /\bhdr\b/i },
  { label: 'SDR', regex: /\bsdr\b/i },
];
```

Replace the `parseReleaseMetadata` function (lines 214–237) with:

```js
function parseReleaseMetadata(title) {
  const rawTitle = typeof title === 'string' ? title : '';
  const parsed = (() => {
    try {
      // Strip Usenet upload-source suffixes before parsing, so they
      // aren't misidentified as release group names.
      const cleaned = rawTitle.replace(/[- ](FTP|Obfuscated|AsRequested|Scrambled|Repost)(?=\.\w{2,4}$|$)/i, '');
      return parseTorrentTitle(cleaned) || {};
    } catch (error) {
      return {};
    }
  })();
  const resolution = detectResolution(rawTitle, parsed);
  const languages = detectLanguages(rawTitle);
  const qualityLabel = parsed.quality || parsed.source || parsed.codec || null;
  const qualityScore = QUALITY_SCORE_MAP[resolution] || 0;

  const parsedTitle = parsed.title || null;
  const parsedYear = parsed.year ? parseInt(parsed.year, 10) || null : null;
  const parsedSeason = Array.isArray(parsed.seasons) ? parsed.seasons[0] || null : null;
  const parsedEpisode = Array.isArray(parsed.episodes) ? parsed.episodes[0] || null : null;
  let parsedTitleDisplay = parsedTitle;
  if (parsedTitle) {
    if (Number.isFinite(parsedSeason) && Number.isFinite(parsedEpisode)) {
      parsedTitleDisplay = `${parsedTitle} S${String(parsedSeason).padStart(2, '0')}E${String(parsedEpisode).padStart(2, '0')}`;
    } else if (Number.isFinite(parsedYear)) {
      parsedTitleDisplay = `${parsedTitle} ${parsedYear}`;
    }
  }

  return {
    parsedTitle,
    parsedTitleDisplay,
    resolution,
    languages,
    qualityLabel,
    qualityScore,
    codec: parsed.codec || null,
    source: parsed.source || null,
    group: parsed.group || null,
    season: parsedSeason,
    episode: parsedEpisode,
    year: parsedYear,
    container: parsed.container || null,
    audio: Array.isArray(parsed.audio) ? parsed.audio[0] : (parsed.audio || null),
    audioList: Array.isArray(parsed.audio) ? parsed.audio : (parsed.audio ? [parsed.audio] : []),
    hdr: Array.isArray(parsed.hdr) && parsed.hdr.length > 0,
    hdrList: Array.isArray(parsed.hdr) ? parsed.hdr : [],
    visualTags: QUALITY_FEATURE_PATTERNS
      .filter(({ regex }) => regex.test(rawTitle))
      .map(({ label }) => label),
  };
}
```

Update `module.exports` to also export `QUALITY_FEATURE_PATTERNS`:

```js
module.exports = {
  LANGUAGE_FILTERS,
  LANGUAGE_SYNONYMS,
  QUALITY_FEATURE_PATTERNS,
  parseReleaseMetadata,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/services/metadata/releaseParser.test.js --no-coverage`
Expected: PASS — all 10 tests green

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/services/metadata/releaseParser.js tests/services/metadata/releaseParser.test.js
git commit -m "feat: enrich parseReleaseMetadata with source, codec, group, audio, HDR, visualTags"
```

---

### Task 4: Wire template system into server.js

**Files:**
- Modify: `server.js`

This task has many small edits across server.js. Each step is one edit.

- [ ] **Step 1: Add formatStreamTitle to the helpers import**

In `server.js` line 47, add `formatStreamTitle` to the destructured require from `./src/utils/helpers`:

Change:
```js
const { sleep, annotateNzbResult, applyMaxSizeFilter, prepareSortedResults, getPreferredLanguageMatch, getPreferredLanguageMatches, triageStatusRank, buildTriageTitleMap, prioritizeTriageCandidates, triageDecisionsMatchStatuses, sanitizeDecisionForCache, serializeFinalNzbResults, restoreFinalNzbResults, safeStat, selectBestRepairCandidate } = require('./src/utils/helpers');
```

To:
```js
const { sleep, annotateNzbResult, applyMaxSizeFilter, prepareSortedResults, getPreferredLanguageMatch, getPreferredLanguageMatches, triageStatusRank, buildTriageTitleMap, prioritizeTriageCandidates, triageDecisionsMatchStatuses, sanitizeDecisionForCache, serializeFinalNzbResults, restoreFinalNzbResults, safeStat, selectBestRepairCandidate, formatStreamTitle } = require('./src/utils/helpers');
```

- [ ] **Step 2: Add NZB_NAMING_PATTERN and NZB_DISPLAY_NAME_PATTERN env var declarations**

After the `INDEXER_DEDUP_ENABLED` declaration (line ~1035), add:

```js
let NZB_NAMING_PATTERN = process.env.NZB_NAMING_PATTERN || '';
let NZB_DISPLAY_NAME_PATTERN = process.env.NZB_DISPLAY_NAME_PATTERN || '';
```

- [ ] **Step 3: Add env vars to rebuildRuntimeConfig**

In `rebuildRuntimeConfig()`, after the `INDEXER_DEDUP_ENABLED` assignment (line ~1201), add:

```js
  NZB_NAMING_PATTERN = process.env.NZB_NAMING_PATTERN || '';
  NZB_DISPLAY_NAME_PATTERN = process.env.NZB_DISPLAY_NAME_PATTERN || '';
```

- [ ] **Step 4: Add env vars to admin config key list**

In the `ADMIN_CONFIG_KEYS` array, after `'NZB_DEDUP_ENABLED'` (line ~1291), add:

```js
  'NZB_NAMING_PATTERN',
  'NZB_DISPLAY_NAME_PATTERN',
```

- [ ] **Step 5: Replace hardcoded stream name and title/description with template rendering**

In the stream-building section of `streamHandler` (around line 3650-3740), replace the existing name construction and stream object building.

Find the block that starts with:
```js
        const addonLabel = ADDON_NAME || DEFAULT_ADDON_NAME;
        const name = qualitySummary ? `${addonLabel} ${qualitySummary}` : addonLabel;
```

Replace it and everything through the stream object construction (both native and NZBDav modes) with the template-based version. The full replacement:

After `if (sizeString) tags.push(sizeString);`, replace from `const addonLabel` through the stream object assignment. The new code:

```js
        const addonLabel = ADDON_NAME || DEFAULT_ADDON_NAME;
        const tagsString = tags.filter(Boolean).join(' • ');

        const namingContext = {
          addon: { name: addonLabel },
          stream: {
            title: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
            filename: result.title || '',
            resolution: detectedResolutionToken || '',
            source: result.source || '',
            encode: result.codec || '',
            visualTags: result.visualTags || result.hdrList || [],
            audioTags: result.audioList || [],
            releaseGroup: result.group || '',
            size: result.size || 0,
            indexer: result.indexer || '',
            languages: releaseLanguages.length > 0 ? releaseLanguages : (sourceLanguage ? [sourceLanguage] : []),
            health: triageTag || '',
            instant: isInstant,
            cached: isInstant,
            files: Number.isFinite(result.files) ? result.files : null,
            grabs: Number.isFinite(result.grabs) ? result.grabs : null,
            date: result.publishDateMs ? new Date(result.publishDateMs).toISOString().slice(0, 10) : null,
            usenetGroup: result.group || null,
            streamQuality: quality || '',
            parsedTitleDisplay: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
          },
          service: { shortName: 'Usenet', cached: isInstant, instant: isInstant },
          tags: tagsString,
          title: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
          indexer: result.indexer || '',
          resolution: detectedResolutionToken || '',
          quality: quality || '',
          health: triageTag || '',
          size: result.size || 0,
          source: result.source || '',
          codec: result.codec || '',
          group: result.group || '',
        };

        const buildPatternFromTokenList = (rawPattern, variant, defaultPattern) => {
          if (rawPattern && typeof rawPattern === 'string' && rawPattern.includes('{')) {
            return rawPattern;
          }
          const hasLineBreaks = /[\r\n]/.test(String(rawPattern || ''));
          const normalizedList = String(rawPattern || '')
            .replace(/\band\b/gi, ',')
            .replace(/[;|]/g, ',');
          const tokens = normalizedList
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean);
          if (!hasLineBreaks && tokens.length === 0) return defaultPattern;

          const shortTokenMap = {
            addon: '{addon.name}',
            title: '{stream.title::exists["{stream.title}"||""]}',
            instant: '{stream.instant::istrue["⚡"||""]}',
            health: '{stream.health::exists["{stream.health}"||""]}',
            quality: '{stream.resolution::exists["{stream.resolution}"||""]}',
            resolution_quality: '{stream.resolution::exists["{stream.resolution}"||""]}',
            stream_quality: '{stream.streamQuality::exists["{stream.streamQuality}"||""]}',
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

          const longTokenMap = {
            title: '{stream.title::exists["🎬 {stream.title}"||""]}',
            filename: '{stream.filename::exists["📄 {stream.filename}"||""]}',
            source: '{stream.source::exists["🎥 {stream.source}"||""]}',
            codec: '{stream.encode::exists["🎞️ {stream.encode}"||""]}',
            resolution: '{stream.resolution::exists["🖥️ {stream.resolution}"||""]}',
            visual: '{stream.visualTags::join(" | ")::exists["📺 {stream.visualTags::join(\\" | \\")}"||""]}',
            audio: '{stream.audioTags::join(" ")::exists["🎧 {stream.audioTags::join(\\" \\")}"||""]}',
            group: '{stream.releaseGroup::exists["👥 {stream.releaseGroup}"||""]}',
            size: '{stream.size::>0["📦 {stream.size::bytes}"||""]}',
            languages: '{stream.languages::join(" ")::exists["🌎 {stream.languages::join(\\" \\")}"||""]}',
            indexer: '{stream.indexer::exists["🔎 {stream.indexer}"||""]}',
            health: '{stream.health::exists["🧪 {stream.health}"||""]}',
            instant: '{stream.instant::istrue["⚡ Instant"||""]}',
            files: '{stream.files::exists["📁 {stream.files} files"||""]}',
            grabs: '{stream.grabs::exists["⬇️ {stream.grabs} grabs"||""]}',
            date: '{stream.date::exists["📅 {stream.date}"||""]}',
            quality: '{stream.resolution::exists["🖥️ {stream.resolution}"||""]}',
            resolution_quality: '{stream.resolution::exists["🖥️ {stream.resolution}"||""]}',
            stream_quality: '{stream.streamQuality::exists["✨ {stream.streamQuality}"||""]}',
            tags: '{tags::exists["🏷️ {tags}"||""]}',
          };

          const tokenMap = variant === 'long' ? longTokenMap : shortTokenMap;

          if (hasLineBreaks) {
            const lines = String(rawPattern || '').split(/\r?\n/);
            const lineParts = lines.map((line) => {
              const normalizedLine = String(line || '')
                .replace(/\band\b/gi, ',')
                .replace(/[;|]/g, ',');
              const lineTokens = normalizedLine
                .split(',')
                .map((token) => token.trim())
                .filter(Boolean);
              return lineTokens
                .map((token) => tokenMap[token.toLowerCase()] || null)
                .filter(Boolean)
                .join(' ');
            });
            const separator = variant === 'long' ? '\n' : ' ';
            const joined = lineParts.join(separator);
            if (joined.replace(/\s/g, '') === '') return defaultPattern;
            return joined;
          }

          const parts = tokens
            .map((token) => tokenMap[token.toLowerCase()] || null)
            .filter(Boolean);

          if (parts.length === 0) return defaultPattern;
          return parts.join(' ');
        };

        const effectiveDefaultDescriptionPattern = '{stream.parsedTitleDisplay::exists["{stream.parsedTitleDisplay}\\n"||""]}{stream.resolution::exists["🖥️ {stream.resolution}"||""]}{stream.source::exists[" {stream.source}"||""]}{stream.encode::exists[" {stream.encode}"||""]}{stream.visualTags::join(" ")::exists[" | {stream.visualTags::join(\\" \\")}"||""]}\\n{stream.size::>0["📦 {stream.size::bytes}"||""]}{stream.indexer::exists[" | 🔎 {stream.indexer}"||""]}\\n{stream.health::exists["🧪 {stream.health}"||""]}';
        const effectiveDescriptionPattern = buildPatternFromTokenList(NZB_NAMING_PATTERN, 'long', effectiveDefaultDescriptionPattern);
        const formattedTitle = formatStreamTitle(effectiveDescriptionPattern, namingContext, effectiveDefaultDescriptionPattern);

        const effectiveDefaultNamePattern = '{addon.name} {stream.health::exists["{stream.health} "||""]}{stream.instant::istrue["⚡ "||""]}{stream.resolution::exists["{stream.resolution}"||""]}';
        const effectiveNamePattern = buildPatternFromTokenList(NZB_DISPLAY_NAME_PATTERN, 'short', effectiveDefaultNamePattern);
        const formattedName = formatStreamTitle(effectiveNamePattern, namingContext, effectiveDefaultNamePattern);
```

- [ ] **Step 6: Update the native mode stream object**

Find the native mode stream construction:
```js
          stream = {
            name,
            description: `${result.title}\n${result.indexer} • ${sizeString}\n${tags.filter(Boolean).join(' • ')}`,
```

Replace with:
```js
          stream = {
            name: formattedName,
            description: formattedTitle,
```

- [ ] **Step 7: Update the NZBDav mode stream object**

Find the NZBDav mode stream construction:
```js
          stream = {
            title: `${result.title}\n${tags.filter(Boolean).join(' • ')}\n${result.indexer}`,
            name,
```

Replace with:
```js
          stream = {
            title: formattedTitle,
            name: formattedName,
```

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 9: Commit**

```bash
git add server.js
git commit -m "feat: configurable stream naming via NZB_NAMING_PATTERN and NZB_DISPLAY_NAME_PATTERN"
```

---

### Task 5: Remove duplicate QUALITY_FEATURE_PATTERNS from server.js

**Files:**
- Modify: `server.js`

Now that `QUALITY_FEATURE_PATTERNS` lives in `releaseParser.js` and the fields are available on annotated results, clean up the duplication.

- [ ] **Step 1: Import QUALITY_FEATURE_PATTERNS from releaseParser and remove the inline copy**

In `server.js`, find the import for `releaseParser` (or add one). The fork currently imports from `./src/services/metadata/releaseParser` indirectly via helpers. Since `extractQualityFeatureBadges` in server.js still uses the local `QUALITY_FEATURE_PATTERNS`, update it to import from the parser.

At the top of `server.js`, add to the existing imports area:

```js
const { QUALITY_FEATURE_PATTERNS } = require('./src/services/metadata/releaseParser');
```

Then delete the inline `QUALITY_FEATURE_PATTERNS` array (lines 66–72):

```js
const QUALITY_FEATURE_PATTERNS = [
  { label: 'DV', regex: /\b(dolby\s*vision|dolbyvision|dv)\b/i },
  { label: 'HDR10+', regex: /hdr10\+/i },
  { label: 'HDR10', regex: /hdr10(?!\+)/i },
  { label: 'HDR', regex: /\bhdr\b/i },
  { label: 'SDR', regex: /\bsdr\b/i },
];
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — all tests green (extractQualityFeatureBadges still works via the imported constant)

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "refactor: import QUALITY_FEATURE_PATTERNS from releaseParser, remove server.js duplicate"
```

---

### Task 6: Update changelog and push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add changelog entry**

In `README.md`, in the `[next]` section, add:

```
- Feature: configurable stream naming template system — rich multi-line Stremio stream cards with resolution, source, codec, visual tags, size, indexer, and health status; customizable via NZB_NAMING_PATTERN and NZB_DISPLAY_NAME_PATTERN env vars
```

- [ ] **Step 2: Run full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: add stream naming template to changelog"
git push myfork upstream-sync-2026-04-12
```

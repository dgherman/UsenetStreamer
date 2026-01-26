/**
 * Configurable blocklist module
 *
 * Supports patterns in these formats:
 * - Simple substring match: "remux" (matches anywhere, case-insensitive)
 * - Regex pattern: /\.iso$/i (matches regex, flags supported)
 * - Word boundary match: [xxx] (matches as word boundary, case-insensitive)
 *
 * Special categories tracked for stats:
 * - 'iso': matches iso, img, bin, cue, exe file types
 * - 'remux': matches remux releases
 * - 'adult': matches adult content markers
 */

// Default patterns matching the original hardcoded behavior
const DEFAULT_PATTERNS = [
  // Release types (standalone tokens): iso, img, bin, cue, exe
  '/(?:^|[\\s.\\-_(\\[])(?:iso|img|bin|cue|exe)(?:[\\s.\\-_\\)\\]]|$)/i',
  // Remux releases (matches anywhere)
  'remux',
  // Adult content markers (word boundaries)
  '[xxx]',
  '[porn]',
  '[wtf-porn]',
  '[xvideos]',
  '[pornhub]',
  '[brazzers]',
  '[bangbros]',
  '[realitykings]',
  '[naughtyamerica]',
  '[blowjob]',
  '[gangbang]',
  '[creampie]',
  '[milf]',
  '[stepmom]',
  '[stepsister]',
  '[onlyfans]',
];

// Patterns that map to stat categories
const ISO_KEYWORDS = ['iso', 'img', 'bin', 'cue', 'exe'];
const REMUX_KEYWORDS = ['remux'];
const ADULT_KEYWORDS = [
  'xxx', 'porn', 'wtf-porn', 'xvideos', 'pornhub', 'brazzers', 'bangbros',
  'realitykings', 'naughtyamerica', 'blowjob', 'gangbang', 'creampie',
  'milf', 'stepmom', 'stepsister', 'onlyfans',
];

/**
 * Parse a single pattern string into a matcher object
 * @param {string} pattern - Pattern string
 * @returns {{ regex: RegExp, source: string, category: string } | null}
 */
function parsePattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return null;
  const trimmed = pattern.trim();
  if (!trimmed) return null;

  let regex;
  let category = 'other';

  // Detect category from pattern content
  const lowerPattern = trimmed.toLowerCase();
  if (ISO_KEYWORDS.some((k) => lowerPattern.includes(k))) {
    category = 'iso';
  } else if (REMUX_KEYWORDS.some((k) => lowerPattern.includes(k))) {
    category = 'remux';
  } else if (ADULT_KEYWORDS.some((k) => lowerPattern.includes(k))) {
    category = 'adult';
  }

  // Regex pattern: /pattern/flags
  const regexMatch = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    try {
      regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
      return { regex, source: trimmed, category };
    } catch (e) {
      console.warn(`[BLOCKLIST] Invalid regex pattern: ${trimmed}`, e.message);
      return null;
    }
  }

  // Word boundary pattern: [word]
  const wordMatch = trimmed.match(/^\[(.+)\]$/);
  if (wordMatch) {
    const word = wordMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(`\\b${word}\\b`, 'i');
    return { regex, source: trimmed, category };
  }

  // Simple substring match (case-insensitive)
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  regex = new RegExp(escaped, 'i');
  return { regex, source: trimmed, category };
}

/**
 * Parse comma-separated patterns string
 * @param {string} patternsString - Comma-separated patterns
 * @returns {Array<{ regex: RegExp, source: string, category: string }>}
 */
function parsePatterns(patternsString) {
  if (!patternsString || typeof patternsString !== 'string') {
    return [];
  }

  // Handle special case: empty string means disabled
  const trimmed = patternsString.trim();
  if (trimmed === '') {
    return [];
  }

  // Split by comma, parse each pattern
  return trimmed
    .split(',')
    .map((p) => parsePattern(p))
    .filter(Boolean);
}

/**
 * Get default patterns string
 * @returns {string}
 */
function getDefaultPatternsString() {
  return DEFAULT_PATTERNS.join(',');
}

/**
 * Create a blocklist checker from patterns
 * @param {Array<{ regex: RegExp, source: string, category: string }>} patterns - Parsed patterns
 * @returns {{ isBlocked: (title: string) => { blocked: boolean, category: string | null, pattern: string | null } }}
 */
function createBlocklistChecker(patterns) {
  if (!patterns || patterns.length === 0) {
    return {
      isBlocked: () => ({ blocked: false, category: null, pattern: null }),
      patterns: [],
      enabled: false,
    };
  }

  return {
    /**
     * Check if a title is blocked
     * @param {string} title - Release title to check
     * @returns {{ blocked: boolean, category: string | null, pattern: string | null }}
     */
    isBlocked(title) {
      if (!title || typeof title !== 'string') {
        return { blocked: false, category: null, pattern: null };
      }

      for (const { regex, source, category } of patterns) {
        if (regex.test(title)) {
          return { blocked: true, category, pattern: source };
        }
      }

      return { blocked: false, category: null, pattern: null };
    },
    patterns,
    enabled: true,
  };
}

/**
 * Build a blocklist checker from environment variable or default
 * @param {string} [envValue] - Value of NZB_BLOCKLIST_PATTERNS env var
 * @returns {{ isBlocked: (title: string) => { blocked: boolean, category: string | null, pattern: string | null }, patterns: Array, enabled: boolean }}
 */
function buildBlocklistFromEnv(envValue) {
  // If explicitly set to empty string, disable blocklist
  if (envValue === '') {
    console.log('[BLOCKLIST] Blocklist disabled (empty pattern string)');
    return createBlocklistChecker([]);
  }

  // If not set or undefined, use defaults
  const patternsString = envValue !== undefined && envValue !== null
    ? envValue
    : getDefaultPatternsString();

  const patterns = parsePatterns(patternsString);

  if (patterns.length === 0) {
    console.log('[BLOCKLIST] No valid patterns found, blocklist disabled');
    return createBlocklistChecker([]);
  }

  console.log(`[BLOCKLIST] Loaded ${patterns.length} patterns:`, patterns.map((p) => p.source));
  return createBlocklistChecker(patterns);
}

module.exports = {
  parsePattern,
  parsePatterns,
  getDefaultPatternsString,
  createBlocklistChecker,
  buildBlocklistFromEnv,
  DEFAULT_PATTERNS,
};

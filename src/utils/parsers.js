// Parsing utilities for releases, episodes, and titles
const path = require('path');
const { VIDEO_EXTENSIONS } = require('../config/constants');

const posixPath = path.posix;

function normalizeReleaseTitle(title) {
  if (title === undefined || title === null) return '';
  const raw = title.toString().trim();
  if (!raw) return '';

  let working = raw.replace(/\.(nzb|zip)$/i, '');
  working = working
    .replace(/[._-]+/g, ' ')
    .replace(/['"`]+/g, ' ')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[^a-z0-9\s]+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();

  return working;
}

function parseRequestedEpisode(type, id, query = {}) {
  if (type !== 'series') return null;

  const rawId = String(id || '');
  const parts = rawId.split(':');
  const season = parts[1] ? Number(parts[1]) : null;
  const episode = parts[2] ? Number(parts[2]) : null;

  if (Number.isFinite(season) && Number.isFinite(episode)) {
    return { season, episode };
  }

  if (query.season !== undefined && query.episode !== undefined) {
    const s = Number(query.season);
    const e = Number(query.episode);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      return { season: s, episode: e };
    }
  }

  return null;
}

function isVideoFileName(fileName = '') {
  if (!fileName) return false;
  const ext = posixPath.extname(fileName.toLowerCase());
  return VIDEO_EXTENSIONS.has(ext);
}

function fileMatchesEpisode(fileName, requestedEpisode) {
  if (!requestedEpisode || !Number.isFinite(requestedEpisode.season) || !Number.isFinite(requestedEpisode.episode)) {
    return true;
  }
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  const s = requestedEpisode.season;
  const e = requestedEpisode.episode;
  const patterns = [
    `s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`,
    `${s}x${String(e).padStart(2, '0')}`,
  ];
  return patterns.some((pattern) => lower.includes(pattern));
}

function normalizeNzbdavPath(pathValue) {
  if (!pathValue) return '/';
  const normalized = pathValue.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function inferMimeType(fileName) {
  if (!fileName) return 'application/octet-stream';
  const VIDEO_MIME_MAP = new Map([
    ['.mp4', 'video/mp4'],
    ['.m4v', 'video/mp4'],
    ['.mkv', 'video/x-matroska'],
    ['.webm', 'video/webm'],
    ['.avi', 'video/x-msvideo'],
    ['.mov', 'video/quicktime'],
    ['.wmv', 'video/x-ms-wmv'],
    ['.flv', 'video/x-flv'],
    ['.ts', 'video/mp2t'],
    ['.m2ts', 'video/mp2t'],
    ['.mts', 'video/mp2t'],
    ['.mpg', 'video/mpeg'],
    ['.mpeg', 'video/mpeg'],
  ]);
  const ext = posixPath.extname(fileName.toLowerCase());
  return VIDEO_MIME_MAP.get(ext) || 'application/octet-stream';
}

function normalizeIndexerToken(value) {
  if (value === undefined || value === null) return null;
  const token = String(value).trim().toLowerCase();
  return token.length > 0 ? token : null;
}

function nzbMatchesIndexer(result, tokenSet) {
  if (!tokenSet || tokenSet.size === 0) return true;
  const idToken = normalizeIndexerToken(result?.indexerId);
  if (idToken && tokenSet.has(idToken)) return true;
  const nameToken = normalizeIndexerToken(result?.indexer);
  if (nameToken && tokenSet.has(nameToken)) return true;
  return false;
}

function cleanSpecialSearchTitle(rawTitle) {
  if (!rawTitle) return '';
  const noiseTokens = new Set([
    'mb', 'gb', 'kb', 'tb', 'xxx', 'hevc', 'x265', 'x264', 'h265', 'h264',
    'hdr', 'dv', 'uhd', 'web', 'webdl', 'web-dl', 'webrip', 'bluray', 'bdrip',
    'remux', 'prt', 'aac', 'ddp', 'ddp5', 'ddp5.1', 'ddp51', 'atmos', 'dts'
  ]);
  const removeEverywherePatterns = [
    /^\d+(mb|gb|kb|tb)$/i,
    /^[0-9]{3,4}p$/i,
    /^s\d{2}e\d{2}$/i,
    /^\d+x\d+$/,
    /^x?26[45]$/i,
    /^h26[45]$/i
  ];

  const normalizeChunk = (value) =>
    value
      .replace(/[\[\](){}]/g, ' ')
      .replace(/[._]/g, ' ')
      .replace(/[:\-–—]/g, ' ')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normalized = normalizeChunk(rawTitle);
  if (!normalized) return '';

  const tokens = normalized.split(' ');
  const filteredTokens = [];
  let contentStarted = false;

  const isRemovableToken = (token, phase) => {
    const lower = token.toLowerCase();
    if (!lower) return true;
    if (noiseTokens.has(lower)) return true;
    if (/^\d+$/.test(lower)) return true;
    if (removeEverywherePatterns.some((pattern) => pattern.test(lower))) return true;
    if (phase === 'prefix') {
      if (/^\d{1,3}mb$/i.test(lower)) return true;
      if (/^\d{1,4}$/.test(lower)) return true;
    }
    return false;
  };

  for (const token of tokens) {
    if (!token) continue;
    if (!contentStarted && isRemovableToken(token, 'prefix')) {
      continue;
    }
    contentStarted = true;
    if (isRemovableToken(token, 'anywhere')) {
      continue;
    }
    filteredTokens.push(token);
  }

  if (filteredTokens.length === 0) {
    filteredTokens.push(tokens[tokens.length - 1]);
  }

  return normalizeChunk(filteredTokens.join(' '));
}

function stripTrailingSlashes(url) {
  return url.replace(/\/+$/, '');
}

// --- Smart History Matching ---

// Known quality/source/codec tokens to identify where the "title" part ends
const QUALITY_TOKENS = new Set([
  // Resolutions
  '480p', '576p', '720p', '1080p', '1080i', '2160p', '4k', 'uhd',
  // Sources
  'bluray', 'bdrip', 'brrip', 'dvdrip', 'dvdscr', 'hdtv', 'pdtv', 'sdtv',
  'webrip', 'web-dl', 'webdl', 'web', 'hdrip', 'hdcam', 'cam', 'ts', 'tc',
  'screener', 'scr', 'r5', 'dvd', 'bd', 'remux',
  // Video codecs
  'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'divx', 'mpeg',
  // HDR
  'hdr', 'hdr10', 'hdr10+', 'dv', 'dolby', 'vision', 'hlg',
  // Audio
  'aac', 'ac3', 'dts', 'dts-hd', 'truehd', 'atmos', 'flac', 'mp3', 'dd5', 'ddp5',
  // 3D
  '3d', 'hsbs', 'hou', 'sbs',
  // Other markers
  'proper', 'repack', 'rerip', 'internal', 'extended', 'unrated', 'directors', 'cut',
  'dubbed', 'dual', 'multi', 'subbed', 'hardcoded', 'hc',
]);

// Language tokens that might appear in titles
const LANGUAGE_TOKENS = new Set([
  'english', 'eng', 'en', 'french', 'fr', 'german', 'de', 'spanish', 'es',
  'italian', 'ita', 'it', 'dutch', 'nl', 'portuguese', 'pt', 'russian', 'ru',
  'japanese', 'jp', 'korean', 'kr', 'chinese', 'cn', 'hindi', 'hin',
  'nordic', 'swedish', 'danish', 'norwegian', 'finnish',
]);

/**
 * Parse a release title into structured tokens
 * @param {string} title - The release title to parse
 * @returns {Object} Parsed components: { titleWords, year, resolution, source, codec, group, raw }
 */
function parseReleaseTokens(title) {
  if (!title) return { titleWords: [], year: null, resolution: null, source: null, codec: null, group: null, raw: '' };

  const raw = title.toString().trim();
  // Normalize separators to spaces
  const normalized = raw
    .replace(/\.(nzb|zip|rar|mkv|avi|mp4)$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized.split(' ');
  const titleWords = [];
  let year = null;
  let resolution = null;
  let source = null;
  let codec = null;
  let group = null;
  let foundQualityMarker = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    // Check for year (4 digits between 1900-2099)
    if (!year && /^(19|20)\d{2}$/.test(token)) {
      year = token;
      foundQualityMarker = true;
      continue;
    }

    // Check for resolution
    if (!resolution && /^(480|576|720|1080|2160)[pi]?$/i.test(lower)) {
      resolution = lower.replace(/[pi]$/, 'p');
      foundQualityMarker = true;
      continue;
    }
    if (!resolution && (lower === '4k' || lower === 'uhd')) {
      resolution = '2160p';
      foundQualityMarker = true;
      continue;
    }

    // Check for quality/source tokens
    if (QUALITY_TOKENS.has(lower)) {
      foundQualityMarker = true;
      if (!source && ['bluray', 'bdrip', 'brrip', 'dvdrip', 'webrip', 'web-dl', 'webdl', 'web', 'hdtv', 'remux'].includes(lower)) {
        source = lower;
      }
      if (!codec && ['x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'divx'].includes(lower)) {
        codec = lower;
      }
      continue;
    }

    // Skip language tokens
    if (LANGUAGE_TOKENS.has(lower)) {
      continue;
    }

    // If we haven't hit quality markers yet, this is part of the title
    if (!foundQualityMarker) {
      // Filter out very short tokens and numbers-only tokens for title
      if (token.length > 1 && !/^\d+$/.test(token)) {
        titleWords.push(lower);
      } else if (token.length === 1 && /[a-z]/i.test(token)) {
        // Keep single letters that might be part of title (e.g., "V" for Vendetta)
        titleWords.push(lower);
      } else if (/^\d+$/.test(token) && token.length <= 2) {
        // Keep short numbers that might be part of title (e.g., "28" Days Later)
        titleWords.push(lower);
      }
    }

    // Last token is often the release group
    if (i === tokens.length - 1 && !QUALITY_TOKENS.has(lower) && !LANGUAGE_TOKENS.has(lower)) {
      group = lower;
    }
  }

  return { titleWords, year, resolution, source, codec, group, raw };
}

/**
 * Extract just the core title words from a release (before quality markers)
 * @param {string} title - The release title
 * @returns {string[]} Array of lowercase title words
 */
function extractCoreTitleWords(title) {
  const parsed = parseReleaseTokens(title);
  return parsed.titleWords;
}

/**
 * Calculate similarity between two sets of title words using Jaccard similarity
 * @param {string[]} words1 - First set of words
 * @param {string[]} words2 - Second set of words
 * @returns {number} Similarity score between 0 and 1
 */
function calculateWordSimilarity(words1, words2) {
  if (!words1.length || !words2.length) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate overall similarity between two parsed releases
 * @param {Object} parsed1 - First parsed release
 * @param {Object} parsed2 - Second parsed release
 * @returns {Object} { score, titleMatch, yearMatch, details }
 */
function calculateReleaseSimilarity(parsed1, parsed2) {
  // Title word similarity (most important)
  const titleSimilarity = calculateWordSimilarity(parsed1.titleWords, parsed2.titleWords);

  // Year match (bonus)
  const yearMatch = parsed1.year && parsed2.year && parsed1.year === parsed2.year;
  const yearMismatch = parsed1.year && parsed2.year && parsed1.year !== parsed2.year;

  // Calculate final score
  // Title similarity is primary (0-1), year match adds bonus, year mismatch penalizes
  let score = titleSimilarity;
  if (yearMatch) score = Math.min(1, score + 0.1);
  if (yearMismatch) score = Math.max(0, score - 0.2);

  // Check if all words from one are contained in the other (asymmetric match)
  const allWords1InWords2 = parsed1.titleWords.length > 0 &&
    parsed1.titleWords.every((w) => parsed2.titleWords.includes(w));
  const allWords2InWords1 = parsed2.titleWords.length > 0 &&
    parsed2.titleWords.every((w) => parsed1.titleWords.includes(w));

  return {
    score,
    titleMatch: titleSimilarity >= 0.8 || allWords1InWords2 || allWords2InWords1,
    yearMatch,
    yearMismatch,
    allWords1InWords2,
    allWords2InWords1,
    details: {
      titleSimilarity,
      words1: parsed1.titleWords,
      words2: parsed2.titleWords,
    }
  };
}

/**
 * Find all history items that match a search title with configurable threshold
 * @param {string} searchTitle - The title to search for
 * @param {Map} historyMap - Map of normalized title -> history entry
 * @param {Object} options - { minSimilarity: 0.6, requireAllWords: false, debug: false }
 * @returns {Array} Array of { entry, normalizedTitle, similarity } sorted by score descending
 */
function findMatchingHistoryItems(searchTitle, historyMap, options = {}) {
  const { minSimilarity = 0.6, requireAllWords = false, debug = false } = options;

  if (!searchTitle || !historyMap || historyMap.size === 0) {
    return [];
  }

  const searchParsed = parseReleaseTokens(searchTitle);
  if (searchParsed.titleWords.length === 0) {
    return [];
  }

  const matches = [];

  for (const [normalizedTitle, entry] of historyMap.entries()) {
    const historyParsed = parseReleaseTokens(entry.jobName || normalizedTitle);
    const similarity = calculateReleaseSimilarity(searchParsed, historyParsed);

    // Check if this is a match
    let isMatch = false;
    if (requireAllWords) {
      // Strict mode: all search words must be in history title
      isMatch = similarity.allWords1InWords2;
    } else {
      // Fuzzy mode: use similarity threshold or asymmetric match
      isMatch = similarity.score >= minSimilarity ||
        similarity.allWords1InWords2 ||
        similarity.allWords2InWords1;
    }

    if (isMatch) {
      matches.push({
        entry,
        normalizedTitle,
        similarity: similarity.score,
        details: similarity,
      });
    }

    if (debug) {
      console.log(`[HISTORY MATCH DEBUG] "${searchParsed.titleWords.join(' ')}" vs "${historyParsed.titleWords.join(' ')}": score=${similarity.score.toFixed(2)}, match=${isMatch}`);
    }
  }

  // Sort by similarity score descending
  matches.sort((a, b) => b.similarity - a.similarity);

  return matches;
}

module.exports = {
  normalizeReleaseTitle,
  parseRequestedEpisode,
  isVideoFileName,
  fileMatchesEpisode,
  normalizeNzbdavPath,
  inferMimeType,
  normalizeIndexerToken,
  nzbMatchesIndexer,
  cleanSpecialSearchTitle,
  stripTrailingSlashes,
  // Smart history matching
  parseReleaseTokens,
  extractCoreTitleWords,
  calculateWordSimilarity,
  calculateReleaseSimilarity,
  findMatchingHistoryItems,
};

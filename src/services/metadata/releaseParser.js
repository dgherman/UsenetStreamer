const _ptt = require('parse-torrent-title');
const parseTorrentTitle = typeof _ptt === 'function' ? _ptt : _ptt.parse;

const LANGUAGE_FILTERS = [
  'English',
  'Tamil',
  'Hindi',
  'Malayalam',
  'Kannada',
  'Telugu',
  'Chinese',
  'Russian',
  'Arabic',
  'Japanese',
  'Korean',
  'Taiwanese',
  'Latino',
  'French',
  'Spanish',
  'Portuguese',
  'Italian',
  'German',
  'Ukrainian',
  'Polish',
  'Czech',
  'Thai',
  'Indonesian',
  'Vietnamese',
  'Dutch',
  'Bengali',
  'Turkish',
  'Greek',
  'Swedish',
  'Romanian',
  'Hungarian',
  'Finnish',
  'Norwegian',
  'Danish',
  'Hebrew',
  'Lithuanian',
  'Punjabi',
  'Marathi',
  'Gujarati',
  'Bhojpuri',
  'Nepali',
  'Urdu',
  'Tagalog',
  'Filipino',
  'Malay',
  'Mongolian',
  'Armenian',
  'Georgian'
];

const LANGUAGE_SYNONYMS = {
  English: ['english', 'ingles', 'inglés', 'anglais', 'englisch', 'en subtitles', 'eng'],
  Tamil: ['tamil', 'tam'],
  Hindi: ['hindi', 'hind', 'hin', 'hindustani'],
  Malayalam: ['malayalam', 'mal'],
  Kannada: ['kannada', 'kan'],
  Telugu: ['telugu', 'tel'],
  Chinese: ['chinese', 'chs', 'chi', 'mandarin'],
  Russian: ['russian', 'rus', 'russk'],
  Arabic: ['arabic', 'ara', 'arab'],
  Japanese: ['japanese', 'jap', 'jpn'],
  Korean: ['korean', 'kor'],
  Taiwanese: ['taiwanese', 'taiwan'],
  Latino: ['latino', 'latin spanish', 'lat'],
  French: ['french', 'français', 'fra', 'fre', 'vostfr'],
  Spanish: ['spanish', 'español', 'esp', 'spa'],
  Portuguese: ['portuguese', 'portugues', 'por', 'ptbr', 'brazilian'],
  Italian: ['italian', 'italiano', 'ita'],
  German: ['german', 'deutsch', 'ger', 'deu'],
  Ukrainian: ['ukrainian', 'ukr'],
  Polish: ['polish', 'polski', 'pol'],
  Czech: ['czech', 'cesky', 'cz', 'cze', 'ces'],
  Thai: ['thai'],
  Indonesian: ['indonesian', 'indo', 'id'],
  Vietnamese: ['vietnamese', 'viet'],
  Dutch: ['dutch', 'nederlands', 'dut', 'nld'],
  Bengali: ['bengali', 'bangla'],
  Turkish: ['turkish', 'turk', 'trk', 'tur'],
  Greek: ['greek', 'ellinika'],
  Swedish: ['swedish', 'svenska', 'swe'],
  Romanian: ['romanian', 'romana'],
  Hungarian: ['hungarian', 'magyar', 'hun'],
  Finnish: ['finnish', 'suomi', 'fin'],
  Norwegian: ['norwegian', 'norsk', 'nor'],
  Danish: ['danish', 'dansk', 'dan'],
  Hebrew: ['hebrew', 'heb'],
  Lithuanian: ['lithuanian', 'lietuvos', 'lit'],
  Punjabi: ['punjabi', 'panjabi', 'pan'],
  Marathi: ['marathi', 'mar'],
  Gujarati: ['gujarati', 'guj'],
  Bhojpuri: ['bhojpuri'],
  Nepali: ['nepali', 'nep'],
  Urdu: ['urdu'],
  Tagalog: ['tagalog'],
  Filipino: ['filipino'],
  Malay: ['malay', 'bahasa melayu'],
  Mongolian: ['mongolian'],
  Armenian: ['armenian'],
  Georgian: ['georgian']
};

const LANGUAGE_PATTERNS = Object.fromEntries(
  LANGUAGE_FILTERS.map((language) => {
    const tokens = LANGUAGE_SYNONYMS[language] || [language];
    const patterns = tokens.map((token) => buildLanguagePattern(token));
    return [language, patterns];
  })
);

const RESOLUTION_PREFERENCES = [
  '4320p',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '576p',
  '540p',
  '480p',
  '360p',
  '240p'
];

const RESOLUTION_NUMERIC_PATTERNS = [
  { label: '4320p', regex: /\b4320p\b/i },
  { label: '2160p', regex: /\b2160p\b/i },
  { label: '1440p', regex: /\b1440p\b/i },
  { label: '1080p', regex: /\b1080p\b|fullhd|fhd/i },
  { label: '720p', regex: /\b720p\b|hd\b/i },
  { label: '576p', regex: /\b576p\b/i },
  { label: '540p', regex: /\b540p\b/i },
  { label: '480p', regex: /\b480p\b|sd\b/i },
  { label: '360p', regex: /\b360p\b/i },
  { label: '240p', regex: /\b240p\b/i }
];

const RESOLUTION_SYNONYM_PATTERNS = [
  { label: '4320p', regex: /\b8k\b/i },
  { label: '2160p', regex: /\b(4k|uhd)\b/i },
];

const QUALITY_SCORE_MAP = RESOLUTION_PREFERENCES.reduce((acc, label, index) => {
  acc[label] = RESOLUTION_PREFERENCES.length - index;
  return acc;
}, {});

const QUALITY_FEATURE_PATTERNS = [
  { label: 'DV', regex: /\b(dolby\s*vision|dolbyvision|dv)\b/i },
  { label: 'HDR10+', regex: /hdr10\+/i },
  { label: 'HDR10', regex: /hdr10(?!\+)/i },
  { label: 'HDR', regex: /\bhdr\b/i },
  { label: 'SDR', regex: /\bsdr\b/i },
];

function buildLanguagePattern(token) {
  if (token instanceof RegExp) return token;
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return /$a/; // never matches
  }
  if (normalized.includes(' ')) {
    return new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
}

function detectLanguages(title) {
  const normalizedTitle = (title || '').toLowerCase();
  if (!normalizedTitle) return [];
  const matches = new Set();
  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(normalizedTitle))) {
      matches.add(language);
    }
  }
  return Array.from(matches);
}

function detectResolution(rawTitle, parsed) {
  if (parsed?.resolution) {
    const normalized = normalizeResolutionLabel(parsed.resolution);
    if (normalized) return normalized;
  }
  const title = rawTitle || '';
  for (const entry of RESOLUTION_NUMERIC_PATTERNS) {
    if (entry.regex.test(title)) {
      return entry.label;
    }
  }
  if (parsed?.quality) {
    const normalized = normalizeResolutionLabel(parsed.quality);
    if (normalized) return normalized;
  }
  for (const entry of RESOLUTION_SYNONYM_PATTERNS) {
    if (entry.regex.test(title)) {
      return entry.label;
    }
  }
  return null;
}

function normalizeResolutionLabel(label) {
  if (label === undefined || label === null) return null;
  const value = label.toString().toLowerCase();
  if (!value) return null;
  if (value.includes('4320') || value.includes('8k')) return '4320p';
  if (value.includes('2160') || value.includes('4k') || value.includes('uhd')) return '2160p';
  if (value.includes('1440')) return '1440p';
  if (value.includes('1080')) return '1080p';
  if (value.includes('720')) return '720p';
  if (value.includes('576')) return '576p';
  if (value.includes('540')) return '540p';
  if (value.includes('480')) return '480p';
  if (value.includes('360')) return '360p';
  if (value.includes('240')) return '240p';
  return null;
}

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

  const parsedTitle = (parsed.title && parsed.title.trim()) ? parsed.title : null;
  const parsedYear = parsed.year ? parseInt(parsed.year, 10) || null : null;
  const parsedSeason = parsed.season != null ? parsed.season : (Array.isArray(parsed.seasons) ? parsed.seasons[0] || null : null);
  const parsedEpisode = parsed.episode != null ? parsed.episode : (Array.isArray(parsed.episodes) ? parsed.episodes[0] || null : null);
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

module.exports = {
  LANGUAGE_FILTERS,
  LANGUAGE_SYNONYMS,
  QUALITY_FEATURE_PATTERNS,
  parseReleaseMetadata,
};

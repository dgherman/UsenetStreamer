// Persistent instant playback cache - maps content IDs to nzbdav2 history slots
// This allows skipping indexer searches entirely for already-downloaded content

const fs = require('fs');
const path = require('path');

// Use CONFIG_DIR if set, otherwise fall back to default config directory
const CONFIG_DIR = (() => {
  const override = process.env.CONFIG_DIR;
  if (override && override.trim() !== '') {
    return path.resolve(override.trim());
  }
  return path.join(__dirname, '../../config');
})();

const INSTANT_CACHE_FILE = path.join(CONFIG_DIR, 'instant-cache.json');

// Cache TTL - how long to trust cached entries (7 days default)
const INSTANT_CACHE_TTL_MS = (() => {
  const raw = Number(process.env.INSTANT_CACHE_TTL_DAYS);
  if (Number.isFinite(raw) && raw > 0) return raw * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000; // 7 days
})();

let instantCache = null;
let cacheLoadedAt = 0;

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadInstantCache() {
  try {
    if (fs.existsSync(INSTANT_CACHE_FILE)) {
      const raw = fs.readFileSync(INSTANT_CACHE_FILE, 'utf-8');
      instantCache = JSON.parse(raw);
      cacheLoadedAt = Date.now();
      console.log(`[INSTANT CACHE] Loaded ${Object.keys(instantCache).length} entries from disk`);
    } else {
      instantCache = {};
    }
  } catch (error) {
    console.warn(`[INSTANT CACHE] Failed to load cache: ${error.message}`);
    instantCache = {};
  }
  return instantCache;
}

function saveInstantCache() {
  try {
    ensureConfigDir();
    fs.writeFileSync(INSTANT_CACHE_FILE, JSON.stringify(instantCache, null, 2), 'utf-8');
  } catch (error) {
    console.warn(`[INSTANT CACHE] Failed to save cache: ${error.message}`);
  }
}

function getInstantCache() {
  if (!instantCache) {
    loadInstantCache();
  }
  return instantCache;
}

function buildInstantCacheKey(type, id, requestedEpisode = null) {
  const parts = [type, id];
  if (requestedEpisode && Number.isFinite(requestedEpisode.season) && Number.isFinite(requestedEpisode.episode)) {
    parts.push(`S${requestedEpisode.season}E${requestedEpisode.episode}`);
  }
  return parts.join(':');
}

function getInstantCacheEntry(type, id, requestedEpisode = null) {
  const cache = getInstantCache();
  const key = buildInstantCacheKey(type, id, requestedEpisode);
  const entry = cache[key];

  if (!entry) return null;

  // Check if entry has expired
  if (entry.cachedAt && INSTANT_CACHE_TTL_MS > 0) {
    if (Date.now() - entry.cachedAt > INSTANT_CACHE_TTL_MS) {
      delete cache[key];
      saveInstantCache();
      return null;
    }
  }

  return entry;
}

function setInstantCacheEntry(type, id, requestedEpisode, entryData) {
  const cache = getInstantCache();
  const key = buildInstantCacheKey(type, id, requestedEpisode);

  cache[key] = {
    ...entryData,
    cachedAt: Date.now(),
  };

  saveInstantCache();
  console.log(`[INSTANT CACHE] Saved entry for ${key}`);
}

function clearInstantCacheEntry(type, id, requestedEpisode = null) {
  const cache = getInstantCache();
  const key = buildInstantCacheKey(type, id, requestedEpisode);

  if (cache[key]) {
    delete cache[key];
    saveInstantCache();
  }
}

function clearInstantCache(reason = 'manual') {
  const cache = getInstantCache();
  const count = Object.keys(cache).length;
  if (count > 0) {
    console.log('[INSTANT CACHE] Cleared all entries', { reason, entries: count });
  }
  instantCache = {};
  saveInstantCache();
}

function getInstantCacheEntries() {
  const cache = getInstantCache();
  const entries = [];
  for (const [key, entry] of Object.entries(cache)) {
    entries.push({
      key,
      ...entry,
    });
  }
  return entries;
}

function getInstantCacheStats() {
  const cache = getInstantCache();
  return {
    entries: Object.keys(cache).length,
    ttlMs: INSTANT_CACHE_TTL_MS,
    filePath: INSTANT_CACHE_FILE,
  };
}

module.exports = {
  loadInstantCache,
  getInstantCacheEntry,
  setInstantCacheEntry,
  clearInstantCacheEntry,
  clearInstantCache,
  getInstantCacheEntries,
  buildInstantCacheKey,
  getInstantCacheStats,
};

// NZBDav stream mount cache module
const nzbdavStreamCache = new Map();

// Negative cache for failed download URLs (global, not per-request)
// Prevents retrying known-bad NZBs across different requests
const failedDownloadUrlCache = new Map();

// Parse cache configuration from environment
let NZBDAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours default

function reloadNzbdavCacheConfig() {
  const raw = Number(process.env.NZBDAV_CACHE_TTL_MINUTES);
  if (Number.isFinite(raw) && raw >= 0) {
    NZBDAV_CACHE_TTL_MS = raw * 60 * 1000;
  } else {
    NZBDAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  }

  // Negative cache TTL (hours) - how long to remember failed download URLs
  const negativeRaw = Number(process.env.NZBDAV_NEGATIVE_CACHE_TTL_HOURS);
  if (Number.isFinite(negativeRaw) && negativeRaw >= 0) {
    NEGATIVE_CACHE_TTL_MS = negativeRaw * 60 * 60 * 1000;
  } else {
    NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours default
  }
}

reloadNzbdavCacheConfig();

// --- Negative cache functions ---

function cleanupNegativeCache() {
  if (NEGATIVE_CACHE_TTL_MS <= 0) return;

  const now = Date.now();
  for (const [url, entry] of failedDownloadUrlCache.entries()) {
    if (entry.expiresAt && entry.expiresAt <= now) {
      failedDownloadUrlCache.delete(url);
    }
  }
}

function isDownloadUrlFailed(downloadUrl) {
  cleanupNegativeCache();
  const entry = failedDownloadUrlCache.get(downloadUrl);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    failedDownloadUrlCache.delete(downloadUrl);
    return null;
  }
  return entry;
}

function markDownloadUrlFailed(downloadUrl, failureReason, errorCode = null) {
  if (NEGATIVE_CACHE_TTL_MS <= 0) return; // Negative cache disabled

  failedDownloadUrlCache.set(downloadUrl, {
    failureReason,
    errorCode,
    failedAt: Date.now(),
    expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
  });
  console.log(`[NEGATIVE CACHE] Marked URL as failed: ${downloadUrl.slice(0, 80)}... (reason: ${failureReason})`);
}

function clearFailedDownloadUrl(downloadUrl) {
  if (failedDownloadUrlCache.has(downloadUrl)) {
    failedDownloadUrlCache.delete(downloadUrl);
    console.log(`[NEGATIVE CACHE] Cleared failed URL: ${downloadUrl.slice(0, 80)}...`);
    return true;
  }
  return false;
}

function clearAllFailedDownloadUrls(reason = 'manual') {
  if (failedDownloadUrlCache.size > 0) {
    console.log('[NEGATIVE CACHE] Cleared all failed URLs', { reason, entries: failedDownloadUrlCache.size });
  }
  failedDownloadUrlCache.clear();
}

function getNegativeCacheStats() {
  cleanupNegativeCache();
  return {
    entries: failedDownloadUrlCache.size,
    ttlMs: NEGATIVE_CACHE_TTL_MS,
  };
}

function cleanupNzbdavCache() {
  if (NZBDAV_CACHE_TTL_MS <= 0) return;

  const now = Date.now();
  for (const [key, entry] of nzbdavStreamCache.entries()) {
    if (entry.expiresAt && entry.expiresAt <= now) {
      nzbdavStreamCache.delete(key);
    }
  }
}

function clearNzbdavStreamCache(reason = 'manual') {
  if (nzbdavStreamCache.size > 0) {
    console.log('[CACHE] Cleared NZBDav stream cache', { reason, entries: nzbdavStreamCache.size });
  }
  nzbdavStreamCache.clear();
}

function clearNzbdavStreamCacheEntry(cacheKey) {
  if (nzbdavStreamCache.has(cacheKey)) {
    nzbdavStreamCache.delete(cacheKey);
    console.log('[CACHE] Cleared NZBDav stream cache entry', { cacheKey: cacheKey?.slice(0, 100) });
    return true;
  }
  return false;
}

// Timeout pending window - how long to remember that a download might still be in progress
const TIMEOUT_PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getOrCreateNzbdavStream(cacheKey, builder) {
  cleanupNzbdavCache();
  const existing = nzbdavStreamCache.get(cacheKey);

  // DEBUG: Log cache lookup
  console.log('[NZBDAV CACHE DEBUG] Lookup', {
    cacheKey: cacheKey?.slice(0, 100),
    hasExisting: Boolean(existing),
    existingStatus: existing?.status,
    existingViewPath: existing?.data?.viewPath?.slice(0, 80),
  });

  if (existing) {
    if (existing.status === 'ready') {
      console.log('[NZBDAV CACHE DEBUG] Returning cached ready entry', {
        viewPath: existing.data?.viewPath?.slice(0, 80),
        jobName: existing.data?.jobName?.slice(0, 60),
      });
      return existing.data;
    }
    if (existing.status === 'pending') {
      return existing.promise;
    }
    if (existing.status === 'failed') {
      throw existing.error;
    }
    // For timeout_pending status, we allow retry but the builder will check
    // for in-flight downloads and reuse them instead of starting new ones
    if (existing.status === 'timeout_pending') {
      console.log('[CACHE] Previous request timed out, retrying (in-flight tracking will prevent duplicates)');
      // Fall through to create new attempt
    }
  }

  const promise = (async () => {
    const data = await builder();
    nzbdavStreamCache.set(cacheKey, {
      status: 'ready',
      data,
      expiresAt: NZBDAV_CACHE_TTL_MS > 0 ? Date.now() + NZBDAV_CACHE_TTL_MS : null
    });
    return data;
  })();

  nzbdavStreamCache.set(cacheKey, { status: 'pending', promise });

  try {
    return await promise;
  } catch (error) {
    if (error?.isNzbdavFailure) {
      // Permanent failure - cache the error
      nzbdavStreamCache.set(cacheKey, {
        status: 'failed',
        error,
        expiresAt: NZBDAV_CACHE_TTL_MS > 0 ? Date.now() + NZBDAV_CACHE_TTL_MS : null
      });
    } else if (isTimeoutError(error)) {
      // Timeout - the download might still be in progress in nzbdav2
      // Keep a timeout_pending status so subsequent requests can retry
      // but the in-flight tracking in nzbdav.js will prevent duplicate downloads
      console.log('[CACHE] Request timed out, marking as timeout_pending for potential retry');
      nzbdavStreamCache.set(cacheKey, {
        status: 'timeout_pending',
        error,
        startedAt: Date.now(),
        expiresAt: Date.now() + TIMEOUT_PENDING_TTL_MS
      });
    } else {
      // Other errors - delete the cache entry
      nzbdavStreamCache.delete(cacheKey);
    }
    throw error;
  }
}

function isTimeoutError(error) {
  if (!error) return false;
  const message = error.message || '';
  return message.includes('Timeout') ||
         message.includes('timeout') ||
         message.includes('ETIMEDOUT') ||
         message.includes('ESOCKETTIMEDOUT') ||
         error.code === 'ETIMEDOUT' ||
         error.code === 'ESOCKETTIMEDOUT';
}

function buildNzbdavCacheKey(downloadUrl, category, requestedEpisode = null) {
  const parts = [downloadUrl, category];
  if (requestedEpisode) {
    parts.push(`S${requestedEpisode.season}E${requestedEpisode.episode}`);
  }
  return parts.join('::');
}

function getNzbdavCacheStats() {
  const stats = {
    entries: nzbdavStreamCache.size,
    ttlMs: NZBDAV_CACHE_TTL_MS,
    byStatus: { ready: 0, pending: 0, failed: 0, timeout_pending: 0 },
    negativeCache: getNegativeCacheStats(),
  };

  for (const entry of nzbdavStreamCache.values()) {
    if (entry.status) {
      stats.byStatus[entry.status] = (stats.byStatus[entry.status] || 0) + 1;
    }
  }

  return stats;
}

module.exports = {
  cleanupNzbdavCache,
  clearNzbdavStreamCache,
  clearNzbdavStreamCacheEntry,
  getOrCreateNzbdavStream,
  buildNzbdavCacheKey,
  // Negative cache exports
  isDownloadUrlFailed,
  markDownloadUrlFailed,
  clearFailedDownloadUrl,
  clearAllFailedDownloadUrls,
  getNegativeCacheStats,
  getNzbdavCacheStats,
  reloadNzbdavCacheConfig,
};

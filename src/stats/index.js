// Operational statistics tracking module
// Tracks metrics for prefetch, instant cache, triage, downloads, and blocklist filtering

// In-memory stats storage
const stats = {
  // Prefetch stats
  prefetch: {
    hits: 0,        // Prefetched job was used
    misses: 0,      // New download had to be queued
    started: 0,     // Number of prefetch jobs started
  },

  // Instant cache stats
  instant: {
    hits: 0,        // Instant cache hit (returned cached streams)
    misses: 0,      // Had to search indexer
    historyHits: 0, // Found matching history items
  },

  // Triage stats
  triage: {
    verified: 0,    // Candidates verified successfully
    unverified: 0,  // Candidates with unverified status
    blocked: 0,     // Candidates blocked by triage
    errors: 0,      // Triage errors (fetch-error, error status)
    totalCandidates: 0, // Total candidates triaged
  },

  // Download stats
  downloads: {
    totalDurationMs: 0,
    count: 0,
    failures: 0,
  },

  // Blocklist stats
  blocklist: {
    remux: 0,       // REMUX releases filtered
    iso: 0,         // ISO/IMG/BIN releases filtered
    adult: 0,       // Adult content filtered
    total: 0,       // Total blocklist hits
  },

  // Request stats
  requests: {
    total: 0,
    movies: 0,
    series: 0,
  },

  // Tracking start time
  startedAt: Date.now(),
};

// Calculate rates with safety for division by zero
function safeRate(hits, total) {
  if (total === 0) return 0;
  return Math.round((hits / total) * 10000) / 100; // Two decimal places
}

// Get all stats with calculated rates
function getStats() {
  const now = Date.now();
  const uptimeMs = now - stats.startedAt;

  const prefetchTotal = stats.prefetch.hits + stats.prefetch.misses;
  const instantTotal = stats.instant.hits + stats.instant.misses;
  const triageTotal = stats.triage.verified + stats.triage.unverified + stats.triage.blocked + stats.triage.errors;

  return {
    uptime: {
      startedAt: new Date(stats.startedAt).toISOString(),
      uptimeMs,
      uptimeHours: Math.round(uptimeMs / 3600000 * 100) / 100,
    },
    prefetch: {
      ...stats.prefetch,
      total: prefetchTotal,
      hitRate: safeRate(stats.prefetch.hits, prefetchTotal),
    },
    instant: {
      ...stats.instant,
      total: instantTotal,
      hitRate: safeRate(stats.instant.hits, instantTotal),
    },
    triage: {
      ...stats.triage,
      total: triageTotal,
      successRate: safeRate(stats.triage.verified, triageTotal),
    },
    downloads: {
      ...stats.downloads,
      averageDurationMs: stats.downloads.count > 0
        ? Math.round(stats.downloads.totalDurationMs / stats.downloads.count)
        : 0,
    },
    blocklist: {
      ...stats.blocklist,
    },
    requests: {
      ...stats.requests,
    },
  };
}

// Reset all stats
function resetStats() {
  stats.prefetch.hits = 0;
  stats.prefetch.misses = 0;
  stats.prefetch.started = 0;
  stats.instant.hits = 0;
  stats.instant.misses = 0;
  stats.instant.historyHits = 0;
  stats.triage.verified = 0;
  stats.triage.unverified = 0;
  stats.triage.blocked = 0;
  stats.triage.errors = 0;
  stats.triage.totalCandidates = 0;
  stats.downloads.totalDurationMs = 0;
  stats.downloads.count = 0;
  stats.downloads.failures = 0;
  stats.blocklist.remux = 0;
  stats.blocklist.iso = 0;
  stats.blocklist.adult = 0;
  stats.blocklist.total = 0;
  stats.requests.total = 0;
  stats.requests.movies = 0;
  stats.requests.series = 0;
  stats.startedAt = Date.now();
}

// Individual tracking functions
function trackPrefetchHit() {
  stats.prefetch.hits++;
}

function trackPrefetchMiss() {
  stats.prefetch.misses++;
}

function trackPrefetchStarted() {
  stats.prefetch.started++;
}

function trackInstantHit() {
  stats.instant.hits++;
}

function trackInstantMiss() {
  stats.instant.misses++;
}

function trackInstantHistoryHit(count = 1) {
  stats.instant.historyHits += count;
}

function trackTriageResult(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'verified') {
    stats.triage.verified++;
  } else if (s === 'unverified' || s === 'unverified_7z') {
    stats.triage.unverified++;
  } else if (s === 'blocked') {
    stats.triage.blocked++;
  } else {
    stats.triage.errors++;
  }
  stats.triage.totalCandidates++;
}

function trackTriageBatch(decisions) {
  if (!decisions || typeof decisions.forEach !== 'function') return;
  decisions.forEach((decision) => {
    trackTriageResult(decision.status);
  });
}

function trackDownload(durationMs, success = true) {
  if (success) {
    stats.downloads.totalDurationMs += durationMs;
    stats.downloads.count++;
  } else {
    stats.downloads.failures++;
  }
}

function trackBlocklistHit(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'remux') {
    stats.blocklist.remux++;
  } else if (t === 'iso' || t === 'release') {
    stats.blocklist.iso++;
  } else if (t === 'adult') {
    stats.blocklist.adult++;
  }
  stats.blocklist.total++;
}

function trackRequest(type) {
  stats.requests.total++;
  const t = String(type || '').toLowerCase();
  if (t === 'movie') {
    stats.requests.movies++;
  } else if (t === 'series') {
    stats.requests.series++;
  }
}

module.exports = {
  getStats,
  resetStats,
  trackPrefetchHit,
  trackPrefetchMiss,
  trackPrefetchStarted,
  trackInstantHit,
  trackInstantMiss,
  trackInstantHistoryHit,
  trackTriageResult,
  trackTriageBatch,
  trackDownload,
  trackBlocklistHit,
  trackRequest,
};

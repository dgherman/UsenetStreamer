/**
 * Health check module
 *
 * Provides lightweight health checks for all dependencies.
 * Designed for monitoring tools (Uptime Kuma, Prometheus, etc.)
 */

const axios = require('axios');

// Default timeout for health checks (short for monitoring)
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Measure execution time of an async function
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{ result: any, latencyMs: number }>}
 */
async function withLatency(fn) {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - start };
  } catch (error) {
    return { error, latencyMs: Date.now() - start };
  }
}

/**
 * Check nzbdav2 API connectivity
 * Uses queue endpoint with limit=1 for minimal overhead
 */
async function checkNzbdavApi(config) {
  const { baseUrl, apiKey, timeout = DEFAULT_TIMEOUT_MS } = config;
  if (!baseUrl) return { status: 'unconfigured', message: 'URL not configured' };
  if (!apiKey) return { status: 'unconfigured', message: 'API key not configured' };

  const { result, error, latencyMs } = await withLatency(async () => {
    const response = await axios.get(`${baseUrl}/api`, {
      params: { mode: 'queue', limit: 1, output: 'json' },
      headers: { 'x-api-key': apiKey },
      timeout,
      validateStatus: () => true,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed');
    }
    if (response.status >= 500) {
      throw new Error(`Server error: ${response.status}`);
    }
    if (response.status >= 400) {
      throw new Error(`Client error: ${response.status}`);
    }
    return response.data;
  });

  if (error) {
    return {
      status: 'down',
      message: error.message || 'Connection failed',
      latencyMs,
    };
  }

  return { status: 'up', latencyMs };
}

/**
 * Check nzbdav2 WebDAV connectivity
 * Uses PROPFIND with Depth:0 for minimal overhead
 */
async function checkNzbdavWebdav(config) {
  const { baseUrl, username, password, timeout = DEFAULT_TIMEOUT_MS } = config;
  if (!baseUrl) return { status: 'unconfigured', message: 'URL not configured' };
  if (!username || !password) return { status: 'unconfigured', message: 'Credentials not configured' };

  const { result, error, latencyMs } = await withLatency(async () => {
    const response = await axios.request({
      method: 'PROPFIND',
      url: `${baseUrl}/`,
      auth: { username, password },
      headers: { Depth: '0' },
      timeout,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed');
    }
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}`);
    }
    // WebDAV PROPFIND returns 207 Multi-Status
    if (response.status !== 207 && response.status !== 200) {
      throw new Error(`Unexpected status: ${response.status}`);
    }
    return response.data;
  });

  if (error) {
    return {
      status: 'down',
      message: error.message || 'Connection failed',
      latencyMs,
    };
  }

  return { status: 'up', latencyMs };
}

/**
 * Check indexer manager connectivity (Prowlarr or NZBHydra)
 * Uses system status or caps endpoint for minimal overhead
 */
async function checkIndexer(config) {
  const { type, baseUrl, apiKey, timeout = DEFAULT_TIMEOUT_MS } = config;
  if (!baseUrl) return { status: 'unconfigured', message: 'URL not configured' };

  const managerType = (type || 'prowlarr').toLowerCase();

  const { result, error, latencyMs } = await withLatency(async () => {
    if (managerType === 'prowlarr') {
      if (!apiKey) throw new Error('API key not configured');
      const response = await axios.get(`${baseUrl}/api/v1/system/status`, {
        headers: { 'X-Api-Key': apiKey },
        timeout,
        validateStatus: () => true,
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed');
      }
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { version: response.data?.version };
    }

    // NZBHydra
    const params = { t: 'caps', o: 'json' };
    if (apiKey) params.apikey = apiKey;
    const response = await axios.get(`${baseUrl}/api`, {
      params,
      timeout,
      validateStatus: () => true,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed');
    }
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { type: 'nzbhydra' };
  });

  if (error) {
    return {
      status: 'down',
      message: error.message || 'Connection failed',
      latencyMs,
    };
  }

  return { status: 'up', latencyMs, ...(result?.version && { version: result.version }) };
}

/**
 * Check Cinemeta connectivity
 * Uses a known stable movie (Shawshank Redemption) for testing
 */
async function checkCinemeta(config = {}) {
  const { baseUrl = 'https://v3-cinemeta.strem.io/meta', timeout = DEFAULT_TIMEOUT_MS } = config;

  const { result, error, latencyMs } = await withLatency(async () => {
    // Use Shawshank Redemption - stable, always available
    const response = await axios.get(`${baseUrl}/movie/tt0111161.json`, {
      timeout,
      validateStatus: () => true,
    });
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.data?.meta) {
      throw new Error('Invalid response format');
    }
    return response.data;
  });

  if (error) {
    return {
      status: 'down',
      message: error.message || 'Connection failed',
      latencyMs,
    };
  }

  return { status: 'up', latencyMs };
}

/**
 * Check TMDb connectivity
 * Uses configuration endpoint for minimal overhead
 */
async function checkTmdb(config) {
  const { apiKey, timeout = DEFAULT_TIMEOUT_MS } = config;
  if (!apiKey) return { status: 'unconfigured', message: 'API key not configured' };

  const { result, error, latencyMs } = await withLatency(async () => {
    const response = await axios.get('https://api.themoviedb.org/3/configuration', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      timeout,
      validateStatus: () => true,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed');
    }
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.data?.images?.base_url) {
      throw new Error('Invalid response format');
    }
    return response.data;
  });

  if (error) {
    return {
      status: 'down',
      message: error.message || 'Connection failed',
      latencyMs,
    };
  }

  return { status: 'up', latencyMs };
}

// Lazy-load NNTP client to avoid startup errors if not installed
let NNTPClient = null;
function getNNTPClient() {
  if (NNTPClient === undefined) return null;
  if (NNTPClient === null) {
    try {
      const nntpModule = require('nntp/lib/nntp');
      NNTPClient = typeof nntpModule === 'function' ? nntpModule : nntpModule?.NNTP || null;
    } catch {
      NNTPClient = undefined; // Mark as unavailable
    }
  }
  return NNTPClient;
}

/**
 * Check Usenet provider connectivity (NNTP)
 * Note: NNTP connections are more expensive than HTTP. Consider longer polling intervals.
 */
async function checkUsenet(config) {
  const { host, port = 119, useTls = false, username, password, timeout = DEFAULT_TIMEOUT_MS } = config;
  if (!host) return { status: 'unconfigured', message: 'Host not configured' };

  const NNTP = getNNTPClient();
  if (!NNTP) return { status: 'unconfigured', message: 'NNTP library not available' };

  const { error, latencyMs } = await withLatency(() => {
    return new Promise((resolve, reject) => {
      const client = new NNTP();
      let settled = false;
      let reachedReady = false;
      let streamRef = null;

      const cleanup = () => {
        if (streamRef && typeof streamRef.removeListener === 'function') {
          streamRef.removeListener('error', onError);
        }
        client.removeListener('error', onError);
        client.removeListener('close', onClose);
        client.removeListener('ready', onReady);
      };

      const finalize = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        try {
          if (reachedReady && typeof client.quit === 'function') {
            client.quit(() => client.end());
          } else if (typeof client.end === 'function') {
            client.end();
          }
        } catch {
          try { client.end(); } catch { /* noop */ }
        }
        if (err) reject(err);
        else resolve();
      };

      const onReady = () => {
        reachedReady = true;
        finalize(null);
      };

      const onError = (err) => {
        finalize(new Error(err?.message || 'NNTP error'));
      };

      const onClose = () => {
        if (!settled) finalize(new Error('Connection closed'));
      };

      const timer = setTimeout(() => {
        finalize(new Error('Connection timed out'));
      }, timeout);

      client.once('ready', onReady);
      client.once('error', onError);
      client.once('close', onClose);

      try {
        streamRef = client.connect({
          host,
          port,
          secure: useTls,
          user: username || undefined,
          password: password || undefined,
          connTimeout: timeout,
        });
        if (streamRef && typeof streamRef.on === 'function') {
          streamRef.on('error', onError);
        }
      } catch (err) {
        finalize(err);
      }
    });
  });

  if (error) {
    return {
      status: 'down',
      message: error.message || 'Connection failed',
      latencyMs,
    };
  }

  return { status: 'up', latencyMs };
}

/**
 * Determine overall health status
 * @param {Object} checks - Individual check results
 * @returns {'healthy' | 'degraded' | 'unhealthy'}
 */
function determineOverallStatus(checks) {
  const criticalServices = ['nzbdav_api', 'nzbdav_webdav'];
  const allServices = Object.keys(checks);

  // Count statuses
  let downCount = 0;
  let criticalDown = false;

  for (const [name, check] of Object.entries(checks)) {
    if (check.status === 'down') {
      downCount++;
      if (criticalServices.includes(name)) {
        criticalDown = true;
      }
    }
  }

  // Critical service down = unhealthy
  if (criticalDown) return 'unhealthy';

  // Any service down = degraded
  if (downCount > 0) return 'degraded';

  // All unconfigured except critical = degraded
  const configuredCount = allServices.filter((name) => checks[name].status !== 'unconfigured').length;
  if (configuredCount < 2) return 'degraded';

  return 'healthy';
}

/**
 * Run all health checks
 * @param {Object} config - Configuration for all services
 * @param {Object} [options] - Options
 * @param {boolean} [options.verbose=false] - Include detailed info
 * @returns {Promise<Object>} Health check results
 */
async function runHealthChecks(config, options = {}) {
  const { verbose = false } = options;

  // Run all checks in parallel
  const [nzbdavApi, nzbdavWebdav, indexer, cinemeta, tmdb, usenet] = await Promise.all([
    checkNzbdavApi({
      baseUrl: config.nzbdavUrl,
      apiKey: config.nzbdavApiKey,
    }),
    checkNzbdavWebdav({
      baseUrl: config.nzbdavWebdavUrl || config.nzbdavUrl,
      username: config.nzbdavWebdavUser,
      password: config.nzbdavWebdavPass,
    }),
    checkIndexer({
      type: config.indexerType,
      baseUrl: config.indexerUrl,
      apiKey: config.indexerApiKey,
    }),
    checkCinemeta(),
    checkTmdb({
      apiKey: config.tmdbApiKey,
    }),
    checkUsenet({
      host: config.usenetHost,
      port: config.usenetPort,
      useTls: config.usenetTls,
      username: config.usenetUser,
      password: config.usenetPass,
    }),
  ]);

  const checks = {
    nzbdav_api: nzbdavApi,
    nzbdav_webdav: nzbdavWebdav,
    indexer,
    cinemeta,
    tmdb,
    usenet,
  };

  const status = determineOverallStatus(checks);

  const result = {
    status,
    timestamp: new Date().toISOString(),
  };

  // Normalize latency field name to snake_case for JSON consistency
  result.dependencies = {};
  for (const [name, check] of Object.entries(checks)) {
    const dep = { status: check.status };
    if (check.latencyMs !== undefined) {
      dep.latency_ms = check.latencyMs;
    }
    if (verbose) {
      if (check.message) dep.message = check.message;
      if (check.version) dep.version = check.version;
    }
    result.dependencies[name] = dep;
  }

  return result;
}

module.exports = {
  checkNzbdavApi,
  checkNzbdavWebdav,
  checkIndexer,
  checkCinemeta,
  checkTmdb,
  checkUsenet,
  determineOverallStatus,
  runHealthChecks,
};

# Mid-Stream Truncation Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When nzbdav2 closes a stream mid-response due to corrupt data (YENC CRC failures), mark the download URL in the negative cache so Stremio's automatic retry routes to a fallback NZB instead of hitting the same corrupt file again.

**Architecture:** Add a byte-counting Transform to `proxyNzbdavStream`'s pipeline. When the pipeline errors and bytes received < Content-Length and the client is still connected, throw a typed `UPSTREAM_STREAM_TRUNCATED` error. Catch that error in `handleNzbdavStream` *before* the `res.writableEnded` bail-out and call `markDownloadUrlFailed()`. The existing negative cache + fallbackUrls flow then handles the next retry automatically.

**Tech Stack:** Node.js streams (`Transform`, `pipeline`), Jest for unit tests, existing `markDownloadUrlFailed` / `isDownloadUrlFailed` from `src/cache/nzbdavCache.js`.

---

## File Map

| File | Change |
|------|--------|
| `src/services/nzbdav.js` | Add `Transform` import; extract two helper functions; add byte counter to pipeline; update pipeline error handler |
| `server.js` | Add one new branch at top of `handleNzbdavStream` catch block |
| `tests/services/nzbdav.truncation.test.js` | New — unit tests for the two helper functions |
| `package.json` + `package-lock.json` | Add `jest` as devDependency |

---

## Task 1: Install Jest

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-generated)

- [ ] **Step 1: Install Jest**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm install --save-dev jest
```

Expected: jest appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Update the test script in package.json**

Open `package.json` and change:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```
to:
```json
"test": "jest"
```

- [ ] **Step 3: Verify Jest runs (no tests yet)**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm test
```

Expected output contains: `No tests found` (exit 0 or 1 — either is fine, just confirming Jest loads).

- [ ] **Step 4: Commit**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git add package.json package-lock.json
git commit -m "chore: add jest for unit tests"
```

---

## Task 2: Write failing unit tests for truncation-detection helpers

**Files:**
- Create: `tests/services/nzbdav.truncation.test.js`

The two helpers to be tested (they don't exist yet — that's what makes the tests fail):

- `getExpectedBytes(responseHeadersLower, totalFileSize)` — returns the number of bytes the upstream promised, or `null` if unknown.
- `isUpstreamTruncated(bytesReceived, expectedBytes, reqDestroyed)` — returns `true` when the upstream definitely closed early.

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p /Users/dgherman/Documents/projects/UsenetStreamer/tests/services
```

- [ ] **Step 2: Write the test file**

Create `/Users/dgherman/Documents/projects/UsenetStreamer/tests/services/nzbdav.truncation.test.js` with the following content:

```javascript
'use strict';

const { getExpectedBytes, isUpstreamTruncated } = require('../../src/services/nzbdav');

describe('getExpectedBytes', () => {
  it('returns Content-Length from response headers when present', () => {
    expect(getExpectedBytes({ 'content-length': '3162261092' }, null)).toBe(3162261092);
  });

  it('falls back to totalFileSize when Content-Length header is absent', () => {
    expect(getExpectedBytes({}, 500000000)).toBe(500000000);
  });

  it('prefers Content-Length header over totalFileSize', () => {
    expect(getExpectedBytes({ 'content-length': '1000' }, 9999)).toBe(1000);
  });

  it('returns null when neither source is available', () => {
    expect(getExpectedBytes({}, null)).toBeNull();
    expect(getExpectedBytes({}, undefined)).toBeNull();
  });

  it('returns null for non-finite or zero Content-Length', () => {
    expect(getExpectedBytes({ 'content-length': 'abc' }, null)).toBeNull();
    expect(getExpectedBytes({ 'content-length': '0' }, null)).toBeNull();
  });
});

describe('isUpstreamTruncated', () => {
  it('returns true when bytes received is less than expected and client is still connected', () => {
    expect(isUpstreamTruncated(21_000_000, 3_162_261_092, false)).toBe(true);
  });

  it('returns false when req.destroyed is true (client disconnected)', () => {
    expect(isUpstreamTruncated(21_000_000, 3_162_261_092, true)).toBe(false);
  });

  it('returns false when bytesReceived is zero (nothing was sent — pre-stream failure path)', () => {
    expect(isUpstreamTruncated(0, 3_162_261_092, false)).toBe(false);
  });

  it('returns false when bytesReceived equals expectedBytes (full transfer)', () => {
    expect(isUpstreamTruncated(1000, 1000, false)).toBe(false);
  });

  it('returns false when expectedBytes is null (no Content-Length available)', () => {
    expect(isUpstreamTruncated(500, null, false)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm test
```

Expected: Tests fail with `TypeError: getExpectedBytes is not a function` (or similar — the helpers don't exist yet).

- [ ] **Step 4: Commit the failing tests**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git add tests/services/nzbdav.truncation.test.js
git commit -m "test: add failing tests for upstream truncation detection helpers"
```

---

## Task 3: Implement helpers and make tests pass

**Files:**
- Modify: `src/services/nzbdav.js` (add helpers + exports only — no pipeline change yet)

- [ ] **Step 1: Add `Transform` to the stream import at the top of `nzbdav.js`**

Find line 7 in `src/services/nzbdav.js`:
```javascript
const { pipeline } = require('stream');
```
Replace with:
```javascript
const { pipeline, Transform } = require('stream');
```

- [ ] **Step 2: Add the two helper functions**

Find the line just before `module.exports` at the bottom of `src/services/nzbdav.js` (line ~1160):
```javascript
module.exports = {
```

Insert these two functions immediately before it:

```javascript
/**
 * Returns the number of bytes the upstream response promised to deliver,
 * or null if the information is not available.
 * @param {Object} responseHeadersLower - Response headers keyed in lowercase
 * @param {number|null} totalFileSize - Pre-fetched file size from HEAD request
 * @returns {number|null}
 */
function getExpectedBytes(responseHeadersLower, totalFileSize) {
  const cl = Number(responseHeadersLower?.['content-length']);
  if (Number.isFinite(cl) && cl > 0) return cl;
  if (Number.isFinite(totalFileSize) && totalFileSize > 0) return totalFileSize;
  return null;
}

/**
 * Returns true when evidence clearly shows the upstream (nzbdav2) closed the
 * connection before delivering the promised bytes, and the client is still alive.
 * @param {number} bytesReceived - Bytes actually piped to the client
 * @param {number|null} expectedBytes - Bytes the upstream declared via Content-Length
 * @param {boolean} reqDestroyed - Whether the client request socket is already destroyed
 * @returns {boolean}
 */
function isUpstreamTruncated(bytesReceived, expectedBytes, reqDestroyed) {
  return (
    Number.isFinite(expectedBytes) &&
    bytesReceived > 0 &&
    bytesReceived < expectedBytes &&
    !reqDestroyed
  );
}

```

- [ ] **Step 3: Export the helpers**

Find the `module.exports` block at the bottom of `src/services/nzbdav.js` and add both helpers:

```javascript
module.exports = {
  ensureNzbdavConfigured,
  getNzbdavCategory,
  buildNzbdavApiParams,
  extractNzbdavQueueId,
  addNzbToNzbdav,
  waitForNzbdavHistorySlot,
  fetchCompletedNzbdavHistory,
  fetchFailedNzbdavHistory,
  fetchNzbdavQueue,
  findMatchingQueueJob,
  trackInFlightDownload,
  getInFlightDownload,
  clearInFlightDownload,
  buildNzbdavCacheKey,
  listWebdavDirectory,
  findBestVideoFile,
  buildNzbdavStream,
  streamFileResponse,
  streamFailureVideo,
  streamVideoTypeFailure,
  proxyNzbdavStream,
  getWebdavClient,
  reloadConfig,
  // Exported for testing
  getExpectedBytes,
  isUpstreamTruncated,
};
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm test
```

Expected:
```
PASS tests/services/nzbdav.truncation.test.js
  getExpectedBytes
    ✓ returns Content-Length from response headers when present
    ✓ falls back to totalFileSize when Content-Length header is absent
    ✓ prefers Content-Length header over totalFileSize
    ✓ returns null when neither source is available
    ✓ returns null for non-finite or zero Content-Length
  isUpstreamTruncated
    ✓ returns true when bytes received is less than expected and client is still connected
    ✓ returns false when req.destroyed is true (client disconnected)
    ✓ returns false when bytesReceived is zero (nothing was sent — pre-stream failure path)
    ✓ returns false when bytesReceived equals expectedBytes (full transfer)
    ✓ returns false when expectedBytes is null (no Content-Length available)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git add src/services/nzbdav.js
git commit -m "feat: add upstream truncation detection helpers to nzbdav"
```

---

## Task 4: Wire helpers into `proxyNzbdavStream`

**Files:**
- Modify: `src/services/nzbdav.js` lines ~1140–1158

The current pipeline block (lines 1141–1158) looks like this:

```javascript
  if (emulateHead || !nzbdavResponse.data || typeof nzbdavResponse.data.pipe !== 'function') {
    if (nzbdavResponse.data && typeof nzbdavResponse.data.destroy === 'function') {
      nzbdavResponse.data.destroy();
    }
    res.end();
    return;
  }

  try {
    await pipelineAsync(nzbdavResponse.data, res);
  } catch (error) {
    if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE' || error?.code === 'ERR_STREAM_UNABLE_TO_PIPE') {
      console.warn('[NZBDAV] Stream closed early by client');
      return;
    }
    throw error;
  }
}
```

- [ ] **Step 1: Replace the pipeline block**

Find the exact text above in `src/services/nzbdav.js` and replace it with:

```javascript
  if (emulateHead || !nzbdavResponse.data || typeof nzbdavResponse.data.pipe !== 'function') {
    if (nzbdavResponse.data && typeof nzbdavResponse.data.destroy === 'function') {
      nzbdavResponse.data.destroy();
    }
    res.end();
    return;
  }

  const expectedBytes = getExpectedBytes(responseHeadersLower, totalFileSize);
  let bytesReceived = 0;
  const byteCounter = new Transform({
    transform(chunk, _encoding, callback) {
      bytesReceived += chunk.length;
      callback(null, chunk);
    }
  });

  try {
    await pipelineAsync(nzbdavResponse.data, byteCounter, res);
  } catch (error) {
    const isClientCloseCode = error?.code === 'ERR_STREAM_PREMATURE_CLOSE' || error?.code === 'ERR_STREAM_UNABLE_TO_PIPE';
    if (isClientCloseCode && req.destroyed) {
      console.warn('[NZBDAV] Stream closed early by client');
      return;
    }
    if (isUpstreamTruncated(bytesReceived, expectedBytes, req.destroyed)) {
      const truncErr = new Error(
        `Upstream stream truncated: received ${bytesReceived} of ${expectedBytes} bytes`
      );
      truncErr.code = 'UPSTREAM_STREAM_TRUNCATED';
      truncErr.isUpstreamTruncation = true;
      throw truncErr;
    }
    throw error;
  }
}
```

- [ ] **Step 2: Run tests — confirm they still pass**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm test
```

Expected: 10 tests pass (no regressions from this change).

- [ ] **Step 3: Commit**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git add src/services/nzbdav.js
git commit -m "feat: detect upstream stream truncation in proxyNzbdavStream"
```

---

## Task 5: Add truncation handling to `handleNzbdavStream` catch block in `server.js`

**Files:**
- Modify: `server.js` lines ~3964–3969

The current catch block starts like this:

```javascript
  } catch (error) {
    // If the client already disconnected, don't attempt recovery or failure videos
    if (res.destroyed || res.writableEnded) {
      console.warn('[NZBDAV] Response already closed, skipping error handling');
      return;
    }
```

- [ ] **Step 1: Insert the truncation branch before the `res.writableEnded` check**

Find the exact text above in `server.js` and replace it with:

```javascript
  } catch (error) {
    // If upstream (nzbdav2) truncated the stream mid-response, mark the URL as failed
    // so Stremio's automatic retry uses a fallback NZB instead of hitting the same corrupt file.
    // We do this BEFORE the res.writableEnded check because we need to mark it regardless.
    if (error?.isUpstreamTruncation && downloadUrl) {
      console.warn('[NZBDAV] Upstream truncated stream mid-response - marking for next retry:', error.message);
      cache.markDownloadUrlFailed(downloadUrl, error.message, 'upstream_truncated');
      return;
    }

    // If the client already disconnected, don't attempt recovery or failure videos
    if (res.destroyed || res.writableEnded) {
      console.warn('[NZBDAV] Response already closed, skipping error handling');
      return;
    }
```

- [ ] **Step 2: Run tests — confirm they still pass**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm test
```

Expected: 10 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git add server.js
git commit -m "feat: mark download URL failed on upstream mid-stream truncation"
```

---

## Task 6: Update IMPROVEMENTS.md and README.md changelog

**Files:**
- Modify: `IMPROVEMENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Add entry to IMPROVEMENTS.md**

In `IMPROVEMENTS.md`, under `## Bug Fixes`, add:

```markdown
### Mid-stream truncation fallback - FIXED

**Problem:** When nzbdav2 encountered corrupt Usenet data (YENC CRC32 failures) mid-stream, it closed the HTTP connection before sending the declared Content-Length bytes. UsenetStreamer's pipeline error handler treated this identically to a client disconnect — silently returning without writing a negative cache entry. Every subsequent Stremio retry served the same corrupt NZB.

**Solution:** Added a byte-counting Transform to `proxyNzbdavStream`'s pipeline. When the pipeline errors, the handler checks: (a) bytes received < Content-Length, (b) at least one byte was received, (c) the client socket is still alive. If all three hold, it throws a typed `UPSTREAM_STREAM_TRUNCATED` error instead of returning silently.

The `handleNzbdavStream` catch block now intercepts this error *before* the `res.writableEnded` bail-out and calls `markDownloadUrlFailed()`. On Stremio's automatic retry, the existing negative cache check fires and `tryNextFallback` routes to the next viable candidate (e.g. a different release already prefetched).

**Implementation details:**
- Added `getExpectedBytes(responseHeadersLower, totalFileSize)` and `isUpstreamTruncated(bytesReceived, expectedBytes, reqDestroyed)` helper functions to `src/services/nzbdav.js`
- Byte counter uses a pass-through Transform — no extra memory or buffering
- `expectedBytes` from response `Content-Length` header (covers both full and range requests)
- Falls back to `totalFileSize` from pre-fetched HEAD request for non-range requests
- Detection skipped entirely if Content-Length is unavailable (fail-safe)
- New negative cache reason code: `upstream_truncated`
```

- [ ] **Step 2: Add changelog entry to README.md**

In `README.md`, find the `## Changelog` section (create it if it doesn't exist) and add a new entry at the top:

```markdown
## Changelog

### [next] - 2026-04-03
- Fix: mid-stream truncation fallback — corrupt Usenet segments (YENC CRC failures) now mark the download URL in the negative cache so Stremio's automatic retry routes to a fallback NZB instead of hitting the same corrupt file repeatedly
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git add IMPROVEMENTS.md README.md
git commit -m "docs: document mid-stream truncation fallback fix"
```

---

## Task 7: Smoke test on Synology NAS and push

- [ ] **Step 1: Run tests one final time**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
npm test
```

Expected: All 10 tests pass.

- [ ] **Step 2: Push to GitHub to trigger CI build**

```bash
cd /Users/dgherman/Documents/projects/UsenetStreamer
git push myfork master
```

- [ ] **Step 3: Wait for CI build to complete**

Check: https://github.com/dgherman/UsenetStreamer/actions

Wait for the build to show green before proceeding.

- [ ] **Step 4: Pull and restart UsenetStreamer on the NAS**

```bash
ssh -o RequestTTY=no -o RemoteCommand=none syno "cd /volume1/docker && sudo /usr/local/bin/docker compose pull usenetstreamer && sudo /usr/local/bin/docker compose up -d usenetstreamer"
```

- [ ] **Step 5: Verify container started cleanly**

```bash
ssh -o RequestTTY=no -o RemoteCommand=none syno "sudo /usr/local/bin/docker logs usenetstreamer --tail 20 2>&1"
```

Expected: No errors, server listening on port 7000.

- [ ] **Step 6: Smoke test — play a movie through Stremio**

Play any movie through Stremio. Verify:
- Basic streaming works (plays without issues on a known-good NZB)
- Check logs for no unexpected errors:
  ```bash
  ssh -o RequestTTY=no -o RemoteCommand=none syno "sudo /usr/local/bin/docker logs usenetstreamer --tail 50 2>&1"
  ```

- [ ] **Step 7: Verify negative cache behavior**

Check the negative cache is empty for a clean stream:
```bash
curl -s http://<nas-ip>:7000/admin/api/stats | grep -i negativeCache
```
Expected: `"entries": 0` (nothing flagged for a healthy stream).

- [ ] **Step 8: Confirm push succeeded and image was built**

Check the Actions page for a completed green build: https://github.com/dgherman/UsenetStreamer/actions

The push in Step 2 (`git push myfork master`) is the main branch push — no additional step needed.

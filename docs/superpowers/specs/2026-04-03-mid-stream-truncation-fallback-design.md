# Mid-Stream Truncation Fallback Design

**Date:** 2026-04-03  
**Status:** Approved

## Problem

When nzbdav2 encounters corrupt Usenet data (e.g. YENC CRC32 failures) mid-stream, it closes the HTTP connection before sending the declared `Content-Length` bytes. UsenetStreamer detects the dropped pipeline but cannot act on it: by the time the error reaches `handleNzbdavStream`'s catch block, `res.writableEnded` is already `true` (partial data was sent to Stremio), so the handler bails out early without writing a negative cache entry. On every subsequent Stremio retry, the same corrupt NZB is served again.

The negative cache and `fallbackUrls` mechanism already exists and works for pre-stream failures. It just isn't triggered for mid-stream truncations.

## Root Cause (confirmed via logs)

- SHiTSoNy `WALL-E` NZB had corrupt YENC segments (CRC32 mismatch on `part001.rar` segs 34 and 59).
- nzbdav2 sent ~21 MB then closed the connection (`Content-Length mismatch`).
- UsenetStreamer's pipeline error hit the `res.writableEnded` early-return in `handleNzbdavStream`.
- `markDownloadUrlFailed()` was never called → negative cache stayed empty → same NZB served on retry.

## Design

### Two-file change

#### 1. `src/services/nzbdav.js` — `proxyNzbdavStream`

Add a byte-counting `Transform` to the pipeline between `nzbdavResponse.data` and `res`:

```javascript
let bytesReceived = 0;
const counter = new Transform({
  transform(chunk, _enc, cb) {
    bytesReceived += chunk.length;
    cb(null, chunk);
  }
});
// pipeline: nzbdavResponse.data → counter → res
```

Determine `expectedBytes`:
- Primary: `Content-Length` header from `nzbdavResponse.headers` (covers both full and range responses).
- Fallback: `totalFileSize` already fetched via HEAD request for non-range requests.
- If neither is available: `expectedBytes` is `null` — skip truncation detection.

Change the pipeline error handler:

```
if (ERR_STREAM_PREMATURE_CLOSE OR ERR_STREAM_UNABLE_TO_PIPE) AND req.destroyed:
  → client closed early, silent return (no change to current behaviour)

else if expectedBytes is not null
     AND bytesReceived < expectedBytes
     AND bytesReceived > 0
     AND !req.destroyed:
  → throw new Error('Upstream stream truncated before Content-Length satisfied')
      with isUpstreamTruncation = true

else:
  → re-throw as before
```

The three-part condition is the "cautious" gate:
- `bytesReceived < expectedBytes` — got less than promised
- `bytesReceived > 0` — at least partially started (not a pre-stream failure, which has its own path)
- `!req.destroyed` — client is still alive; the server closed first

#### 2. `server.js` — `handleNzbdavStream` catch block

Insert one new branch **before** the existing `res.writableEnded` early-return:

```javascript
if (error?.isUpstreamTruncation && downloadUrl) {
  console.warn('[NZBDAV] Upstream truncated stream mid-response - marking for next retry:', error.message);
  cache.markDownloadUrlFailed(downloadUrl, error.message, 'upstream_truncated');
  return;
}
```

No fallback attempt on the current connection (impossible — headers already sent and partial data delivered). The negative cache entry is all that's needed.

### How the retry path works

On Stremio's automatic retry with the same stream URL:

1. `handleNzbdavStream` is called with the same `downloadUrl` and `fallbackUrls` query params.
2. Existing negative cache check (line ~3832) fires: `cache.isDownloadUrlFailed(downloadUrl)` returns the entry.
3. `tryNextFallback` picks up the `fallbackUrls` already encoded in the stream URL.
4. Next viable candidate (e.g. HDTeam) is served without user intervention.

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Range requests (Stremio seeks) | `expectedBytes` comes from range response `Content-Length` (chunk size). Check still valid. |
| History-only streams (`downloadUrl` is `''`) | Condition `downloadUrl exists` fails → no cache entry written, existing behaviour. |
| `expectedBytes` unavailable (no Content-Length headers) | Truncation detection skipped entirely. Fail-safe: don't risk blacklisting a good URL. |
| Transient NAS network hiccup | A NAS-side TCP reset likely also destroys `req`, failing the `!req.destroyed` gate. Small residual race window; worst case: 24h negative cache TTL. |

## User Experience

- **First play attempt:** stream drops as today (one interruption).
- **Stremio auto-retry:** routes to next fallback NZB without user action.
- User does not need to manually select a different release.
- Whether Stremio shows a buffering spinner or briefly kicks to the stream list depends on Stremio's internal retry behaviour; either way, no manual intervention required.

## Out of Scope

- Switching NZBs mid-stream on the same HTTP connection (not possible in HTTP).
- Detecting corruption before streaming starts (would require downloading and verifying RAR headers upfront, unacceptable latency).

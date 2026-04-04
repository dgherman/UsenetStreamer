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

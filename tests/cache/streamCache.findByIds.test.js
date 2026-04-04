'use strict';

const streamCache = require('../../src/cache/streamCache');

// Reproduces what buildStreamCacheKey (server.js:1215) produces
function makeCacheKey({ type, id, requestedEpisode = null, query = {} }) {
  const normalizedQuery = {};
  Object.keys(query).sort().forEach((k) => { normalizedQuery[k] = query[k]; });
  const normalizedEpisode = requestedEpisode
    ? { season: requestedEpisode.season ?? null, episode: requestedEpisode.episode ?? null }
    : null;
  return JSON.stringify({ type, id, requestedEpisode: normalizedEpisode, query: normalizedQuery });
}

beforeEach(() => {
  streamCache.clearStreamResponseCache('test');
});

describe('findStreamCacheEntryByIds', () => {
  it('returns null on empty cache', () => {
    expect(streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null)).toBeNull();
  });

  it('finds a matching movie entry', () => {
    const key = makeCacheKey({ type: 'movie', id: 'tt1234' });
    streamCache.setStreamCacheEntry(key, { streams: [] }, { version: 1, finalNzbResults: [] });
    const result = streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null);
    expect(result).not.toBeNull();
    expect(result.payload).toEqual({ streams: [] });
  });

  it('returns null when type does not match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234' }), {}, null
    );
    expect(streamCache.findStreamCacheEntryByIds('series', 'tt1234', null)).toBeNull();
  });

  it('returns null when id does not match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234' }), {}, null
    );
    expect(streamCache.findStreamCacheEntryByIds('movie', 'tt9999', null)).toBeNull();
  });

  it('matches series entry with correct episode', () => {
    const ep = { season: 2, episode: 5 };
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'series', id: 'tt5678', requestedEpisode: ep }), { streams: [] }, null
    );
    expect(streamCache.findStreamCacheEntryByIds('series', 'tt5678', ep)).not.toBeNull();
  });

  it('returns null when episode does not match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'series', id: 'tt5678', requestedEpisode: { season: 2, episode: 5 } }),
      { streams: [] }, null
    );
    expect(streamCache.findStreamCacheEntryByIds('series', 'tt5678', { season: 2, episode: 6 })).toBeNull();
  });

  it('finds entry regardless of original query params', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234', query: { title: 'WALL-E', year: '2008' } }),
      { streams: ['x'] }, null
    );
    const result = streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null);
    expect(result).not.toBeNull();
    expect(result.payload.streams).toEqual(['x']);
  });

  it('returns most recently accessed when multiple keys match', () => {
    streamCache.setStreamCacheEntry(
      makeCacheKey({ type: 'movie', id: 'tt1234', query: { a: '1' } }),
      { streams: ['A'] }, null
    );
    // Small delay to ensure different timestamps
    const delay = new Promise(resolve => setTimeout(resolve, 5));
    return delay.then(() => {
      streamCache.setStreamCacheEntry(
        makeCacheKey({ type: 'movie', id: 'tt1234', query: { b: '2' } }),
        { streams: ['B'] }, null
      );
      const result = streamCache.findStreamCacheEntryByIds('movie', 'tt1234', null);
      expect(result).not.toBeNull();
      expect(result.payload.streams).toEqual(['B']); // B was accessed last (set last)
    });
  });
});

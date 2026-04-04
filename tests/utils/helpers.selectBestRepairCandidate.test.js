'use strict';

const { selectBestRepairCandidate } = require('../../src/utils/helpers');

// Helper: build a result object
function makeResult(overrides = {}) {
  return {
    downloadUrl: 'https://indexer.example/nzb/1',
    title: 'WALL-E 2008 1080p BluRay x264',
    size: 200 * 1024 * 1024, // 200 MB
    resolution: '1080p',
    language: 'english',
    indexerId: 'nzbgeek',
    ...overrides,
  };
}

describe('selectBestRepairCandidate', () => {
  it('returns null for empty array', () => {
    expect(selectBestRepairCandidate([], { type: 'movie' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(selectBestRepairCandidate(null, { type: 'movie' })).toBeNull();
  });

  it('returns the single viable result', () => {
    const r = makeResult();
    expect(selectBestRepairCandidate([r], { type: 'movie' })).toBe(r);
  });

  it('filters results below movie size floor (100 MB) when alternatives exist', () => {
    const small = makeResult({ title: 'WALL-E small', size: 50 * 1024 * 1024, downloadUrl: 'url-small' });
    const big   = makeResult({ title: 'WALL-E big',   size: 200 * 1024 * 1024, downloadUrl: 'url-big' });
    const result = selectBestRepairCandidate([small, big], { type: 'movie' });
    expect(result.downloadUrl).toBe('url-big');
  });

  it('filters results below series size floor (20 MB) when alternatives exist', () => {
    const small = makeResult({ title: 'Show S01E01 tiny', size: 5 * 1024 * 1024, downloadUrl: 'url-tiny' });
    const ok    = makeResult({ title: 'Show S01E01 ok',   size: 30 * 1024 * 1024, downloadUrl: 'url-ok' });
    const result = selectBestRepairCandidate([small, ok], { type: 'series' });
    expect(result.downloadUrl).toBe('url-ok');
  });

  it('falls back to below-floor results when ALL results are under the floor', () => {
    const small = makeResult({ size: 10 * 1024 * 1024 }); // 10 MB — under any floor
    const result = selectBestRepairCandidate([small], { type: 'movie' });
    // Best-effort: returns the only result rather than null
    expect(result).toBe(small);
  });

  it('results with unknown size (no size field) pass the floor', () => {
    const noSize = makeResult({ size: undefined });
    const result = selectBestRepairCandidate([noSize], { type: 'movie' });
    expect(result).toBe(noSize);
  });

  it('filters by allowed resolutions when configured', () => {
    const hd  = makeResult({ resolution: '1080p', downloadUrl: 'url-hd' });
    const sd  = makeResult({ resolution: '720p',  downloadUrl: 'url-sd' });
    const result = selectBestRepairCandidate([hd, sd], {
      type: 'movie',
      allowedResolutions: ['720p'],
    });
    expect(result.downloadUrl).toBe('url-sd');
  });

  it('falls back to all results when resolution filter eliminates everything', () => {
    const hd = makeResult({ resolution: '1080p', downloadUrl: 'url-hd' });
    const result = selectBestRepairCandidate([hd], {
      type: 'movie',
      allowedResolutions: ['720p'], // only 720p allowed, but we only have 1080p
    });
    // Best-effort: returns 1080p rather than null
    expect(result).toBe(hd);
  });

  it('prefers paid indexer results over free ones', () => {
    const free = makeResult({ title: 'free result',  downloadUrl: 'url-free',  indexerId: 'nzbgeek' });
    const paid = makeResult({ title: 'paid result',  downloadUrl: 'url-paid',  indexerId: 'nzbplanet' });
    const result = selectBestRepairCandidate([free, paid], {
      type: 'movie',
      isPaidIndexer: (r) => r.indexerId === 'nzbplanet',
    });
    expect(result.downloadUrl).toBe('url-paid');
  });

  it('prefers language-matched results over unmatched ones', () => {
    const english = makeResult({ title: 'WALL-E english', language: 'english', downloadUrl: 'url-en' });
    const french  = makeResult({ title: 'WALL-E french',  language: 'french',  downloadUrl: 'url-fr' });
    const result = selectBestRepairCandidate([english, french], {
      type: 'movie',
      preferredLanguages: ['french'],
    });
    expect(result.downloadUrl).toBe('url-fr');
  });

  it('paid indexer rank beats language preference', () => {
    const paidNoLang = makeResult({ title: 'paid no-lang', language: 'english', downloadUrl: 'url-paid', indexerId: 'nzbplanet' });
    const freeLang   = makeResult({ title: 'free lang',    language: 'french',  downloadUrl: 'url-free', indexerId: 'nzbgeek' });
    const result = selectBestRepairCandidate([paidNoLang, freeLang], {
      type: 'movie',
      preferredLanguages: ['french'],
      isPaidIndexer: (r) => r.indexerId === 'nzbplanet',
    });
    expect(result.downloadUrl).toBe('url-paid');
  });

  it('preserves indexer order when no preferences configured', () => {
    const first  = makeResult({ title: 'first',  downloadUrl: 'url-1' });
    const second = makeResult({ title: 'second', downloadUrl: 'url-2' });
    const result = selectBestRepairCandidate([first, second], { type: 'movie' });
    expect(result.downloadUrl).toBe('url-1');
  });
});

'use strict';

const { parseReleaseMetadata } = require('../../../src/services/metadata/releaseParser');

describe('parseReleaseMetadata', () => {
  test('extracts source, codec, group from typical release title', () => {
    const result = parseReleaseMetadata('The.Batman.2022.2160p.UHD.BluRay.x265.HDR.DTS-HD.MA.7.1-GROUP');
    expect(result.resolution).toBe('2160p');
    expect(result.source).toBeTruthy();
    expect(result.codec).toBe('x265');
    expect(result.group).toBe('GROUP');
  });

  test('extracts parsedTitle and parsedTitleDisplay', () => {
    const result = parseReleaseMetadata('The.Batman.2022.1080p.BluRay.x264-GROUP');
    expect(result.parsedTitle).toBe('The Batman');
    expect(result.parsedTitleDisplay).toBe('The Batman 2022');
    expect(result.year).toBe(2022);
  });

  test('parsedTitleDisplay includes season and episode', () => {
    const result = parseReleaseMetadata('Severance.S02E04.1080p.WEB.H264-GROUP');
    expect(result.parsedTitle).toBe('Severance');
    expect(result.parsedTitleDisplay).toMatch(/Severance S02E04/);
    expect(result.season).toBe(2);
    expect(result.episode).toBe(4);
  });

  test('returns audioList as array', () => {
    const result = parseReleaseMetadata('Movie.2024.2160p.BluRay.x265.DTS-HD.MA.7.1-GROUP');
    expect(Array.isArray(result.audioList)).toBe(true);
  });

  test('returns hdrList as array', () => {
    const result = parseReleaseMetadata('Movie.2024.2160p.UHD.BluRay.HDR10.DV-GROUP');
    expect(Array.isArray(result.hdrList)).toBe(true);
  });

  test('returns visualTags from QUALITY_FEATURE_PATTERNS', () => {
    const result = parseReleaseMetadata('Movie.2024.2160p.BluRay.HDR.DV-GROUP');
    expect(Array.isArray(result.visualTags)).toBe(true);
    expect(result.visualTags).toContain('HDR');
    expect(result.visualTags).toContain('DV');
  });

  test('returns empty visualTags when no quality features', () => {
    const result = parseReleaseMetadata('Movie.2024.1080p.BluRay.x264-GROUP');
    expect(result.visualTags).toEqual([]);
  });

  test('strips Usenet upload suffixes before parsing group', () => {
    const result = parseReleaseMetadata('Movie.2024.1080p.BluRay.x264-GROUP-Obfuscated');
    // Should not have 'GROUP-Obfuscated' as group; 'Obfuscated' stripped
    expect(result.group).not.toMatch(/obfuscated/i);
  });

  test('handles empty string gracefully', () => {
    const result = parseReleaseMetadata('');
    expect(result.resolution).toBeNull();
    expect(result.parsedTitle).toBeNull();
    expect(result.source).toBeNull();
    expect(result.codec).toBeNull();
    expect(result.group).toBeNull();
    expect(result.audioList).toEqual([]);
    expect(result.hdrList).toEqual([]);
    expect(result.visualTags).toEqual([]);
    expect(result.languages).toEqual([]);
  });

  test('preserves backward-compatible fields', () => {
    const result = parseReleaseMetadata('Movie.2024.1080p.BluRay.x264-GROUP');
    expect(result).toHaveProperty('resolution');
    expect(result).toHaveProperty('languages');
    expect(result).toHaveProperty('qualityLabel');
    expect(result).toHaveProperty('qualityScore');
  });
});

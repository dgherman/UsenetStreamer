'use strict';

const TemplateEngine = require('../../src/utils/templateEngine');

describe('TemplateEngine', () => {
  describe('basic rendering', () => {
    test('resolves simple path', () => {
      const engine = new TemplateEngine({ title: 'Test Movie' });
      expect(engine.render('{title}')).toBe('Test Movie');
    });

    test('resolves nested path', () => {
      const engine = new TemplateEngine({ stream: { title: 'Nested' } });
      expect(engine.render('{stream.title}')).toBe('Nested');
    });

    test('returns empty string for missing path', () => {
      const engine = new TemplateEngine({});
      expect(engine.render('{missing}')).toBe('');
    });

    test('preserves literal text', () => {
      const engine = new TemplateEngine({ name: 'Addon' });
      expect(engine.render('Hello {name}!')).toBe('Hello Addon!');
    });
  });

  describe('modifiers', () => {
    test('::exists with conditional', () => {
      const engine = new TemplateEngine({ stream: { title: 'Movie' } });
      expect(engine.render('{stream.title::exists["yes"||"no"]}')).toBe('yes');
    });

    test('::exists false when empty string', () => {
      const engine = new TemplateEngine({ stream: { title: '' } });
      expect(engine.render('{stream.title::exists["yes"||"no"]}')).toBe('no');
    });

    test('::istrue with boolean true', () => {
      const engine = new TemplateEngine({ stream: { instant: true } });
      expect(engine.render('{stream.instant::istrue["⚡"||""]}')).toBe('⚡');
    });

    test('::istrue with boolean false', () => {
      const engine = new TemplateEngine({ stream: { instant: false } });
      expect(engine.render('{stream.instant::istrue["⚡"||""]}')).toBe('');
    });

    test('::bytes formats number', () => {
      const engine = new TemplateEngine({ stream: { size: 15032385536 } });
      expect(engine.render('{stream.size::bytes}')).toBe('14 GB');
    });

    test('::join joins array', () => {
      const engine = new TemplateEngine({ stream: { languages: ['English', 'French'] } });
      expect(engine.render('{stream.languages::join(", ")}')).toBe('English, French');
    });

    test('::>0 comparison', () => {
      const engine = new TemplateEngine({ stream: { size: 1000 } });
      expect(engine.render('{stream.size::>0["has size"||"no size"]}')).toBe('has size');
    });

    test('::>0 with zero', () => {
      const engine = new TemplateEngine({ stream: { size: 0 } });
      expect(engine.render('{stream.size::>0["has size"||"no size"]}')).toBe('no size');
    });

    test('::lower converts to lowercase', () => {
      const engine = new TemplateEngine({ name: 'HELLO' });
      expect(engine.render('{name::lower}')).toBe('hello');
    });

    test('::upper converts to uppercase', () => {
      const engine = new TemplateEngine({ name: 'hello' });
      expect(engine.render('{name::upper}')).toBe('HELLO');
    });
  });

  describe('empty line cleanup', () => {
    test('strips blank lines from output', () => {
      const engine = new TemplateEngine({ a: 'line1', b: '', c: 'line3' });
      const pattern = '{a}\n{b}\n{c}';
      expect(engine.render(pattern)).toBe('line1\nline3');
    });
  });

  describe('chained modifiers', () => {
    test('join then exists', () => {
      const engine = new TemplateEngine({ stream: { visualTags: ['HDR', 'DV'] } });
      expect(engine.render('{stream.visualTags::join(" ")::exists["vis: {stream.visualTags::join(\\" \\")}"||""]}')).toBe('vis: HDR DV');
    });

    test('join then exists with empty array', () => {
      const engine = new TemplateEngine({ stream: { visualTags: [] } });
      expect(engine.render('{stream.visualTags::join(" ")::exists["vis"||"none"]}')).toBe('none');
    });
  });

  describe('complex patterns', () => {
    test('renders full stream card pattern', () => {
      const ctx = {
        addon: { name: 'UsenetStreamer' },
        stream: {
          title: 'The Batman (2022)',
          resolution: '2160p',
          source: 'BluRay',
          encode: 'x265',
          visualTags: ['HDR', 'DV'],
          size: 15032385536,
          indexer: 'NZBGeek',
          health: '✓ Healthy',
          instant: false,
        },
      };
      const engine = new TemplateEngine(ctx);
      const namePattern = '{addon.name} {stream.health::exists["{stream.health} "||""]}{stream.instant::istrue["⚡ "||""]}{stream.resolution::exists["{stream.resolution}"||""]}';
      expect(engine.render(namePattern)).toBe('UsenetStreamer ✓ Healthy 2160p');
    });
  });
});

import { describe, expect, it } from 'vitest';
import ownSource from './noHardCodedColours.test.ts?raw';

const THEME_FILE = '/src/theme/theme.ts';
const THIS_FILE = '/src/test/noHardCodedColours.test.ts';

// Vite's glob never returns the importing file, so this file's own text is added explicitly.
const sources: Record<string, string> = {
  ...(import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  [THIS_FILE]: ownSource,
};

// Assembled from fragments because this file is part of its own scan.
const patterns = [
  new RegExp('#' + '[0-9a-fA-F]{3,8}' + '\\b', 'gi'),
  new RegExp('rg' + 'ba?\\(', 'gi'),
  new RegExp('hs' + 'la?\\(', 'gi'),
];

const offenders: { file: string; literal: string }[] = Object.entries(sources)
  .filter(([file]) => file !== THEME_FILE)
  .flatMap(([file, text]) =>
    patterns.flatMap((pattern) =>
      Array.from(text.matchAll(pattern), (match) => ({ file, literal: match[0] })),
    ),
  )
  .sort((a, b) => a.file.localeCompare(b.file));

describe('theme tokens', () => {
  it('scans every source file, this one included', () => {
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain(THIS_FILE);
    expect(files).toContain(THEME_FILE);
  });

  it('keeps colour literals inside the theme file', () => {
    expect(offenders, offenders.map((o) => `${o.file}: ${o.literal}`).join('\n')).toEqual([]);
  });

  it('detects colour literals assembled at runtime', () => {
    const samples: [RegExp, string][] = [
      [patterns[0], `${'#'}${'abc'}`],
      [patterns[1], 'rg' + 'b(0, 0, 0)'],
      [patterns[2], 'hs' + 'l(0, 0%, 0%)'],
    ];
    for (const [pattern, sample] of samples) {
      expect(new RegExp(pattern.source, pattern.flags).test(sample), sample).toBe(true);
    }
  });
});

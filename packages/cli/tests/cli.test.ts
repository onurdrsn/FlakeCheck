import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLI path and output contracts', () => {
  it('keeps the package HTTP-only and exposes the binary without shell execution', async () => {
    const packageJson = await import('../package.json', { with: { type: 'json' } });
    expect(packageJson.default.bin.flakecheck).toBe('./dist/index.js');
    expect(packageJson.default.dependencies.commander).toBeTruthy();
    expect('private' in packageJson.default).toBe(false);
    expect(packageJson.default.scripts.prepublishOnly).toBe('pnpm run build');

    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    expect(indexSource).not.toContain('node:child_process');
    expect(indexSource).not.toContain('child_process');
    expect(indexSource).not.toContain('process.env');

    const reportSource = readFileSync(new URL('../src/report.ts', import.meta.url), 'utf8');
    expect(reportSource).not.toContain('https://');
  });
});

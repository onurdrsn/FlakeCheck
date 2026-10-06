import { describe, expect, it } from 'vitest';

describe('CLI path and output contracts', () => {
  it('keeps the package HTTP-only and exposes the binary', async () => {
    const packageJson = await import('../package.json', { with: { type: 'json' } });
    expect(packageJson.default.bin.flakecheck).toBe('./dist/index.js');
    expect(packageJson.default.dependencies.commander).toBeTruthy();
    expect('private' in packageJson.default).toBe(false);
    expect(packageJson.default.scripts.prepublishOnly).toBe('pnpm run build');
  });
});

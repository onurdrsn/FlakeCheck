import { describe, expect, it } from 'vitest';
import { chunks } from '../src/db/writer.js';

describe('classification writer chunking', () => {
  it('never creates chunks over 500 rows', () => {
    const result = chunks(Array.from({ length: 1001 }, (_, i) => i));
    expect(result.map((item) => item.length)).toEqual([500, 500, 1]);
  });
});

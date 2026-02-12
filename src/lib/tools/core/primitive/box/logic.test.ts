import { describe, expect, test } from 'vitest';
import { generateBoxCodeSnapshot, normalizeBoxParams } from './logic';

describe('box logic snapshots', () => {
    test('normalizes box params with defaults', () => {
        expect(normalizeBoxParams({ width: 20 })).toEqual({
            width: 20,
            height: 10,
            depth: 10,
        });
    });

    test('generates deterministic replicad code snapshot string', () => {
        const code = generateBoxCodeSnapshot({ width: 10, height: 20, depth: 30 });
        expect(code).toContain('makeBaseBox(10, 30, 20)');
    });
});

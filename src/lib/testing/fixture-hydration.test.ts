import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildHydratedPatch } from '@/store/hydration';

describe('fixture-first hydration', () => {
    test('normalizes simple-box fixture JSON into store patch', () => {
        const fixturePath = path.resolve(process.cwd(), 'src/test/fixtures/simple-box.json');
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

        const patch = buildHydratedPatch(fixture);

        expect(patch.fileName).toBe('Simple Box');
        expect(patch.projectId).toBe('proj-simple-box');
        expect(patch.objects?.[0]?.id).toBe('box1');
        expect(Array.from(patch.selectedIds ?? [])).toEqual(['box1']);
    });
});

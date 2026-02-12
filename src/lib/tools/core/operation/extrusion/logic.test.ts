import { describe, expect, test, vi } from 'vitest';
import { executeExtrusion, normalizeExtrusionParams } from './logic';

describe('extrusion logic', () => {
    test('normalizes profile from selection when missing', () => {
        const normalized = normalizeExtrusionParams({}, ['sketch_1']);
        expect(normalized.profile).toBe('sketch_1');
        expect(normalized.distance).toBe(10);
    });

    test('generates standard extrusion operation call', () => {
        const addOperation = vi.fn();
        const codeManager = {
            addOperation,
            addFaceExtrusion: vi.fn(),
        } as any;

        executeExtrusion({
            codeManager,
            selectedIds: ['sketch1'],
            params: { distance: 25 },
        });

        expect(addOperation).toHaveBeenCalledWith('sketch1', 'extrude', [25]);
    });

    test('routes face extrusion through addFaceExtrusion', () => {
        const addFaceExtrusion = vi.fn(() => 'faceExt1');
        const addOperation = vi.fn();
        const codeManager = {
            addOperation,
            addFaceExtrusion,
        } as any;

        executeExtrusion({
            codeManager,
            selectedIds: [],
            params: { profile: 'body1:face-3', distance: 15, operation: 'join' },
        });

        expect(addFaceExtrusion).toHaveBeenCalledWith('body1', 3, 15, {});
        expect(addOperation).toHaveBeenCalledWith('body1', 'fuse', [{ type: 'raw', content: 'faceExt1' }]);
    });
});

import { describe, expect, it } from 'vitest';
import {
    getThumbnailKeys,
    removeProjectThumbnail,
    resolveProjectThumbnail,
    upsertProjectThumbnail,
} from './thumbnail';

describe('thumbnail helpers', () => {
    it('prefers stable project ids over renamed file names', () => {
        const thumbnails = upsertProjectThumbnail({}, 'thumb-data', 'proj-123', 'Old Name');

        expect(getThumbnailKeys('proj-123', 'Old Name')).toEqual(['proj-123', 'Old Name']);
        expect(resolveProjectThumbnail(thumbnails, 'proj-123', 'New Name')).toBe('thumb-data');
        expect(resolveProjectThumbnail(thumbnails, undefined, 'Old Name')).toBe('thumb-data');
    });

    it('removes both stable and legacy thumbnail keys', () => {
        const thumbnails = upsertProjectThumbnail({}, 'thumb-data', 'proj-123', 'Old Name');
        const next = removeProjectThumbnail(thumbnails, 'proj-123', 'Old Name');

        expect(next['proj-123']).toBeUndefined();
        expect(next['Old Name']).toBeUndefined();
    });
});

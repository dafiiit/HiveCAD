import { describe, expect, it } from 'vitest';
import { matchesSearchableFields } from './search';

describe('matchesSearchableFields', () => {
    it('matches against any searchable field', () => {
        expect(matchesSearchableFields('bracket', 'Root Project', 'A steel bracket')).toBe(true);
        expect(matchesSearchableFields('steel', 'Root Project', 'A steel bracket')).toBe(true);
        expect(matchesSearchableFields('missing', 'Root Project', 'A steel bracket')).toBe(false);
    });

    it('treats blank queries as matches', () => {
        expect(matchesSearchableFields('   ', 'Root Project', 'A steel bracket')).toBe(true);
    });
});

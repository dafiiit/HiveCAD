import { describe, expect, test, beforeEach } from 'vitest';
import { ID } from './id-generator';

describe('ID generator', () => {
    beforeEach(() => {
        ID.reset('mock-id');
    });

    test('generates deterministic IDs in test mode', () => {
        expect(ID.generate()).toBe('mock-id-1');
        expect(ID.generate()).toBe('mock-id-2');
    });

    test('supports prefixed generation', () => {
        expect(ID.generatePrefixed('sk')).toBe('sk_mock-id-1');
    });
});

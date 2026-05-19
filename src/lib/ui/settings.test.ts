import { describe, it, expect } from 'vitest';
import { getUserInitial, getUserLabel } from './settings';

describe('settings helpers', () => {
    it('falls back safely when the user email is missing', () => {
        expect(getUserInitial(undefined, undefined)).toBe('?');
        expect(getUserInitial(null, 'user-123')).toBe('U');
        expect(getUserLabel(undefined)).toBe('Unknown account');
    });

    it('uses the email when it exists', () => {
        expect(getUserInitial('alice@example.com', 'user-123')).toBe('A');
        expect(getUserLabel('alice@example.com')).toBe('alice@example.com');
    });
});

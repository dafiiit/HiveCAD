import { describe, it, expect } from 'vitest';
import {
    lengthToCanonical, lengthFromCanonical,
    angleToCanonical, angleFromCanonical,
    resolveNumeric,
} from './quantity';

describe('length conversion', () => {
    it('converts display units to canonical mm', () => {
        expect(lengthToCanonical(1, 'mm')).toBe(1);
        expect(lengthToCanonical(1, 'cm')).toBe(10);
        expect(lengthToCanonical(1, 'm')).toBe(1000);
        expect(lengthToCanonical(1, 'in')).toBeCloseTo(25.4);
    });

    it('round-trips through canonical mm', () => {
        for (const unit of ['mm', 'cm', 'm', 'in'] as const) {
            expect(lengthFromCanonical(lengthToCanonical(42, unit), unit)).toBeCloseTo(42);
        }
    });
});

describe('angle conversion', () => {
    it('converts radians to canonical degrees', () => {
        expect(angleToCanonical(Math.PI, 'rad')).toBeCloseTo(180);
        expect(angleToCanonical(90, 'deg')).toBe(90);
    });

    it('round-trips through canonical degrees', () => {
        expect(angleFromCanonical(angleToCanonical(1.234, 'rad'), 'rad')).toBeCloseTo(1.234);
    });
});

describe('resolveNumeric', () => {
    it('returns a plain number as-is', () => {
        expect(resolveNumeric(7)).toBe(7);
    });

    it('throws on an (unimplemented) expression rather than guessing', () => {
        expect(() => resolveNumeric({ expr: 'width / 2' })).toThrow(/not implemented/);
    });
});

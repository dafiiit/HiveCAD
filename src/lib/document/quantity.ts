/**
 * Unit conversion for the document model (Stage 3, D10).
 *
 * Values live canonically — millimetres for length, degrees for angle, matching
 * OpenCascade. Conversion to/from a display unit happens ONLY here, at the UI
 * boundary, so the kernel and generated code never deal with units.
 */

import { isExpression, type AngleUnit, type LengthUnit, type Numeric } from './types';

const LENGTH_TO_MM: Record<LengthUnit, number> = {
    mm: 1,
    cm: 10,
    m: 1000,
    in: 25.4,
};

const ANGLE_TO_DEG: Record<AngleUnit, number> = {
    deg: 1,
    rad: 180 / Math.PI,
};

/** Display value (in `unit`) → canonical millimetres. */
export function lengthToCanonical(value: number, unit: LengthUnit): number {
    return value * LENGTH_TO_MM[unit];
}

/** Canonical millimetres → display value (in `unit`). */
export function lengthFromCanonical(mm: number, unit: LengthUnit): number {
    return mm / LENGTH_TO_MM[unit];
}

/** Display value (in `unit`) → canonical degrees. */
export function angleToCanonical(value: number, unit: AngleUnit): number {
    return value * ANGLE_TO_DEG[unit];
}

/** Canonical degrees → display value (in `unit`). */
export function angleFromCanonical(deg: number, unit: AngleUnit): number {
    return deg / ANGLE_TO_DEG[unit];
}

/**
 * Resolve a numeric property value to its canonical number. Expressions are not
 * implemented yet (D10) — resolving one throws, deliberately, so the gap is
 * loud rather than silently wrong.
 */
export function resolveNumeric(value: Numeric): number {
    if (isExpression(value)) {
        throw new Error(`Expression evaluation is not implemented yet: "${value.expr}"`);
    }
    return value;
}

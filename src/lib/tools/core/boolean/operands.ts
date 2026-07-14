import type { ToolContext } from '../../types';

export interface BooleanOperands {
    /** the base solid the operation is invoked on */
    primary: string;
    /** the other operands, applied in order */
    secondaries: string[];
    /** keep the operand bodies as individuals after the operation */
    keepTools: boolean;
}

/** A selection id may be a sub-entity like "shape2:face-0"; the boolean acts on the owning solid. */
const baseSolidId = (id: string): string => id.split(':')[0];

/**
 * Resolve the operands for a boolean tool. Prefers the explicit Body 1 / Body 2
 * picks from the operation panel, and falls back to the raw multi-selection so a
 * direct "select two bodies, click Join" still works. Returns null when there
 * aren't two distinct solids to operate on.
 */
export function resolveBooleanOperands(context: ToolContext): BooleanOperands | null {
    const { params, scene } = context;

    const picked = [params?.target, params?.tool].filter(Boolean) as string[];
    const source = picked.length >= 2 ? picked : scene.selectedIds;

    const ids = [...new Set(source.map(baseSolidId))];
    if (ids.length < 2) return null;

    const [primary, ...secondaries] = ids;
    return { primary, secondaries, keepTools: !!params?.keepTools };
}

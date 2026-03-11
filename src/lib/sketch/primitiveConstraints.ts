import type { SketchConstraint } from './types';

const PRIMITIVE_CONSTRAINT_PREFIX = 'primitive-constraint:';

export function buildPrimitiveCoincidentConstraintId(key1: string, key2: string): string {
    const [a, b] = [key1, key2].sort();
    return `${PRIMITIVE_CONSTRAINT_PREFIX}coincident:${a}|${b}`;
}

export function buildPrimitiveLineConstraintId(type: 'horizontal' | 'vertical', primitiveId: string): string {
    return `${PRIMITIVE_CONSTRAINT_PREFIX}${type}:${primitiveId}`;
}

export function isPrimitiveConstraintId(id: string): boolean {
    return id.startsWith(PRIMITIVE_CONSTRAINT_PREFIX);
}

export function isPrimitiveCoincidentConstraint(constraint: Pick<SketchConstraint, 'type' | 'entityIds'>): boolean {
    return constraint.type === 'coincident' && constraint.entityIds.length === 2 && constraint.entityIds.every(id => id.includes(':'));
}

export function isPrimitiveLineConstraint(constraint: Pick<SketchConstraint, 'type' | 'entityIds'>): constraint is SketchConstraint & { type: 'horizontal' | 'vertical'; entityIds: [string] } {
    return (constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.entityIds.length === 1 && !constraint.entityIds[0].includes(':');
}

export function findPrimitiveLineConstraint(
    constraints: readonly SketchConstraint[],
    primitiveId: string,
): 'horizontal' | 'vertical' | null {
    for (const constraint of constraints) {
        if (isPrimitiveLineConstraint(constraint) && constraint.entityIds[0] === primitiveId) {
            return constraint.type;
        }
    }
    return null;
}

export function hasPrimitiveCoincidentConstraint(
    constraints: readonly SketchConstraint[],
    key1: string,
    key2: string,
): boolean {
    const expectedId = buildPrimitiveCoincidentConstraintId(key1, key2);
    return constraints.some(constraint => constraint.id === expectedId);
}
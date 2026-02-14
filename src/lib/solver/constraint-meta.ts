/**
 * Constraint Metadata — defines selection requirements and display info for each constraint type.
 * This is the single source of truth for what each constraint needs and how to prompt the user.
 */

import type { ConstraintType, EntityType } from './types';

// ==================== Selection Step ====================

/** Describes one step in a constraint's selection sequence */
export interface ConstraintSelectionStep {
    /** Human-readable instruction for this step */
    prompt: string;
    /** Allowed entity types for this step */
    allowedTypes: EntityType[];
    /** Whether this step accepts a composite entity (e.g., a line is selected but we want its points) */
    extractPoints?: boolean;
}

// ==================== Constraint Metadata ====================

export interface ConstraintMeta {
    /** Constraint type identifier */
    type: ConstraintType;
    /** Human-readable label */
    label: string;
    /** Short description shown in tooltip */
    description: string;
    /** Ordered selection steps — user must complete them in sequence */
    selectionSteps: ConstraintSelectionStep[];
    /** Minimum total entity count (for flat selection mode) */
    minEntities: number;
    /** Maximum total entity count */
    maxEntities: number;
    /** Whether this constraint takes a numeric value (distance, angle, radius) */
    hasValue?: boolean;
    /** Icon name (Lucide) */
    icon: string;
}

// ==================== Constraint Definitions ====================

export const CONSTRAINT_META: Record<ConstraintType, ConstraintMeta> = {
    coincident: {
        type: 'coincident',
        label: 'Coincident',
        description: 'Make two points occupy the same position',
        icon: 'Locate',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first point', allowedTypes: ['point'] },
            { prompt: 'Select second point', allowedTypes: ['point'] },
        ],
    },

    horizontal: {
        type: 'horizontal',
        label: 'Horizontal',
        description: 'Make a line horizontal, or align two points horizontally',
        icon: 'ArrowRight',
        minEntities: 1,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select a line or first point', allowedTypes: ['line', 'point'] },
            { prompt: '(Optional) Select second point', allowedTypes: ['point'] },
        ],
    },

    vertical: {
        type: 'vertical',
        label: 'Vertical',
        description: 'Make a line vertical, or align two points vertically',
        icon: 'ArrowDown',
        minEntities: 1,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select a line or first point', allowedTypes: ['line', 'point'] },
            { prompt: '(Optional) Select second point', allowedTypes: ['point'] },
        ],
    },

    tangent: {
        type: 'tangent',
        label: 'Tangent',
        description: 'Make a line tangent to a circle/arc, or two curves tangent',
        icon: 'Route',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first entity (line, circle, or arc)', allowedTypes: ['line', 'circle', 'arc'] },
            { prompt: 'Select second entity (circle or arc)', allowedTypes: ['line', 'circle', 'arc'] },
        ],
    },

    parallel: {
        type: 'parallel',
        label: 'Parallel',
        description: 'Make two lines parallel',
        icon: 'AlignVerticalSpaceAround',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first line', allowedTypes: ['line'] },
            { prompt: 'Select second line', allowedTypes: ['line'] },
        ],
    },

    perpendicular: {
        type: 'perpendicular',
        label: 'Perpendicular',
        description: 'Make two lines perpendicular (90°)',
        icon: 'CornerDownRight',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first line', allowedTypes: ['line'] },
            { prompt: 'Select second line', allowedTypes: ['line'] },
        ],
    },

    equal: {
        type: 'equal',
        label: 'Equal',
        description: 'Make two lines equal length, or two circles/arcs equal radius',
        icon: 'Equal',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first line or circle', allowedTypes: ['line', 'circle', 'arc'] },
            { prompt: 'Select second line or circle (same type)', allowedTypes: ['line', 'circle', 'arc'] },
        ],
    },

    symmetric: {
        type: 'symmetric',
        label: 'Symmetric',
        description: 'Make two points symmetric about a mirror line',
        icon: 'FlipHorizontal',
        minEntities: 3,
        maxEntities: 3,
        selectionSteps: [
            { prompt: '① Select first point', allowedTypes: ['point'] },
            { prompt: '② Select second point (mirror of first)', allowedTypes: ['point'] },
            { prompt: '③ Select the symmetry line (axis)', allowedTypes: ['line'] },
        ],
    },

    midpoint: {
        type: 'midpoint',
        label: 'Midpoint',
        description: 'Constrain a point to lie at the midpoint of a line',
        icon: 'Crosshair',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select the point', allowedTypes: ['point'] },
            { prompt: 'Select the line', allowedTypes: ['line'] },
        ],
    },

    distance: {
        type: 'distance',
        label: 'Distance',
        description: 'Fix the distance between two points or along a line',
        icon: 'Ruler',
        minEntities: 1,
        maxEntities: 2,
        hasValue: true,
        selectionSteps: [
            { prompt: 'Select first point or a line', allowedTypes: ['point', 'line'] },
            { prompt: '(If point) Select second point', allowedTypes: ['point'] },
        ],
    },

    angle: {
        type: 'angle',
        label: 'Angle',
        description: 'Fix the angle between two lines',
        icon: 'MessageSquareWarning',
        minEntities: 2,
        maxEntities: 2,
        hasValue: true,
        selectionSteps: [
            { prompt: 'Select first line', allowedTypes: ['line'] },
            { prompt: 'Select second line', allowedTypes: ['line'] },
        ],
    },

    pointOnLine: {
        type: 'pointOnLine',
        label: 'Point on Line',
        description: 'Constrain a point to lie on a line',
        icon: 'Dot',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select the point', allowedTypes: ['point'] },
            { prompt: 'Select the line', allowedTypes: ['line'] },
        ],
    },

    pointOnCircle: {
        type: 'pointOnCircle',
        label: 'Point on Circle',
        description: 'Constrain a point to lie on a circle or arc',
        icon: 'Target',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select the point', allowedTypes: ['point'] },
            { prompt: 'Select the circle or arc', allowedTypes: ['circle', 'arc'] },
        ],
    },

    radius: {
        type: 'radius',
        label: 'Radius',
        description: 'Fix the radius of a circle or arc',
        icon: 'CircleDot',
        minEntities: 1,
        maxEntities: 1,
        hasValue: true,
        selectionSteps: [
            { prompt: 'Select a circle or arc', allowedTypes: ['circle', 'arc'] },
        ],
    },

    fixed: {
        type: 'fixed',
        label: 'Fixed',
        description: 'Lock entity position — prevents solver from moving it',
        icon: 'Lock',
        minEntities: 1,
        maxEntities: 10,
        selectionSteps: [
            { prompt: 'Select entities to lock', allowedTypes: ['point', 'line', 'circle', 'arc'] },
        ],
    },

    collinear: {
        type: 'collinear',
        label: 'Collinear',
        description: 'Make two lines lie on the same infinite line',
        icon: 'GripVertical',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first line', allowedTypes: ['line'] },
            { prompt: 'Select second line', allowedTypes: ['line'] },
        ],
    },

    concentric: {
        type: 'concentric',
        label: 'Concentric',
        description: 'Make two circles/arcs share the same center',
        icon: 'CircleDot',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first circle or arc', allowedTypes: ['circle', 'arc'] },
            { prompt: 'Select second circle or arc', allowedTypes: ['circle', 'arc'] },
        ],
    },

    equalRadius: {
        type: 'equalRadius',
        label: 'Equal Radius',
        description: 'Make two circles/arcs have equal radii',
        icon: 'CircleEqual',
        minEntities: 2,
        maxEntities: 2,
        selectionSteps: [
            { prompt: 'Select first circle or arc', allowedTypes: ['circle', 'arc'] },
            { prompt: 'Select second circle or arc', allowedTypes: ['circle', 'arc'] },
        ],
    },
};

// ==================== Validation Helpers ====================

/**
 * Validate a set of selected entities against a constraint's requirements.
 * Returns { valid, errorMessage } where errorMessage describes what's wrong.
 */
export function validateConstraintSelection(
    type: ConstraintType,
    entities: Array<{ id: string; type: EntityType }>,
): { valid: boolean; errorMessage?: string } {
    const meta = CONSTRAINT_META[type];
    if (!meta) {
        return { valid: false, errorMessage: `Unknown constraint type: ${type}` };
    }

    if (entities.length < meta.minEntities) {
        return {
            valid: false,
            errorMessage: buildRequirementMessage(meta),
        };
    }

    if (entities.length > meta.maxEntities) {
        return {
            valid: false,
            errorMessage: `${meta.label} requires at most ${meta.maxEntities} entities (got ${entities.length})`,
        };
    }

    // Type-specific validation
    switch (type) {
        case 'coincident':
            if (!entities.every(e => e.type === 'point'))
                return { valid: false, errorMessage: 'Coincident requires 2 points' };
            break;

        case 'horizontal':
        case 'vertical': {
            if (entities.length === 1 && entities[0].type !== 'line' && entities[0].type !== 'point')
                return { valid: false, errorMessage: `${meta.label} requires 1 line or 2 points` };
            if (entities.length === 2 && !entities.every(e => e.type === 'point'))
                return { valid: false, errorMessage: `${meta.label} with 2 entities requires 2 points` };
            break;
        }

        case 'parallel':
        case 'perpendicular':
        case 'collinear':
            if (!entities.every(e => e.type === 'line'))
                return { valid: false, errorMessage: `${meta.label} requires 2 lines` };
            break;

        case 'equal': {
            const allLines = entities.every(e => e.type === 'line');
            const allCircular = entities.every(e => e.type === 'circle' || e.type === 'arc');
            if (!allLines && !allCircular)
                return { valid: false, errorMessage: 'Equal requires 2 lines or 2 circles/arcs' };
            break;
        }

        case 'tangent': {
            const hasLineOrCircle = entities.some(e => e.type === 'line') || entities.every(e => e.type === 'circle' || e.type === 'arc');
            const hasCircular = entities.some(e => e.type === 'circle' || e.type === 'arc');
            if (!hasCircular)
                return { valid: false, errorMessage: 'Tangent requires at least one circle/arc' };
            break;
        }

        case 'symmetric': {
            const points = entities.filter(e => e.type === 'point');
            const lines = entities.filter(e => e.type === 'line');
            if (points.length !== 2 || lines.length !== 1)
                return { valid: false, errorMessage: 'Symmetric requires 2 points + 1 symmetry line' };
            break;
        }

        case 'midpoint':
        case 'pointOnLine': {
            const hasPoint = entities.some(e => e.type === 'point');
            const hasLine = entities.some(e => e.type === 'line');
            if (!hasPoint || !hasLine)
                return { valid: false, errorMessage: `${meta.label} requires 1 point + 1 line` };
            break;
        }

        case 'pointOnCircle': {
            const hasPoint = entities.some(e => e.type === 'point');
            const hasCircular = entities.some(e => e.type === 'circle' || e.type === 'arc');
            if (!hasPoint || !hasCircular)
                return { valid: false, errorMessage: 'Point on Circle requires 1 point + 1 circle/arc' };
            break;
        }

        case 'distance': {
            if (entities.length === 1 && entities[0].type !== 'line')
                return { valid: false, errorMessage: 'Distance requires 2 points or 1 line' };
            if (entities.length === 2 && !entities.every(e => e.type === 'point'))
                return { valid: false, errorMessage: 'Distance with 2 entities requires 2 points' };
            break;
        }

        case 'angle':
            if (!entities.every(e => e.type === 'line'))
                return { valid: false, errorMessage: 'Angle requires 2 lines' };
            break;

        case 'radius':
            if (!entities.every(e => e.type === 'circle' || e.type === 'arc'))
                return { valid: false, errorMessage: 'Radius requires a circle or arc' };
            break;

        case 'fixed':
            // Any entity type is acceptable
            break;

        case 'concentric':
        case 'equalRadius':
            if (!entities.every(e => e.type === 'circle' || e.type === 'arc'))
                return { valid: false, errorMessage: `${meta.label} requires 2 circles/arcs` };
            break;
    }

    return { valid: true };
}

/**
 * Build a human-readable instruction string from constraint meta.
 */
export function buildRequirementMessage(meta: ConstraintMeta): string {
    if (meta.selectionSteps.length === 1) {
        return meta.selectionSteps[0].prompt;
    }
    return meta.selectionSteps
        .map((step, i) => `${i + 1}. ${step.prompt}`)
        .join('\n');
}

/**
 * Get the next selection prompt for a partially-filled constraint.
 * @param type - constraint type
 * @param selectedSoFar - entities already selected
 * @returns The prompt for the next step, or null if selection is complete
 */
export function getNextSelectionPrompt(
    type: ConstraintType,
    selectedCount: number,
): string | null {
    const meta = CONSTRAINT_META[type];
    if (!meta) return null;

    if (selectedCount >= meta.maxEntities) return null;

    // For optional steps (like horizontal with 1 line), check if we already have enough
    if (selectedCount >= meta.minEntities) {
        const step = meta.selectionSteps[selectedCount];
        if (!step) return null;
        return step.prompt;
    }

    const step = meta.selectionSteps[selectedCount];
    if (!step) return null;
    return step.prompt;
}

/**
 * Check if an entity type is acceptable at the given selection step.
 */
export function isEntityAcceptableAtStep(
    type: ConstraintType,
    stepIndex: number,
    entityType: EntityType,
): boolean {
    const meta = CONSTRAINT_META[type];
    if (!meta) return false;
    const step = meta.selectionSteps[stepIndex];
    if (!step) return false;
    return step.allowedTypes.includes(entityType);
}

/**
 * Get a short summary string describing which entities a constraint connects.
 * Used for display in the object browser.
 */
export function getConstraintSummary(
    type: ConstraintType,
    entityLabels: string[],
    value?: number,
): string {
    const meta = CONSTRAINT_META[type];
    if (!meta) return type;

    const entityStr = entityLabels.join(' ↔ ');
    if (value !== undefined && meta.hasValue) {
        return `${meta.label}: ${entityStr} = ${value.toFixed(2)}`;
    }
    return `${meta.label}: ${entityStr}`;
}

/**
 * The document model (Stage 3 foundation).
 *
 * The target architecture makes a typed object graph the source of truth, with
 * the script becoming a generated *view* (see docs/architecture/TARGET_ARCHITECTURE.md,
 * D1). This module defines that graph's vocabulary: typed Properties, the
 * DocumentObject that holds them, and the LinkSub reference that points at
 * another object's sub-entities by their stable Stage-2 MappedNames.
 *
 * Nothing here is wired into the running app yet — it is the data model the
 * later increments build on. It is pure and fully unit-tested.
 */

// ── Expressions & numeric values (D10) ──────────────────────────────────────
//
// A numeric property is `number | Expression` from the very start, even though
// Expression evaluation is not implemented yet. Encoding this now avoids a
// painful retrofit once projects exist.

export interface Expression {
    /** the source text, e.g. "width / 2 + 3" */
    readonly expr: string;
}

export type Numeric = number | Expression;

export function isExpression(v: Numeric): v is Expression {
    return typeof v === 'object' && v !== null && 'expr' in v;
}

// ── Units (D10) ─────────────────────────────────────────────────────────────
//
// Values are stored canonically (mm, degrees — as OpenCascade uses). A length /
// angle property also carries the unit to DISPLAY in; conversion happens only at
// the UI boundary. See quantity.ts.

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in';
export type AngleUnit = 'deg' | 'rad';

// ── References ──────────────────────────────────────────────────────────────

/**
 * A durable reference to sub-entities of another object — the typed replacement
 * for the string id `"shape2:face-0"`. `subElements` are Stage-2 MappedNames, so
 * the reference survives regeneration.
 */
export interface LinkSub {
    objectId: string;
    /** stable MappedNames of the referenced faces/edges (empty = whole object) */
    subElements: string[];
}

// ── Properties ──────────────────────────────────────────────────────────────

export type Property =
    | { kind: 'length'; value: Numeric; unit: LengthUnit }   // canonical: mm
    | { kind: 'angle'; value: Numeric; unit: AngleUnit }     // canonical: deg
    | { kind: 'count'; value: number }                        // integer
    | { kind: 'bool'; value: boolean }
    | { kind: 'text'; value: string }
    | { kind: 'vec3'; value: [number, number, number] }
    | { kind: 'placement'; position: [number, number, number]; rotation: [number, number, number] }
    | { kind: 'linkSub'; links: LinkSub[] }
    | { kind: 'script'; body: string };                       // D1 escape hatch

export type PropertyKind = Property['kind'];

// Constructors — concise, typed, and the single place defaults live.
export const P = {
    length: (value: Numeric, unit: LengthUnit = 'mm'): Property => ({ kind: 'length', value, unit }),
    angle: (value: Numeric, unit: AngleUnit = 'deg'): Property => ({ kind: 'angle', value, unit }),
    count: (value: number): Property => ({ kind: 'count', value }),
    bool: (value: boolean): Property => ({ kind: 'bool', value }),
    text: (value: string): Property => ({ kind: 'text', value }),
    vec3: (value: [number, number, number]): Property => ({ kind: 'vec3', value }),
    placement: (
        position: [number, number, number] = [0, 0, 0],
        rotation: [number, number, number] = [0, 0, 0],
    ): Property => ({ kind: 'placement', position, rotation }),
    linkSub: (links: LinkSub[]): Property => ({ kind: 'linkSub', links }),
    script: (body: string): Property => ({ kind: 'script', body }),
};

// ── Document object ─────────────────────────────────────────────────────────

/**
 * One node in the document graph: a feature with typed properties. Its
 * dependencies are DERIVED from its linkSub properties (an object depends on
 * every object it links to), so the graph can never disagree with the data.
 */
export interface DocumentObject {
    id: string;
    /** feature type: 'box', 'fuse', 'fillet', 'sketch', 'script', … */
    type: string;
    label: string;
    properties: Record<string, Property>;
    /** true when this object (or something upstream) changed and needs recompute */
    touched: boolean;
}

/** Every object id this object links to (its dependencies), de-duplicated. */
export function derivedDependencies(obj: DocumentObject): string[] {
    const deps = new Set<string>();
    for (const prop of Object.values(obj.properties)) {
        if (prop.kind === 'linkSub') {
            for (const link of prop.links) deps.add(link.objectId);
        }
    }
    return [...deps];
}

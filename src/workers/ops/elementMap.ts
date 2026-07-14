/**
 * ElementMap (Stage 2b).
 *
 * The Topological Naming Problem in one sentence: OpenCascade identifies a face
 * by its position in an explorer walk (`Face3`), and that position shifts the
 * moment anything upstream changes — so a stored "Face3" selection silently
 * repoints. The ElementMap fixes it by giving every face a *derivation-based*
 * name that is reproduced identically whenever the model regenerates.
 *
 *   IndexedName  — the volatile OCCT index (the `faceId` we already mesh with).
 *   MappedName   — the stable name this module assigns/composes.
 *
 * A primitive's faces get *root* names (`shape1#F0` …). Every operation then
 * *composes* new names from its inputs using the `Modified`/`Generated` history
 * captured in `history.ts`: a face that was deformed keeps its name, a face that
 * passed through unchanged keeps its name, a genuinely new face gets a fresh one.
 * This is FreeCAD's ElementMap idea, hand-rolled on `BRepBuilderAPI` history —
 * deliberately NOT OCAF/TNaming, which this WASM build does not expose.
 *
 * The composition (`composeElementMap`) is pure data and fully unit-tested; the
 * OCCT-touching helpers (`rootElementMap`) are thin.
 */

import { hashOf, type OpHistory } from './history';

/** A stable, derivation-based face name. */
export type MappedName = string;

/** faceHash (this-session OCCT identity) → stable MappedName. */
export type ElementMap = Map<number, MappedName>;

/** Root name for face `index` of a freshly-created feature. */
export function rootFaceName(featureId: string, index: number): MappedName {
    return `${featureId}#F${index}`;
}

/**
 * An edge's stable name is composed from the names of the faces it borders — the
 * "combo name" idea from FreeCAD. Because face names are already stable, so is
 * this. The face names are sorted so the result is independent of iteration
 * order, and deduped so a seam edge (same face on both sides) collapses to one.
 *
 * @param adjacentFaceNames  the MappedNames of the faces meeting at the edge
 */
export function edgeComboName(adjacentFaceNames: MappedName[]): MappedName {
    const uniq = [...new Set(adjacentFaceNames.filter(Boolean))].sort();
    return `E[${uniq.join('~')}]`;
}

/** A stable-ish geometric signature of an edge, used only to break name ties. */
export interface EdgeGeom {
    /** representative point (midpoint / a point on the curve) */
    center: [number, number, number];
    length: number;
}

const roundK = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Order edges that share a combo name by a canonical geometric key, so each gets
 * a reproducible rank. Sorted by z, then y, then x, then length (z first so a
 * hole's top/bottom rim get a consistent order that survives a resize); ties
 * fall back to the session-stable hash.
 */
function rankByGeometry(edgeHashes: number[], edgeGeom?: Map<number, EdgeGeom>): number[] {
    return [...edgeHashes].sort((a, b) => {
        const ga = edgeGeom?.get(a);
        const gb = edgeGeom?.get(b);
        if (ga && gb) {
            const keys: [number, number][] = [
                [ga.center[2], gb.center[2]],
                [ga.center[1], gb.center[1]],
                [ga.center[0], gb.center[0]],
                [ga.length, gb.length],
            ];
            for (const [va, vb] of keys) {
                const d = roundK(va) - roundK(vb);
                if (Math.abs(d) > 1e-6) return d;
            }
        }
        return a - b;
    });
}

/**
 * Build an edge ElementMap (edgeHash → combo name) from an edge→adjacent-faces
 * adjacency and the shape's face map. Pure; the OCCT-touching adjacency and
 * geometry extraction live in the worker.
 *
 * A bare combo name (face pair) is NOT always unique — the same two faces can
 * meet at several disjoint edges (e.g. a hole's top and bottom rim both border
 * {sphere, cylinder}). When that happens we append a geometric rank `@k`, the
 * standard FreeCAD-style disambiguation. Single-occupancy names are left bare so
 * they stay maximally stable.
 *
 * @param edgeAdjacency  edgeHash → the hashes of the faces bordering it
 * @param faceMap        faceHash → face MappedName
 * @param edgeGeom       edgeHash → geometric signature, for tie-breaking
 */
export function buildEdgeMap(
    edgeAdjacency: Map<number, number[]>,
    faceMap: ElementMap,
    edgeGeom?: Map<number, EdgeGeom>,
): ElementMap {
    // 1. Base combo name per edge.
    const comboName = new Map<number, MappedName>();
    for (const [edgeHash, faceHashes] of edgeAdjacency) {
        const names = faceHashes
            .map(fh => faceMap.get(fh))
            .filter((n): n is MappedName => n !== undefined);
        if (names.length === 0) continue;
        comboName.set(edgeHash, edgeComboName(names));
    }

    // 2. Group by name to find collisions.
    const byName = new Map<MappedName, number[]>();
    for (const [edgeHash, name] of comboName) {
        const arr = byName.get(name);
        if (arr) arr.push(edgeHash);
        else byName.set(name, [edgeHash]);
    }

    // 3. Emit — bare name if unique, geometric rank suffix if colliding.
    const edgeMap: ElementMap = new Map();
    for (const [name, edgeHashes] of byName) {
        if (edgeHashes.length === 1) {
            edgeMap.set(edgeHashes[0], name);
            continue;
        }
        rankByGeometry(edgeHashes, edgeGeom).forEach((edgeHash, i) => {
            edgeMap.set(edgeHash, `${name}@${i}`);
        });
    }
    return edgeMap;
}

/**
 * Compose the result's ElementMap from its inputs' names and the operation's
 * face history. Pure — this is the algorithm the whole naming scheme rests on.
 *
 * @param inputMap          union of both inputs' faceHash → name
 * @param history           Modified/Generated/deleted, keyed by input faceHash
 * @param outputFaceHashes  the result's actual face hashes, in mesh order
 * @param op                operation tag, used only to label genuinely-new faces
 */
export function composeElementMap(
    inputMap: ElementMap,
    history: OpHistory,
    outputFaceHashes: number[],
    op: string,
): ElementMap {
    // Index the history by output hash first. Modified/Generated can reference
    // intermediate hashes that don't survive SimplifyResult, so we DON'T seed the
    // result map from them directly — we only consult them for hashes that are
    // actual result faces. This keeps the map exactly the size of the result.
    const modifiedName = new Map<number, MappedName>();
    for (const [inHash, outHashes] of history.modified) {
        const base = inputMap.get(inHash);
        if (base === undefined) continue;
        // 1:1 keeps the name; a split (1:many) disambiguates with a stable index.
        // (Index-based split disambiguation is order-dependent — harden with
        // geometry later.)
        outHashes.forEach((oh, i) => {
            modifiedName.set(oh, outHashes.length > 1 ? `${base}|${i}` : base);
        });
    }

    const generatedName = new Map<number, MappedName>();
    for (const [inHash, outHashes] of history.generated) {
        const base = inputMap.get(inHash);
        if (base === undefined) continue;
        outHashes.forEach((oh, i) => {
            if (!generatedName.has(oh)) generatedName.set(oh, `${base}+g${i}`);
        });
    }

    // Name each ACTUAL result face, by priority:
    //   modified > generated > passthrough (unchanged) > genuinely new.
    const out: ElementMap = new Map();
    let novel = 0;
    for (const oh of outputFaceHashes) {
        const name =
            modifiedName.get(oh) ??
            generatedName.get(oh) ??
            inputMap.get(oh) ??
            `${op}$N${novel++}`;
        out.set(oh, name);
    }

    return out;
}

// ── Per-shape registry ──────────────────────────────────────────────────────
//
// Maps live keyed by the shape object (WeakMap → GC'd with the shape). The worker
// additionally persists them by feature id so a cloned cache hit can re-attach
// its map (a clone does not carry WeakMap entries).

const mapByShape = new WeakMap<object, ElementMap>();

export function setElementMap(shape: object, map: ElementMap): void {
    if (shape && typeof shape === 'object') mapByShape.set(shape, map);
}

export function getElementMap(shape: object): ElementMap | undefined {
    return mapByShape.get(shape);
}

/**
 * Enumerate a shape's faces and assign root names by index. Used for freshly
 * created features that have no derivation history yet (primitives, imports).
 */
export function rootElementMap(shape: any, featureId: string): ElementMap {
    const map: ElementMap = new Map();
    const faces: any[] = Array.from(shape.faces);
    faces.forEach((face, i) => {
        try {
            map.set(hashOf(face.wrapped), rootFaceName(featureId, i));
        } catch {
            /* a face without a usable hash — skip */
        } finally {
            try { face.delete?.(); } catch { /* transient */ }
        }
    });
    return map;
}

/** The map already attached to a shape, or a freshly-built root map. */
export function elementMapOf(shape: any, featureId: string): ElementMap {
    return getElementMap(shape) ?? rootElementMap(shape, featureId);
}

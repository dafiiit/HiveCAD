/**
 * Edge/face feature operations with stable references (Stage 2c).
 *
 * Fillet, chamfer and shell each act on specific sub-entities the user picked.
 * The pick is stored as a stable MappedName (edge combo name, or face name), and
 * here we *resolve* that name back to the actual OCCT sub-entity on the current
 * shape before applying the operation. Because the name is reproduced identically
 * on every regeneration, the operation keeps targeting the right edge/face even
 * after upstream edits — that is the whole point of the ElementMap.
 *
 * The operation itself reuses replicad's own `fillet`/`chamfer`/`shell` (which
 * run their finder over the shape's own edges/faces without cloning), driven by
 * an `inList` of the resolved entities — so we get correct geometry without
 * re-implementing the OCCT builders. (Composing the *result's* ElementMap from
 * fillet history is a later refinement; results currently get fresh root names.)
 */

import { elementMapOf, buildEdgeMap, type EdgeGeom } from './elementMap';
import { hashOf } from './history';

/**
 * A geometric signature for an edge, used only to break combo-name ties. The
 * midpoint of start/end (for a closed edge, a point on the curve) plus length
 * distinguishes, e.g., a hole's two coaxial rims (same faces, different height).
 */
export function edgeGeomOf(edge: any): EdgeGeom {
    let center: [number, number, number] = [0, 0, 0];
    let length = 0;
    try {
        const sp = edge.startPoint;
        const ep = edge.endPoint;
        center = [(sp.x + ep.x) / 2, (sp.y + ep.y) / 2, (sp.z + ep.z) / 2];
        try { sp.delete?.(); ep.delete?.(); } catch { /* transient */ }
    } catch { /* keep origin */ }
    try { length = edge.length; } catch { /* keep 0 */ }
    return { center, length };
}

/** edgeHash → the hashes of the faces meeting at that edge, for the whole shape. */
function edgeFaceAdjacency(shape: any): Map<number, number[]> {
    const adjacency = new Map<number, number[]>();
    const faces: any[] = Array.from(shape.faces);
    for (const face of faces) {
        let faceHash: number;
        try { faceHash = hashOf(face.wrapped); } catch { try { face.delete?.(); } catch { /* */ } continue; }
        let faceEdges: any[] = [];
        try { faceEdges = Array.from(face.edges); } catch { /* face without edges */ }
        for (const fe of faceEdges) {
            try {
                const eh = hashOf(fe.wrapped);
                (adjacency.get(eh) ?? adjacency.set(eh, []).get(eh)!).push(faceHash);
            } catch { /* skip */ }
            finally { try { fe.delete?.(); } catch { /* */ } }
        }
        try { face.delete?.(); } catch { /* */ }
    }
    return adjacency;
}

/** Resolve edge combo-names to the actual edges of `shape` (caller disposes them). */
function resolveNamedEdges(shape: any, wanted: Set<string>): any[] {
    const faceMap = elementMapOf(shape, shape?._astId || 'anon');
    const adjacency = edgeFaceAdjacency(shape);

    // One pass over the edges: keep the first wrapper per hash and its geometry
    // (needed to reproduce the same tie-break ranking the mesh used).
    const byHash = new Map<number, any>();
    const geom = new Map<number, EdgeGeom>();
    for (const edge of Array.from(shape.edges) as any[]) {
        let h: number;
        try { h = hashOf(edge.wrapped); } catch { try { edge.delete?.(); } catch { /* */ } continue; }
        if (byHash.has(h)) { try { edge.delete?.(); } catch { /* */ } continue; }
        byHash.set(h, edge);
        geom.set(h, edgeGeomOf(edge));
    }

    const edgeMap = buildEdgeMap(adjacency, faceMap, geom);
    const wantedHashes = new Set<number>();
    for (const [edgeHash, name] of edgeMap) {
        if (wanted.has(name)) wantedHashes.add(edgeHash);
    }

    const result: any[] = [];
    for (const [h, edge] of byHash) {
        if (wantedHashes.has(h)) result.push(edge);
        else { try { edge.delete?.(); } catch { /* */ } }
    }
    return result;
}

/** Resolve face names to the actual faces of `shape` (caller disposes them). */
function resolveNamedFaces(shape: any, wanted: Set<string>): any[] {
    const faceMap = elementMapOf(shape, shape?._astId || 'anon');
    const result: any[] = [];
    const faces: any[] = Array.from(shape.faces);
    for (const face of faces) {
        let keep = false;
        try { keep = wanted.has(faceMap.get(hashOf(face.wrapped)) ?? ''); } catch { /* */ }
        if (keep) result.push(face);
        else { try { face.delete?.(); } catch { /* */ } }
    }
    return result;
}

const dispose = (items: any[]) => items.forEach(i => { try { i.delete?.(); } catch { /* */ } });

export function filletNamed(base: any, edgeNames: string[], radius: number): any {
    const edges = resolveNamedEdges(base, new Set(edgeNames));
    if (edges.length === 0) throw new Error(`Fillet: none of the selected edges were found on the current shape`);
    try {
        return base.fillet(radius, (e: any) => e.inList(edges));
    } finally { dispose(edges); }
}

export function chamferNamed(base: any, edgeNames: string[], distance: number): any {
    const edges = resolveNamedEdges(base, new Set(edgeNames));
    if (edges.length === 0) throw new Error(`Chamfer: none of the selected edges were found on the current shape`);
    try {
        return base.chamfer(distance, (e: any) => e.inList(edges));
    } finally { dispose(edges); }
}

export function shellNamed(base: any, faceNames: string[], thickness: number): any {
    const faces = resolveNamedFaces(base, new Set(faceNames));
    if (faces.length === 0) throw new Error(`Shell: none of the selected faces were found on the current shape`);
    try {
        return base.shell(thickness, (f: any) => f.inList(faces));
    } finally { dispose(faces); }
}

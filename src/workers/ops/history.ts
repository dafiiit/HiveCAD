/**
 * Operation history (Stage 2 foundation).
 *
 * When we run a boolean/fillet/etc. ourselves through raw OpenCascade, the
 * builder can tell us — for each face of each input — which face(s) of the
 * result it became (`Modified`), which new face(s) it spawned (`Generated`), and
 * whether it vanished (`IsDeleted`). That mapping is the raw material a stable
 * ElementMap is composed from (Stage 2b). Replicad throws it away because it
 * frees the builder inside the call; we keep it.
 *
 * Faces are keyed by OpenCascade's `TopoDS_Shape::HashCode`, which is stable for
 * a given shape instance within a session — enough to correlate an input face
 * with its descendants in the same operation. It is NOT a persistent identity
 * across regenerations; that is exactly what ElementMap will add on top.
 */

/** Matches replicad's `HASH_CODE_MAX`. */
export const HASH_MAX = 2147483647;

/** Hash of a raw `TopoDS_Shape` (its per-session identity). */
export function hashOf(rawShape: any): number {
    return rawShape.HashCode(HASH_MAX);
}

/**
 * Face-level derivation of one operation's result from its inputs.
 * All keys/values are face hash codes.
 */
export interface OpHistory {
    /** input face → result face(s) it turned into */
    modified: Map<number, number[]>;
    /** input face → result face(s) newly generated from it */
    generated: Map<number, number[]>;
    /** input faces that no longer exist in the result */
    deleted: Set<number>;
    /** the operation that produced this (e.g. "fuse", "cut") */
    operation: string;
}

/**
 * Result shape → the history that produced it. A WeakMap so a shape that gets
 * garbage-collected takes its history with it. Consumed by Stage 2b.
 */
const historyByShape = new WeakMap<object, OpHistory>();

export function recordHistory(shape: object, history: OpHistory): void {
    if (shape && typeof shape === 'object') historyByShape.set(shape, history);
}

export function getHistory(shape: object): OpHistory | undefined {
    return historyByShape.get(shape);
}

/**
 * Drain a `TopTools_ListOfShape` into an array of hash codes, deleting each
 * transient wrapper as we go. Destructive — the list is a throwaway the builder
 * hands us per query.
 */
export function drainListToHashes(list: any): number[] {
    const hashes: number[] = [];
    // NCollection list: First_1() reads the head, RemoveFirst() advances.
    while (list.Size() > 0) {
        const item = list.First_1();
        hashes.push(hashOf(item));
        try { item.delete?.(); } catch { /* transient */ }
        list.RemoveFirst();
    }
    return hashes;
}

/**
 * Read Modified/Generated/IsDeleted for every face of each input shape.
 * Must be called after `Build()` (and after `SimplifyResult`, if used — OCCT
 * keeps the history pointing at the simplified result).
 *
 * @param builder  a built BRepAlgoAPI_* / BRepBuilderAPI_MakeShape
 * @param inputs   the replicad input shapes (each exposes `.faces` and `.wrapped`)
 * @param track    register transient OCCT objects for disposal by the caller
 */
export function captureFaceHistory(
    builder: any,
    inputs: any[],
    operation: string,
    track: (o: any) => any,
): OpHistory {
    const modified = new Map<number, number[]>();
    const generated = new Map<number, number[]>();
    const deleted = new Set<number>();

    for (const input of inputs) {
        const faces: any[] = Array.from(input.faces);
        for (const face of faces) {
            try {
                const raw = face.wrapped;
                const h = hashOf(raw);

                if (builder.IsDeleted(raw)) {
                    deleted.add(h);
                    continue;
                }

                const mod = track(builder.Modified(raw));
                const modHashes = drainListToHashes(mod);
                if (modHashes.length) modified.set(h, modHashes);

                const gen = track(builder.Generated(raw));
                const genHashes = drainListToHashes(gen);
                if (genHashes.length) generated.set(h, genHashes);
            } catch {
                /* a face type that doesn't participate — skip it */
            } finally {
                try { face.delete?.(); } catch { /* transient */ }
            }
        }
    }

    return { modified, generated, deleted, operation };
}

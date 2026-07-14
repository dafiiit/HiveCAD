/**
 * Boolean operations owned by us (Stage 2 foundation).
 *
 * These reimplement replicad's `fuse`/`cut`/`intersect` on top of raw
 * OpenCascade so we can read the builder's `Modified`/`Generated`/`IsDeleted`
 * history before the builder is freed — the input replicad drops. Behaviour is
 * otherwise kept identical to replicad (same `SimplifyResult`, same glue
 * options) so routing existing `a.fuse(b)` calls through here is transparent.
 *
 * Kernel memory is managed explicitly: every transient OCCT object is tracked
 * and deleted in `finally`. The result shape is intentionally NOT tracked — it
 * outlives the builder, exactly as in replicad's own implementation.
 */

import { getOC, cast, isShape3D } from 'replicad';
import { captureFaceHistory, recordHistory, hashOf, type OpHistory } from './history';
import { composeElementMap, elementMapOf, setElementMap } from './elementMap';

/** Face hashes of a shape, in explorer order, disposing the transient wrappers. */
function faceHashes(shape: any): number[] {
    const faces: any[] = Array.from(shape.faces);
    const hashes: number[] = [];
    for (const face of faces) {
        try { hashes.push(hashOf(face.wrapped)); } catch { /* skip */ }
        finally { try { face.delete?.(); } catch { /* transient */ } }
    }
    return hashes;
}

export type BooleanOp = 'fuse' | 'cut' | 'intersect';

export interface BooleanOptions {
    /** replicad-compatible face-gluing hint for faster booleans on shared faces */
    optimisation?: 'none' | 'commonFace' | 'sameFace';
    /** unify coplanar faces/edges after the boolean (replicad does this by default) */
    simplify?: boolean;
}

export interface BooleanResult {
    shape: any;
    history: OpHistory;
}

/** Build the right BRepAlgoAPI_* builder for the op. */
function makeBuilder(oc: any, op: BooleanOp, a: any, b: any, progress: any): any {
    switch (op) {
        case 'fuse': return new oc.BRepAlgoAPI_Fuse_3(a, b, progress);
        case 'cut': return new oc.BRepAlgoAPI_Cut_3(a, b, progress);
        case 'intersect': return new oc.BRepAlgoAPI_Common_3(a, b, progress);
    }
}

/**
 * Run a boolean and capture its face history.
 *
 * @param base  the shape the operation is invoked on (`this` for `a.fuse(b)`)
 * @param tool  the other operand
 */
export function booleanWithHistory(
    op: BooleanOp,
    base: any,
    tool: any,
    { optimisation = 'none', simplify = true }: BooleanOptions = {},
): BooleanResult {
    const oc = getOC();
    const garbage: any[] = [];
    const track = <T>(o: T): T => { garbage.push(o); return o; };

    try {
        const progress = track(new oc.Message_ProgressRange_1());
        const builder = track(makeBuilder(oc, op, base.wrapped, tool.wrapped, progress));

        if (optimisation === 'commonFace') builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
        else if (optimisation === 'sameFace') builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);

        builder.Build(progress);
        // Match replicad's default post-processing. OCCT keeps the operation
        // history pointing at the simplified result, so we still read it after.
        if (simplify) builder.SimplifyResult(true, true, 1e-3);

        const history = captureFaceHistory(builder, [base, tool], op, track);

        const shape = cast(builder.Shape());
        if (!isShape3D(shape)) {
            throw new Error(`Boolean '${op}' did not produce a 3D shape`);
        }

        const resultFaceHashes = faceHashes(shape);

        // A boolean of non-overlapping bodies can yield an empty result — most
        // commonly an intersection with nothing in common, or a cut that removes
        // everything. Report that in the operation's own terms instead of letting
        // an empty shape render as "nothing happened".
        if (resultFaceHashes.length === 0) {
            throw new Error(
                op === 'intersect'
                    ? 'The selected bodies do not overlap — there is nothing to intersect'
                    : op === 'cut'
                        ? 'The cut removed the entire body — nothing remains'
                        : "The 'fuse' operation produced an empty result",
            );
        }

        recordHistory(shape, history);

        // Compose stable names for the result from the operands' names and this
        // operation's face history, and attach them to the result shape.
        const inputMap = new Map([
            ...elementMapOf(base, base?._astId || 'anonA'),
            ...elementMapOf(tool, tool?._astId || 'anonB'),
        ]);
        const elementMap = composeElementMap(inputMap, history, resultFaceHashes, op);
        setElementMap(shape, elementMap);

        console.log(
            `Ops: ${op} history — ${history.modified.size} modified, ` +
            `${history.generated.size} generated, ${history.deleted.size} deleted; ` +
            `named ${elementMap.size} result faces`
        );
        return { shape, history };
    } finally {
        for (const g of garbage) {
            try { g.delete?.(); } catch { /* already gone */ }
        }
    }
}

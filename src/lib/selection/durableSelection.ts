/**
 * Durable sub-entity selections (Stage 2b/2c).
 *
 * A selection id is `objId:face-N` or `objId:edge-N`, where N is the volatile
 * OCCT index that shifts whenever the model regenerates — so a stored selection
 * silently repoints to the wrong face/edge (the Topological Naming Problem, at
 * the selection layer). The fix: remember each selected entity's stable
 * MappedName (which the mesh now carries in `faceMapping[i].name` /
 * `edgeMapping[i].name`), and after every regeneration re-resolve the selection
 * to whichever index now carries that name.
 *
 * Vertex selections have no stable names yet, so they pass through untouched.
 */

interface SubMapping { faceId?: number; edgeId?: number; name?: string }
interface MappedObject {
    id: string;
    faceMapping?: SubMapping[];
    edgeMapping?: SubMapping[];
}

type Kind = 'face' | 'edge';

/** Parse a sub-entity selection id into its parts, or null if it isn't one. */
function parse(selectionId: string): { objId: string; kind: Kind; index: number } | null {
    for (const kind of ['face', 'edge'] as Kind[]) {
        const sep = `:${kind}-`;
        if (selectionId.includes(sep)) {
            const [objId, idxStr] = selectionId.split(sep);
            return { objId, kind, index: parseInt(idxStr, 10) };
        }
    }
    return null;
}

const mappingFor = (obj: MappedObject | undefined, kind: Kind): SubMapping[] | undefined =>
    kind === 'face' ? obj?.faceMapping : obj?.edgeMapping;

const indexOf = (entry: SubMapping, kind: Kind): number | undefined =>
    kind === 'face' ? entry.faceId : entry.edgeId;

/** The stable MappedName of a face/edge selection, if the mesh has one. */
export function selectionNameOf(selectionId: string, objects: MappedObject[]): string | undefined {
    const p = parse(selectionId);
    if (!p) return undefined;
    const obj = objects.find(o => o.id === p.objId);
    return mappingFor(obj, p.kind)?.find(m => indexOf(m, p.kind) === p.index)?.name;
}

export interface Reconciliation {
    selectedIds: Set<string>;
    /** selectionId → MappedName, pruned to the surviving selections */
    selectionNames: Map<string, string>;
    changed: boolean;
}

/**
 * Re-resolve face/edge selections against regenerated geometry.
 * - an entity whose name is found at a new index → the selection id is rewritten;
 * - an entity whose name is gone → the selection is dropped;
 * - non-sub-entity selections, and ones with no recorded name, are kept as-is.
 */
export function reconcileFaceSelections(
    selectedIds: Set<string>,
    selectionNames: Map<string, string>,
    objects: MappedObject[],
): Reconciliation {
    const nextSelected = new Set<string>();
    const nextNames = new Map<string, string>();
    let changed = false;

    for (const selId of selectedIds) {
        const p = parse(selId);
        const name = selectionNames.get(selId);
        if (!p || !name) {
            // Not a named sub-entity selection — leave it alone.
            nextSelected.add(selId);
            continue;
        }

        const obj = objects.find(o => o.id === p.objId);
        const entry = mappingFor(obj, p.kind)?.find(m => m.name === name);
        if (!entry) {
            changed = true; // the named entity no longer exists — drop it
            continue;
        }

        const newId = `${p.objId}:${p.kind}-${indexOf(entry, p.kind)}`;
        nextSelected.add(newId);
        nextNames.set(newId, name);
        if (newId !== selId) changed = true;
    }

    return { selectedIds: nextSelected, selectionNames: nextNames, changed };
}

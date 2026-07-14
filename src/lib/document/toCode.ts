/**
 * Document → Code generator (Stage 3, increment 4a).
 *
 * The inverse of fromCode.ts: renders the typed Document back into an executable
 * script. This is the enabler for the D1 flip — once the Document is the source
 * of truth, this is how the worker gets code to run. Fully-modelled features
 * (primitives, booleans, fillet/chamfer/shell) are regenerated from their typed
 * properties; everything else (sketches, extrudes, hand-written nodes) is emitted
 * from its preserved verbatim `body`, so a code → doc → code round-trip is
 * lossless.
 *
 * Not wired into the app yet — the actual truth-flip (store holds the Document,
 * tools mutate it) is the next, larger step.
 */

import { Document } from './document';
import { resolveNumeric } from './quantity';
import { DocumentObject, Property } from './types';

function lengthVal(p: Property | undefined, fallback = 0): number {
    return p && p.kind === 'length' ? resolveNumeric(p.value) : fallback;
}

function linkList(p: Property | undefined): { objectId: string; subElements: string[] }[] {
    return p && p.kind === 'linkSub' ? p.links : [];
}

function scriptBody(obj: DocumentObject): string | undefined {
    const p = obj.properties.body;
    return p && p.kind === 'script' ? p.body : undefined;
}

/** The right-hand side of `const <id> = …` for one object. */
export function exprFor(obj: DocumentObject): string {
    switch (obj.type) {
        // Primitives are `replicad.*` calls — the prefix is required for the code
        // to resolve in the worker (bare `makeBaseBox` is undefined there).
        case 'box':
            return `replicad.makeBaseBox(${lengthVal(obj.properties.width)}, ${lengthVal(obj.properties.depth)}, ${lengthVal(obj.properties.height)})`;
        case 'cylinder':
            return `replicad.makeCylinder(${lengthVal(obj.properties.radius)}, ${lengthVal(obj.properties.height)})`;
        case 'sphere':
            return `replicad.makeSphere(${lengthVal(obj.properties.radius)})`;

        case 'fuse':
        case 'cut':
        case 'intersect': {
            const ids = linkList(obj.properties.operands).map(l => l.objectId);
            if (ids.length < 2) return scriptBody(obj) ?? ids[0] ?? 'null';
            const [primary, ...rest] = ids;
            return rest.reduce((acc, id) => `${acc}.${obj.type}(${id})`, primary);
        }

        case 'fillet':
        case 'chamfer':
        case 'shell': {
            const link = linkList(obj.properties.base)[0];
            const amountKey = obj.type === 'shell' ? 'thickness' : obj.type === 'chamfer' ? 'distance' : 'radius';
            const amount = lengthVal(obj.properties[amountKey]);
            const names = link ? link.subElements : [];
            return `__${obj.type}(${link?.objectId ?? 'null'}, [${names.map(n => JSON.stringify(n)).join(', ')}], ${amount})`;
        }

        default:
            // sketch / extrusion / revolve / script — emit the preserved source.
            return scriptBody(obj) ?? 'null';
    }
}

/**
 * Objects that main() returns (the rendered bodies): the DAG sinks — those no
 * other object consumes. A consumed operand (boolean input, fillet base) has a
 * dependent and is therefore not returned.
 */
export function tipObjects(doc: Document): string[] {
    return doc.all().filter(o => doc.dependents(o.id).length === 0).map(o => o.id);
}

/** Render the whole Document as an executable `main()` script. */
export function generateCode(doc: Document): string {
    const lines = doc.recomputeOrder().map(id => {
        const obj = doc.getObject(id)!;
        return `  const ${id} = ${exprFor(obj)};`;
    });
    const tips = tipObjects(doc);
    return `const main = () => {\n${lines.join('\n')}\n  return [${tips.join(', ')}];\n};`;
}

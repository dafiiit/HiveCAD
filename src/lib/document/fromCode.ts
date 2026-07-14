/**
 * Code → Document parser (Stage 3, increment 2).
 *
 * Builds a typed Document from the current script by interpreting the feature
 * declarations the CodeManager already extracts. This is the principled
 * replacement for the ad-hoc `lastOpName.includes('box')` guessing (W1): every
 * recognised feature becomes a DocumentObject with a real type and typed
 * properties, and anything unrecognised becomes an opaque `script` node rather
 * than being mislabelled.
 *
 * For now the Document is DERIVED from code (code is still the source of truth).
 * Later increments flip that: the Document becomes truth and code is generated.
 */

import { parse } from '@babel/parser';
import generateBabel from '@babel/generator';
import { CodeManager, type FeatureNode } from '../code-manager';
import { Document } from './document';
import { P, type DocumentObject, type LinkSub, type Property } from './types';

// Workaround for the babel default-export interop (matches code-manager).
const generate = (generateBabel as any).default || generateBabel;

/**
 * Verbatim source of a feature's initializer, e.g. `makeBaseBox(10, 10, 10)`.
 * Used as the `script` body for features the model doesn't fully regenerate
 * (sketches, extrudes, hand-written code), so a Document → Code round-trip is
 * lossless for them.
 */
function sourceExprOf(feature: FeatureNode): string {
    const init = feature.path?.node?.init;
    if (!init) return feature.id;
    try {
        return generate(init).code;
    } catch {
        return feature.id;
    }
}

/** Babel arg node → a plain value, or `{ ref }` for an identifier reference. */
function argValue(node: any): any {
    if (!node) return undefined;
    switch (node.type) {
        case 'NumericLiteral': return node.value;
        case 'StringLiteral': return node.value;
        case 'BooleanLiteral': return node.value;
        case 'UnaryExpression':
            return node.operator === '-' ? -argValue(node.argument) : argValue(node.argument);
        case 'ArrayExpression': return node.elements.map(argValue);
        case 'Identifier': return { ref: node.name };
        default: return undefined;
    }
}

const num = (v: any, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const refOf = (v: any): string | undefined => (v && typeof v === 'object' && 'ref' in v ? v.ref : undefined);

// Only the primitives that are real replicad functions AND that the generator
// can reproduce as `replicad.*` calls. Torus/coil are drawCircle+revolve chains,
// so they fall through to verbatim `script` bodies (round-trip-safe) instead.
const PRIMITIVE_TYPE: Record<string, string> = {
    makeBaseBox: 'box',
    makeBox: 'box',
    makeCylinder: 'cylinder',
    makeSphere: 'sphere',
};

const BOOLEAN_OPS = new Set(['fuse', 'cut', 'intersect']);
const SKETCH_OPS = new Set([
    'draw', 'drawRectangle', 'drawRoundedRectangle', 'drawCircle', 'drawEllipse',
    'drawPolysides', 'sketchRectangle', 'sketchCircle', 'sketchRoundedRectangle',
    'sketchOnPlane', 'lineTo', 'line', 'vLine', 'hLine', 'close',
]);

const obj = (id: string, type: string, properties: Record<string, Property>): DocumentObject => ({
    id,
    type,
    label: `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
    properties,
    touched: false,
});

function primitiveObject(id: string, type: string, args: any[]): DocumentObject {
    const v = args.map(argValue);
    switch (type) {
        case 'box':
            return obj(id, 'box', { width: P.length(num(v[0], 10)), depth: P.length(num(v[1], 10)), height: P.length(num(v[2], 10)) });
        case 'cylinder':
            return obj(id, 'cylinder', { radius: P.length(num(v[0], 5)), height: P.length(num(v[1], 10)) });
        case 'sphere':
            return obj(id, 'sphere', { radius: P.length(num(v[0], 5)) });
        default:
            return obj(id, type, {});
    }
}

/** `__fillet` / `__chamfer` / `__shell` — base link + named sub-entities + amount. */
function referenceOpObject(id: string, fnName: string, args: any[]): DocumentObject {
    const type = fnName.replace(/^__/, ''); // fillet | chamfer | shell
    const baseId = refOf(argValue(args[0])) ?? '';
    const names: string[] = (argValue(args[1]) ?? []).filter((n: any) => typeof n === 'string');
    const amount = num(argValue(args[2]), 1);
    const link: LinkSub = { objectId: baseId, subElements: names };
    const amountKey = type === 'shell' ? 'thickness' : type === 'chamfer' ? 'distance' : 'radius';
    return obj(id, type, { base: P.linkSub([link]), [amountKey]: P.length(amount) });
}

/** `a.fuse(b).fuse(c)` — primary is the source, operands are the op args. */
function booleanObject(feature: FeatureNode): DocumentObject {
    const lastOp = feature.operations[feature.operations.length - 1].name;
    const operandIds: string[] = [];
    if (feature.source && feature.source !== 'replicad') operandIds.push(feature.source);
    for (const op of feature.operations) {
        if (BOOLEAN_OPS.has(op.name)) {
            const ref = refOf(argValue(op.args[0]));
            if (ref) operandIds.push(ref);
        }
    }
    const links = [...new Set(operandIds)].map(objectId => ({ objectId, subElements: [] }));
    return obj(feature.id, lastOp, { operands: P.linkSub(links) });
}

/** Interpret one CodeManager feature into a typed DocumentObject. */
function toDocumentObject(feature: FeatureNode): DocumentObject {
    const ops = feature.operations;
    if (ops.length === 0) {
        return obj(feature.id, 'script', { body: P.script(feature.source || feature.id) });
    }
    const opNames = ops.map(o => o.name);
    const last = ops[ops.length - 1];

    // A primitive constructor as the only/base op.
    const primitive = PRIMITIVE_TYPE[ops[0].name];
    if (primitive && ops.length === 1) {
        return primitiveObject(feature.id, primitive, ops[0].args);
    }

    // Owned edge/face feature ops.
    if (last.name === '__fillet' || last.name === '__chamfer' || last.name === '__shell') {
        return referenceOpObject(feature.id, last.name, last.args);
    }

    // Booleans.
    if (opNames.some(n => BOOLEAN_OPS.has(n))) {
        return booleanObject(feature);
    }

    // Extrude / revolve — typed for the tree, but the geometry chain isn't fully
    // modelled, so keep the verbatim body for lossless regeneration.
    if (opNames.includes('extrude')) {
        const link = feature.source ? [{ objectId: feature.source, subElements: [] }] : [];
        return obj(feature.id, 'extrusion', { profile: P.linkSub(link), body: P.script(sourceExprOf(feature)) });
    }
    if (opNames.includes('revolve')) {
        const link = feature.source ? [{ objectId: feature.source, subElements: [] }] : [];
        return obj(feature.id, 'revolve', { profile: P.linkSub(link), body: P.script(sourceExprOf(feature)) });
    }

    // Sketch-like chains.
    if (opNames.some(n => SKETCH_OPS.has(n))) {
        const planeOp = ops.find(o => o.name === 'sketchOnPlane');
        const plane = planeOp && planeOp.args[0]?.type === 'StringLiteral' ? planeOp.args[0].value : 'XY';
        return obj(feature.id, 'sketch', { plane: P.text(plane), body: P.script(sourceExprOf(feature)) });
    }

    // Unrecognised: an opaque script node (the D1 escape hatch), not a guess.
    return obj(feature.id, 'script', { body: P.script(sourceExprOf(feature)) });
}

/** Build a Document from already-parsed CodeManager features. */
export function documentFromFeatures(features: FeatureNode[]): Document {
    const doc = new Document();
    for (const feature of features) {
        if (!doc.has(feature.id)) doc.addObject(toDocumentObject(feature));
    }
    return doc;
}

/** Build a Document from source code (convenience — parses via CodeManager). */
export function parseDocument(code: string): Document {
    return documentFromFeatures(new CodeManager(code).getFeatures());
}

/**
 * Whether `code` is a flat feature program the Document can fully represent and
 * losslessly regenerate: exactly one top-level `main` (arrow or function), whose
 * body is only single-declarator `const` declarations plus an optional return.
 *
 * This is the safety gate for the D1 flip. Imperative code — a `function main`
 * with loops, reassignments (`box = box.shell(...)`), module-scope helpers, or a
 * base64 import loop — is NOT flat, so it stays code-as-truth and is never fed
 * through the (lossy for that shape) document round-trip.
 */
export function isFlatFeatureProgram(code: string): boolean {
    let ast: any;
    try {
        ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    } catch {
        return false;
    }

    const body = ast.program.body;
    let mainBody: any[] | null = null;

    for (const stmt of body) {
        if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === 'main') {
            mainBody = stmt.body.body;
        } else if (
            stmt.type === 'VariableDeclaration' &&
            stmt.declarations.length === 1 &&
            stmt.declarations[0].id.type === 'Identifier' &&
            stmt.declarations[0].id.name === 'main' &&
            (stmt.declarations[0].init?.type === 'ArrowFunctionExpression' ||
                stmt.declarations[0].init?.type === 'FunctionExpression') &&
            stmt.declarations[0].init.body.type === 'BlockStatement'
        ) {
            mainBody = stmt.declarations[0].init.body.body;
        } else {
            return false; // any other top-level statement (helper, const, …) → not flat
        }
    }

    if (!mainBody) return false;

    let returns = 0;
    for (const stmt of mainBody) {
        if (stmt.type === 'ReturnStatement') { returns++; continue; }
        const isFlatConst =
            stmt.type === 'VariableDeclaration' &&
            stmt.kind === 'const' &&
            stmt.declarations.length === 1 &&
            stmt.declarations[0].id.type === 'Identifier' &&
            !!stmt.declarations[0].init;
        if (!isFlatConst) return false; // if / for / reassignment / … → not flat
    }
    return returns <= 1;
}

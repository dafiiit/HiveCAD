/**
 * Document ⇄ code synchronisation (Stage 3, increment 4b — the D1 flip).
 *
 * The store now carries a `document` that is the source of truth WHEN the code is
 * a flat feature program (`isFlatFeatureProgram`). In that case a tool mutation
 * regenerates the code from the document (`code = generateCode(document)`), so
 * the typed graph — not the string — is authoritative.
 *
 * When the code is imperative (Gridfinity-class: `function main`, loops,
 * reassignments, module helpers, base64 imports), it CANNOT be represented and
 * would be destroyed by a round-trip, so it stays code-as-truth (`document =
 * null`) and is never regenerated. This gate is what makes the flip safe.
 */

import { Document } from './document';
import { isFlatFeatureProgram, parseDocument } from './fromCode';
import { generateCode } from './toCode';

export interface CodeState {
    code: string;
    document: Document | null;
}

/** Compare two documents by their salient content (ids, types, properties). */
function equivalent(a: Document, b: Document): boolean {
    if (a.size !== b.size) return false;
    for (const obj of a.all()) {
        const other = b.getObject(obj.id);
        if (!other || other.type !== obj.type) return false;
        if (JSON.stringify(other.properties) !== JSON.stringify(obj.properties)) return false;
    }
    return true;
}

/**
 * Derive the authoritative state from raw code produced by a tool.
 *
 * If the code is flat AND regenerating from the parsed document reproduces the
 * same document, the document becomes the source of truth and the code is
 * replaced by the regenerated (normalised) form. Otherwise the raw code stays
 * authoritative and `document` is null. The re-parse check is belt-and-braces:
 * we never adopt a document that wouldn't round-trip.
 */
export function deriveFromToolCode(rawCode: string): CodeState {
    if (!isFlatFeatureProgram(rawCode)) return { code: rawCode, document: null };
    try {
        const document = parseDocument(rawCode);
        const regenerated = generateCode(document);
        if (isFlatFeatureProgram(regenerated) && equivalent(document, parseDocument(regenerated))) {
            return { code: regenerated, document };
        }
    } catch {
        /* fall through to code-as-truth */
    }
    return { code: rawCode, document: null };
}

/**
 * Derive state from a raw code EDIT (Monaco, project load, undo). Here the code
 * the user/history provided is authoritative and preserved verbatim — comments
 * and formatting intact — while `document` is kept in sync as a derived view
 * (null when the code isn't representable). This is the code-first escape hatch.
 */
export function deriveFromCodeEdit(rawCode: string): CodeState {
    if (!isFlatFeatureProgram(rawCode)) return { code: rawCode, document: null };
    try {
        return { code: rawCode, document: parseDocument(rawCode) };
    } catch {
        return { code: rawCode, document: null };
    }
}

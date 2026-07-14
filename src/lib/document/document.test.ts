import { describe, it, expect } from 'vitest';
import { Document } from './document';
import { P, derivedDependencies, type DocumentObject } from './types';

/** A box-like leaf object with no dependencies. */
const leaf = (id: string): DocumentObject => ({
    id,
    type: 'box',
    label: id,
    properties: { width: P.length(10), height: P.length(10), depth: P.length(10) },
    touched: false,
});

/** An object that links to (depends on) other objects via a linkSub property. */
const derived = (id: string, type: string, deps: string[]): DocumentObject => ({
    id,
    type,
    label: id,
    properties: { operands: P.linkSub(deps.map(objectId => ({ objectId, subElements: [] }))) },
    touched: false,
});

describe('derivedDependencies', () => {
    it('extracts dependencies from linkSub properties', () => {
        expect(derivedDependencies(derived('f', 'fuse', ['a', 'b']))).toEqual(['a', 'b']);
    });

    it('returns none for a leaf', () => {
        expect(derivedDependencies(leaf('a'))).toEqual([]);
    });

    it('dedupes repeated links', () => {
        const obj = derived('f', 'fillet', ['a', 'a']);
        expect(derivedDependencies(obj)).toEqual(['a']);
    });
});

describe('Document dependencies', () => {
    it('reports direct dependencies and dependents', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(leaf('b'));
        doc.addObject(derived('c', 'fuse', ['a', 'b']));

        expect(doc.dependencies('c').sort()).toEqual(['a', 'b']);
        expect(doc.dependents('a')).toEqual(['c']);
        expect(doc.dependents('c')).toEqual([]);
    });

    it('ignores links to objects that do not exist', () => {
        const doc = new Document();
        doc.addObject(derived('c', 'fillet', ['ghost']));
        expect(doc.dependencies('c')).toEqual([]);
    });

    it('rejects duplicate ids', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        expect(() => doc.addObject(leaf('a'))).toThrow(/already has/);
    });
});

describe('Document.recomputeOrder', () => {
    it('orders dependencies before dependents', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(leaf('b'));
        doc.addObject(derived('c', 'fuse', ['a', 'b']));
        doc.addObject(derived('d', 'fillet', ['c']));

        const order = doc.recomputeOrder();
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
        expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
        expect(order).toHaveLength(4);
    });

    it('is deterministic (insertion order breaks ties)', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(leaf('b'));
        doc.addObject(leaf('c'));
        expect(doc.recomputeOrder()).toEqual(['a', 'b', 'c']);
    });

    it('throws on a dependency cycle', () => {
        const doc = new Document();
        doc.addObject(derived('a', 'fuse', ['b']));
        doc.addObject(derived('b', 'fuse', ['a']));
        expect(() => doc.recomputeOrder()).toThrow(/cycle/);
    });
});

describe('Document.touch propagation', () => {
    it('marks the object and everything downstream', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(leaf('b'));
        doc.addObject(derived('c', 'fuse', ['a', 'b']));
        doc.addObject(derived('d', 'fillet', ['c']));

        doc.touch('a');

        // a → c → d touched; b untouched (not downstream of a).
        expect(doc.getObject('a')!.touched).toBe(true);
        expect(doc.getObject('c')!.touched).toBe(true);
        expect(doc.getObject('d')!.touched).toBe(true);
        expect(doc.getObject('b')!.touched).toBe(false);
    });

    it('touchedObjects returns them in recompute order', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(derived('c', 'fuse', ['a']));
        doc.addObject(derived('d', 'fillet', ['c']));

        doc.touch('a');
        expect(doc.touchedObjects()).toEqual(['a', 'c', 'd']);
    });

    it('clearTouched resets all flags', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.touch('a');
        doc.clearTouched();
        expect(doc.getObject('a')!.touched).toBe(false);
    });

    it('does not loop forever on a diamond dependency', () => {
        // a → b, a → c, b → d, c → d
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(derived('b', 'fillet', ['a']));
        doc.addObject(derived('c', 'fillet', ['a']));
        doc.addObject(derived('d', 'fuse', ['b', 'c']));

        doc.touch('a');
        expect(doc.getObject('d')!.touched).toBe(true);
    });
});

describe('Document removal', () => {
    it('removes an object and drops it from ordering', () => {
        const doc = new Document();
        doc.addObject(leaf('a'));
        doc.addObject(leaf('b'));
        doc.removeObject('a');
        expect(doc.has('a')).toBe(false);
        expect(doc.all().map(o => o.id)).toEqual(['b']);
    });
});

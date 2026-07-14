/**
 * The Document — the object graph and its dependency DAG (Stage 3 foundation).
 *
 * This is Layer 3/4 of the target architecture: a typed graph of DocumentObjects
 * plus the machinery to recompute them in the right order and to propagate
 * "touched" downstream when one changes. It mirrors what dependency-graph.ts does
 * for the code string today, but over the typed model instead of parsed text.
 *
 * Dependencies are DERIVED from each object's linkSub properties, so the graph is
 * always consistent with the data — there is no separate edge list to keep in sync.
 */

import { DocumentObject, derivedDependencies } from './types';

export class Document {
    private objects = new Map<string, DocumentObject>();
    /** creation order; used as a stable tiebreaker and for diff-friendly output */
    private insertionOrder: string[] = [];

    // ── Mutation ────────────────────────────────────────────────────────────

    addObject(obj: DocumentObject): void {
        if (this.objects.has(obj.id)) {
            throw new Error(`Document already has an object with id "${obj.id}"`);
        }
        this.objects.set(obj.id, obj);
        this.insertionOrder.push(obj.id);
    }

    removeObject(id: string): void {
        if (!this.objects.delete(id)) return;
        this.insertionOrder = this.insertionOrder.filter(x => x !== id);
    }

    getObject(id: string): DocumentObject | undefined {
        return this.objects.get(id);
    }

    has(id: string): boolean {
        return this.objects.has(id);
    }

    get size(): number {
        return this.objects.size;
    }

    /** Objects in insertion order. */
    all(): DocumentObject[] {
        return this.insertionOrder.map(id => this.objects.get(id)!);
    }

    // ── Dependencies ──────────────────────────────────────────────────────────

    /** Ids this object directly depends on that actually exist in the document. */
    dependencies(id: string): string[] {
        const obj = this.objects.get(id);
        if (!obj) return [];
        return derivedDependencies(obj).filter(dep => this.objects.has(dep));
    }

    /** Ids that directly depend on this object. */
    dependents(id: string): string[] {
        const result: string[] = [];
        for (const other of this.insertionOrder) {
            if (other !== id && this.dependencies(other).includes(id)) result.push(other);
        }
        return result;
    }

    // ── Recompute ordering ────────────────────────────────────────────────────

    /**
     * Topological order for recomputation (dependencies before dependents), via
     * Kahn's algorithm. Ties are broken by insertion order for determinism.
     * Throws on a dependency cycle — the document graph must be acyclic.
     */
    recomputeOrder(): string[] {
        const inDegree = new Map<string, number>();
        for (const id of this.insertionOrder) inDegree.set(id, this.dependencies(id).length);

        // Seed with zero-dependency nodes, in insertion order.
        const queue = this.insertionOrder.filter(id => inDegree.get(id) === 0);
        const order: string[] = [];

        while (queue.length > 0) {
            const id = queue.shift()!;
            order.push(id);
            // Relax dependents, preserving insertion order among newly-freed nodes.
            const freed: string[] = [];
            for (const dep of this.dependents(id)) {
                const d = inDegree.get(dep)! - 1;
                inDegree.set(dep, d);
                if (d === 0) freed.push(dep);
            }
            freed.sort((a, b) => this.insertionOrder.indexOf(a) - this.insertionOrder.indexOf(b));
            queue.push(...freed);
        }

        if (order.length !== this.objects.size) {
            throw new Error('Document has a dependency cycle');
        }
        return order;
    }

    // ── Touched-set propagation ────────────────────────────────────────────────

    /** Mark an object and everything transitively downstream as touched. */
    touch(id: string): void {
        const stack = [id];
        const seen = new Set<string>();
        while (stack.length > 0) {
            const cur = stack.pop()!;
            if (seen.has(cur)) continue;
            seen.add(cur);
            const obj = this.objects.get(cur);
            if (obj) obj.touched = true;
            stack.push(...this.dependents(cur));
        }
    }

    /** Touched objects, in recompute order (what a regeneration would rebuild). */
    touchedObjects(): string[] {
        return this.recomputeOrder().filter(id => this.objects.get(id)?.touched);
    }

    /** Clear touched flags (after a successful recompute). */
    clearTouched(): void {
        for (const obj of this.objects.values()) obj.touched = false;
    }
}

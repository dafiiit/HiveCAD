/**
 * Tests for Dependency Graph and Incremental Execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    DependencyGraph,
    getDependencyGraph,
    resetDependencyGraph,
    mergeExecutionResults,
} from './dependency-graph';

describe('DependencyGraph', () => {
    let graph: DependencyGraph;

    beforeEach(() => {
        resetDependencyGraph();
        graph = new DependencyGraph();
    });

    afterEach(() => {
        resetDependencyGraph();
    });

    describe('analyze', () => {
        it('should identify features with no dependencies', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const cylinder1 = replicad.makeCylinder(5, 20);
            `;

            const result = graph.analyze(code);

            expect(result.nodes.size).toBe(2);
            expect(result.nodes.get('box1')?.dependencies.size).toBe(0);
            expect(result.nodes.get('cylinder1')?.dependencies.size).toBe(0);
        });

        it('should identify dependencies between features', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
                const box3 = box2.chamfer(0.5);
            `;

            const result = graph.analyze(code);

            expect(result.nodes.size).toBe(3);
            expect(result.nodes.get('box1')?.dependencies.size).toBe(0);
            expect(result.nodes.get('box2')?.dependencies.has('box1')).toBe(true);
            expect(result.nodes.get('box3')?.dependencies.has('box2')).toBe(true);
        });

        it('should build dependents mapping', () => {
            const code = `
                const base = replicad.makeBox(10, 10, 10);
                const fillet1 = base.fillet(1);
                const fillet2 = base.fillet(2);
            `;

            const result = graph.analyze(code);

            expect(result.nodes.get('base')?.dependents.has('fillet1')).toBe(true);
            expect(result.nodes.get('base')?.dependents.has('fillet2')).toBe(true);
        });

        it('should detect complex dependency chains', () => {
            const code = `
                const a = replicad.makeBox(10, 10, 10);
                const b = a.fillet(1);
                const c = replicad.makeCylinder(5, 10);
                const d = b.fuse(c);
                const e = d.chamfer(0.5);
            `;

            const result = graph.analyze(code);

            // d depends on both b and c
            expect(result.nodes.get('d')?.dependencies.has('b')).toBe(true);
            expect(result.nodes.get('d')?.dependencies.has('c')).toBe(true);

            // e depends on d
            expect(result.nodes.get('e')?.dependencies.has('d')).toBe(true);
        });

        it('should provide topologically sorted execution order', () => {
            const code = `
                const a = replicad.makeBox(10, 10, 10);
                const b = a.fillet(1);
                const c = b.chamfer(0.5);
            `;

            const result = graph.analyze(code);

            // a should come before b, b before c
            const aIndex = result.executionOrder.indexOf('a');
            const bIndex = result.executionOrder.indexOf('b');
            const cIndex = result.executionOrder.indexOf('c');

            expect(aIndex).toBeLessThan(bIndex);
            expect(bIndex).toBeLessThan(cIndex);
        });

        it('should mark all features as dirty on first analysis', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
            `;

            const result = graph.analyze(code);

            expect(result.dirtyFeatures.has('box1')).toBe(true);
            expect(result.dirtyFeatures.has('box2')).toBe(true);
        });
    });

    describe('incremental analysis', () => {
        it('should detect unchanged features', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
            `;

            // First analysis - everything dirty
            const result1 = graph.analyze(code);
            expect(result1.dirtyFeatures.size).toBe(2);

            // Simulate caching results
            graph.updateCache([
                { id: 'box1', meshData: null, edgeData: null, vertexData: null },
                { id: 'box2', meshData: null, edgeData: null, vertexData: null },
            ]);

            // Second analysis with same code
            const result2 = graph.analyze(code);
            expect(result2.cachedFeatures.has('box1')).toBe(true);
            expect(result2.cachedFeatures.has('box2')).toBe(true);
            expect(result2.dirtyFeatures.size).toBe(0);
        });

        it('should mark feature and dependents dirty when code changes', () => {
            const code1 = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
            `;

            graph.analyze(code1);
            graph.updateCache([
                { id: 'box1', meshData: null, edgeData: null, vertexData: null },
                { id: 'box2', meshData: null, edgeData: null, vertexData: null },
            ]);

            // Change box1's code
            const code2 = `
                const box1 = replicad.makeBox(20, 20, 20);
                const box2 = box1.fillet(1);
            `;

            const result = graph.analyze(code2);

            // box1 changed, so both should be dirty
            expect(result.dirtyFeatures.has('box1')).toBe(true);
            expect(result.dirtyFeatures.has('box2')).toBe(true);
        });

        it('should not affect independent features when one changes', () => {
            const code1 = `
                const box1 = replicad.makeBox(10, 10, 10);
                const cylinder1 = replicad.makeCylinder(5, 10);
            `;

            graph.analyze(code1);
            graph.updateCache([
                { id: 'box1', meshData: null, edgeData: null, vertexData: null },
                { id: 'cylinder1', meshData: null, edgeData: null, vertexData: null },
            ]);

            // Change only box1
            const code2 = `
                const box1 = replicad.makeBox(20, 20, 20);
                const cylinder1 = replicad.makeCylinder(5, 10);
            `;

            const result = graph.analyze(code2);

            expect(result.dirtyFeatures.has('box1')).toBe(true);
            expect(result.cachedFeatures.has('cylinder1')).toBe(true);
        });

        it('should propagate dirty status through dependency chain', () => {
            const code1 = `
                const a = replicad.makeBox(10, 10, 10);
                const b = a.fillet(1);
                const c = b.chamfer(0.5);
                const d = c.shell(0.1);
            `;

            graph.analyze(code1);
            graph.updateCache([
                { id: 'a', meshData: null, edgeData: null, vertexData: null },
                { id: 'b', meshData: null, edgeData: null, vertexData: null },
                { id: 'c', meshData: null, edgeData: null, vertexData: null },
                { id: 'd', meshData: null, edgeData: null, vertexData: null },
            ]);

            // Change only 'a'
            const code2 = `
                const a = replicad.makeBox(20, 20, 20);
                const b = a.fillet(1);
                const c = b.chamfer(0.5);
                const d = c.shell(0.1);
            `;

            const result = graph.analyze(code2);

            // All should be dirty because they all depend on 'a'
            expect(result.dirtyFeatures.has('a')).toBe(true);
            expect(result.dirtyFeatures.has('b')).toBe(true);
            expect(result.dirtyFeatures.has('c')).toBe(true);
            expect(result.dirtyFeatures.has('d')).toBe(true);
        });

        it('should only invalidate affected branch in diamond dependency', () => {
            const code1 = `
                const base = replicad.makeBox(10, 10, 10);
                const left = base.translateX(-5);
                const right = base.translateX(5);
                const combined = left.fuse(right);
            `;

            graph.analyze(code1);
            graph.updateCache([
                { id: 'base', meshData: null, edgeData: null, vertexData: null },
                { id: 'left', meshData: null, edgeData: null, vertexData: null },
                { id: 'right', meshData: null, edgeData: null, vertexData: null },
                { id: 'combined', meshData: null, edgeData: null, vertexData: null },
            ]);

            // Change only 'left'
            const code2 = `
                const base = replicad.makeBox(10, 10, 10);
                const left = base.translateX(-10);
                const right = base.translateX(5);
                const combined = left.fuse(right);
            `;

            const result = graph.analyze(code2);

            // base and right should be cached
            expect(result.cachedFeatures.has('base')).toBe(true);
            expect(result.cachedFeatures.has('right')).toBe(true);

            // left and combined should be dirty
            expect(result.dirtyFeatures.has('left')).toBe(true);
            expect(result.dirtyFeatures.has('combined')).toBe(true);
        });
    });

    describe('createExecutionPlan', () => {
        it('should create plan with all features on first run', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
            `;

            const plan = graph.createExecutionPlan(code);

            expect(plan.toExecute).toContain('box1');
            expect(plan.toExecute).toContain('box2');
            expect(plan.toCache).toHaveLength(0);
        });

        it('should plan to use cache for unchanged features', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
            `;

            graph.analyze(code);
            graph.updateCache([
                { id: 'box1', meshData: null, edgeData: null, vertexData: null },
                { id: 'box2', meshData: null, edgeData: null, vertexData: null },
            ]);

            const plan = graph.createExecutionPlan(code);

            expect(plan.toExecute).toHaveLength(0);
            expect(plan.toCache).toContain('box1');
            expect(plan.toCache).toContain('box2');
        });
    });

    describe('cache management', () => {
        it('should store and retrieve cached results', () => {
            const code = `const box1 = replicad.makeBox(10, 10, 10);`;
            graph.analyze(code);

            const mockMeshData = {
                vertices: new Float32Array([1, 2, 3]),
                indices: new Uint32Array([0, 1, 2]),
                normals: new Float32Array([0, 1, 0]),
            };

            graph.updateCache([{
                id: 'box1',
                meshData: mockMeshData,
                edgeData: null,
                vertexData: null,
            }]);

            const cached = graph.getCached(['box1']);
            expect(cached.has('box1')).toBe(true);
            expect(cached.get('box1')?.meshData).toEqual(mockMeshData);
        });

        it('should invalidate cache when feature is invalidated', () => {
            const code = `
                const a = replicad.makeBox(10, 10, 10);
                const b = a.fillet(1);
            `;

            graph.analyze(code);
            graph.updateCache([
                { id: 'a', meshData: null, edgeData: null, vertexData: null },
                { id: 'b', meshData: null, edgeData: null, vertexData: null },
            ]);

            const invalidated = graph.invalidate('a');

            expect(invalidated.has('a')).toBe(true);
            expect(invalidated.has('b')).toBe(true);
            expect(graph.getCached(['a', 'b']).size).toBe(0);
        });

        it('should clear all caches', () => {
            const code = `const box1 = replicad.makeBox(10, 10, 10);`;
            graph.analyze(code);
            graph.updateCache([{
                id: 'box1',
                meshData: null,
                edgeData: null,
                vertexData: null,
            }]);

            graph.clearCache();

            expect(graph.getCached(['box1']).size).toBe(0);
        });
    });

    describe('getFeatureInfo', () => {
        it('should return feature information', () => {
            const code = `
                const a = replicad.makeBox(10, 10, 10);
                const b = a.fillet(1);
            `;

            graph.analyze(code);

            const info = graph.getFeatureInfo('b');

            expect(info).not.toBeNull();
            expect(info?.dependencies).toContain('a');
            expect(info?.isDirty).toBe(true);
        });

        it('should return null for unknown features', () => {
            const code = `const box1 = replicad.makeBox(10, 10, 10);`;
            graph.analyze(code);

            expect(graph.getFeatureInfo('nonexistent')).toBeNull();
        });
    });

    describe('getStats', () => {
        it('should return statistics', () => {
            const code = `
                const box1 = replicad.makeBox(10, 10, 10);
                const box2 = box1.fillet(1);
            `;

            graph.analyze(code);
            graph.updateCache([{
                id: 'box1',
                meshData: {
                    vertices: new Float32Array(9),
                    indices: new Uint32Array(3),
                    normals: new Float32Array(9),
                },
                edgeData: null,
                vertexData: null,
            }]);

            const stats = graph.getStats();

            expect(stats.totalFeatures).toBe(2);
            expect(stats.cachedFeatures).toBe(1);
            expect(stats.cacheSize).toBeGreaterThan(0);
        });
    });

    describe('singleton', () => {
        it('should return same instance', () => {
            const g1 = getDependencyGraph();
            const g2 = getDependencyGraph();

            expect(g1).toBe(g2);
        });

        it('should reset properly', () => {
            const g1 = getDependencyGraph();
            g1.analyze('const x = 1;');

            resetDependencyGraph();

            const g2 = getDependencyGraph();
            expect(g2.getStats().totalFeatures).toBe(0);
        });
    });
});

describe('mergeExecutionResults', () => {
    it('should merge cached and new results in order', () => {
        const cached = new Map([
            ['a', {
                meshData: { vertices: new Float32Array([1]), indices: new Uint32Array([0]), normals: new Float32Array([1]) },
                edgeData: null,
                vertexData: null,
                inputHash: 'hash-a',
                timestamp: Date.now(),
            }],
        ]);

        const newResults = [
            { id: 'b', meshData: null, edgeData: null, vertexData: null },
        ];

        const executionOrder = ['a', 'b'];

        const merged = mergeExecutionResults(cached, newResults, executionOrder);

        expect(merged).toHaveLength(2);
        expect(merged[0].id).toBe('a');
        expect(merged[0].fromCache).toBe(true);
        expect(merged[1].id).toBe('b');
        expect(merged[1].fromCache).toBe(false);
    });

    it('should prefer new results over cached', () => {
        const cached = new Map([
            ['a', {
                meshData: { vertices: new Float32Array([1]), indices: new Uint32Array([0]), normals: new Float32Array([1]) },
                edgeData: null,
                vertexData: null,
                inputHash: 'hash-a',
                timestamp: Date.now(),
            }],
        ]);

        const newResults = [
            { id: 'a', meshData: { vertices: new Float32Array([2]), indices: new Uint32Array([1]), normals: new Float32Array([2]) }, edgeData: null, vertexData: null },
        ];

        const executionOrder = ['a'];

        const merged = mergeExecutionResults(cached, newResults, executionOrder);

        expect(merged).toHaveLength(1);
        expect(merged[0].fromCache).toBe(false);
        expect(merged[0].meshData?.vertices[0]).toBe(2);
    });
});

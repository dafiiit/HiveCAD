/**
 * Unit Tests for Topology Module
 * 
 * Tests the core functionality of the Topological Naming System:
 * - StableId generation and serialization
 * - TopologyGraph node management and queries
 * - TopologyReference creation and serialization
 * - TopologyTracker operations
 * - ReferenceResolver resolution strategies
 * - ShapeAnalyzer geometric extraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    // StableId
    createStableId,
    createPrimitiveFaceId,
    createExtrudedFaceId,
    serializeStableId,
    deserializeStableId,
    signaturesMatch,
    generateTopologyUUID,

    // TopologyGraph
    TopologyGraph,

    // TopologyReference
    createReferenceFromSelection,
    createSemanticReference,
    createTopFaceReference,
    parseSelectionId,
    toSelectionId,
    hasStableId,
    isIndexOnlyReference,
    serializeReference,
    deserializeReference,

    // TopologyTracker
    TopologyTracker,
    getTopologyTracker,

    // ReferenceResolver
    ReferenceResolver,

    // ShapeAnalyzer
    ShapeAnalyzer,
    analyzeShape,

    // Types
    type GeometricSignature,
    type StableTopologyId,
    type TopologyReference,
} from './index';

// ============================================================================
// StableId Tests
// ============================================================================

describe('StableId', () => {
    describe('generateTopologyUUID', () => {
        it('should generate unique UUIDs', () => {
            const uuid1 = generateTopologyUUID();
            const uuid2 = generateTopologyUUID();

            expect(uuid1).toBeDefined();
            expect(uuid2).toBeDefined();
            expect(uuid1).not.toBe(uuid2);
        });

        it('should generate valid UUID format', () => {
            const uuid = generateTopologyUUID();
            // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });
    });

    describe('createStableId', () => {
        it('should create a stable ID with required fields', () => {
            const id = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });

            expect(id.uuid).toBeDefined();
            expect(id.entityType).toBe('face');
            expect(id.sourceOperationId).toBe('op_1');
            expect(id.featureId).toBe('box1');
            expect(id.isAlive).toBe(true);
            expect(id.generation).toBe(1);
            expect(id.generatorLinks).toEqual([]);
        });

        it('should include optional fields', () => {
            const signature: GeometricSignature = {
                centroid: [1, 2, 3],
                normal: [0, 0, 1],
                area: 100,
            };

            const id = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
                label: 'Top Face',
                geometricSignature: signature,
                generatorLinks: [{
                    type: 'primitive_face',
                    sourceEntityId: 'box1',
                    semanticTag: 'top',
                }],
            });

            expect(id.label).toBe('Top Face');
            expect(id.geometricSignature).toEqual(signature);
            expect(id.generatorLinks).toHaveLength(1);
            expect(id.generatorLinks[0].semanticTag).toBe('top');
        });
    });

    describe('createPrimitiveFaceId', () => {
        it('should create ID for primitive face', () => {
            const id = createPrimitiveFaceId({
                primitiveType: 'box',
                featureId: 'box1',
                operationId: 'op_1',
                faceIndex: 0,
                semanticTag: 'top',
            });

            expect(id.entityType).toBe('face');
            expect(id.label).toContain('box');
            expect(id.label).toContain('top');
            expect(id.generatorLinks[0].type).toBe('primitive_face');
            expect(id.generatorLinks[0].semanticTag).toBe('top');
        });
    });

    describe('createExtrudedFaceId', () => {
        it('should create ID for top cap', () => {
            const id = createExtrudedFaceId({
                featureId: 'extrude1',
                operationId: 'op_2',
                sourceSketchEdgeId: 'line_uuid',
                isEndCap: true,
                isTop: true,
            });

            expect(id.label).toContain('top');
            expect(id.generatorLinks[0].type).toBe('extruded_from');
            expect(id.generatorLinks[0].semanticTag).toBe('top');
        });

        it('should create ID for side face', () => {
            const id = createExtrudedFaceId({
                featureId: 'extrude1',
                operationId: 'op_2',
                sourceSketchEdgeId: 'line_uuid',
                sourceEdgeName: 'Line1',
                isEndCap: false,
                isTop: false,
            });

            expect(id.label).toContain('side');
            expect(id.label).toContain('Line1');
            expect(id.generatorLinks[0].semanticTag).toBe('side');
        });
    });

    describe('serialization', () => {
        it('should serialize and deserialize correctly', () => {
            const original = createStableId({
                entityType: 'edge',
                sourceOperationId: 'op_1',
                featureId: 'cylinder1',
                label: 'Test Edge',
                generatorLinks: [{
                    type: 'fillet_of',
                    sourceEntityId: 'edge_123',
                }],
            });

            const serialized = serializeStableId(original);
            const deserialized = deserializeStableId(serialized);

            expect(deserialized.uuid).toBe(original.uuid);
            expect(deserialized.entityType).toBe(original.entityType);
            expect(deserialized.label).toBe(original.label);
            expect(deserialized.featureId).toBe(original.featureId);
            expect(deserialized.generatorLinks).toEqual(original.generatorLinks);
        });
    });

    describe('signaturesMatch', () => {
        it('should match identical signatures', () => {
            const sig1: GeometricSignature = {
                centroid: [1, 2, 3],
                normal: [0, 0, 1],
                area: 100,
                surfaceType: 'plane',
            };

            const result = signaturesMatch(sig1, sig1);
            expect(result.matches).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.9);
        });

        it('should not match very different signatures', () => {
            const sig1: GeometricSignature = {
                centroid: [0, 0, 0],
                normal: [0, 0, 1],
                area: 100,
            };
            const sig2: GeometricSignature = {
                centroid: [100, 100, 100],
                normal: [1, 0, 0],
                area: 1,
            };

            const result = signaturesMatch(sig1, sig2);
            expect(result.matches).toBe(false);
            expect(result.confidence).toBeLessThan(0.5);
        });

        it('should handle missing signatures', () => {
            const result = signaturesMatch(undefined, undefined);
            expect(result.matches).toBe(false);
            expect(result.confidence).toBe(0);
        });
    });
});

// ============================================================================
// TopologyGraph Tests
// ============================================================================

describe('TopologyGraph', () => {
    let graph: TopologyGraph;

    beforeEach(() => {
        graph = new TopologyGraph();
    });

    describe('addNode', () => {
        it('should add a node to the graph', () => {
            const stableId = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });

            const node = graph.addNode(stableId, 0);

            expect(node.id).toBe(stableId);
            expect(node.currentIndex).toBe(0);
            expect(graph.getNode(stableId.uuid)).toBe(node);
        });

        it('should index by type and feature', () => {
            const faceId = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });
            const edgeId = createStableId({
                entityType: 'edge',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });

            graph.addNode(faceId, 0);
            graph.addNode(edgeId, 0);

            expect(graph.getNodesOfType('face')).toHaveLength(1);
            expect(graph.getNodesOfType('edge')).toHaveLength(1);
            expect(graph.getNodesForFeature('box1')).toHaveLength(2);
        });
    });

    describe('updateNodeIndex', () => {
        it('should update the display index', () => {
            const stableId = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });

            graph.addNode(stableId, 0);
            graph.updateNodeIndex(stableId.uuid, 5);

            const node = graph.getNode(stableId.uuid);
            expect(node?.currentIndex).toBe(5);
            expect(node?.id.generation).toBe(2);
        });
    });

    describe('markNodeDead', () => {
        it('should mark node as dead', () => {
            const stableId = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });

            graph.addNode(stableId, 0);
            graph.markNodeDead(stableId.uuid, 'deleted');

            const node = graph.getNode(stableId.uuid);
            expect(node?.id.isAlive).toBe(false);
            expect(node?.id.deathReason).toBe('deleted');
            expect(node?.currentIndex).toBeUndefined();
        });
    });

    describe('getAncestry', () => {
        it('should return parent chain', () => {
            const parent = createStableId({
                entityType: 'edge',
                sourceOperationId: 'op_1',
                featureId: 'sketch1',
            });

            const child = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_2',
                featureId: 'extrude1',
                generatorLinks: [{
                    type: 'extruded_from',
                    sourceEntityId: parent.uuid,
                }],
            });

            graph.addNode(parent, 0);
            graph.addNode(child, 0);

            const ancestry = graph.getAncestry(child.uuid);
            expect(ancestry).toContain(parent.uuid);
        });
    });

    describe('serialization', () => {
        it('should serialize and deserialize correctly', () => {
            const id1 = createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });
            const id2 = createStableId({
                entityType: 'edge',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            });

            graph.addNode(id1, 0);
            graph.addNode(id2, 1);
            graph.recordOperation('op_1', 'Create Box');

            const serialized = graph.serialize();
            const restored = TopologyGraph.deserialize(serialized);

            expect(restored.getNode(id1.uuid)).toBeDefined();
            expect(restored.getNode(id2.uuid)).toBeDefined();
            expect(restored.getOperationHistory()).toContain('op_1');
        });
    });

    describe('getStats', () => {
        it('should return correct statistics', () => {
            graph.addNode(createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            }), 0);
            graph.addNode(createStableId({
                entityType: 'face',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            }), 1);
            graph.addNode(createStableId({
                entityType: 'edge',
                sourceOperationId: 'op_1',
                featureId: 'box1',
            }), 0);

            const stats = graph.getStats();
            expect(stats.totalNodes).toBe(3);
            expect(stats.faces).toBe(2);
            expect(stats.edges).toBe(1);
        });
    });
});

// ============================================================================
// TopologyReference Tests
// ============================================================================

describe('TopologyReference', () => {
    describe('createReferenceFromSelection', () => {
        it('should create reference from index', () => {
            const ref = createReferenceFromSelection('box1', 'face', 0);

            expect(ref.type).toBe('face');
            expect(ref.baseObjectId).toBe('box1');
            expect(ref.indexHint).toBe(0);
        });

        it('should include stable ID if provided', () => {
            const ref = createReferenceFromSelection('box1', 'face', 0, 'uuid-123');

            expect(ref.stableId).toBe('uuid-123');
        });

        it('should create geometric selector from signature', () => {
            const signature: GeometricSignature = {
                centroid: [5, 5, 10],
                normal: [0, 0, 1],
                area: 100,
            };
            const ref = createReferenceFromSelection('box1', 'face', 0, undefined, signature);

            expect(ref.geometricSelector).toBeDefined();
            expect(ref.geometricSelector?.centroidPosition).toEqual([5, 5, 10]);
            expect(ref.geometricSelector?.normalDirection).toEqual([0, 0, 1]);
        });
    });

    describe('createSemanticReference', () => {
        it('should create semantic reference', () => {
            const ref = createSemanticReference('box1', 'face', { type: 'topmost' });

            expect(ref.semanticSelector?.type).toBe('topmost');
            expect(ref.label).toContain('topmost');
        });
    });

    describe('createTopFaceReference', () => {
        it('should create top face reference', () => {
            const ref = createTopFaceReference('box1');

            expect(ref.semanticSelector?.type).toBe('topmost');
            expect(ref.label).toBe('Top Face');
        });
    });

    describe('parseSelectionId', () => {
        it('should parse face selection', () => {
            const ref = parseSelectionId('box1:face-5');

            expect(ref?.type).toBe('face');
            expect(ref?.baseObjectId).toBe('box1');
            expect(ref?.indexHint).toBe(5);
        });

        it('should parse edge selection', () => {
            const ref = parseSelectionId('cylinder1:edge-12');

            expect(ref?.type).toBe('edge');
            expect(ref?.baseObjectId).toBe('cylinder1');
            expect(ref?.indexHint).toBe(12);
        });

        it('should return null for invalid format', () => {
            expect(parseSelectionId('invalid')).toBeNull();
            expect(parseSelectionId('box1-face-0')).toBeNull();
        });
    });

    describe('toSelectionId', () => {
        it('should convert reference to selection ID', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 3,
            };

            expect(toSelectionId(ref)).toBe('box1:face-3');
        });
    });

    describe('hasStableId', () => {
        it('should return true if stable ID exists', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid-123',
            };

            expect(hasStableId(ref)).toBe(true);
        });

        it('should return false if no stable ID', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
            };

            expect(hasStableId(ref)).toBe(false);
        });
    });

    describe('isIndexOnlyReference', () => {
        it('should return true for index-only reference', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 0,
            };

            expect(isIndexOnlyReference(ref)).toBe(true);
        });

        it('should return false if has stable ID', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid-123',
                indexHint: 0,
            };

            expect(isIndexOnlyReference(ref)).toBe(false);
        });
    });

    describe('serialization', () => {
        it('should serialize and deserialize correctly', () => {
            const original: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid-123',
                semanticSelector: { type: 'topmost' },
                indexHint: 0,
                label: 'Top Face',
            };

            const serialized = serializeReference(original);
            const deserialized = deserializeReference(serialized);

            expect(deserialized.type).toBe(original.type);
            expect(deserialized.baseObjectId).toBe(original.baseObjectId);
            expect(deserialized.stableId).toBe(original.stableId);
            expect(deserialized.semanticSelector?.type).toBe('topmost');
            expect(deserialized.label).toBe(original.label);
        });
    });
});

// ============================================================================
// TopologyTracker Tests
// ============================================================================

describe('TopologyTracker', () => {
    beforeEach(() => {
        TopologyTracker.reset();
    });

    afterEach(() => {
        TopologyTracker.reset();
    });

    describe('singleton', () => {
        it('should return same instance', () => {
            const tracker1 = getTopologyTracker();
            const tracker2 = getTopologyTracker();

            expect(tracker1).toBe(tracker2);
        });
    });

    describe('operations', () => {
        it('should track operations', () => {
            const tracker = getTopologyTracker();

            const opId = tracker.beginOperation('Create Box');
            expect(opId).toBeDefined();
            expect(tracker.getCurrentOperationId()).toBe(opId);

            tracker.endOperation();
            expect(tracker.getCurrentOperationId()).toBeNull();
        });
    });

    describe('entity registration', () => {
        it('should register faces', () => {
            const tracker = getTopologyTracker();
            tracker.beginOperation('Create Box');

            const stableId = tracker.registerFace('box1', 0, [{
                type: 'primitive_face',
                sourceEntityId: 'box1',
            }], { centroid: [0, 0, 5] }, 'Top Face');

            expect(stableId.entityType).toBe('face');
            expect(stableId.featureId).toBe('box1');
            expect(tracker.getStableId(stableId.uuid)).toBeDefined();
            tracker.endOperation();
        });

        it('should maintain index mappings', () => {
            const tracker = getTopologyTracker();
            tracker.beginOperation('Create Box');

            const id1 = tracker.registerFace('box1', 0, [], {});
            const id2 = tracker.registerFace('box1', 1, [], {});

            expect(tracker.getStableIdForIndex('box1', 'face', 0)).toBe(id1.uuid);
            expect(tracker.getStableIdForIndex('box1', 'face', 1)).toBe(id2.uuid);
            expect(tracker.getIndexForStableId('box1', 'face', id1.uuid)).toBe(0);
            tracker.endOperation();
        });
    });

    describe('serialization', () => {
        it('should serialize and deserialize state', () => {
            const tracker = getTopologyTracker();
            tracker.beginOperation('Test Op');
            tracker.registerFace('box1', 0, [], {}, 'Face 0');
            tracker.endOperation();

            const serialized = tracker.serialize();
            tracker.clear();

            expect(tracker.getStats().features).toBe(0);

            tracker.deserialize(serialized);

            expect(tracker.getStats().features).toBe(1);
        });
    });
});

// ============================================================================
// ReferenceResolver Tests
// ============================================================================

describe('ReferenceResolver', () => {
    let resolver: ReferenceResolver;

    beforeEach(() => {
        TopologyTracker.reset();
        resolver = new ReferenceResolver();
    });

    afterEach(() => {
        TopologyTracker.reset();
    });

    describe('resolve by stable ID', () => {
        it('should resolve if stable ID exists', () => {
            const tracker = getTopologyTracker();
            tracker.beginOperation('Test');
            const stableId = tracker.registerFace('box1', 3, [], {});
            tracker.endOperation();

            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: stableId.uuid,
            };

            const result = resolver.resolve(ref);

            expect(result.success).toBe(true);
            expect(result.index).toBe(3);
            expect(result.strategy).toBe('stableId');
            expect(result.confidence).toBe(1.0);
        });

        it('should fail if stable ID not found', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'nonexistent-uuid',
            };

            const result = resolver.resolve(ref);

            expect(result.success).toBe(false);
            // When stableId resolution fails and there's no fallback, strategy is 'failed'
            expect(result.strategy).toBe('failed');
        });
    });

    describe('resolve by semantic selector', () => {
        it('should resolve topmost face', () => {
            const mockShapeAnalysis = {
                getFaceCount: () => 3,
                getEdgeCount: () => 0,
                getVertexCount: () => 0,
                getFaceSignature: (i: number): GeometricSignature => {
                    const centroids: [number, number, number][] = [
                        [0, 0, 0],   // bottom
                        [0, 0, 5],   // middle
                        [0, 0, 10],  // top
                    ];
                    return { centroid: centroids[i] };
                },
                getEdgeSignature: () => ({}),
                getVertexPosition: () => [0, 0, 0] as [number, number, number],
            };

            const ref = createTopFaceReference('box1');
            const result = resolver.resolve(ref, { shapeAnalysis: mockShapeAnalysis });

            expect(result.success).toBe(true);
            expect(result.index).toBe(2); // Third face is topmost
            expect(result.strategy).toBe('semantic');
        });

        it('should resolve largest face', () => {
            const mockShapeAnalysis = {
                getFaceCount: () => 3,
                getEdgeCount: () => 0,
                getVertexCount: () => 0,
                getFaceSignature: (i: number): GeometricSignature => {
                    const areas = [100, 500, 200];
                    return { area: areas[i] };
                },
                getEdgeSignature: () => ({}),
                getVertexPosition: () => [0, 0, 0] as [number, number, number],
            };

            const ref = createSemanticReference('box1', 'face', { type: 'largest' });
            const result = resolver.resolve(ref, { shapeAnalysis: mockShapeAnalysis });

            expect(result.success).toBe(true);
            expect(result.index).toBe(1); // Second face is largest
        });
    });

    describe('resolve by index hint', () => {
        it('should fall back to index hint', () => {
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 5,
            };

            const result = resolver.resolve(ref);

            expect(result.success).toBe(true);
            expect(result.index).toBe(5);
            expect(result.strategy).toBe('indexHint');
            expect(result.confidence).toBeLessThan(0.5);
        });
    });

    describe('canResolve', () => {
        it('should return true for resolvable references', () => {
            expect(resolver.canResolve({
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid',
            })).toBe(true);

            expect(resolver.canResolve({
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 0,
            })).toBe(true);
        });

        it('should return false for unresolvable references', () => {
            expect(resolver.canResolve({
                type: 'face',
                baseObjectId: 'box1',
            })).toBe(false);
        });
    });
});

// ============================================================================
// ShapeAnalyzer Tests
// ============================================================================

describe('ShapeAnalyzer', () => {
    describe('face analysis', () => {
        it('should extract face count', () => {
            const mockShape = {
                faces: [
                    { center: { x: 0, y: 0, z: 5 }, area: 100 },
                    { center: { x: 0, y: 0, z: 0 }, area: 100 },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1', 'makeBox');

            expect(analyzer.getFaceCount()).toBe(2);
        });

        it('should extract face signatures', () => {
            const mockShape = {
                faces: [
                    {
                        center: { x: 0, y: 0, z: 10 },
                        normalAt: () => ({ x: 0, y: 0, z: 1 }),
                        area: 100,
                        surfaceType: () => 'plane',
                    },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1');
            const sig = analyzer.getFaceSignature(0);

            expect(sig.centroid).toEqual([0, 0, 10]);
            expect(sig.normal).toEqual([0, 0, 1]);
            expect(sig.area).toBe(100);
            expect(sig.surfaceType).toBe('plane');
        });
    });

    describe('edge analysis', () => {
        it('should extract edge signatures', () => {
            const mockShape = {
                edges: [
                    {
                        startPoint: { x: 0, y: 0, z: 0 },
                        endPoint: { x: 10, y: 0, z: 0 },
                        length: 10,
                        curveType: () => 'line',
                    },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1');
            const sig = analyzer.getEdgeSignature(0);

            expect(sig.centroid).toEqual([5, 0, 0]);
            expect(sig.length).toBe(10);
            expect(sig.curveType).toBe('line');
            expect(sig.axisDirection).toEqual([1, 0, 0]);
        });
    });

    describe('vertex analysis', () => {
        it('should extract vertex positions', () => {
            const mockShape = {
                vertices: [
                    { point: { x: 0, y: 0, z: 0 } },
                    { point: { x: 10, y: 10, z: 10 } },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1');

            expect(analyzer.getVertexCount()).toBe(2);
            expect(analyzer.getVertexPosition(0)).toEqual([0, 0, 0]);
            expect(analyzer.getVertexPosition(1)).toEqual([10, 10, 10]);
        });
    });

    describe('semantic analysis', () => {
        it('should find topmost face', () => {
            const mockShape = {
                faces: [
                    { center: { x: 0, y: 0, z: 0 } },
                    { center: { x: 0, y: 0, z: 10 } },
                    { center: { x: 0, y: 0, z: 5 } },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1');

            expect(analyzer.findTopmostFace()).toBe(1);
        });

        it('should find largest face', () => {
            const mockShape = {
                faces: [
                    { center: { x: 0, y: 0, z: 0 }, area: 50 },
                    { center: { x: 0, y: 0, z: 0 }, area: 200 },
                    { center: { x: 0, y: 0, z: 0 }, area: 100 },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1');

            expect(analyzer.findLargestFace()).toBe(1);
        });

        it('should find faces parallel to direction', () => {
            const mockShape = {
                faces: [
                    {
                        center: { x: 0, y: 0, z: 5 },
                        normalAt: () => ({ x: 0, y: 0, z: 1 }),
                    },
                    {
                        center: { x: 0, y: 0, z: 0 },
                        normalAt: () => ({ x: 0, y: 0, z: -1 }),
                    },
                    {
                        center: { x: 5, y: 0, z: 0 },
                        normalAt: () => ({ x: 1, y: 0, z: 0 }),
                    },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1');
            const zParallel = analyzer.findFacesParallelTo([0, 0, 1]);

            expect(zParallel).toContain(0);
            expect(zParallel).toContain(1);
            expect(zParallel).not.toContain(2);
        });
    });

    describe('full topology analysis', () => {
        it('should generate complete analysis result', () => {
            const mockShape = {
                faces: [
                    {
                        center: { x: 0, y: 0, z: 5 },
                        normalAt: () => ({ x: 0, y: 0, z: 1 }),
                        area: 100,
                    },
                ],
                edges: [
                    {
                        startPoint: { x: 0, y: 0, z: 0 },
                        endPoint: { x: 10, y: 0, z: 0 },
                        length: 10,
                    },
                ],
                vertices: [
                    { point: { x: 0, y: 0, z: 0 } },
                ],
            };

            const analyzer = analyzeShape(mockShape, 'box1', 'op_1', 'makeBox');
            const result = analyzer.analyzeFullTopology();

            expect(result.faces).toHaveLength(1);
            expect(result.faces[0].stableId.entityType).toBe('face');
            expect(result.faces[0].stableId.featureId).toBe('box1');

            expect(result.edges).toHaveLength(1);
            expect(result.edges[0].stableId.entityType).toBe('edge');

            expect(result.vertices).toHaveLength(1);
            expect(result.vertices[0].stableId.entityType).toBe('vertex');
        });
    });
});

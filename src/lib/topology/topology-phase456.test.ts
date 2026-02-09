/**
 * Unit Tests for Topology Module - Phases 4, 5, and 6
 * 
 * Tests the additional functionality:
 * - Phase 4: WorkerTopologyBridge
 * - Phase 5: ReferenceManager
 * - Phase 6: CodeGeneration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    // Phase 4: Worker Topology Bridge
    extractFaceSignature,
    extractEdgeSignature,
    generateTopologyForShape,
    reconstructTopologyId,
    reconstructTopologyData,
    buildTopologyState,
    createEmptyTopologyState,
    serializeTopologyState,
    deserializeTopologyState,
    type SerializedTopologyData,
    type ObjectTopologyState,

    // Phase 5: Reference Manager
    getReferenceManager,
    resetReferenceManager,
    type ReferenceStatus,
    type ReferenceState,

    // Phase 6: Code Generation
    ReferenceCodeGenerator,
    createReferenceCodeGenerator,
    generateFaceSelectionCode,
    generateEdgeSelectionCode,
    transformIndexToStableReference,
    extractIndexReferences,
    generateMigrationReport,
    type ReferenceCodeOptions,

    // Core types
    createStableId,
    type TopologyReference,
    type GeometricSignature,
} from './index';

// ============================================================================
// Phase 4: Worker Topology Bridge Tests
// ============================================================================

describe('WorkerTopologyBridge', () => {
    describe('extractFaceSignature', () => {
        it('should extract signature from face with full data', () => {
            const mockFace = {
                center: { x: 5, y: 10, z: 15 },
                normalAt: () => ({ x: 0, y: 0, z: 1 }),
                area: 100,
                geomType: 'plane',  // Should use geomType, not surfaceType()
            };

            const signature = extractFaceSignature(mockFace, 0);

            expect(signature.centroid).toEqual([5, 10, 15]);
            expect(signature.normal).toEqual([0, 0, 1]);
            expect(signature.area).toBe(100);
            expect(signature.surfaceType).toBe('plane');
        });

        it('should handle face with missing methods', () => {
            const mockFace = {
                center: { x: 1, y: 2, z: 3 },
            };

            const signature = extractFaceSignature(mockFace, 0);

            expect(signature.centroid).toEqual([1, 2, 3]);
            expect(signature.normal).toBeUndefined();
            expect(signature.area).toBeUndefined();
        });

        it('should handle center with missing properties', () => {
            const mockFace = {
                center: { x: 1 },  // Missing y and z
            };

            const signature = extractFaceSignature(mockFace, 0);

            expect(signature.centroid).toEqual([1, 0, 0]);
        });
    });

    describe('extractEdgeSignature', () => {
        it('should extract signature from edge', () => {
            const mockEdge = {
                center: { x: 5, y: 5, z: 0 },
                length: 10,
                geomType: 'line',  // Should use geomType
            };

            const signature = extractEdgeSignature(mockEdge, 0);

            expect(signature.centroid).toEqual([5, 5, 0]);
            expect(signature.length).toBe(10);
            expect(signature.curveType).toBe('line');
        });

        it('should handle edge with missing data', () => {
            const mockEdge = {};

            const signature = extractEdgeSignature(mockEdge, 0);

            expect(signature.centroid).toBeUndefined();
            expect(signature.length).toBeUndefined();
        });

        it('should extract direction for linear edges', () => {
            const mockEdge = {
                startPoint: { x: 0, y: 0, z: 0 },
                endPoint: { x: 10, y: 0, z: 0 },
            };

            const signature = extractEdgeSignature(mockEdge, 0);

            expect(signature.axisDirection).toEqual([1, 0, 0]);
        });
    });

    describe('generateTopologyForShape', () => {
        it('should generate topology data for shape', () => {
            const mockShape = {
                faces: [
                    { center: { x: 0, y: 0, z: 10 }, area: 100 },
                    { center: { x: 0, y: 0, z: 0 }, area: 100 },
                ],
                edges: [
                    { center: { x: 5, y: 0, z: 5 }, length: 10 },
                ],
            };

            const topology = generateTopologyForShape(mockShape, 'box1', 'makeBox');

            expect(topology.featureId).toBe('box1');
            expect(topology.operationType).toBe('makeBox');
            expect(topology.faces).toHaveLength(2);
            expect(topology.edges).toHaveLength(1);
            expect(topology.timestamp).toBeDefined();
        });

        it('should handle empty shape', () => {
            const mockShape = {};

            const topology = generateTopologyForShape(mockShape, 'empty1');

            expect(topology.faces).toHaveLength(0);
            expect(topology.edges).toHaveLength(0);
            expect(topology.vertices).toHaveLength(0);
        });

        it('should generate stable IDs for each entity', () => {
            const mockShape = {
                faces: [
                    { center: { x: 0, y: 0, z: 0 } },
                ],
            };

            const topology = generateTopologyForShape(mockShape, 'box1');

            expect(topology.faces[0].stableId).toBeDefined();
            expect(topology.faces[0].stableId.uuid).toBeDefined();
            expect(topology.faces[0].index).toBe(0);
        });
    });

    describe('reconstructTopologyId', () => {
        it('should reconstruct topology ID from serialized data', () => {
            const serializedId = {
                uuid: 'test-uuid-123',
                entityType: 'face',
                featureId: 'box1',
                sourceOperationId: 'op1',
                label: 'Top Face',
                isAlive: true,
                generation: 1,
                generatorLinks: [],
            };

            const stableId = reconstructTopologyId(serializedId);

            expect(stableId.uuid).toBe('test-uuid-123');
            expect(stableId.entityType).toBe('face');
            expect(stableId.featureId).toBe('box1');
            expect(stableId.label).toBe('Top Face');
        });
    });

    describe('TopologyState', () => {
        it('should create empty topology state', () => {
            const state = createEmptyTopologyState();

            expect(state.faceIdToIndex).toBeInstanceOf(Map);
            expect(state.indexToFaceId).toBeInstanceOf(Map);
            expect(state.edgeIdToIndex).toBeInstanceOf(Map);
            expect(state.indexToEdgeId).toBeInstanceOf(Map);
            expect(state.vertexIdToIndex).toBeInstanceOf(Map);
            expect(state.indexToVertexId).toBeInstanceOf(Map);
            expect(state.stableIds).toBeInstanceOf(Map);
            expect(state.signatures).toBeInstanceOf(Map);
            expect(state.lastUpdated).toBe(0);
        });

        it('should build topology state from serialized data', () => {
            const serialized: SerializedTopologyData = {
                featureId: 'box1',
                faces: [
                    {
                        index: 0,
                        stableId: {
                            uuid: 'face-uuid-0',
                            entityType: 'face',
                            featureId: 'box1',
                            sourceOperationId: 'op1',
                            isAlive: true,
                            generation: 1,
                            generatorLinks: [],
                        },
                        signature: { centroid: [0, 0, 10] },
                    },
                ],
                edges: [],
                vertices: [],
                timestamp: Date.now(),
            };

            const state = buildTopologyState(serialized);

            expect(state.indexToFaceId.get(0)).toBe('face-uuid-0');
            expect(state.faceIdToIndex.get('face-uuid-0')).toBe(0);
            expect(state.stableIds.has('face-uuid-0')).toBe(true);
            expect(state.signatures.has('face-uuid-0')).toBe(true);
        });

        it('should serialize and deserialize topology state', () => {
            // First create state properly via buildTopologyState
            const serializedData: SerializedTopologyData = {
                featureId: 'cylinder1',
                faces: [
                    {
                        index: 0,
                        stableId: {
                            uuid: 'uuid-f0',
                            entityType: 'face',
                            featureId: 'cylinder1',
                            sourceOperationId: 'op1',
                            isAlive: true,
                            generation: 1,
                            generatorLinks: [],
                        },
                        signature: { centroid: [0, 0, 5], normal: [0, 0, 1] },
                    },
                    {
                        index: 1,
                        stableId: {
                            uuid: 'uuid-f1',
                            entityType: 'face',
                            featureId: 'cylinder1',
                            sourceOperationId: 'op1',
                            isAlive: true,
                            generation: 1,
                            generatorLinks: [],
                        },
                        signature: { centroid: [0, 0, 0] },
                    },
                ],
                edges: [
                    {
                        index: 0,
                        stableId: {
                            uuid: 'uuid-e0',
                            entityType: 'edge',
                            featureId: 'cylinder1',
                            sourceOperationId: 'op1',
                            isAlive: true,
                            generation: 1,
                            generatorLinks: [],
                        },
                        signature: { length: 10 },
                    },
                ],
                vertices: [],
                timestamp: Date.now(),
            };

            const original = buildTopologyState(serializedData);
            const serialized = serializeTopologyState(original);
            const deserialized = deserializeTopologyState(serialized);

            expect(deserialized.indexToFaceId.get(0)).toBe('uuid-f0');
            expect(deserialized.indexToFaceId.get(1)).toBe('uuid-f1');
            expect(deserialized.indexToEdgeId.get(0)).toBe('uuid-e0');
            expect(deserialized.stableIds.has('uuid-f0')).toBe(true);
        });
    });
});

// ============================================================================
// Phase 5: Reference Manager Tests
// ============================================================================

describe('ReferenceManager', () => {
    beforeEach(() => {
        resetReferenceManager();
    });

    afterEach(() => {
        resetReferenceManager();
    });

    describe('singleton', () => {
        it('should return the same instance', () => {
            const manager1 = getReferenceManager();
            const manager2 = getReferenceManager();

            expect(manager1).toBe(manager2);
        });

        it('should reset properly', () => {
            const manager1 = getReferenceManager();
            manager1.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 0,
            }, 'feature1');

            expect(manager1.getReferencesForFeature('feature1')).toHaveLength(1);

            resetReferenceManager();
            const manager2 = getReferenceManager();

            expect(manager2.getReferencesForFeature('feature1')).toHaveLength(0);
        });
    });

    describe('registerReference', () => {
        it('should register a reference', () => {
            const manager = getReferenceManager();

            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid-123',
                indexHint: 0,
            };

            const state = manager.registerReference('ref1', ref, 'feature1');

            expect(state).toBeDefined();
            expect(state.reference).toEqual(ref);
            expect(state.featureId).toBe('feature1');
            expect(state.id).toBe('ref1');
        });

        it('should set initial status to pending', () => {
            const manager = getReferenceManager();

            const state = manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 0,
            }, 'feature1');

            expect(state.status).toBe('pending');
        });
    });

    describe('updateReferenceStatus', () => {
        it('should update status to valid', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid-123',
            }, 'feature1');

            manager.updateReferenceStatus('ref1', 'valid', 0, 1.0, 'stableId');

            const refs = manager.getReferencesForFeature('feature1');
            expect(refs[0].status).toBe('valid');
            expect(refs[0].resolvedIndex).toBe(0);
            expect(refs[0].confidence).toBe(1.0);
        });

        it('should update status to broken with error message', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'nonexistent',
            }, 'feature1');

            manager.updateReferenceStatus(
                'ref1',
                'broken',
                undefined,
                0,
                undefined,
                'Stable ID not found in topology graph'
            );

            const refs = manager.getReferencesForFeature('feature1');
            expect(refs[0].status).toBe('broken');
            expect(refs[0].errorMessage).toBe('Stable ID not found in topology graph');
        });

        it('should update status to warning with alternatives', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.updateReferenceStatus(
                'ref1',
                'warning',
                2,
                0.7,
                'geometric',
                undefined,
                [
                    { index: 2, confidence: 0.7, label: 'Best match' },
                    { index: 3, confidence: 0.5, label: 'Alternate' },
                ]
            );

            const refs = manager.getReferencesForFeature('feature1');
            expect(refs[0].status).toBe('warning');
            expect(refs[0].alternatives).toHaveLength(2);
            expect(refs[0].alternatives?.[0].confidence).toBe(0.7);
        });
    });

    describe('getReferencesForFeature', () => {
        it('should return all references for a feature', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
                indexHint: 0,
            }, 'feature1');

            manager.registerReference('ref2', {
                type: 'edge',
                baseObjectId: 'box1',
                indexHint: 1,
            }, 'feature1');

            manager.registerReference('ref3', {
                type: 'face',
                baseObjectId: 'cylinder1',
                indexHint: 0,
            }, 'feature2');

            const feature1Refs = manager.getReferencesForFeature('feature1');
            const feature2Refs = manager.getReferencesForFeature('feature2');

            expect(feature1Refs).toHaveLength(2);
            expect(feature2Refs).toHaveLength(1);
        });
    });

    describe('getReferencesNeedingAttention', () => {
        it('should return broken and warning references', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.registerReference('ref2', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.registerReference('ref3', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature2');

            manager.updateReferenceStatus('ref1', 'valid', 0, 1.0);
            manager.updateReferenceStatus('ref2', 'broken', undefined, 0, undefined, 'Not found');
            manager.updateReferenceStatus('ref3', 'warning', 1, 0.6);

            const needsAttention = manager.getReferencesNeedingAttention();

            expect(needsAttention).toHaveLength(2);
            expect(needsAttention.some(r => r.status === 'broken')).toBe(true);
            expect(needsAttention.some(r => r.status === 'warning')).toBe(true);
        });
    });

    describe('repairReference', () => {
        it('should repair a broken reference', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.updateReferenceStatus('ref1', 'broken', undefined, 0, undefined, 'Not found');

            manager.repairReference('ref1', 5, 'user_select');

            const refs = manager.getReferencesForFeature('feature1');
            expect(refs[0].status).toBe('migrated');
            expect(refs[0].resolvedIndex).toBe(5);
            expect(refs[0].resolvedBy).toBe('user');
        });
    });

    describe('clearFeatureReferences', () => {
        it('should clear all references for a feature', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.registerReference('ref2', {
                type: 'edge',
                baseObjectId: 'box1',
            }, 'feature1');

            expect(manager.getReferencesForFeature('feature1')).toHaveLength(2);

            manager.clearFeatureReferences('feature1');

            expect(manager.getReferencesForFeature('feature1')).toHaveLength(0);
        });
    });

    describe('event listeners', () => {
        it('should emit events on status change', () => {
            const manager = getReferenceManager();
            const events: any[] = [];

            const unsubscribe = manager.addEventListener((event) => {
                events.push(event);
            });

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.updateReferenceStatus('ref1', 'valid', 0, 1.0);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('status_change');
            expect(events[0].referenceId).toBe('ref1');

            unsubscribe();
        });

        it('should emit events on repair', () => {
            const manager = getReferenceManager();
            const events: any[] = [];

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.updateReferenceStatus('ref1', 'broken');

            const unsubscribe = manager.addEventListener((event) => {
                events.push(event);
            });

            manager.repairReference('ref1', 3, 'accept_suggestion');

            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events.some(e => e.type === 'repair')).toBe(true);

            unsubscribe();
        });
    });

    describe('hasBrokenReferences', () => {
        it('should return true when broken references exist', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.updateReferenceStatus('ref1', 'broken');

            expect(manager.hasBrokenReferences()).toBe(true);
        });

        it('should return false when no broken references', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', {
                type: 'face',
                baseObjectId: 'box1',
            }, 'feature1');

            manager.updateReferenceStatus('ref1', 'valid', 0, 1.0);

            expect(manager.hasBrokenReferences()).toBe(false);
        });
    });

    describe('getBrokenReferenceCount', () => {
        it('should count broken references', () => {
            const manager = getReferenceManager();

            manager.registerReference('ref1', { type: 'face', baseObjectId: 'box1' }, 'f1');
            manager.registerReference('ref2', { type: 'face', baseObjectId: 'box1' }, 'f1');
            manager.registerReference('ref3', { type: 'face', baseObjectId: 'box1' }, 'f2');

            manager.updateReferenceStatus('ref1', 'broken');
            manager.updateReferenceStatus('ref2', 'broken');
            manager.updateReferenceStatus('ref3', 'warning');

            expect(manager.getBrokenReferenceCount()).toBe(2);
        });
    });
});

// ============================================================================
// Phase 6: Code Generation Tests
// ============================================================================

describe('CodeGeneration', () => {
    describe('ReferenceCodeGenerator', () => {
        describe('constructor', () => {
            it('should create generator with default options', () => {
                const generator = new ReferenceCodeGenerator();

                expect(generator).toBeDefined();
            });

            it('should create generator with custom options', () => {
                const generator = new ReferenceCodeGenerator({
                    includeStableId: false,
                    compact: true,
                });

                expect(generator).toBeDefined();
            });
        });

        describe('generateReferenceCode', () => {
            it('should generate code for reference with stable ID', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const ref: TopologyReference = {
                    type: 'face',
                    baseObjectId: 'box1',
                    stableId: 'uuid-123',
                };

                const code = generator.generateReferenceCode(ref);

                expect(code).toContain('selectFace');
                expect(code).toContain('box1');
                expect(code).toContain('uuid-123');
            });

            it('should generate code for edge reference', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const ref: TopologyReference = {
                    type: 'edge',
                    baseObjectId: 'cylinder1',
                    stableId: 'edge-uuid',
                };

                const code = generator.generateReferenceCode(ref);

                expect(code).toContain('selectEdge');
                expect(code).toContain('cylinder1');
            });

            it('should include semantic selector', () => {
                const generator = new ReferenceCodeGenerator();

                const ref: TopologyReference = {
                    type: 'face',
                    baseObjectId: 'box1',
                    semanticSelector: { type: 'topmost' },
                };

                const code = generator.generateReferenceCode(ref);

                expect(code).toContain('semantic');
                expect(code).toContain('topmost');
            });

            it('should include geometric selector', () => {
                const generator = new ReferenceCodeGenerator();

                const ref: TopologyReference = {
                    type: 'face',
                    baseObjectId: 'box1',
                    geometricSelector: {
                        normalDirection: [0, 0, 1],
                        centroidPosition: [5, 5, 10],
                    },
                };

                const code = generator.generateReferenceCode(ref);

                expect(code).toContain('geometric');
                expect(code).toContain('normalDirection');
                expect(code).toContain('centroidPosition');
            });

            it('should include index hint as fallback', () => {
                const generator = new ReferenceCodeGenerator();

                const ref: TopologyReference = {
                    type: 'face',
                    baseObjectId: 'box1',
                    indexHint: 3,
                };

                const code = generator.generateReferenceCode(ref);

                expect(code).toContain('indexHint');
                expect(code).toContain('3');
            });
        });

        describe('generateFaceSelector', () => {
            it('should generate face selector code', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const code = generator.generateFaceSelector('box1', 'uuid-123');

                expect(code).toContain('selectFace');
                expect(code).toContain('box1');
                expect(code).toContain('uuid-123');
            });

            it('should include semantic selector', () => {
                const generator = new ReferenceCodeGenerator();

                const code = generator.generateFaceSelector(
                    'box1',
                    undefined,
                    { type: 'largest' }
                );

                expect(code).toContain('largest');
            });
        });

        describe('generateEdgeSelector', () => {
            it('should generate edge selector code', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const code = generator.generateEdgeSelector('cylinder1', 'edge-uuid');

                expect(code).toContain('selectEdge');
                expect(code).toContain('cylinder1');
            });
        });

        describe('generateSemanticSelector', () => {
            it('should generate semantic selector code', () => {
                const generator = new ReferenceCodeGenerator();

                const code = generator.generateSemanticSelector('box1', 'face', 'topmost');

                expect(code).toContain('selectTopmost');
                expect(code).toContain('box1');
            });

            it('should include params', () => {
                const generator = new ReferenceCodeGenerator();

                const code = generator.generateSemanticSelector(
                    'box1',
                    'face',
                    'at_position',
                    { position: [0, 0, 10] }
                );

                expect(code).toContain('selectAtPosition');
                expect(code).toContain('position');
            });
        });

        describe('generateGeometricSelector', () => {
            it('should generate geometric selector code', () => {
                const generator = new ReferenceCodeGenerator();

                const code = generator.generateGeometricSelector('box1', 'face', {
                    normalDirection: [0, 0, 1],
                    centroidPosition: [5, 5, 10],
                    areaRange: { min: 90, max: 110 },
                });

                expect(code).toContain('selectFaceByGeometry');
                expect(code).toContain('normalDirection');
                expect(code).toContain('centroidPosition');
                expect(code).toContain('areaRange');
            });
        });

        describe('generateFilletCode', () => {
            it('should generate fillet operation code', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const edgeRef: TopologyReference = {
                    type: 'edge',
                    baseObjectId: 'box1',
                    stableId: 'edge-uuid',
                };

                const code = generator.generateFilletCode('box1', edgeRef, 2);

                expect(code).toContain('fillet');
                expect(code).toContain('2');
                expect(code).toContain('selectEdge');
            });
        });

        describe('generateChamferCode', () => {
            it('should generate chamfer operation code', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const edgeRef: TopologyReference = {
                    type: 'edge',
                    baseObjectId: 'box1',
                    stableId: 'edge-uuid',
                };

                const code = generator.generateChamferCode('box1', edgeRef, 1.5);

                expect(code).toContain('chamfer');
                expect(code).toContain('1.5');
            });
        });

        describe('generateFaceExtrusionCode', () => {
            it('should generate face extrusion code', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const faceRef: TopologyReference = {
                    type: 'face',
                    baseObjectId: 'box1',
                    stableId: 'face-uuid',
                };

                const code = generator.generateFaceExtrusionCode('box1', faceRef, 10);

                expect(code).toContain('extrudeFace');
                expect(code).toContain('10');
            });

            it('should include options', () => {
                const generator = new ReferenceCodeGenerator({ compact: true });

                const faceRef: TopologyReference = {
                    type: 'face',
                    baseObjectId: 'box1',
                    stableId: 'face-uuid',
                };

                const code = generator.generateFaceExtrusionCode('box1', faceRef, 10, {
                    fuseWithOriginal: false,
                });

                expect(code).toContain('fuseWithOriginal');
            });
        });
    });

    describe('createReferenceCodeGenerator', () => {
        it('should create a generator', () => {
            const generator = createReferenceCodeGenerator();

            expect(generator).toBeInstanceOf(ReferenceCodeGenerator);
        });

        it('should pass options', () => {
            const generator = createReferenceCodeGenerator({ compact: true });

            const code = generator.generateReferenceCode({
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid',
            });

            // Compact format should be on one line
            expect(code.split('\n').length).toBe(1);
        });
    });

    describe('generateFaceSelectionCode', () => {
        it('should generate compact face selection code', () => {
            const code = generateFaceSelectionCode('box1', {
                stableId: 'uuid-123',
                index: 0,
            });

            expect(code).toContain('selectFace');
            expect(code).toContain('uuid-123');
        });

        it('should include semantic type', () => {
            const code = generateFaceSelectionCode('box1', {
                semanticType: 'topmost',
            });

            expect(code).toContain('topmost');
        });

        it('should include geometric selectors', () => {
            const code = generateFaceSelectionCode('box1', {
                normal: [0, 0, 1],
                position: [5, 5, 10],
            });

            expect(code).toContain('normalDirection');
            expect(code).toContain('centroidPosition');
        });
    });

    describe('generateEdgeSelectionCode', () => {
        it('should generate compact edge selection code', () => {
            const code = generateEdgeSelectionCode('cylinder1', {
                stableId: 'edge-uuid',
                index: 2,
            });

            expect(code).toContain('selectEdge');
            expect(code).toContain('edge-uuid');
        });
    });

    describe('extractIndexReferences', () => {
        it('should extract getFace references', () => {
            const code = `
const box = makeBox(10, 10, 10);
const face = getFace(box, 0);
const anotherFace = getFace(box, 5);
            `;

            const refs = extractIndexReferences(code);

            expect(refs).toHaveLength(2);
            expect(refs[0].objectId).toBe('box');
            expect(refs[0].entityType).toBe('face');
            expect(refs[0].index).toBe(0);
            expect(refs[1].index).toBe(5);
        });

        it('should extract faces array access', () => {
            const code = `
const box = makeBox(10, 10, 10);
const face = box.faces[3];
            `;

            const refs = extractIndexReferences(code);

            expect(refs).toHaveLength(1);
            expect(refs[0].objectId).toBe('box');
            expect(refs[0].index).toBe(3);
        });

        it('should include code range', () => {
            const code = 'getFace(box, 0)';

            const refs = extractIndexReferences(code);

            expect(refs[0].codeRange.start).toBe(0);
            expect(refs[0].codeRange.end).toBe(code.length);
        });

        it('should handle code with no references', () => {
            const code = `
const box = makeBox(10, 10, 10);
const cylinder = makeCylinder(5, 20);
            `;

            const refs = extractIndexReferences(code);

            expect(refs).toHaveLength(0);
        });
    });

    describe('transformIndexToStableReference', () => {
        it('should transform getFace to selectFace', () => {
            const code = 'const face = getFace(box, 0);';

            const transformed = transformIndexToStableReference(
                code,
                'box',
                'face',
                0,
                'uuid-123'
            );

            expect(transformed).toContain('selectFace');
            expect(transformed).toContain('uuid-123');
            expect(transformed).not.toContain('getFace(box, 0)');
        });

        it('should preserve code around the reference', () => {
            const code = `
const box = makeBox(10, 10, 10);
const face = getFace(box, 0);
const result = face.extrude(5);
            `;

            const transformed = transformIndexToStableReference(
                code,
                'box',
                'face',
                0,
                'uuid-123'
            );

            expect(transformed).toContain('makeBox');
            expect(transformed).toContain('extrude');
        });
    });

    describe('generateMigrationReport', () => {
        it('should report index-based references', () => {
            const code = `
const box = makeBox(10, 10, 10);
const face1 = getFace(box, 0);
const face2 = getFace(box, 1);
const face3 = getFace(box, 2);
            `;

            const report = generateMigrationReport(code);

            expect(report.indexBasedReferences).toBe(3);
            expect(report.recommendations.length).toBeGreaterThan(0);
        });

        it('should report stable references', () => {
            const code = `
const box = makeBox(10, 10, 10);
const face = selectFace(box, { stableId: "uuid-123" });
            `;

            const report = generateMigrationReport(code);

            expect(report.stableReferences).toBe(1);
        });

        it('should report mixed references', () => {
            const code = `
const box = makeBox(10, 10, 10);
const face1 = getFace(box, 0);
const face2 = selectFace(box, { stableId: "uuid" });
            `;

            const report = generateMigrationReport(code);

            expect(report.indexBasedReferences).toBe(1);
            expect(report.stableReferences).toBe(1);
            expect(report.totalReferences).toBe(2);
        });

        it('should handle code with no references', () => {
            const code = `
const box = makeBox(10, 10, 10);
            `;

            const report = generateMigrationReport(code);

            expect(report.totalReferences).toBe(0);
            expect(report.recommendations).toHaveLength(0);
        });
    });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
    beforeEach(() => {
        resetReferenceManager();
    });

    afterEach(() => {
        resetReferenceManager();
    });

    describe('WorkerTopologyBridge + ReferenceManager', () => {
        it('should register references from topology data', () => {
            const manager = getReferenceManager();

            // Simulate topology data from worker
            const topologyData: SerializedTopologyData = {
                featureId: 'box1',
                faces: [
                    {
                        index: 0,
                        stableId: {
                            uuid: 'face-uuid-0',
                            entityType: 'face',
                            featureId: 'box1',
                            sourceOperationId: 'op1',
                            isAlive: true,
                            generation: 1,
                            generatorLinks: [],
                        },
                        signature: { centroid: [0, 0, 10], normal: [0, 0, 1] },
                    },
                ],
                edges: [],
                vertices: [],
                timestamp: Date.now(),
            };

            // Build topology state
            const topologyState = buildTopologyState(topologyData);
            const faceStableId = topologyState.indexToFaceId.get(0);
            expect(faceStableId).toBeDefined();

            // Register reference
            const faceRef: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: faceStableId,
            };

            const state = manager.registerReference('ref1', faceRef, 'feature1');

            // Update status after resolution
            manager.updateReferenceStatus('ref1', 'valid', 0, 1.0, 'stableId');

            const refs = manager.getReferencesForFeature('feature1');
            expect(refs[0].status).toBe('valid');
            expect(refs[0].reference.stableId).toBe('face-uuid-0');
        });
    });

    describe('ReferenceManager + CodeGeneration', () => {
        it('should generate code for registered references', () => {
            const manager = getReferenceManager();
            const generator = new ReferenceCodeGenerator({ compact: true });

            // Register a reference
            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: 'uuid-abc',
                semanticSelector: { type: 'topmost' },
                indexHint: 0,
            };

            const state = manager.registerReference('ref1', ref, 'fillet1');

            // Generate code from the reference
            const code = generator.generateReferenceCode(state.reference);

            expect(code).toContain('uuid-abc');
            expect(code).toContain('topmost');
            expect(code).toContain('indexHint');
        });
    });

    describe('Full Pipeline', () => {
        it('should handle complete topology -> reference -> code flow', () => {
            // Step 1: Generate topology data (simulating worker)
            const mockShape = {
                faces: [
                    { center: { x: 0, y: 0, z: 10 }, area: 100 },
                ],
            };

            const topologyData = generateTopologyForShape(mockShape, 'box1', 'makeBox');

            // Step 2: Build topology state (main thread)
            const topologyState = buildTopologyState(topologyData);

            // Step 3: Create and register reference
            const manager = getReferenceManager();
            const faceStableId = topologyState.indexToFaceId.get(0);
            expect(faceStableId).toBeDefined();

            const ref: TopologyReference = {
                type: 'face',
                baseObjectId: 'box1',
                stableId: faceStableId,
            };

            const state = manager.registerReference('ref1', ref, 'fillet1');

            // Step 4: Update status
            manager.updateReferenceStatus('ref1', 'valid', 0, 1.0, 'stableId');

            // Step 5: Generate code
            const generator = new ReferenceCodeGenerator({ compact: true });
            const code = generator.generateReferenceCode(state.reference);

            // Verify
            expect(code).toContain('selectFace');
            expect(code).toContain(faceStableId!);
        });
    });
});

/**
 * Topology Tracker - Singleton Service
 * 
 * This module provides a global service that tracks all topology changes during
 * model operations. It maintains the TopologyGraph and provides methods for:
 * - Recording new topology entities
 * - Tracking topology evolution through operations
 * - Looking up stable IDs for indices and vice versa
 * 
 * The tracker hooks into the CAD kernel execution to automatically
 * maintain the topology graph.
 */

import {
    StableTopologyId,
    TopologyEntityType,
    GeometricSignature,
    GeneratorLink,
    createStableId,
    generateTopologyUUID,
} from './StableId';
import { TopologyGraph, TopologyNode } from './TopologyGraph';
import { TopologyReference } from './TopologyReference';

// ============================================================================
// Types
// ============================================================================

/**
 * Mapping of display index to stable ID for a specific entity type
 */
export interface IndexToIdMapping {
    /** Feature (AST variable) ID */
    featureId: string;

    /** Entity type */
    entityType: TopologyEntityType;

    /** Map of display index to StableId UUID */
    indexToUuid: Map<number, string>;

    /** Map of StableId UUID to display index */
    uuidToIndex: Map<string, number>;
}

/**
 * Complete topology mapping for a feature after regeneration
 */
export interface FeatureTopologyMapping {
    featureId: string;
    operationId: string;
    faces: IndexToIdMapping;
    edges: IndexToIdMapping;
    vertices: IndexToIdMapping;
    timestamp: number;
}

/**
 * Result of analyzing a shape's topology
 */
export interface TopologyAnalysisResult {
    faces: Array<{
        index: number;
        stableId: StableTopologyId;
        signature: GeometricSignature;
    }>;
    edges: Array<{
        index: number;
        stableId: StableTopologyId;
        signature: GeometricSignature;
    }>;
    vertices: Array<{
        index: number;
        stableId: StableTopologyId;
        position: [number, number, number];
    }>;
}

// ============================================================================
// Topology Tracker Class
// ============================================================================

/**
 * Singleton service that tracks topology evolution across model operations.
 */
export class TopologyTracker {
    private static instance: TopologyTracker | null = null;

    /** The topology graph */
    private graph: TopologyGraph;

    /** Current feature mappings (featureId -> mapping) */
    private featureMappings: Map<string, FeatureTopologyMapping>;

    /** Operation counter for generating unique operation IDs */
    private operationCounter: number;

    /** Current operation context */
    private currentOperationId: string | null;
    private currentOperationName: string | null;

    /** Listeners for topology changes */
    private changeListeners: Set<(featureId: string) => void>;

    private constructor() {
        this.graph = new TopologyGraph();
        this.featureMappings = new Map();
        this.operationCounter = 0;
        this.currentOperationId = null;
        this.currentOperationName = null;
        this.changeListeners = new Set();
    }

    /**
     * Get the singleton instance
     */
    static getInstance(): TopologyTracker {
        if (!TopologyTracker.instance) {
            TopologyTracker.instance = new TopologyTracker();
        }
        return TopologyTracker.instance;
    }

    /**
     * Reset the singleton (for testing)
     */
    static reset(): void {
        TopologyTracker.instance = null;
    }

    // ========================================================================
    // Operation Context
    // ========================================================================

    /**
     * Begin a new operation context
     */
    beginOperation(operationName: string): string {
        this.operationCounter++;
        this.currentOperationId = `op_${this.operationCounter}_${Date.now()}`;
        this.currentOperationName = operationName;
        return this.currentOperationId;
    }

    /**
     * End the current operation context
     */
    endOperation(): void {
        if (this.currentOperationId) {
            this.graph.recordOperation(
                this.currentOperationId,
                this.currentOperationName || undefined
            );
        }
        this.currentOperationId = null;
        this.currentOperationName = null;
    }

    /**
     * Get the current operation ID
     */
    getCurrentOperationId(): string | null {
        return this.currentOperationId;
    }

    // ========================================================================
    // Entity Registration
    // ========================================================================

    /**
     * Register a new face with a stable ID
     */
    registerFace(
        featureId: string,
        displayIndex: number,
        generatorLinks: GeneratorLink[],
        signature?: GeometricSignature,
        label?: string
    ): StableTopologyId {
        const stableId = createStableId({
            entityType: 'face',
            sourceOperationId: this.currentOperationId || 'unknown',
            sourceOperationName: this.currentOperationName || undefined,
            featureId,
            generatorLinks,
            label,
            geometricSignature: signature,
        });

        this.graph.addNode(stableId, displayIndex);
        this.updateMapping(featureId, 'face', displayIndex, stableId.uuid);

        return stableId;
    }

    /**
     * Register a new edge with a stable ID
     */
    registerEdge(
        featureId: string,
        displayIndex: number,
        generatorLinks: GeneratorLink[],
        signature?: GeometricSignature,
        label?: string
    ): StableTopologyId {
        const stableId = createStableId({
            entityType: 'edge',
            sourceOperationId: this.currentOperationId || 'unknown',
            sourceOperationName: this.currentOperationName || undefined,
            featureId,
            generatorLinks,
            label,
            geometricSignature: signature,
        });

        this.graph.addNode(stableId, displayIndex);
        this.updateMapping(featureId, 'edge', displayIndex, stableId.uuid);

        return stableId;
    }

    /**
     * Register a new vertex with a stable ID
     */
    registerVertex(
        featureId: string,
        displayIndex: number,
        generatorLinks: GeneratorLink[],
        position: [number, number, number],
        label?: string
    ): StableTopologyId {
        const stableId = createStableId({
            entityType: 'vertex',
            sourceOperationId: this.currentOperationId || 'unknown',
            sourceOperationName: this.currentOperationName || undefined,
            featureId,
            generatorLinks,
            label,
            geometricSignature: {
                centroid: position,
            },
        });

        this.graph.addNode(stableId, displayIndex);
        this.updateMapping(featureId, 'vertex', displayIndex, stableId.uuid);

        return stableId;
    }

    /**
     * Update the index mapping for a feature
     */
    private updateMapping(
        featureId: string,
        entityType: TopologyEntityType,
        index: number,
        uuid: string
    ): void {
        let mapping = this.featureMappings.get(featureId);
        if (!mapping) {
            mapping = {
                featureId,
                operationId: this.currentOperationId || 'unknown',
                faces: {
                    featureId,
                    entityType: 'face',
                    indexToUuid: new Map(),
                    uuidToIndex: new Map(),
                },
                edges: {
                    featureId,
                    entityType: 'edge',
                    indexToUuid: new Map(),
                    uuidToIndex: new Map(),
                },
                vertices: {
                    featureId,
                    entityType: 'vertex',
                    indexToUuid: new Map(),
                    uuidToIndex: new Map(),
                },
                timestamp: Date.now(),
            };
            this.featureMappings.set(featureId, mapping);
        }

        const typeMapping = entityType === 'face' ? mapping.faces :
            entityType === 'edge' ? mapping.edges : mapping.vertices;

        typeMapping.indexToUuid.set(index, uuid);
        typeMapping.uuidToIndex.set(uuid, index);
    }

    // ========================================================================
    // Lookup Methods
    // ========================================================================

    /**
     * Get the stable ID for a display index
     */
    getStableIdForIndex(
        featureId: string,
        entityType: TopologyEntityType,
        index: number
    ): string | undefined {
        const mapping = this.featureMappings.get(featureId);
        if (!mapping) return undefined;

        const typeMapping = entityType === 'face' ? mapping.faces :
            entityType === 'edge' ? mapping.edges : mapping.vertices;

        return typeMapping.indexToUuid.get(index);
    }

    /**
     * Get the display index for a stable ID
     */
    getIndexForStableId(
        featureId: string,
        entityType: TopologyEntityType,
        uuid: string
    ): number | undefined {
        const mapping = this.featureMappings.get(featureId);
        if (!mapping) return undefined;

        const typeMapping = entityType === 'face' ? mapping.faces :
            entityType === 'edge' ? mapping.edges : mapping.vertices;

        return typeMapping.uuidToIndex.get(uuid);
    }

    /**
     * Get the full StableTopologyId for a UUID
     */
    getStableId(uuid: string): StableTopologyId | undefined {
        return this.graph.getStableId(uuid);
    }

    /**
     * Get the topology node for a UUID
     */
    getNode(uuid: string): TopologyNode | undefined {
        return this.graph.getNode(uuid);
    }

    /**
     * Get all nodes for a feature
     */
    getNodesForFeature(featureId: string): TopologyNode[] {
        return this.graph.getNodesForFeature(featureId);
    }

    // ========================================================================
    // Regeneration Handling
    // ========================================================================

    /**
     * Called before a feature is regenerated - marks all its entities as potentially dead
     */
    beginRegeneration(featureId: string): void {
        const nodes = this.graph.getAliveNodesForFeature(featureId);
        for (const node of nodes) {
            // Don't mark as dead yet, just prepare for update
            node.id.lastRegenAt = Date.now();
        }
    }

    /**
     * Update topology after regeneration using geometric matching
     */
    updateAfterRegeneration(
        featureId: string,
        newTopology: TopologyAnalysisResult
    ): {
        matched: number;
        new: number;
        lost: number;
    } {
        const existingNodes = this.graph.getAliveNodesForFeature(featureId);
        const result = { matched: 0, new: 0, lost: 0 };

        // Clear old mappings
        const mapping = this.featureMappings.get(featureId);
        if (mapping) {
            mapping.faces.indexToUuid.clear();
            mapping.faces.uuidToIndex.clear();
            mapping.edges.indexToUuid.clear();
            mapping.edges.uuidToIndex.clear();
            mapping.vertices.indexToUuid.clear();
            mapping.vertices.uuidToIndex.clear();
            mapping.timestamp = Date.now();
        }

        const matchedUuids = new Set<string>();

        // Match faces
        for (const newFace of newTopology.faces) {
            const existingMatch = this.findBestMatch(existingNodes, 'face', newFace.signature);

            if (existingMatch && !matchedUuids.has(existingMatch.uuid)) {
                // Update existing node
                this.graph.updateNodeIndex(existingMatch.uuid, newFace.index);
                this.updateMapping(featureId, 'face', newFace.index, existingMatch.uuid);

                // Update signature
                existingMatch.geometricSignature = newFace.signature;
                matchedUuids.add(existingMatch.uuid);
                result.matched++;
            } else {
                // Create new node
                this.registerFace(
                    featureId,
                    newFace.index,
                    newFace.stableId.generatorLinks,
                    newFace.signature,
                    newFace.stableId.label
                );
                result.new++;
            }
        }

        // Match edges
        for (const newEdge of newTopology.edges) {
            const existingMatch = this.findBestMatch(existingNodes, 'edge', newEdge.signature);

            if (existingMatch && !matchedUuids.has(existingMatch.uuid)) {
                this.graph.updateNodeIndex(existingMatch.uuid, newEdge.index);
                this.updateMapping(featureId, 'edge', newEdge.index, existingMatch.uuid);
                existingMatch.geometricSignature = newEdge.signature;
                matchedUuids.add(existingMatch.uuid);
                result.matched++;
            } else {
                this.registerEdge(
                    featureId,
                    newEdge.index,
                    newEdge.stableId.generatorLinks,
                    newEdge.signature,
                    newEdge.stableId.label
                );
                result.new++;
            }
        }

        // Match vertices
        for (const newVertex of newTopology.vertices) {
            const vertexSig: GeometricSignature = { centroid: newVertex.position };
            const existingMatch = this.findBestMatch(existingNodes, 'vertex', vertexSig);

            if (existingMatch && !matchedUuids.has(existingMatch.uuid)) {
                this.graph.updateNodeIndex(existingMatch.uuid, newVertex.index);
                this.updateMapping(featureId, 'vertex', newVertex.index, existingMatch.uuid);
                matchedUuids.add(existingMatch.uuid);
                result.matched++;
            } else {
                this.registerVertex(
                    featureId,
                    newVertex.index,
                    newVertex.stableId.generatorLinks,
                    newVertex.position,
                    newVertex.stableId.label
                );
                result.new++;
            }
        }

        // Mark unmatched nodes as dead
        for (const node of existingNodes) {
            if (!matchedUuids.has(node.id.uuid)) {
                this.graph.markNodeDead(node.id.uuid, 'deleted');
                result.lost++;
            }
        }

        // Notify listeners
        this.notifyChange(featureId);

        return result;
    }

    /**
     * Find the best matching existing node for a new entity
     */
    private findBestMatch(
        existingNodes: TopologyNode[],
        entityType: TopologyEntityType,
        signature: GeometricSignature
    ): StableTopologyId | null {
        const candidates = existingNodes.filter(n =>
            n.id.entityType === entityType &&
            n.id.isAlive &&
            n.id.geometricSignature
        );

        let bestMatch: StableTopologyId | null = null;
        let bestConfidence = 0;

        for (const node of candidates) {
            const matches = this.graph.findNodesBySignature(entityType, signature, 0.5);
            for (const match of matches) {
                if (match.node.id.uuid === node.id.uuid && match.confidence > bestConfidence) {
                    bestConfidence = match.confidence;
                    bestMatch = node.id;
                }
            }
        }

        return bestMatch;
    }

    // ========================================================================
    // Change Listeners
    // ========================================================================

    /**
     * Add a listener for topology changes
     */
    addChangeListener(listener: (featureId: string) => void): void {
        this.changeListeners.add(listener);
    }

    /**
     * Remove a change listener
     */
    removeChangeListener(listener: (featureId: string) => void): void {
        this.changeListeners.delete(listener);
    }

    /**
     * Notify listeners of a change
     */
    private notifyChange(featureId: string): void {
        for (const listener of this.changeListeners) {
            try {
                listener(featureId);
            } catch (e) {
                console.error('Topology change listener error:', e);
            }
        }
    }

    // ========================================================================
    // Feature Management
    // ========================================================================

    /**
     * Remove all topology for a feature
     */
    removeFeature(featureId: string): void {
        const nodes = this.graph.getNodesForFeature(featureId);
        for (const node of nodes) {
            this.graph.removeNode(node.id.uuid);
        }
        this.featureMappings.delete(featureId);
        this.notifyChange(featureId);
    }

    /**
     * Get mapping for a feature
     */
    getFeatureMapping(featureId: string): FeatureTopologyMapping | undefined {
        return this.featureMappings.get(featureId);
    }

    // ========================================================================
    // Serialization
    // ========================================================================

    /**
     * Serialize the full tracker state
     */
    serialize(): Record<string, any> {
        const mappings: Record<string, any>[] = [];
        for (const [featureId, mapping] of this.featureMappings) {
            mappings.push({
                featureId,
                operationId: mapping.operationId,
                timestamp: mapping.timestamp,
                faces: {
                    indexToUuid: Array.from(mapping.faces.indexToUuid.entries()),
                    uuidToIndex: Array.from(mapping.faces.uuidToIndex.entries()),
                },
                edges: {
                    indexToUuid: Array.from(mapping.edges.indexToUuid.entries()),
                    uuidToIndex: Array.from(mapping.edges.uuidToIndex.entries()),
                },
                vertices: {
                    indexToUuid: Array.from(mapping.vertices.indexToUuid.entries()),
                    uuidToIndex: Array.from(mapping.vertices.uuidToIndex.entries()),
                },
            });
        }

        return {
            version: 1,
            graph: this.graph.serialize(),
            mappings,
            operationCounter: this.operationCounter,
        };
    }

    /**
     * Deserialize tracker state
     */
    deserialize(data: Record<string, any>): void {
        this.graph = TopologyGraph.deserialize(data.graph || {});
        this.featureMappings.clear();
        this.operationCounter = data.operationCounter || 0;

        if (data.mappings) {
            for (const mappingData of data.mappings) {
                const mapping: FeatureTopologyMapping = {
                    featureId: mappingData.featureId,
                    operationId: mappingData.operationId,
                    timestamp: mappingData.timestamp,
                    faces: {
                        featureId: mappingData.featureId,
                        entityType: 'face',
                        indexToUuid: new Map(mappingData.faces.indexToUuid),
                        uuidToIndex: new Map(mappingData.faces.uuidToIndex),
                    },
                    edges: {
                        featureId: mappingData.featureId,
                        entityType: 'edge',
                        indexToUuid: new Map(mappingData.edges.indexToUuid),
                        uuidToIndex: new Map(mappingData.edges.uuidToIndex),
                    },
                    vertices: {
                        featureId: mappingData.featureId,
                        entityType: 'vertex',
                        indexToUuid: new Map(mappingData.vertices.indexToUuid),
                        uuidToIndex: new Map(mappingData.vertices.uuidToIndex),
                    },
                };
                this.featureMappings.set(mappingData.featureId, mapping);
            }
        }
    }

    /**
     * Clear all tracker data
     */
    clear(): void {
        this.graph.clear();
        this.featureMappings.clear();
        this.operationCounter = 0;
        this.currentOperationId = null;
        this.currentOperationName = null;
    }

    // ========================================================================
    // Statistics
    // ========================================================================

    /**
     * Get statistics about the tracker
     */
    getStats(): {
        features: number;
        graphStats: ReturnType<TopologyGraph['getStats']>;
    } {
        return {
            features: this.featureMappings.size,
            graphStats: this.graph.getStats(),
        };
    }
}

// Export singleton accessor
export function getTopologyTracker(): TopologyTracker {
    return TopologyTracker.getInstance();
}

/**
 * Topology Graph Management
 * 
 * This module maintains the parent-child relationships and history of topology entities.
 * It tracks how entities are created, modified, and destroyed through the model history.
 * 
 * The TopologyGraph is the central data structure for persistent naming:
 * - Records all topology changes during operations
 * - Maintains mapping: StableId → (OperationID, SourceEntity, Result)
 * - Serializable for project save/load
 */

import {
    StableTopologyId,
    TopologyEntityType,
    GeometricSignature,
    serializeStableId,
    deserializeStableId,
} from './StableId';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Represents a node in the topology graph.
 * Each node corresponds to a topological entity (face, edge, vertex).
 */
export interface TopologyNode {
    /** The stable identifier for this entity */
    id: StableTopologyId;

    /** Current transient index in the shape (for display) - may be null if dead */
    currentIndex?: number;

    /** Parent entity UUIDs (entities this was derived from) */
    parentIds: string[];

    /** Child entity UUIDs (entities derived from this) */
    childIds: string[];

    /** Last operation that modified this entity */
    lastModifiedBy?: string;

    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Snapshot of topology state after an operation.
 * Used for history tracking and undo/redo.
 */
export interface TopologySnapshot {
    /** Operation ID this snapshot is for */
    operationId: string;

    /** Operation name for debugging */
    operationName?: string;

    /** Timestamp of the snapshot */
    timestamp: number;

    /** Map of StableId UUID to transient index at this point */
    indexMap: Map<string, number>;

    /** Set of alive entity UUIDs at this point */
    aliveEntities: Set<string>;

    /** Feature ID this operation belongs to */
    featureId?: string;
}

/**
 * Serializable version of TopologySnapshot
 */
export interface SerializedTopologySnapshot {
    operationId: string;
    operationName?: string;
    timestamp: number;
    indexMap: [string, number][];
    aliveEntities: string[];
    featureId?: string;
}

// ============================================================================
// Topology Graph Class
// ============================================================================

/**
 * The TopologyGraph maintains the full history and relationships of all topology entities.
 */
export class TopologyGraph {
    /** Map of StableId UUID to TopologyNode */
    private nodes: Map<string, TopologyNode> = new Map();

    /** Operation history (ordered list of operation IDs) */
    private operationHistory: string[] = [];

    /** Snapshot of topology state after each operation */
    private operationSnapshots: Map<string, TopologySnapshot> = new Map();

    /** Index by feature ID for quick lookup */
    private featureIndex: Map<string, Set<string>> = new Map();

    /** Index by entity type for quick lookup */
    private typeIndex: Map<TopologyEntityType, Set<string>> = new Map();

    constructor() {
        this.typeIndex.set('face', new Set());
        this.typeIndex.set('edge', new Set());
        this.typeIndex.set('vertex', new Set());
    }

    // ========================================================================
    // Node Management
    // ========================================================================

    /**
     * Add a new topology node
     */
    addNode(stableId: StableTopologyId, currentIndex?: number): TopologyNode {
        const node: TopologyNode = {
            id: stableId,
            currentIndex,
            parentIds: stableId.generatorLinks.map(l => l.sourceEntityId),
            childIds: [],
        };

        this.nodes.set(stableId.uuid, node);

        // Update indices
        this.typeIndex.get(stableId.entityType)?.add(stableId.uuid);

        let featureSet = this.featureIndex.get(stableId.featureId);
        if (!featureSet) {
            featureSet = new Set();
            this.featureIndex.set(stableId.featureId, featureSet);
        }
        featureSet.add(stableId.uuid);

        // Update parent-child relationships
        for (const parentId of node.parentIds) {
            const parent = this.nodes.get(parentId);
            if (parent && !parent.childIds.includes(stableId.uuid)) {
                parent.childIds.push(stableId.uuid);
            }
        }

        return node;
    }

    /**
     * Get a node by UUID
     */
    getNode(uuid: string): TopologyNode | undefined {
        return this.nodes.get(uuid);
    }

    /**
     * Get the StableId for a node
     */
    getStableId(uuid: string): StableTopologyId | undefined {
        return this.nodes.get(uuid)?.id;
    }

    /**
     * Update the current index of a node
     */
    updateNodeIndex(uuid: string, newIndex: number): void {
        const node = this.nodes.get(uuid);
        if (node) {
            node.currentIndex = newIndex;
            node.id.lastRegenAt = Date.now();
            node.id.generation++;
        }
    }

    /**
     * Mark a node as dead (entity no longer exists)
     */
    markNodeDead(uuid: string, reason: 'deleted' | 'merged' | 'split' | 'replaced'): void {
        const node = this.nodes.get(uuid);
        if (node) {
            node.id.isAlive = false;
            node.id.deathReason = reason;
            node.currentIndex = undefined;
        }
    }

    /**
     * Mark that an entity was split into multiple new entities
     */
    markNodeSplit(uuid: string, newEntityUuids: string[]): void {
        const node = this.nodes.get(uuid);
        if (node) {
            node.id.isAlive = false;
            node.id.deathReason = 'split';
            node.id.splitInto = newEntityUuids;
            node.currentIndex = undefined;

            // Add parent-child links
            for (const newUuid of newEntityUuids) {
                if (!node.childIds.includes(newUuid)) {
                    node.childIds.push(newUuid);
                }
            }
        }
    }

    /**
     * Mark that an entity was merged into another
     */
    markNodeMerged(uuid: string, mergedIntoUuid: string): void {
        const node = this.nodes.get(uuid);
        if (node) {
            node.id.isAlive = false;
            node.id.deathReason = 'merged';
            node.id.mergedInto = mergedIntoUuid;
            node.currentIndex = undefined;

            // Add parent-child link
            if (!node.childIds.includes(mergedIntoUuid)) {
                node.childIds.push(mergedIntoUuid);
            }
        }
    }

    /**
     * Remove a node completely from the graph
     */
    removeNode(uuid: string): void {
        const node = this.nodes.get(uuid);
        if (!node) return;

        // Remove from indices
        this.typeIndex.get(node.id.entityType)?.delete(uuid);
        this.featureIndex.get(node.id.featureId)?.delete(uuid);

        // Remove from parent's children
        for (const parentId of node.parentIds) {
            const parent = this.nodes.get(parentId);
            if (parent) {
                parent.childIds = parent.childIds.filter(id => id !== uuid);
            }
        }

        // Remove from children's parents
        for (const childId of node.childIds) {
            const child = this.nodes.get(childId);
            if (child) {
                child.parentIds = child.parentIds.filter(id => id !== uuid);
            }
        }

        this.nodes.delete(uuid);
    }

    // ========================================================================
    // Query Methods
    // ========================================================================

    /**
     * Get all nodes for a feature
     */
    getNodesForFeature(featureId: string): TopologyNode[] {
        const uuids = this.featureIndex.get(featureId);
        if (!uuids) return [];
        return Array.from(uuids).map(uuid => this.nodes.get(uuid)!).filter(Boolean);
    }

    /**
     * Get all alive nodes for a feature
     */
    getAliveNodesForFeature(featureId: string): TopologyNode[] {
        return this.getNodesForFeature(featureId).filter(n => n.id.isAlive);
    }

    /**
     * Get all nodes of a specific type
     */
    getNodesOfType(type: TopologyEntityType): TopologyNode[] {
        const uuids = this.typeIndex.get(type);
        if (!uuids) return [];
        return Array.from(uuids).map(uuid => this.nodes.get(uuid)!).filter(Boolean);
    }

    /**
     * Get all alive nodes of a specific type
     */
    getAliveNodesOfType(type: TopologyEntityType): TopologyNode[] {
        return this.getNodesOfType(type).filter(n => n.id.isAlive);
    }

    /**
     * Find nodes by geometric signature match
     */
    findNodesBySignature(
        type: TopologyEntityType,
        signature: GeometricSignature,
        minConfidence: number = 0.7
    ): Array<{ node: TopologyNode; confidence: number }> {
        const candidates = this.getAliveNodesOfType(type);
        const results: Array<{ node: TopologyNode; confidence: number }> = [];

        for (const node of candidates) {
            if (!node.id.geometricSignature) continue;

            const match = this.compareSignatures(node.id.geometricSignature, signature);
            if (match.confidence >= minConfidence) {
                results.push({ node, confidence: match.confidence });
            }
        }

        // Sort by confidence descending
        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }

    /**
     * Compare two geometric signatures
     */
    private compareSignatures(
        sig1: GeometricSignature,
        sig2: GeometricSignature
    ): { confidence: number } {
        let totalScore = 0;
        let maxScore = 0;

        // Compare centroids
        if (sig1.centroid && sig2.centroid) {
            const dist = this.vectorDistance(sig1.centroid, sig2.centroid);
            const tolerance = 1e-4;
            if (dist < tolerance) totalScore += 3;
            else if (dist < tolerance * 10) totalScore += 2;
            else if (dist < tolerance * 100) totalScore += 1;
            maxScore += 3;
        }

        // Compare normals
        if (sig1.normal && sig2.normal) {
            const dot = this.vectorDot(sig1.normal, sig2.normal);
            if (Math.abs(dot - 1) < 0.01) totalScore += 2;
            else if (Math.abs(dot - 1) < 0.1) totalScore += 1;
            maxScore += 2;
        }

        // Compare areas
        if (sig1.area !== undefined && sig2.area !== undefined) {
            const diff = Math.abs(sig1.area - sig2.area) / Math.max(sig1.area, sig2.area, 1e-10);
            if (diff < 0.01) totalScore += 2;
            else if (diff < 0.05) totalScore += 1;
            maxScore += 2;
        }

        // Compare surface type
        if (sig1.surfaceType && sig2.surfaceType) {
            if (sig1.surfaceType === sig2.surfaceType) totalScore += 1;
            maxScore += 1;
        }

        return {
            confidence: maxScore > 0 ? totalScore / maxScore : 0,
        };
    }

    private vectorDistance(a: [number, number, number], b: [number, number, number]): number {
        return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    }

    private vectorDot(a: [number, number, number], b: [number, number, number]): number {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    /**
     * Find a node by current index and type
     */
    findNodeByIndex(featureId: string, type: TopologyEntityType, index: number): TopologyNode | undefined {
        const nodes = this.getAliveNodesForFeature(featureId);
        return nodes.find(n => n.id.entityType === type && n.currentIndex === index);
    }

    /**
     * Get the ancestry chain for a node (parents, grandparents, etc.)
     */
    getAncestry(uuid: string, maxDepth: number = 10): string[] {
        const ancestry: string[] = [];
        const visited = new Set<string>();
        const queue: Array<{ id: string; depth: number }> = [{ id: uuid, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (visited.has(id) || depth > maxDepth) continue;
            visited.add(id);

            const node = this.nodes.get(id);
            if (!node) continue;

            for (const parentId of node.parentIds) {
                ancestry.push(parentId);
                queue.push({ id: parentId, depth: depth + 1 });
            }
        }

        return ancestry;
    }

    /**
     * Get all descendants of a node (children, grandchildren, etc.)
     */
    getDescendants(uuid: string, maxDepth: number = 10): string[] {
        const descendants: string[] = [];
        const visited = new Set<string>();
        const queue: Array<{ id: string; depth: number }> = [{ id: uuid, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (visited.has(id) || depth > maxDepth) continue;
            visited.add(id);

            const node = this.nodes.get(id);
            if (!node) continue;

            for (const childId of node.childIds) {
                descendants.push(childId);
                queue.push({ id: childId, depth: depth + 1 });
            }
        }

        return descendants;
    }

    // ========================================================================
    // Operation History
    // ========================================================================

    /**
     * Record an operation in history
     */
    recordOperation(operationId: string, operationName?: string, featureId?: string): void {
        this.operationHistory.push(operationId);

        // Create snapshot of current state
        const snapshot: TopologySnapshot = {
            operationId,
            operationName,
            timestamp: Date.now(),
            indexMap: new Map(),
            aliveEntities: new Set(),
            featureId,
        };

        for (const [uuid, node] of this.nodes) {
            if (node.id.isAlive) {
                snapshot.aliveEntities.add(uuid);
                if (node.currentIndex !== undefined) {
                    snapshot.indexMap.set(uuid, node.currentIndex);
                }
            }
        }

        this.operationSnapshots.set(operationId, snapshot);
    }

    /**
     * Get a snapshot for an operation
     */
    getSnapshot(operationId: string): TopologySnapshot | undefined {
        return this.operationSnapshots.get(operationId);
    }

    /**
     * Get operation history
     */
    getOperationHistory(): string[] {
        return [...this.operationHistory];
    }

    /**
     * Rollback to a specific operation (for undo)
     */
    rollbackTo(operationId: string): void {
        const targetIndex = this.operationHistory.indexOf(operationId);
        if (targetIndex === -1) return;

        const snapshot = this.operationSnapshots.get(operationId);
        if (!snapshot) return;

        // Mark all entities created after this operation as dead
        for (const [uuid, node] of this.nodes) {
            if (!snapshot.aliveEntities.has(uuid)) {
                node.id.isAlive = false;
                node.currentIndex = undefined;
            } else {
                node.id.isAlive = true;
                node.currentIndex = snapshot.indexMap.get(uuid);
            }
        }

        // Trim history
        this.operationHistory = this.operationHistory.slice(0, targetIndex + 1);
    }

    // ========================================================================
    // Serialization
    // ========================================================================

    /**
     * Serialize the graph to a JSON-safe format
     */
    serialize(): Record<string, any> {
        const nodes: Record<string, any>[] = [];
        for (const [uuid, node] of this.nodes) {
            nodes.push({
                id: serializeStableId(node.id),
                currentIndex: node.currentIndex,
                parentIds: node.parentIds,
                childIds: node.childIds,
                lastModifiedBy: node.lastModifiedBy,
                metadata: node.metadata,
            });
        }

        const snapshots: SerializedTopologySnapshot[] = [];
        for (const [opId, snapshot] of this.operationSnapshots) {
            snapshots.push({
                operationId: snapshot.operationId,
                operationName: snapshot.operationName,
                timestamp: snapshot.timestamp,
                indexMap: Array.from(snapshot.indexMap.entries()),
                aliveEntities: Array.from(snapshot.aliveEntities),
                featureId: snapshot.featureId,
            });
        }

        return {
            version: 1,
            nodes,
            operationHistory: this.operationHistory,
            snapshots,
        };
    }

    /**
     * Deserialize from JSON
     */
    static deserialize(data: Record<string, any>): TopologyGraph {
        const graph = new TopologyGraph();

        if (data.nodes) {
            for (const nodeData of data.nodes) {
                const stableId = deserializeStableId(nodeData.id);
                const node: TopologyNode = {
                    id: stableId,
                    currentIndex: nodeData.currentIndex,
                    parentIds: nodeData.parentIds || [],
                    childIds: nodeData.childIds || [],
                    lastModifiedBy: nodeData.lastModifiedBy,
                    metadata: nodeData.metadata,
                };

                graph.nodes.set(stableId.uuid, node);
                graph.typeIndex.get(stableId.entityType)?.add(stableId.uuid);

                let featureSet = graph.featureIndex.get(stableId.featureId);
                if (!featureSet) {
                    featureSet = new Set();
                    graph.featureIndex.set(stableId.featureId, featureSet);
                }
                featureSet.add(stableId.uuid);
            }
        }

        if (data.operationHistory) {
            graph.operationHistory = data.operationHistory;
        }

        if (data.snapshots) {
            for (const snapData of data.snapshots as SerializedTopologySnapshot[]) {
                const snapshot: TopologySnapshot = {
                    operationId: snapData.operationId,
                    operationName: snapData.operationName,
                    timestamp: snapData.timestamp,
                    indexMap: new Map(snapData.indexMap),
                    aliveEntities: new Set(snapData.aliveEntities),
                    featureId: snapData.featureId,
                };
                graph.operationSnapshots.set(snapData.operationId, snapshot);
            }
        }

        return graph;
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.nodes.clear();
        this.operationHistory = [];
        this.operationSnapshots.clear();
        this.featureIndex.clear();
        this.typeIndex.set('face', new Set());
        this.typeIndex.set('edge', new Set());
        this.typeIndex.set('vertex', new Set());
    }

    /**
     * Get statistics about the graph
     */
    getStats(): {
        totalNodes: number;
        aliveNodes: number;
        deadNodes: number;
        faces: number;
        edges: number;
        vertices: number;
        operations: number;
    } {
        let aliveNodes = 0;
        let deadNodes = 0;

        for (const node of this.nodes.values()) {
            if (node.id.isAlive) aliveNodes++;
            else deadNodes++;
        }

        return {
            totalNodes: this.nodes.size,
            aliveNodes,
            deadNodes,
            faces: this.typeIndex.get('face')?.size || 0,
            edges: this.typeIndex.get('edge')?.size || 0,
            vertices: this.typeIndex.get('vertex')?.size || 0,
            operations: this.operationHistory.length,
        };
    }
}

/**
 * Dependency Analysis and Incremental Execution Engine
 * 
 * Implements a DAG (Directed Acyclic Graph) for feature dependencies,
 * enabling incremental execution like Onshape/Fusion 360.
 * 
 * When a feature is modified, only the features that depend on it
 * (directly or transitively) need to be recomputed. Unrelated features
 * are cached and reused.
 */

import { parse } from '@babel/parser';
import traverseBabel from '@babel/traverse';
import generateBabel from '@babel/generator';
import * as t from '@babel/types';

// Workaround for babel import issues
const traverse = (traverseBabel as any).default || traverseBabel;
const generate = (generateBabel as any).default || generateBabel;

// ============================================================================
// Types
// ============================================================================

/**
 * A node in the feature dependency graph
 */
export interface FeatureDependencyNode {
    /** Feature identifier (variable name) */
    id: string;

    /** Features this feature directly depends on */
    dependencies: Set<string>;

    /** Features that directly depend on this feature */
    dependents: Set<string>;

    /** Hash of the feature's definition for change detection */
    codeHash: string;

    /** Hash of all inputs (code + dependency outputs) */
    inputHash: string;

    /** The code that defines this feature (for re-execution) */
    code: string;

    /** Line range in the source code */
    lineRange: { start: number; end: number };

    /** Whether this feature needs recomputation */
    dirty: boolean;

    /** Order in which this feature should be executed (topological sort order) */
    executionOrder: number;
}

/**
 * Cached execution result for a feature
 */
export interface FeatureCache {
    /** The cached mesh data */
    meshData: {
        vertices: Float32Array;
        indices: Uint32Array;
        normals: Float32Array;
    } | null;

    /** Edge data */
    edgeData: Float32Array | null;

    /** Vertex data */
    vertexData: Float32Array | null;

    /** Face and edge mappings */
    faceMapping?: Array<{ start: number; count: number; faceId: number }>;
    edgeMapping?: Array<{ start: number; count: number; edgeId: number }>;

    /** Hash of inputs when this cache was created */
    inputHash: string;

    /** When this cache was created */
    timestamp: number;
}

/**
 * Result of dependency analysis
 */
export interface DependencyAnalysisResult {
    /** All feature nodes */
    nodes: Map<string, FeatureDependencyNode>;

    /** Topologically sorted execution order */
    executionOrder: string[];

    /** Features that need re-execution */
    dirtyFeatures: Set<string>;

    /** Features that can use cached results */
    cachedFeatures: Set<string>;
}

/**
 * Incremental execution plan
 */
export interface ExecutionPlan {
    /** Features to execute in order */
    toExecute: string[];

    /** Features to reuse from cache */
    toCache: string[];

    /** Code to send to worker (only dirty features) */
    incrementalCode: string;

    /** Full code for initial execution */
    fullCode: string;
}

// ============================================================================
// Dependency Graph
// ============================================================================

/**
 * Manages the feature dependency graph and incremental execution
 */
export class DependencyGraph {
    private nodes: Map<string, FeatureDependencyNode> = new Map();
    private cache: Map<string, FeatureCache> = new Map();
    private executionOrder: string[] = [];

    /**
     * Analyze code and build the dependency graph
     */
    analyze(code: string): DependencyAnalysisResult {
        const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
        const newNodes = new Map<string, FeatureDependencyNode>();

        // First pass: collect all variable declarations
        traverse(ast, {
            VariableDeclarator: (path: any) => {
                if (!t.isIdentifier(path.node.id)) return;

                const varName = path.node.id.name;
                const loc = path.node.loc;
                const codeForNode = generate(path.node.init).code;
                const codeHash = this.hashString(codeForNode);

                newNodes.set(varName, {
                    id: varName,
                    dependencies: new Set(),
                    dependents: new Set(),
                    codeHash,
                    inputHash: '',
                    code: codeForNode,
                    lineRange: loc ? { start: loc.start.line, end: loc.end.line } : { start: 0, end: 0 },
                    dirty: true,
                    executionOrder: 0,
                });

                // Find dependencies - identifiers referenced in the initializer
                path.traverse({
                    Identifier: (idPath: any) => {
                        const refName = idPath.node.name;
                        // Skip if it's the variable being declared or a builtin
                        if (refName !== varName &&
                            refName !== 'replicad' &&
                            !this.isBuiltin(refName) &&
                            newNodes.has(refName)) {
                            newNodes.get(varName)!.dependencies.add(refName);
                        }
                    }
                });
            }
        });

        // Second pass: resolve dependencies to features that exist
        // and build the reverse (dependents) mapping
        for (const [id, node] of newNodes) {
            const validDeps = new Set<string>();
            for (const dep of node.dependencies) {
                if (newNodes.has(dep)) {
                    validDeps.add(dep);
                    newNodes.get(dep)!.dependents.add(id);
                }
            }
            node.dependencies = validDeps;
        }

        // Topological sort
        const sorted = this.topologicalSort(newNodes);

        // Assign execution order
        sorted.forEach((id, index) => {
            newNodes.get(id)!.executionOrder = index;
        });

        // Determine dirty features by comparing with previous state
        const dirtyFeatures = new Set<string>();
        const cachedFeatures = new Set<string>();

        for (const [id, node] of newNodes) {
            const oldNode = this.nodes.get(id);
            const cached = this.cache.get(id);

            // Compute input hash (own code + all dependency output hashes)
            const depHashes = Array.from(node.dependencies)
                .map(dep => newNodes.get(dep)?.codeHash || '')
                .sort()
                .join('|');
            node.inputHash = this.hashString(node.codeHash + '|' + depHashes);

            // Feature is dirty if:
            // 1. It's new (not in old nodes)
            // 2. Its code changed
            // 3. Any of its dependencies are dirty
            // 4. No cache exists
            // 5. Cache input hash doesn't match
            const isNew = !oldNode;
            const codeChanged = oldNode && oldNode.codeHash !== node.codeHash;
            const hasDirtyDep = Array.from(node.dependencies).some(dep => dirtyFeatures.has(dep));
            const noCache = !cached;
            const cacheStale = cached && cached.inputHash !== node.inputHash;

            if (isNew || codeChanged || hasDirtyDep || noCache || cacheStale) {
                node.dirty = true;
                dirtyFeatures.add(id);
            } else {
                node.dirty = false;
                cachedFeatures.add(id);
            }
        }

        // Propagate dirty status to dependents
        const propagateDirty = (id: string) => {
            for (const dep of newNodes.get(id)?.dependents || []) {
                if (!dirtyFeatures.has(dep)) {
                    dirtyFeatures.add(dep);
                    cachedFeatures.delete(dep);
                    newNodes.get(dep)!.dirty = true;
                    propagateDirty(dep);
                }
            }
        };

        for (const id of dirtyFeatures) {
            propagateDirty(id);
        }

        // Update internal state
        this.nodes = newNodes;
        this.executionOrder = sorted;

        return {
            nodes: newNodes,
            executionOrder: sorted,
            dirtyFeatures,
            cachedFeatures,
        };
    }

    /**
     * Create an execution plan based on what's changed
     */
    createExecutionPlan(code: string, analysis?: DependencyAnalysisResult): ExecutionPlan {
        const result = analysis || this.analyze(code);

        const toExecute = result.executionOrder.filter(id => result.dirtyFeatures.has(id));
        const toCache = result.executionOrder.filter(id => result.cachedFeatures.has(id));

        // Generate incremental code - only dirty features, but include
        // dependency references for proper resolution
        const incrementalCode = this.generateIncrementalCode(code, result);

        return {
            toExecute,
            toCache,
            incrementalCode,
            fullCode: code,
        };
    }

    /**
     * Update cache with execution results
     */
    updateCache(results: Array<{
        id: string;
        meshData: FeatureCache['meshData'];
        edgeData: FeatureCache['edgeData'];
        vertexData: FeatureCache['vertexData'];
        faceMapping?: FeatureCache['faceMapping'];
        edgeMapping?: FeatureCache['edgeMapping'];
    }>): void {
        for (const result of results) {
            const node = this.nodes.get(result.id);
            if (node) {
                this.cache.set(result.id, {
                    meshData: result.meshData,
                    edgeData: result.edgeData,
                    vertexData: result.vertexData,
                    faceMapping: result.faceMapping,
                    edgeMapping: result.edgeMapping,
                    inputHash: node.inputHash,
                    timestamp: Date.now(),
                });
                node.dirty = false;
            }
        }
    }

    /**
     * Get cached results for features
     */
    getCached(ids: string[]): Map<string, FeatureCache> {
        const result = new Map<string, FeatureCache>();
        for (const id of ids) {
            const cached = this.cache.get(id);
            if (cached) {
                result.set(id, cached);
            }
        }
        return result;
    }

    /**
     * Invalidate cache for a feature and its dependents
     */
    invalidate(featureId: string): Set<string> {
        const invalidated = new Set<string>();

        const doInvalidate = (id: string) => {
            if (invalidated.has(id)) return;
            invalidated.add(id);
            this.cache.delete(id);

            const node = this.nodes.get(id);
            if (node) {
                node.dirty = true;
                for (const dep of node.dependents) {
                    doInvalidate(dep);
                }
            }
        };

        doInvalidate(featureId);
        return invalidated;
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.cache.clear();
        for (const node of this.nodes.values()) {
            node.dirty = true;
        }
    }

    /**
     * Get dependency information for a feature
     */
    getFeatureInfo(id: string): {
        dependencies: string[];
        dependents: string[];
        isDirty: boolean;
        isCached: boolean;
    } | null {
        const node = this.nodes.get(id);
        if (!node) return null;

        return {
            dependencies: Array.from(node.dependencies),
            dependents: Array.from(node.dependents),
            isDirty: node.dirty,
            isCached: this.cache.has(id),
        };
    }

    /**
     * Get statistics about the cache
     */
    getStats(): {
        totalFeatures: number;
        cachedFeatures: number;
        dirtyFeatures: number;
        cacheSize: number;
    } {
        let cacheSize = 0;
        for (const cached of this.cache.values()) {
            if (cached.meshData?.vertices) cacheSize += cached.meshData.vertices.byteLength;
            if (cached.meshData?.indices) cacheSize += cached.meshData.indices.byteLength;
            if (cached.meshData?.normals) cacheSize += cached.meshData.normals.byteLength;
            if (cached.edgeData) cacheSize += cached.edgeData.byteLength;
            if (cached.vertexData) cacheSize += cached.vertexData.byteLength;
        }

        return {
            totalFeatures: this.nodes.size,
            cachedFeatures: this.cache.size,
            dirtyFeatures: Array.from(this.nodes.values()).filter(n => n.dirty).length,
            cacheSize,
        };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    /**
     * Topological sort using Kahn's algorithm
     */
    private topologicalSort(nodes: Map<string, FeatureDependencyNode>): string[] {
        const result: string[] = [];
        const inDegree = new Map<string, number>();
        const queue: string[] = [];

        // Initialize in-degrees
        for (const [id, node] of nodes) {
            inDegree.set(id, node.dependencies.size);
            if (node.dependencies.size === 0) {
                queue.push(id);
            }
        }

        // Process queue
        while (queue.length > 0) {
            const id = queue.shift()!;
            result.push(id);

            const node = nodes.get(id);
            if (node) {
                for (const dependent of node.dependents) {
                    const degree = (inDegree.get(dependent) || 0) - 1;
                    inDegree.set(dependent, degree);
                    if (degree === 0) {
                        queue.push(dependent);
                    }
                }
            }
        }

        // Check for cycles
        if (result.length !== nodes.size) {
            console.warn('Dependency cycle detected! Falling back to declaration order.');
            return Array.from(nodes.keys());
        }

        return result;
    }

    /**
     * Generate code for incremental execution
     * Includes only dirty features but with proper context
     */
    private generateIncrementalCode(code: string, analysis: DependencyAnalysisResult): string {
        if (analysis.dirtyFeatures.size === analysis.nodes.size) {
            // Everything is dirty, just return full code
            return code;
        }

        // For now, return full code - true incremental execution
        // requires worker-side shape caching which is a bigger change
        // The analysis/caching happens on the main thread for mesh reuse
        return code;
    }

    /**
     * Simple string hash using djb2 algorithm
     */
    private hashString(str: string): string {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    /**
     * Check if an identifier is a builtin/global
     */
    private isBuiltin(name: string): boolean {
        const builtins = new Set([
            'console', 'Math', 'Array', 'Object', 'String', 'Number', 'Boolean',
            'JSON', 'Date', 'RegExp', 'Error', 'Map', 'Set', 'Promise',
            'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
            '__record', // Our injection function
        ]);
        return builtins.has(name);
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let dependencyGraphInstance: DependencyGraph | null = null;

/**
 * Get the global dependency graph instance
 */
export function getDependencyGraph(): DependencyGraph {
    if (!dependencyGraphInstance) {
        dependencyGraphInstance = new DependencyGraph();
    }
    return dependencyGraphInstance;
}

/**
 * Reset the dependency graph (for testing)
 */
export function resetDependencyGraph(): void {
    if (dependencyGraphInstance) {
        dependencyGraphInstance.clearCache();
    }
    dependencyGraphInstance = null;
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * Combine cached results with new execution results
 */
export function mergeExecutionResults(
    cached: Map<string, FeatureCache>,
    newResults: Array<{
        id: string;
        meshData: any;
        edgeData: any;
        vertexData: any;
        faceMapping?: any;
        edgeMapping?: any;
    }>,
    executionOrder: string[]
): Array<{
    id: string;
    meshData: any;
    edgeData: any;
    vertexData: any;
    faceMapping?: any;
    edgeMapping?: any;
    fromCache: boolean;
}> {
    const newResultsMap = new Map(newResults.map(r => [r.id, r]));
    const result: Array<{
        id: string;
        meshData: any;
        edgeData: any;
        vertexData: any;
        faceMapping?: any;
        edgeMapping?: any;
        fromCache: boolean;
    }> = [];

    for (const id of executionOrder) {
        const newResult = newResultsMap.get(id);
        if (newResult) {
            result.push({ ...newResult, fromCache: false });
        } else {
            const cachedResult = cached.get(id);
            if (cachedResult) {
                result.push({
                    id,
                    meshData: cachedResult.meshData,
                    edgeData: cachedResult.edgeData,
                    vertexData: cachedResult.vertexData,
                    faceMapping: cachedResult.faceMapping,
                    edgeMapping: cachedResult.edgeMapping,
                    fromCache: true,
                });
            }
        }
    }

    return result;
}

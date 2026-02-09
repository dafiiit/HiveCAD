/**
 * Reference Status Types
 * 
 * Types for tracking the status of topological references in the UI.
 * 
 * Phase 5: UI Integration
 */

import { TopologyReference, StableTopologyId, GeometricSignature } from '../topology';

// ============================================================================
// Reference Status
// ============================================================================

/**
 * Status of a reference resolution attempt
 */
export type ReferenceStatus =
    | 'valid'           // Reference resolved successfully
    | 'warning'         // Resolved with low confidence
    | 'broken'          // Could not resolve
    | 'pending'         // Resolution in progress
    | 'migrated';       // Was broken, user fixed it

/**
 * Detailed reference state for UI display
 */
export interface ReferenceState {
    /** Unique ID for this reference */
    id: string;

    /** The original reference */
    reference: TopologyReference;

    /** Current status */
    status: ReferenceStatus;

    /** Resolved index (if resolved) */
    resolvedIndex?: number;

    /** Resolution confidence (0-1) */
    confidence: number;

    /** Strategy used to resolve */
    resolvedBy?: 'stableId' | 'semantic' | 'geometric' | 'indexHint' | 'user';

    /** Error message if broken */
    errorMessage?: string;

    /** Alternative candidates if uncertain */
    alternatives?: Array<{
        index: number;
        confidence: number;
        label?: string;
    }>;

    /** Feature ID this reference belongs to */
    featureId: string;

    /** Operation using this reference */
    operationName?: string;

    /** Human-readable description */
    description: string;
}

// ============================================================================
// Reference Resolution Events
// ============================================================================

/**
 * Event fired when a reference status changes
 */
export interface ReferenceStatusChangeEvent {
    type: 'status_change';
    referenceId: string;
    previousStatus: ReferenceStatus;
    newStatus: ReferenceStatus;
    timestamp: number;
}

/**
 * Event fired when user repairs a reference
 */
export interface ReferenceRepairEvent {
    type: 'repair';
    referenceId: string;
    originalIndex?: number;
    newIndex: number;
    method: 'user_select' | 'accept_suggestion' | 'geometric_selector';
    timestamp: number;
}

export type ReferenceEvent = ReferenceStatusChangeEvent | ReferenceRepairEvent;

// ============================================================================
// Reference Manager State
// ============================================================================

/**
 * Global state for managing reference statuses
 */
export interface ReferenceManagerState {
    /** All tracked references */
    references: Map<string, ReferenceState>;

    /** References grouped by feature */
    byFeature: Map<string, Set<string>>;

    /** References that need attention (broken or warning) */
    needsAttention: Set<string>;

    /** Event listeners */
    listeners: Set<(event: ReferenceEvent) => void>;
}

/**
 * Global reference manager singleton
 */
class ReferenceManager {
    private state: ReferenceManagerState = {
        references: new Map(),
        byFeature: new Map(),
        needsAttention: new Set(),
        listeners: new Set(),
    };

    /**
     * Register a reference for tracking
     */
    registerReference(
        id: string,
        reference: TopologyReference,
        featureId: string,
        operationName?: string
    ): ReferenceState {
        const state: ReferenceState = {
            id,
            reference,
            status: 'pending',
            confidence: 0,
            featureId,
            operationName,
            description: this.describeReference(reference),
        };

        this.state.references.set(id, state);

        // Track by feature
        if (!this.state.byFeature.has(featureId)) {
            this.state.byFeature.set(featureId, new Set());
        }
        this.state.byFeature.get(featureId)!.add(id);

        return state;
    }

    /**
     * Update reference status after resolution
     */
    updateReferenceStatus(
        id: string,
        status: ReferenceStatus,
        resolvedIndex?: number,
        confidence?: number,
        resolvedBy?: ReferenceState['resolvedBy'],
        errorMessage?: string,
        alternatives?: ReferenceState['alternatives']
    ): void {
        const state = this.state.references.get(id);
        if (!state) return;

        const previousStatus = state.status;
        state.status = status;
        state.resolvedIndex = resolvedIndex;
        state.confidence = confidence ?? 0;
        state.resolvedBy = resolvedBy;
        state.errorMessage = errorMessage;
        state.alternatives = alternatives;

        // Track items needing attention
        if (status === 'broken' || status === 'warning') {
            this.state.needsAttention.add(id);
        } else {
            this.state.needsAttention.delete(id);
        }

        // Fire event
        this.emit({
            type: 'status_change',
            referenceId: id,
            previousStatus,
            newStatus: status,
            timestamp: Date.now(),
        });
    }

    /**
     * Repair a broken reference by user selection
     */
    repairReference(id: string, newIndex: number, method: ReferenceRepairEvent['method']): void {
        const state = this.state.references.get(id);
        if (!state) return;

        const originalIndex = state.resolvedIndex;

        // Update the reference
        state.status = 'migrated';
        state.resolvedIndex = newIndex;
        state.confidence = 1.0;
        state.resolvedBy = 'user';
        state.errorMessage = undefined;

        this.state.needsAttention.delete(id);

        // Fire event
        this.emit({
            type: 'repair',
            referenceId: id,
            originalIndex,
            newIndex,
            method,
            timestamp: Date.now(),
        });
    }

    /**
     * Get all references for a feature
     */
    getReferencesForFeature(featureId: string): ReferenceState[] {
        const ids = this.state.byFeature.get(featureId);
        if (!ids) return [];
        return Array.from(ids).map(id => this.state.references.get(id)!).filter(Boolean);
    }

    /**
     * Get all references needing attention
     */
    getReferencesNeedingAttention(): ReferenceState[] {
        return Array.from(this.state.needsAttention)
            .map(id => this.state.references.get(id)!)
            .filter(Boolean);
    }

    /**
     * Check if any features have broken references
     */
    hasBrokenReferences(): boolean {
        return this.state.needsAttention.size > 0;
    }

    /**
     * Get broken reference count
     */
    getBrokenReferenceCount(): number {
        let count = 0;
        for (const id of this.state.needsAttention) {
            const state = this.state.references.get(id);
            if (state?.status === 'broken') count++;
        }
        return count;
    }

    /**
     * Add event listener
     */
    addEventListener(listener: (event: ReferenceEvent) => void): () => void {
        this.state.listeners.add(listener);
        return () => this.state.listeners.delete(listener);
    }

    /**
     * Emit event to all listeners
     */
    private emit(event: ReferenceEvent): void {
        for (const listener of this.state.listeners) {
            try {
                listener(event);
            } catch (err) {
                console.error('Reference event listener error:', err);
            }
        }
    }

    /**
     * Generate human-readable description
     */
    private describeReference(ref: TopologyReference): string {
        const parts: string[] = [];
        parts.push(`${ref.type} on ${ref.baseObjectId}`);

        if (ref.stableId) {
            parts.push(`(ID: ${ref.stableId.slice(0, 8)}...)`);
        }

        if (ref.semanticSelector) {
            parts.push(`[${ref.semanticSelector.type}]`);
        }

        if (ref.indexHint !== undefined) {
            parts.push(`#${ref.indexHint}`);
        }

        return parts.join(' ');
    }

    /**
     * Clear all references for a feature
     */
    clearFeatureReferences(featureId: string): void {
        const ids = this.state.byFeature.get(featureId);
        if (!ids) return;

        for (const id of ids) {
            this.state.references.delete(id);
            this.state.needsAttention.delete(id);
        }
        this.state.byFeature.delete(featureId);
    }

    /**
     * Clear all references
     */
    clearAll(): void {
        this.state.references.clear();
        this.state.byFeature.clear();
        this.state.needsAttention.clear();
    }
}

// Singleton instance
let referenceManagerInstance: ReferenceManager | null = null;

/**
 * Get the global reference manager
 */
export function getReferenceManager(): ReferenceManager {
    if (!referenceManagerInstance) {
        referenceManagerInstance = new ReferenceManager();
    }
    return referenceManagerInstance;
}

/**
 * Reset the reference manager (for testing)
 */
export function resetReferenceManager(): void {
    if (referenceManagerInstance) {
        referenceManagerInstance.clearAll();
    }
    referenceManagerInstance = null;
}

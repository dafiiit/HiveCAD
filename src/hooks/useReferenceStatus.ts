/**
 * Reference Status Hook
 * 
 * React hook for accessing reference status in components.
 * 
 * Phase 5: UI Integration
 */

import { useState, useEffect, useCallback } from 'react';
import {
    getReferenceManager,
    ReferenceState,
    ReferenceEvent,
    ReferenceStatus,
} from '../lib/topology';

/**
 * Hook to get reference status for a specific feature
 */
export function useFeatureReferenceStatus(featureId: string): {
    references: ReferenceState[];
    status: ReferenceStatus;
    brokenCount: number;
    warningCount: number;
} {
    const [references, setReferences] = useState<ReferenceState[]>([]);

    useEffect(() => {
        const manager = getReferenceManager();

        const updateRefs = () => {
            setReferences(manager.getReferencesForFeature(featureId));
        };

        updateRefs();

        const unsubscribe = manager.addEventListener((event) => {
            updateRefs();
        });

        return unsubscribe;
    }, [featureId]);

    // Calculate aggregate status
    let status: ReferenceStatus = 'valid';
    let brokenCount = 0;
    let warningCount = 0;

    for (const ref of references) {
        if (ref.status === 'broken') {
            status = 'broken';
            brokenCount++;
        } else if (ref.status === 'warning') {
            if (status !== 'broken') status = 'warning';
            warningCount++;
        } else if (ref.status === 'pending' && status === 'valid') {
            status = 'pending';
        }
    }

    return {
        references,
        status,
        brokenCount,
        warningCount,
    };
}

/**
 * Hook to get global reference status across all features
 */
export function useGlobalReferenceStatus(): {
    totalReferences: number;
    brokenReferences: ReferenceState[];
    warningReferences: ReferenceState[];
    needsAttention: boolean;
    repairAll: () => void;
} {
    const [brokenReferences, setBrokenReferences] = useState<ReferenceState[]>([]);
    const [warningReferences, setWarningReferences] = useState<ReferenceState[]>([]);
    const [totalReferences, setTotalReferences] = useState(0);

    useEffect(() => {
        const manager = getReferenceManager();

        const update = () => {
            const needsAttention = manager.getReferencesNeedingAttention();
            setBrokenReferences(needsAttention.filter(r => r.status === 'broken'));
            setWarningReferences(needsAttention.filter(r => r.status === 'warning'));
            // Note: We'd need to add a method to get total count
            setTotalReferences(needsAttention.length);
        };

        update();

        const unsubscribe = manager.addEventListener(() => update());

        return unsubscribe;
    }, []);

    const repairAll = useCallback(() => {
        // This would trigger the repair dialog for all broken references
        // Implementation depends on UI state management
        console.log('Repair all triggered');
    }, []);

    return {
        totalReferences,
        brokenReferences,
        warningReferences,
        needsAttention: brokenReferences.length > 0 || warningReferences.length > 0,
        repairAll,
    };
}

/**
 * Hook to subscribe to reference events
 */
export function useReferenceEvents(
    onEvent: (event: ReferenceEvent) => void
): void {
    useEffect(() => {
        const manager = getReferenceManager();
        const unsubscribe = manager.addEventListener(onEvent);
        return unsubscribe;
    }, [onEvent]);
}

export default useFeatureReferenceStatus;

/**
 * Reference Indicator Component
 * 
 * Displays a small indicator showing the status of topological references
 * on a feature. Shows green for valid, yellow for warning, red for broken.
 * 
 * Phase 5: UI Integration
 */

import React, { useEffect, useState } from 'react';
import { getReferenceManager, ReferenceState, ReferenceStatus } from '../../lib/topology';

interface ReferenceIndicatorProps {
    /** Feature ID to show reference status for */
    featureId: string;

    /** Size of the indicator (default: 'sm') */
    size?: 'sm' | 'md' | 'lg';

    /** Click handler */
    onClick?: (brokenRefs: ReferenceState[]) => void;

    /** Show tooltip on hover */
    showTooltip?: boolean;
}

/**
 * Get status color
 */
function getStatusColor(status: ReferenceStatus): string {
    switch (status) {
        case 'valid':
        case 'migrated':
            return '#22c55e'; // green-500
        case 'warning':
            return '#f59e0b'; // amber-500
        case 'broken':
            return '#ef4444'; // red-500
        case 'pending':
            return '#6b7280'; // gray-500
        default:
            return '#6b7280';
    }
}

/**
 * Get status icon
 */
function getStatusIcon(status: ReferenceStatus): string {
    switch (status) {
        case 'valid':
        case 'migrated':
            return '✓';
        case 'warning':
            return '⚠';
        case 'broken':
            return '✗';
        case 'pending':
            return '…';
        default:
            return '?';
    }
}

/**
 * Reference status indicator component
 */
export const ReferenceIndicator: React.FC<ReferenceIndicatorProps> = ({
    featureId,
    size = 'sm',
    onClick,
    showTooltip = true,
}) => {
    const [references, setReferences] = useState<ReferenceState[]>([]);
    const [worstStatus, setWorstStatus] = useState<ReferenceStatus>('valid');

    useEffect(() => {
        const manager = getReferenceManager();

        const updateRefs = () => {
            const refs = manager.getReferencesForFeature(featureId);
            setReferences(refs);

            // Determine worst status
            let worst: ReferenceStatus = 'valid';
            for (const ref of refs) {
                if (ref.status === 'broken') {
                    worst = 'broken';
                    break;
                }
                // Use type assertion to avoid TypeScript narrowing issue
                const currentWorst = worst as ReferenceStatus;
                if (ref.status === 'warning' && currentWorst !== 'broken') {
                    worst = 'warning';
                }
                if (ref.status === 'pending' && currentWorst === 'valid') {
                    worst = 'pending';
                }
            }
            setWorstStatus(worst);
        };

        updateRefs();

        // Subscribe to changes
        const unsubscribe = manager.addEventListener((event) => {
            const state = manager.getReferencesForFeature(featureId);
            if (state.some(s => s.id === (event as any).referenceId)) {
                updateRefs();
            }
        });

        return unsubscribe;
    }, [featureId]);

    // Don't render if no references
    if (references.length === 0) {
        return null;
    }

    const sizeClasses = {
        sm: 'w-4 h-4 text-xs',
        md: 'w-5 h-5 text-sm',
        lg: 'w-6 h-6 text-base',
    };

    const brokenCount = references.filter(r => r.status === 'broken').length;
    const warningCount = references.filter(r => r.status === 'warning').length;

    const tooltipText = worstStatus === 'broken'
        ? `${brokenCount} broken reference${brokenCount !== 1 ? 's' : ''}`
        : worstStatus === 'warning'
            ? `${warningCount} uncertain reference${warningCount !== 1 ? 's' : ''}`
            : `${references.length} reference${references.length !== 1 ? 's' : ''} OK`;

    const handleClick = () => {
        if (onClick && (worstStatus === 'broken' || worstStatus === 'warning')) {
            onClick(references.filter(r => r.status === 'broken' || r.status === 'warning'));
        }
    };

    return (
        <div
            className={`
                ${sizeClasses[size]}
                rounded-full
                flex items-center justify-center
                font-bold
                cursor-pointer
                transition-all duration-200
                hover:scale-110
            `}
            style={{
                backgroundColor: getStatusColor(worstStatus),
                color: 'white',
            }}
            onClick={handleClick}
            title={showTooltip ? tooltipText : undefined}
        >
            {worstStatus === 'broken' || worstStatus === 'warning'
                ? getStatusIcon(worstStatus)
                : null}
        </div>
    );
};

export default ReferenceIndicator;

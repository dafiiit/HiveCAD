/**
 * Reference Repair Dialog Component
 * 
 * Modal dialog for repairing broken topological references.
 * Shows candidates and allows user to select the correct entity.
 * 
 * Phase 5: UI Integration
 */

import React, { useState, useCallback } from 'react';
import { getReferenceManager, ReferenceState } from '../../lib/topology';

interface ReferenceRepairDialogProps {
    /** References to repair */
    references: ReferenceState[];

    /** Close handler */
    onClose: () => void;

    /** Called when repair is complete */
    onRepairComplete?: (repairedCount: number) => void;

    /** Optional handler to highlight entity in viewport */
    onHighlightEntity?: (featureId: string, type: 'face' | 'edge' | 'vertex', index: number) => void;
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
}

/**
 * Get status badge color
 */
function getStatusBadgeClass(status: ReferenceState['status']): string {
    switch (status) {
        case 'broken':
            return 'bg-red-500 text-white';
        case 'warning':
            return 'bg-amber-500 text-white';
        case 'valid':
        case 'migrated':
            return 'bg-green-500 text-white';
        default:
            return 'bg-gray-500 text-white';
    }
}

/**
 * Reference repair dialog component
 */
export const ReferenceRepairDialog: React.FC<ReferenceRepairDialogProps> = ({
    references,
    onClose,
    onRepairComplete,
    onHighlightEntity,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [repairedCount, setRepairedCount] = useState(0);
    const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);

    const currentRef = references[currentIndex];
    const isLast = currentIndex >= references.length - 1;

    const handleSelectCandidate = useCallback((index: number) => {
        setSelectedCandidate(index);

        // Highlight in viewport
        if (onHighlightEntity && currentRef) {
            onHighlightEntity(
                currentRef.featureId,
                currentRef.reference.type,
                index
            );
        }
    }, [currentRef, onHighlightEntity]);

    const handleAcceptSuggestion = useCallback(() => {
        if (!currentRef || currentRef.alternatives?.length === 0) return;

        const bestCandidate = currentRef.alternatives?.[0];
        if (!bestCandidate) return;

        const manager = getReferenceManager();
        manager.repairReference(currentRef.id, bestCandidate.index, 'accept_suggestion');

        setRepairedCount(prev => prev + 1);
        moveToNext();
    }, [currentRef]);

    const handleManualSelect = useCallback(() => {
        if (!currentRef || selectedCandidate === null) return;

        const manager = getReferenceManager();
        manager.repairReference(currentRef.id, selectedCandidate, 'user_select');

        setRepairedCount(prev => prev + 1);
        setSelectedCandidate(null);
        moveToNext();
    }, [currentRef, selectedCandidate]);

    const handleSkip = useCallback(() => {
        moveToNext();
    }, []);

    const moveToNext = () => {
        if (isLast) {
            onRepairComplete?.(repairedCount);
            onClose();
        } else {
            setCurrentIndex(prev => prev + 1);
            setSelectedCandidate(null);
        }
    };

    if (!currentRef) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Repair Broken Reference
                        </h2>
                        <p className="text-sm text-gray-400">
                            {currentIndex + 1} of {references.length}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                    {/* Reference Info */}
                    <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(currentRef.status)}`}>
                                {currentRef.status.toUpperCase()}
                            </span>
                            <span className="text-gray-300 text-sm">
                                {currentRef.reference.type}
                            </span>
                        </div>
                        <p className="text-white">{currentRef.description}</p>
                        {currentRef.errorMessage && (
                            <p className="text-red-400 text-sm mt-1">{currentRef.errorMessage}</p>
                        )}
                    </div>

                    {/* Original Index */}
                    {currentRef.reference.indexHint !== undefined && (
                        <div className="mb-4 p-3 bg-gray-700/50 rounded">
                            <p className="text-gray-400 text-sm">
                                Original index: <span className="text-white font-mono">#{currentRef.reference.indexHint}</span>
                            </p>
                        </div>
                    )}

                    {/* Candidates */}
                    {currentRef.alternatives && currentRef.alternatives.length > 0 ? (
                        <div className="mb-4">
                            <h3 className="text-sm font-medium text-gray-300 mb-2">
                                Suggested candidates:
                            </h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {currentRef.alternatives.map((candidate, idx) => (
                                    <button
                                        key={candidate.index}
                                        onClick={() => handleSelectCandidate(candidate.index)}
                                        className={`
                                            w-full p-3 rounded border transition-all
                                            ${selectedCandidate === candidate.index
                                                ? 'border-blue-500 bg-blue-500/20'
                                                : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-white">
                                                    #{candidate.index}
                                                </span>
                                                {candidate.label && (
                                                    <span className="text-gray-400 text-sm">
                                                        {candidate.label}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`
                                                    text-sm font-medium
                                                    ${candidate.confidence > 0.8 ? 'text-green-400' :
                                                        candidate.confidence > 0.5 ? 'text-amber-400' :
                                                            'text-red-400'}
                                                `}>
                                                    {formatConfidence(candidate.confidence)} match
                                                </span>
                                                {idx === 0 && (
                                                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">
                                                        Best
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 p-4 bg-gray-700/30 rounded text-center">
                            <p className="text-gray-400">
                                No candidates found. The referenced entity may have been deleted.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
                    <button
                        onClick={handleSkip}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Skip
                    </button>
                    <div className="flex items-center gap-3">
                        {currentRef.alternatives && currentRef.alternatives.length > 0 && (
                            <>
                                <button
                                    onClick={handleAcceptSuggestion}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                                >
                                    Accept Best Match
                                </button>
                                {selectedCandidate !== null && (
                                    <button
                                        onClick={handleManualSelect}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
                                    >
                                        Use Selected
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReferenceRepairDialog;

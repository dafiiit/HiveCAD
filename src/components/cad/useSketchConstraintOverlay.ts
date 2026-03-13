import { useState, useMemo, useCallback } from 'react';
import { SketchPrimitive } from '../../hooks/useCADStore';
import { SketchConstraint } from '../../lib/solver';
import { toolRegistry } from '../../lib/tools';

export type ConstraintOverlayTarget = {
    kind: 'handle' | 'primitive';
    id: string;
    anchorPoint?: [number, number];
};

interface UseSketchConstraintOverlayProps {
    activeSketchPrimitives: SketchPrimitive[];
    sketchConstraints: (SketchConstraint | { id: string; type: string; entityIds: string[]; driving: boolean; })[];
}

export const useSketchConstraintOverlay = ({
    activeSketchPrimitives,
    sketchConstraints
}: UseSketchConstraintOverlayProps) => {

    const [constraintOverlayTarget, setConstraintOverlayTarget] = useState<ConstraintOverlayTarget | null>(null);
    const [selectedConstraintOverlayId, setSelectedConstraintOverlayId] = useState<string | null>(null);

    const parseEndpointHandleId = useCallback((handleId: string): { primitiveId: string; pointIndex: number } | null => {
        const colonIdx = handleId.lastIndexOf(':');
        if (colonIdx === -1) return null;
        const primitiveId = handleId.slice(0, colonIdx);
        const pointIndex = Number(handleId.slice(colonIdx + 1));
        if (!primitiveId || !Number.isFinite(pointIndex) || pointIndex < 0) return null;
        return { primitiveId, pointIndex };
    }, []);

    const clearConstraintOverlay = useCallback(() => {
        setConstraintOverlayTarget(null);
        setSelectedConstraintOverlayId(null);
    }, []);

    const setConstraintOverlayForHandle = useCallback((handleId: string) => {
        const parsed = parseEndpointHandleId(handleId);
        if (!parsed) {
            clearConstraintOverlay();
            return;
        }
        setConstraintOverlayTarget({ kind: 'handle', id: `${parsed.primitiveId}:${parsed.pointIndex}` });
        setSelectedConstraintOverlayId(null);
    }, [clearConstraintOverlay, parseEndpointHandleId]);

    const setConstraintOverlayForPrimitive = useCallback((primitiveId: string, anchorPoint?: [number, number]) => {
        setConstraintOverlayTarget({ kind: 'primitive', id: primitiveId, anchorPoint });
        setSelectedConstraintOverlayId(null);
    }, []);

    function getMidpoint(prim: SketchPrimitive): [number, number] {
        if (prim.points.length === 0) return [0, 0];
        if (prim.points.length === 1) return prim.points[0];
        const p1 = prim.points[0];
        const p2 = prim.points[prim.points.length - 1];
        return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    }

    const constraintOverlay = useMemo(() => {
        if (!constraintOverlayTarget) return null;

        const matchedById = new Map<string, (typeof sketchConstraints)[number]>();

        if (constraintOverlayTarget.kind === 'handle') {
            const parsed = parseEndpointHandleId(constraintOverlayTarget.id);
            if (!parsed) return null;

            const { primitiveId, pointIndex } = parsed;
            const primitive = activeSketchPrimitives.find(p => p.id === primitiveId);
            const point = primitive?.points[pointIndex];
            if (!primitive || !point) return null;

            const endpointKey = `${primitiveId}:${pointIndex}`;
            const solverEntityIds = (primitive.properties?.solverEntityIds as string[] | undefined) ?? [];
            const solverPointId = solverEntityIds[pointIndex];
            const maybeSolverEntityId = primitive.properties?.solverId as string | undefined;

            for (const constraint of sketchConstraints) {
                const ids = constraint.entityIds ?? [];

                if (ids.includes(endpointKey)) {
                    matchedById.set(constraint.id, constraint);
                    continue;
                }

                if (solverPointId && ids.includes(solverPointId)) {
                    matchedById.set(constraint.id, constraint);
                    continue;
                }

                if (maybeSolverEntityId && ids.includes(maybeSolverEntityId)) {
                    matchedById.set(constraint.id, constraint);
                    continue;
                }

                if (ids.includes(primitiveId) && (constraint.type === 'horizontal' || constraint.type === 'vertical')) {
                    matchedById.set(constraint.id, constraint);
                }
            }

            return {
                anchorPoint: point,
                constraints: Array.from(matchedById.values()),
            };
        }

        const primitive = activeSketchPrimitives.find(p => p.id === constraintOverlayTarget.id);
        if (!primitive) return null;

        const solverId = primitive.properties?.solverId as string | undefined;

        for (const constraint of sketchConstraints) {
            const ids = constraint.entityIds ?? [];

            if (ids.includes(primitive.id)) {
                matchedById.set(constraint.id, constraint);
                continue;
            }

            if (solverId && ids.includes(solverId)) {
                matchedById.set(constraint.id, constraint);
            }
        }

        const fallbackAnchor = primitive.points.length === 0 
            ? [0, 0] as [number, number]
            : primitive.type === 'circle' || primitive.type === 'constructionCircle'
                ? primitive.points[0]
                : getMidpoint(primitive);

        return {
            anchorPoint: constraintOverlayTarget.anchorPoint ?? fallbackAnchor,
            constraints: Array.from(matchedById.values()),
        };
    }, [constraintOverlayTarget, parseEndpointHandleId, activeSketchPrimitives, sketchConstraints]);

    const overlayConstraintItems = useMemo(() => {
        if (!constraintOverlay) return [];

        return constraintOverlay.constraints
            .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
            .map(constraint => {
                const tool = toolRegistry.get(constraint.type as any);
                return {
                    id: constraint.id,
                    type: constraint.type,
                    iconName: tool?.metadata.icon ?? 'HelpCircle',
                    label: tool?.metadata.label ?? constraint.type,
                };
            });
    }, [constraintOverlay]);

    return {
        constraintOverlayTarget,
        setConstraintOverlayTarget,
        selectedConstraintOverlayId,
        setSelectedConstraintOverlayId,
        clearConstraintOverlay,
        setConstraintOverlayForHandle,
        setConstraintOverlayForPrimitive,
        constraintOverlay,
        overlayConstraintItems,
        parseEndpointHandleId
    };
};

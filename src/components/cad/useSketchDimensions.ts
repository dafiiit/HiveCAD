import { useState, useRef, useCallback } from 'react';
import { SketchPrimitive } from '../../hooks/useCADStore';

export interface SketchDimension {
    id: string;
    type: 'length' | 'radius' | 'distance' | 'angle';
    primitiveIds: string[];
    value: number;
    position: [number, number];       // Badge location
    endpoints: [[number, number], [number, number]]; // Reference line endpoints
}

interface UseSketchDimensionsProps {
    pixelScale: number;
    activeSketchPrimitives: SketchPrimitive[];
    storeApiRef: React.MutableRefObject<any>;
    clearPrimitiveSelection: () => void;
    setSketchInputLock: (field: string, value: number) => void;
    clearSketchInputLocks: () => void;
    addSketchPrimitive: (prim: SketchPrimitive) => void;
    updateCurrentDrawingPrimitive: (prim: SketchPrimitive | null) => void;
}

export const useSketchDimensions = ({
    pixelScale,
    activeSketchPrimitives,
    storeApiRef,
    clearPrimitiveSelection,
    setSketchInputLock,
    clearSketchInputLocks,
    addSketchPrimitive,
    updateCurrentDrawingPrimitive
}: UseSketchDimensionsProps) => {

    const [dimFocusedField, setDimFocusedField] = useState<'length' | 'angle' | null>('length');
    const [sketchDimensions, setSketchDimensions] = useState<SketchDimension[]>([]);
    const dimensionFirstPrimRef = useRef<string | null>(null);

    function getMidpoint(prim: SketchPrimitive): [number, number] {
        if (prim.points.length === 0) return [0, 0];
        if (prim.points.length === 1) return prim.points[0];
        const p1 = prim.points[0];
        const p2 = prim.points[prim.points.length - 1];
        return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    }

    const applyDimensionToPrimitive = useCallback((prim: SketchPrimitive) => {
        const id = `dim-${prim.id}-${Date.now()}`;

        if (dimensionFirstPrimRef.current && dimensionFirstPrimRef.current !== prim.id) {
            const lineTypes = ['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'];
            const firstPrim = activeSketchPrimitives.find(p => p.id === dimensionFirstPrimRef.current);

            if (firstPrim && lineTypes.includes(firstPrim.type) && lineTypes.includes(prim.type)
                && firstPrim.points.length >= 2 && prim.points.length >= 2) {
                const l1p1 = firstPrim.points[0];
                const l1p2 = firstPrim.points[firstPrim.points.length - 1];
                const l2p1 = prim.points[0];
                const l2p2 = prim.points[prim.points.length - 1];
                const d1x = l1p2[0] - l1p1[0], d1y = l1p2[1] - l1p1[1];
                const d2x = l2p2[0] - l2p1[0], d2y = l2p2[1] - l2p1[1];
                const dot = d1x * d2x + d1y * d2y;
                const mag1 = Math.hypot(d1x, d1y);
                const mag2 = Math.hypot(d2x, d2y);
                const cosAngle = mag1 > 1e-10 && mag2 > 1e-10 ? Math.max(-1, Math.min(1, dot / (mag1 * mag2))) : 1;
                const angleRad = Math.acos(cosAngle);
                const angleDeg = angleRad * (180 / Math.PI);
                const mid1 = getMidpoint(firstPrim);
                const mid2 = getMidpoint(prim);
                const badgePos: [number, number] = [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2 + 4 * pixelScale];
                setSketchDimensions(prev => [...prev, {
                    id,
                    type: 'angle',
                    primitiveIds: [dimensionFirstPrimRef.current!, prim.id],
                    value: angleDeg,
                    position: badgePos,
                    endpoints: [mid1, mid2],
                }]);
                dimensionFirstPrimRef.current = null;
                clearPrimitiveSelection();
                return;
            }

            const isOriginFirst = dimensionFirstPrimRef.current === '__origin__';
            const mid1: [number, number] = isOriginFirst ? [0, 0] : (() => {
                return firstPrim ? getMidpoint(firstPrim) : [0, 0] as [number, number];
            })();
            const mid2 = getMidpoint(prim);

            if (mid1 && mid2) {
                const dist = Math.sqrt(Math.pow(mid2[0] - mid1[0], 2) + Math.pow(mid2[1] - mid1[1], 2));
                const badgePos: [number, number] = [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2 + 2 * pixelScale];
                setSketchDimensions(prev => [...prev, {
                    id,
                    type: 'distance',
                    primitiveIds: [dimensionFirstPrimRef.current!, prim.id],
                    value: dist,
                    position: badgePos,
                    endpoints: [mid1, mid2],
                }]);
            }
            dimensionFirstPrimRef.current = null;
            clearPrimitiveSelection();
            return;
        }

        const lineTypes = ['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'];
        const arcTypes = ['threePointsArc', 'centerPointArc'];

        if (lineTypes.includes(prim.type) && prim.points.length >= 2) {
            const p1 = prim.points[0];
            const p2 = prim.points[prim.points.length - 1];
            const length = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
            const mx = (p1[0] + p2[0]) / 2;
            const my = (p1[1] + p2[1]) / 2;
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const offsetDist = 8 * pixelScale;
            const badgePos: [number, number] = [mx - (dy / len) * offsetDist, my + (dx / len) * offsetDist];
            setSketchDimensions(prev => [...prev, {
                id,
                type: 'length',
                primitiveIds: [prim.id],
                value: length,
                position: badgePos,
                endpoints: [p1, p2],
            }]);
            dimensionFirstPrimRef.current = prim.id;
        } else if (prim.type === 'circle' && prim.points.length >= 2) {
            const center = prim.points[0];
            const edge = prim.points[1];
            const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
            const badgePos: [number, number] = [(center[0] + edge[0]) / 2, (center[1] + edge[1]) / 2 + 4 * pixelScale];
            setSketchDimensions(prev => [...prev, {
                id,
                type: 'radius',
                primitiveIds: [prim.id],
                value: radius,
                position: badgePos,
                endpoints: [center, edge],
            }]);
            dimensionFirstPrimRef.current = null;
        } else if (arcTypes.includes(prim.type) && prim.points.length >= 3) {
            const pts = prim.points;
            const ax = pts[0][0], ay = pts[0][1];
            const bx = pts[1][0], by = pts[1][1];
            const cx = pts[2][0], cy = pts[2][1];
            const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
            if (Math.abs(d) > 1e-10) {
                const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
                const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
                const radius = Math.sqrt(Math.pow(ax - ux, 2) + Math.pow(ay - uy, 2));
                const badgePos: [number, number] = [(ux + ax) / 2, (uy + ay) / 2 + 4 * pixelScale];
                setSketchDimensions(prev => [...prev, {
                    id,
                    type: 'radius',
                    primitiveIds: [prim.id],
                    value: radius,
                    position: badgePos,
                    endpoints: [[ux, uy], pts[0]],
                }]);
            }
            dimensionFirstPrimRef.current = null;
        } else if (prim.type === 'rectangle' && prim.points.length >= 2) {
            const p1 = prim.points[0];
            const p2 = prim.points[1];
            const width = Math.abs(p2[0] - p1[0]);
            const height = Math.abs(p2[1] - p1[1]);
            const offset = 5 * pixelScale;
            setSketchDimensions(prev => [...prev,
                {
                    id: `${id}-w`,
                    type: 'length',
                    primitiveIds: [prim.id],
                    value: width,
                    position: [(p1[0] + p2[0]) / 2, Math.min(p1[1], p2[1]) - offset],
                    endpoints: [[p1[0], Math.min(p1[1], p2[1])], [p2[0], Math.min(p1[1], p2[1])]],
                },
                {
                    id: `${id}-h`,
                    type: 'length',
                    primitiveIds: [prim.id],
                    value: height,
                    position: [Math.max(p1[0], p2[0]) + offset, (p1[1] + p2[1]) / 2],
                    endpoints: [[Math.max(p1[0], p2[0]), p1[1]], [Math.max(p1[0], p2[0]), p2[1]]],
                },
            ]);
            dimensionFirstPrimRef.current = null;
        } else {
            dimensionFirstPrimRef.current = prim.id;
        }
    }, [activeSketchPrimitives, pixelScale, clearPrimitiveSelection]);

    const handleDimLengthChange = useCallback((value: number) => {
        setSketchInputLock('length', value);
        const state = storeApiRef.current.getState();
        const prim = state.currentDrawingPrimitive;
        if (prim && prim.type === 'line' && prim.points.length >= 2) {
            const start = prim.points[0];
            const currentEnd = prim.points[prim.points.length - 1];
            const dxRaw = currentEnd[0] - start[0];
            const dyRaw = currentEnd[1] - start[1];
            const currentAngle = state.lockedValues.angle != null
                ? (state.lockedValues.angle * Math.PI) / 180
                : Math.atan2(dyRaw, dxRaw);
            const newEnd: [number, number] = [
                start[0] + Math.cos(currentAngle) * value,
                start[1] + Math.sin(currentAngle) * value,
            ];
            const newPoints = [...prim.points];
            newPoints[newPoints.length - 1] = newEnd;
            state.updateCurrentDrawingPrimitive({ ...prim, points: newPoints });
        }
    }, [setSketchInputLock, storeApiRef]);

    const handleDimAngleChange = useCallback((value: number) => {
        setSketchInputLock('angle', value);
        const state = storeApiRef.current.getState();
        const prim = state.currentDrawingPrimitive;
        if (prim && prim.type === 'line' && prim.points.length >= 2) {
            const start = prim.points[0];
            const currentEnd = prim.points[prim.points.length - 1];
            const dxRaw = currentEnd[0] - start[0];
            const dyRaw = currentEnd[1] - start[1];
            const currentLength = state.lockedValues.length != null
                ? state.lockedValues.length
                : Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw);
            const newAngle = (value * Math.PI) / 180;
            const newEnd: [number, number] = [
                start[0] + Math.cos(newAngle) * currentLength,
                start[1] + Math.sin(newAngle) * currentLength,
            ];
            const newPoints = [...prim.points];
            newPoints[newPoints.length - 1] = newEnd;
            state.updateCurrentDrawingPrimitive({ ...prim, points: newPoints });
        }
    }, [setSketchInputLock, storeApiRef]);

    const handleDimFocusChange = useCallback((field: 'length' | 'angle') => {
        setDimFocusedField(field);
    }, []);

    const handleDimEnter = useCallback(() => {
        const state = storeApiRef.current.getState();
        const prim = state.currentDrawingPrimitive;
        if (prim && prim.type === 'line' && prim.points.length >= 2) {
            const finalPoints = [prim.points[0], prim.points[prim.points.length - 1]];
            addSketchPrimitive({
                ...prim,
                points: finalPoints
            });
            clearSketchInputLocks();
            setDimFocusedField('length');
            updateCurrentDrawingPrimitive(null);
        }
    }, [addSketchPrimitive, clearSketchInputLocks, updateCurrentDrawingPrimitive, storeApiRef]);

    return {
        dimFocusedField,
        setDimFocusedField,
        sketchDimensions,
        dimensionFirstPrimRef,
        applyDimensionToPrimitive,
        handleDimLengthChange,
        handleDimAngleChange,
        handleDimFocusChange,
        handleDimEnter
    };
};

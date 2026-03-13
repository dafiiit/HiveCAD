import { useCallback } from 'react';
import { SketchPrimitive } from '../../hooks/useCADStore';
import { getHandlePoints, type HandlePoint } from '../../lib/sketch/interaction-types';

interface UseSketchHitTestProps {
    pixelScale: number;
    activeSketchPrimitives: SketchPrimitive[];
    sketchEntities: Map<string, any>;
}

export const useSketchHitTest = ({
    pixelScale,
    activeSketchPrimitives,
    sketchEntities
}: UseSketchHitTestProps) => {

    const pointToSegmentDist = useCallback((p: [number, number], a: [number, number], b: [number, number]): number => {
        const A = p[0] - a[0];
        const B = p[1] - a[1];
        const C = b[0] - a[0];
        const D = b[1] - a[1];
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = lenSq !== 0 ? dot / lenSq : -1;
        let xx: number, yy: number;
        if (param < 0) { xx = a[0]; yy = a[1]; }
        else if (param > 1) { xx = b[0]; yy = b[1]; }
        else { xx = a[0] + param * C; yy = a[1] + param * D; }
        return Math.sqrt(Math.pow(p[0] - xx, 2) + Math.pow(p[1] - yy, 2));
    }, []);

    const hitTestPrimitives = useCallback((p: [number, number]): string | null => {
        const threshold = 6.0 * pixelScale;
        let closestId: string | null = null;
        let minDist = threshold;

        for (const prim of activeSketchPrimitives) {
            let distance = Infinity;

            // Check proximity to endpoints first
            for (const pt of prim.points) {
                const dx = pt[0] - p[0];
                const dy = pt[1] - p[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) {
                    minDist = d;
                    closestId = prim.id;
                }
            }

            // Check line segments
            if (['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'].includes(prim.type) && prim.points.length >= 2) {
                const p1 = prim.points[0];
                const p2 = prim.points[prim.points.length - 1];
                distance = pointToSegmentDist(p, p1, p2);
            }

            // Check circles
            if (['circle', 'constructionCircle'].includes(prim.type) && prim.points.length >= 2) {
                const center = prim.points[0];
                const edge = prim.points[1];
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
                const distToCenter = Math.sqrt(Math.pow(center[0] - p[0], 2) + Math.pow(center[1] - p[1], 2));
                distance = Math.abs(distToCenter - radius);
            }

            // Check rectangles
            if (['rectangle', 'roundedRectangle'].includes(prim.type) && prim.points.length >= 2) {
                const p1 = prim.points[0];
                const p2 = prim.points[1];
                const corners: [number, number][] = [p1, [p2[0], p1[1]], p2, [p1[0], p2[1]]];
                for (let i = 0; i < 4; i++) {
                    const d = pointToSegmentDist(p, corners[i], corners[(i + 1) % 4]);
                    distance = Math.min(distance, d);
                }
            }

            // Check arcs - threePointsArc and centerPointArc
            if (['threePointsArc', 'arc', 'centerPointArc'].includes(prim.type)) {
                if (prim.type === 'threePointsArc' && prim.points.length >= 3) {
                    // Three-point arc: approximate by checking multiple points along the arc
                    const [start, end, via] = prim.points;
                    // Compute center from three points
                    const ax = start[0], ay = start[1];
                    const bx = end[0], by = end[1];
                    const cx = via[0], cy = via[1];
                    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
                    if (Math.abs(d) > 1e-10) {
                        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
                        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
                        const center: [number, number] = [ux, uy];
                        const radius = Math.sqrt((start[0] - center[0]) ** 2 + (start[1] - center[1]) ** 2);
                        const distToCenter = Math.sqrt((center[0] - p[0]) ** 2 + (center[1] - p[1]) ** 2);
                        distance = Math.abs(distToCenter - radius);
                    }
                } else if (prim.type === 'centerPointArc' && prim.points.length >= 3) {
                    // Center-point arc: [center, start, end]
                    const center = prim.points[0];
                    const radius = Math.sqrt((prim.points[1][0] - center[0]) ** 2 + (prim.points[1][1] - center[1]) ** 2);
                    const distToCenter = Math.sqrt((center[0] - p[0]) ** 2 + (center[1] - p[1]) ** 2);
                    distance = Math.abs(distToCenter - radius);
                }
            }

            if (distance < minDist) {
                minDist = distance;
                closestId = prim.id;
            }
        }

        return closestId;
    }, [activeSketchPrimitives, pixelScale, pointToSegmentDist]);

    const hitTestHandles = useCallback((p: [number, number]): HandlePoint | null => {
        // Threshold must match the largest hit target mesh size (size * 2.5)
        // Largest handle size is 2.0, so threshold = 2.0 * 2.5 = 5.0
        const threshold = 5.0 * pixelScale;
        let bestHandle: HandlePoint | null = null;
        let bestDist = threshold;

        for (const prim of activeSketchPrimitives) {
            const handles = getHandlePoints(prim);
            for (const h of handles) {
                const dx = h.position[0] - p[0];
                const dy = h.position[1] - p[1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestHandle = h;
                }
            }
        }
        return bestHandle;
    }, [activeSketchPrimitives, pixelScale]);

    const hitTest = useCallback((p: [number, number]) => {
        // Higher threshold for easier clicking
        const hitThreshold = 6.0 * pixelScale; // Normalizing threshold with pixelScale as it did before... Wait, in earlier code it was `hitThreshold = 6.0;`
        let closestEntityId: string | null = null;
        let minDistance = 6.0; // Use fixed 6.0 to match earlier code logic

        // 1. Check Solver Entities (Existing Logic)
        sketchEntities.forEach((entity) => {
            let distance = Infinity;
            let weight = 1.0;

            if (entity.type === 'point') {
                const dx = entity.x - p[0];
                const dy = entity.y - p[1];
                distance = Math.sqrt(dx * dx + dy * dy);
                // Give points a selection priority over lines if they are both close
                weight = 0.8;
            } else if (entity.type === 'line') {
                const p1 = sketchEntities.get(entity.p1Id);
                const p2 = sketchEntities.get(entity.p2Id);
                if (p1 && p2 && p1.type === 'point' && p2.type === 'point') {
                    const A = p[0] - p1.x;
                    const B = p[1] - p1.y;
                    const C = p2.x - p1.x;
                    const D = p2.y - p1.y;

                    const dot = A * C + B * D;
                    const lenSq = C * C + D * D;
                    let param = -1;
                    if (lenSq !== 0) param = dot / lenSq;

                    let xx, yy;
                    if (param < 0) { xx = p1.x; yy = p1.y; }
                    else if (param > 1) { xx = p2.x; yy = p2.y; }
                    else { xx = p1.x + param * C; yy = p1.y + param * D; }

                    const dx = p[0] - xx;
                    const dy = p[1] - yy;
                    distance = Math.sqrt(dx * dx + dy * dy);
                }
            } else if (entity.type === 'circle') {
                const center = sketchEntities.get(entity.centerId);
                if (center && center.type === 'point') {
                    const dx = center.x - p[0];
                    const dy = center.y - p[1];
                    const distToCenter = Math.sqrt(dx * dx + dy * dy);
                    distance = Math.abs(distToCenter - entity.radius);
                }
            }

            const weightedDistance = distance * weight;
            if (weightedDistance < minDistance) {
                minDistance = weightedDistance;
                closestEntityId = entity.id;
            }
        });

        // 2. NEW: Check Active Primitives (The shapes you just drew)
        activeSketchPrimitives.forEach((prim) => {
            let distance = Infinity;

            for (const pt of prim.points) {
                const dx = pt[0] - p[0];
                const dy = pt[1] - p[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDistance) {
                    minDistance = d;
                    closestEntityId = prim.id;
                }
            }

            if (prim.type === 'line' && prim.points.length >= 2) {
                const p1 = prim.points[0];
                const p2 = prim.points[1];
                const A = p[0] - p1[0];
                const B = p[1] - p1[1];
                const C = p2[0] - p1[0];
                const D = p2[1] - p1[1];
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = -1;
                if (lenSq !== 0) param = dot / lenSq;

                let xx, yy;
                if (param < 0) { xx = p1[0]; yy = p1[1]; }
                else if (param > 1) { xx = p2[0]; yy = p2[1]; }
                else { xx = p1[0] + param * C; yy = p1[1] + param * D; }

                const dx = p[0] - xx;
                const dy = p[1] - yy;
                distance = Math.sqrt(dx * dx + dy * dy);
            }

            if (prim.type === 'circle' && prim.points.length >= 2) {
                const center = prim.points[0];
                const end = prim.points[1];
                const radius = Math.sqrt(Math.pow(end[0] - center[0], 2) + Math.pow(end[1] - center[1], 2));
                const dx = center[0] - p[0];
                const dy = center[1] - p[1];
                distance = Math.abs(Math.sqrt(dx * dx + dy * dy) - radius);
            }

            if (distance < minDistance) {
                minDistance = distance;
                closestEntityId = prim.id;
            }
        });

        return closestEntityId;
    }, [activeSketchPrimitives, sketchEntities]);

    return {
        pointToSegmentDist,
        hitTestPrimitives,
        hitTestHandles,
        hitTest
    };
};

import { SketchPrimitive } from '../../hooks/useCADStore';
import { arcFromThreePoints } from '../sketch-graph/Geometry';
import { Quadtree } from './Quadtree';
import {
    SnapPoint,
    SnapResult,
    SnapPointType,
    SNAP_PRIORITY,
    SnappingConfig,
    DEFAULT_SNAPPING_CONFIG,
    generateSnapPointId
} from './types';

/**
 * Core engine for handling 2D snapping logic
 */
export class SnappingEngine {
    private quadtree: Quadtree;
    private config: SnappingConfig;
    private snapPoints: SnapPoint[] = [];

    constructor(config: Partial<SnappingConfig> = {}) {
        this.quadtree = new Quadtree();
        this.config = { ...DEFAULT_SNAPPING_CONFIG, ...config };
    }

    /**
     * Update configuration
     */
    setConfig(config: Partial<SnappingConfig>) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Set the entities to snap to
     */
    setEntities(primitives: SketchPrimitive[]) {
        this.snapPoints = [];

        // Extract snap points from all primitives
        primitives.forEach(prim => {
            this.extractSnapPoints(prim);
        });

        // Rebuild spatial index
        this.quadtree.rebuild(this.snapPoints);
    }

    /**
     * Extract snap points from a single primitive
     */
    private extractSnapPoints(prim: SketchPrimitive) {
        // Helper to add point
        const add = (x: number, y: number, type: SnapPointType) => {
            if (!this.shouldSnapTo(type)) return;

            this.snapPoints.push({
                id: generateSnapPointId(),
                x,
                y,
                type,
                sourceEntityId: prim.id,
                priority: SNAP_PRIORITY[type]
            });
        };

        const pts = prim.points;
        if (pts.length === 0) return;

        // 1. Endpoints (Lines, Polylines, Arcs, Splines)
        if (['line', 'vline', 'hline', 'polarline', 'tangentline', 'spline', 'smoothSpline', 'bezier', 'quadraticBezier', 'cubicBezier'].includes(prim.type)) {
            add(pts[0][0], pts[0][1], 'endpoint');
            if (pts.length > 1) {
                add(pts[pts.length - 1][0], pts[pts.length - 1][1], 'endpoint');
            }
        } else if (prim.type === 'threePointsArc' && pts.length >= 2) {
            // Special case for 3-point arc: points are [start, end, via]
            add(pts[0][0], pts[0][1], 'endpoint');
            add(pts[1][0], pts[1][1], 'endpoint');
            // If it's a 3-point arc, we might also want to snap to the 'via' point as a generic point? 
            // For now, let's treat pts[2] as a point too if user wants to snap to it.
            if (pts.length >= 3) {
                add(pts[2][0], pts[2][1], 'endpoint'); // Call it endpoint for now so it's high priority
            }
        }

        // 2. Midpoints (Lines)
        if (['line', 'vline', 'hline', 'polarline', 'tangentline'].includes(prim.type) && pts.length >= 2) {
            const p1 = pts[0];
            const p2 = pts[pts.length - 1]; // Use last point for line segment
            const mx = (p1[0] + p2[0]) / 2;
            const my = (p1[1] + p2[1]) / 2;
            add(mx, my, 'midpoint');
        }

        // 3. Circle/Arc Centers
        if (prim.type === 'circle' && pts.length >= 1) {
            add(pts[0][0], pts[0][1], 'center');
            // For circle, the second point is on the circumference, which we could treat as "endpoint" or special "quadrant" snap?
            // For now, let's just do center.
        }

        // Rectangle corners and center
        if (prim.type === 'rectangle' && pts.length >= 2) {
            const p1 = pts[0];
            const p2 = pts[1];

            // Corners
            add(p1[0], p1[1], 'endpoint');
            add(p2[0], p2[1], 'endpoint');
            add(p1[0], p2[1], 'endpoint');
            add(p2[0], p1[1], 'endpoint');

            // Midpoints
            add((p1[0] + p2[0]) / 2, p1[1], 'midpoint'); // Top/Bottom
            add((p1[0] + p2[0]) / 2, p2[1], 'midpoint');
            add(p1[0], (p1[1] + p2[1]) / 2, 'midpoint'); // Left/Right
            add(p2[0], (p1[1] + p2[1]) / 2, 'midpoint');

            // Center
            add((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, 'center');
        }

        // 4. Arc Snap Points (Center, Midpoint)
        if (prim.type === 'threePointsArc' && pts.length === 3) {
            const p1 = { x: pts[0][0], y: pts[0][1] };
            const p2 = { x: pts[1][0], y: pts[1][1] }; // End
            const p3 = { x: pts[2][0], y: pts[2][1] }; // Mid/Via

            const arc = arcFromThreePoints(p1, p2, p3);
            if (arc) {
                // Center
                add(arc.center.x, arc.center.y, 'center');

                // Midpoint of the arc curve
                // We need to find the angle halfway between start and end in the correct direction
                let startAngle = arc.startAngle;
                let endAngle = arc.endAngle;

                if (arc.ccw) {
                    if (endAngle < startAngle) endAngle += Math.PI * 2;
                } else {
                    if (startAngle < endAngle) startAngle += Math.PI * 2;
                }

                const midAngle = (startAngle + endAngle) / 2;
                const midX = arc.center.x + Math.cos(midAngle) * arc.radius;
                const midY = arc.center.y + Math.sin(midAngle) * arc.radius;

                add(midX, midY, 'midpoint');
            }
        }
    }

    /**
     * Check if specific snap type is enabled
     */
    private shouldSnapTo(type: SnapPointType): boolean {
        switch (type) {
            case 'endpoint': return this.config.snapToEndpoints;
            case 'midpoint': return this.config.snapToMidpoints;
            case 'center': return this.config.snapToCenters;
            case 'grid': return this.config.snapToGrid;
            case 'horizontal':
            case 'vertical':
            case 'extension':
                return this.config.snapToVirtualConstraints;
            default: return true;
        }
    }

    /**
     * Find the best snap target for a given position
     */
    findSnapTarget(x: number, y: number): SnapResult | null {
        const { snapDistance } = this.config;

        // 1. Query Spatial Index for direct snaps (Endpoint, Midpoint, Center)
        const nearest = this.quadtree.findNearest(x, y, snapDistance);

        if (nearest) {
            const dx = nearest.x - x;
            const dy = nearest.y - y;
            return {
                x: nearest.x,
                y: nearest.y,
                snapPoint: nearest,
                distance: Math.sqrt(dx * dx + dy * dy)
            };
        }

        // 2. Virtual Constraints (Horizontal/Vertical alignment)
        if (this.config.snapToVirtualConstraints) {
            const virtualSnap = this.findVirtualSnap(x, y);
            if (virtualSnap) return virtualSnap;
        }

        // 3. Grid Snap
        if (this.config.snapToGrid) {
            const gridSize = this.config.gridSize;
            const gx = Math.round(x / gridSize) * gridSize;
            const gy = Math.round(y / gridSize) * gridSize;

            const dx = gx - x;
            const dy = gy - y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= snapDistance) {
                return {
                    x: gx,
                    y: gy,
                    snapPoint: {
                        id: 'grid_snap',
                        x: gx,
                        y: gy,
                        type: 'grid',
                        priority: SNAP_PRIORITY.grid
                    },
                    distance: dist
                };
            }
        }

        return null;
    }

    /**
     * Find virtual layout constraints (Horizontal/Vertical alignment with existing points)
     * This is computed dynamically as it depends on the cursor position relative to ALL points.
     * To optimize, we could only check points in the viewport or nearby spatial nodes.
     */
    private findVirtualSnap(x: number, y: number): SnapResult | null {
        const { snapDistance } = this.config;
        let bestResult: SnapResult | null = null;
        let minDistance = snapDistance;

        // We need to check alignment with ANY significant point (endpoints, centers)
        // Ideally, we iterate through 'important' snap points.
        // For performance, let's limit to searching a vertical/horizontal band in the quadtree?
        // Or just iterate all snap points if count is low (< 1000). 
        // JavaScript is fast enough for < 1000 points iteration per frame usually.

        // Let's filter only high-priority snap types for alignment (endpoints, centers)
        const alignmentCandidates = this.snapPoints.filter(p =>
            p.type === 'endpoint' || p.type === 'center'
        );

        for (const p of alignmentCandidates) {
            // Horizontal Alignment (same Y)
            const dy = Math.abs(p.y - y);
            if (dy < minDistance) {
                // We are seemingly aligned horizontally with point p
                // Result would be (x, p.y) - keeping X free, locking Y
                // But strictly speaking, a snap *locks* to a point. 
                // Fusion does "guides". The cursor *snaps* to the guide.

                // We check if X is close to the X of the cursor (it is by definition x=x)
                // The "snap point" is virtual: (x, p.y)

                const distance = dy;
                bestResult = {
                    x: x, // Keep cursor X
                    y: p.y, // Snap Y
                    distance: distance,
                    snapPoint: {
                        id: `v_horz_${p.id}`,
                        x: x,
                        y: p.y,
                        type: 'horizontal',
                        priority: SNAP_PRIORITY.horizontal
                    },
                    guideLines: [{
                        from: { x: p.x, y: p.y },
                        to: { x: x, y: p.y },
                        type: 'horizontal'
                    }]
                };
                minDistance = distance;
            }

            // Vertical Alignment (same X)
            const dx = Math.abs(p.x - x);
            if (dx < minDistance) {
                const distance = dx;
                bestResult = {
                    x: p.x, // Snap X
                    y: y, // Keep cursor Y
                    distance: distance,
                    snapPoint: {
                        id: `v_vert_${p.id}`,
                        x: p.x,
                        y: y,
                        type: 'vertical',
                        priority: SNAP_PRIORITY.vertical
                    },
                    guideLines: [{
                        from: { x: p.x, y: p.y },
                        to: { x: p.x, y: y },
                        type: 'vertical'
                    }]
                };
                minDistance = distance;
            }
        }

        // If we found both, we might be at an intersection of two guides!
        // For now, return the best single alignment.
        // A more tracking-heavy approach would be required for "inference" (hover to wake up point).

        return bestResult;
    }
}

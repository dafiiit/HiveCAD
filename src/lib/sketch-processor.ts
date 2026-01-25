import { toast } from 'sonner';
import { CodeManager } from './code-manager';
import { toolRegistry } from './tools';
import { PlanarGraph } from './sketch-graph/Graph';
import { GeometryType, LineSegment, ArcSegment, Circle, arcFromThreePoints } from './sketch-graph/Geometry';
import type { SketchPrimitive } from '../store/types';
import type { EntityId, SketchEntity, ConstraintSolver } from './solver';

interface ProcessSketchParams {
    activeSketchPrimitives: SketchPrimitive[];
    sketchEntities: Map<EntityId, SketchEntity>;
    solverInstance: ConstraintSolver | null;
    sketchPlane: 'XY' | 'XZ' | 'YZ' | null;
    code: string;
}

export function processSketch({
    activeSketchPrimitives,
    sketchEntities,
    solverInstance,
    sketchPlane,
    code
}: ProcessSketchParams): { code: string; sketchName: string | null; error?: string } {

    // SYNC: Copy solver positions back to primitives before processing
    let syncedPrimitives = [...activeSketchPrimitives];

    if (solverInstance?.isInitialized && sketchEntities.size > 0) {
        syncedPrimitives = syncedPrimitives.map(prim => {
            // If primitive has a solverId, get solved position from sketchEntities
            const solverId = prim.properties?.solverId;
            if (!solverId) return prim;

            const entity = sketchEntities.get(solverId as string);
            if (!entity) return prim;

            // Handle different entity types
            if (entity.type === 'point') {
                // Update the relevant point in the primitive (typically the last/end point)
                const newPoints = [...prim.points] as [number, number][];
                if (newPoints.length > 1) {
                    newPoints[newPoints.length - 1] = [entity.x, entity.y];
                } else if (newPoints.length === 1) {
                    newPoints[0] = [entity.x, entity.y];
                }
                return { ...prim, points: newPoints };
            }

            // For line entities, update both endpoints
            if (entity.type === 'line') {
                const p1Entity = sketchEntities.get(entity.p1Id);
                const p2Entity = sketchEntities.get(entity.p2Id);

                if (p1Entity?.type === 'point' && p2Entity?.type === 'point') {
                    return {
                        ...prim,
                        points: [
                            [p1Entity.x, p1Entity.y],
                            [p2Entity.x, p2Entity.y]
                        ] as [number, number][]
                    };
                }
            }

            return prim;
        });
    }

    if (syncedPrimitives.length === 0) {
        return { code, sketchName: null };
    }

    const cm = new CodeManager(code);
    let sketchName: string | null = null;

    // Shape wrapper tools that create standalone drawings
    const shapeWrappers = ['rectangle', 'roundedRectangle', 'circle', 'polygon', 'text'];
    const isSingleShape = syncedPrimitives.length === 1 && shapeWrappers.includes(syncedPrimitives[0].type);

    if (isSingleShape) {
        const firstPrim = syncedPrimitives[0];
        const tool = toolRegistry.get(firstPrim.type);
        if (tool?.createShape && sketchPlane) {
            sketchName = tool.createShape(cm, firstPrim, sketchPlane);
        } else {
            // Fallback for simple shapes
            if (firstPrim.type === 'rectangle') {
                const [p1, p2] = firstPrim.points;
                const width = Math.abs(p2[0] - p1[0]);
                const height = Math.abs(p2[1] - p1[1]);
                sketchName = cm.addFeature('drawRectangle', null, [width, height]);
                const centerX = (p1[0] + p2[0]) / 2;
                const centerY = (p1[1] + p2[1]) / 2;
                if (centerX !== 0 || centerY !== 0) {
                    cm.addOperation(sketchName, 'translate', [centerX, centerY]);
                }
            } else if (firstPrim.type === 'circle') {
                const [center, edge] = firstPrim.points;
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
                sketchName = cm.addFeature('drawCircle', null, [radius]);
                if (center[0] !== 0 || center[1] !== 0) {
                    cm.addOperation(sketchName, 'translate', [center[0], center[1]]);
                }
            }
            if (sketchPlane && sketchName) cm.addOperation(sketchName, 'sketchOnPlane', [sketchPlane]);
        }
    } else {
        // --- PLANAR GRAPH PROFILE DETECTION ---
        const graph = new PlanarGraph();

        syncedPrimitives.forEach(prim => {
            // Regular line
            if (prim.type === 'line') {
                const p1 = { x: prim.points[0][0], y: prim.points[0][1] };
                const p2 = { x: prim.points[1][0], y: prim.points[1][1] };
                graph.addGeometry(new LineSegment(p1, p2));
            }

            // Rectangle
            else if (prim.type === 'rectangle' || prim.type === 'roundedRectangle') {
                const [p1, p2] = prim.points;
                const p3 = { x: p2[0], y: p1[1] };
                const p4 = { x: p1[0], y: p2[1] };

                graph.addGeometry(new LineSegment({ x: p1[0], y: p1[1] }, p3)); // Top/Bottom
                graph.addGeometry(new LineSegment(p3, { x: p2[0], y: p2[1] })); // Right
                graph.addGeometry(new LineSegment({ x: p2[0], y: p2[1] }, p4)); // Bottom/Top
                graph.addGeometry(new LineSegment(p4, { x: p1[0], y: p1[1] })); // Left
            }
            // Circle
            else if (prim.type === 'circle') {
                const [center, edge] = prim.points;
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
                graph.addGeometry(new Circle({ x: center[0], y: center[1] }, radius));
            }
            // Standard arcs (threePointsArc, arc)
            else if (['threePointsArc', 'arc'].includes(prim.type) && prim.points.length >= 3) {
                const p1 = { x: prim.points[0][0], y: prim.points[0][1] };
                const p2 = { x: prim.points[1][0], y: prim.points[1][1] }; // End
                const p3 = { x: prim.points[2][0], y: prim.points[2][1] }; // Mid/Via
                const arc = arcFromThreePoints(p1, p2, p3);
                if (arc) graph.addGeometry(arc);
            }
            // Tangent arc and sagitta arc
            else if (['tangentArc', 'sagittaArc'].includes(prim.type) && prim.points.length >= 2) {
                const p1 = { x: prim.points[0][0], y: prim.points[0][1] };
                const p2 = { x: prim.points[1][0], y: prim.points[1][1] };
                const sagitta = prim.properties?.sagitta || 0;
                if (Math.abs(sagitta) > 0.001) {
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const perpX = -dy / len;
                    const perpY = dx / len;
                    const via = { x: midX + perpX * sagitta, y: midY + perpY * sagitta };
                    const arc = arcFromThreePoints(p1, p2, via);
                    if (arc) graph.addGeometry(arc);
                } else {
                    graph.addGeometry(new LineSegment(p1, p2));
                }
            }
            // Polygon
            else if (prim.type === 'polygon' && prim.points.length >= 2) {
                const center = prim.points[0];
                const edge = prim.points[1];
                const sides = prim.properties?.sides || 6;
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
                const dx = edge[0] - center[0];
                const dy = edge[1] - center[1];
                const startAngle = Math.atan2(dy, dx);

                const polyPoints: { x: number; y: number }[] = [];
                for (let i = 0; i <= sides; i++) {
                    const theta = startAngle + (i / sides) * Math.PI * 2;
                    polyPoints.push({
                        x: center[0] + Math.cos(theta) * radius,
                        y: center[1] + Math.sin(theta) * radius
                    });
                }
                for (let i = 0; i < polyPoints.length - 1; i++) {
                    graph.addGeometry(new LineSegment(polyPoints[i], polyPoints[i + 1]));
                }
            }
            // Ellipse
            else if (prim.type === 'ellipse' && prim.points.length >= 2) {
                const startPt = prim.points[0];
                const endPt = prim.points[1];
                const xRadius = prim.properties?.xRadius || 10;
                const yRadius = prim.properties?.yRadius || 5;
                const cx = (startPt[0] + endPt[0]) / 2;
                const cy = (startPt[1] + endPt[1]) / 2;
                const segments = 32;

                const ellipsePoints: { x: number; y: number }[] = [];
                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * Math.PI * 2;
                    ellipsePoints.push({
                        x: cx + Math.cos(theta) * xRadius,
                        y: cy + Math.sin(theta) * yRadius
                    });
                }
                for (let i = 0; i < ellipsePoints.length - 1; i++) {
                    graph.addGeometry(new LineSegment(ellipsePoints[i], ellipsePoints[i + 1]));
                }
            }
            // Splines
            else if (['spline', 'smoothSpline'].includes(prim.type) && prim.points.length >= 2) {
                const pts = prim.points.map(p => ({ x: p[0], y: p[1] }));
                for (let i = 0; i < pts.length - 1; i++) {
                    graph.addGeometry(new LineSegment(pts[i], pts[i + 1]));
                }
            }
            // Bezier
            else if (['bezier', 'quadraticBezier', 'cubicBezier'].includes(prim.type) && prim.points.length >= 2) {
                const pts = prim.points.map(p => ({ x: p[0], y: p[1] }));
                if (pts.length >= 2) {
                    graph.addGeometry(new LineSegment(pts[0], pts[pts.length > 2 ? 1 : pts.length - 1]));
                }
            }
        });

        graph.computeTopology();
        const allCycles = graph.findCycles();

        const calculateSignedArea = (cycle: { edges: any[], direction: boolean[] }) => {
            let area = 0;
            cycle.edges.forEach((edge, i) => {
                const isFwd = cycle.direction[i];
                const p1 = isFwd ? edge.start.point : edge.end.point;
                const p2 = isFwd ? edge.end.point : edge.start.point;
                area += (p1.x * p2.y - p2.x * p1.y);
            });
            return area / 2;
        };

        const cycles = allCycles
            .filter(c => calculateSignedArea(c) < -1e-9)
            .map(c => ({
                edges: [...c.edges].reverse(),
                direction: [...c.direction].reverse().map(d => !d)
            }));

        if (cycles.length > 0) {
            sketchName = cm.addFeature('draw', null, []);

            cycles.forEach((cycle, cycleIdx) => {
                const firstEdge = cycle.edges[0];
                const isForward = cycle.direction[0];
                let currentPoint = isForward ? firstEdge.start.point : firstEdge.end.point;

                cm.addOperation(sketchName!, 'movePointerTo', [[currentPoint.x, currentPoint.y]]);

                cycle.edges.forEach((edge, i) => {
                    const isFwd = cycle.direction[i];

                    if (edge.geometry.type === GeometryType.Line) {
                        const l = edge.geometry as LineSegment;
                        const pEnd = isFwd ? l.end : l.start;
                        cm.addOperation(sketchName!, 'lineTo', [[pEnd.x, pEnd.y]]);
                        currentPoint = pEnd;
                    } else if (edge.geometry.type === GeometryType.Arc) {
                        const a = edge.geometry as ArcSegment;
                        const pEnd = isFwd ? a.endPoint : a.startPoint;

                        const angle1 = Math.atan2(currentPoint.y - a.center.y, currentPoint.x - a.center.x);
                        const angle2 = Math.atan2(pEnd.y - a.center.y, pEnd.x - a.center.x);
                        const travelCCW = isFwd ? a.ccw : !a.ccw;

                        let sweep = angle2 - angle1;
                        if (travelCCW) {
                            if (sweep <= 0) sweep += 2 * Math.PI;
                        } else {
                            if (sweep >= 0) sweep -= 2 * Math.PI;
                        }

                        const midAngle = angle1 + sweep / 2;
                        const viaX = a.center.x + a.radius * Math.cos(midAngle);
                        const viaY = a.center.y + a.radius * Math.sin(midAngle);

                        cm.addOperation(sketchName!, 'threePointsArcTo', [[pEnd.x, pEnd.y], [viaX, viaY]]);
                        currentPoint = pEnd;
                    }
                });
                cm.addOperation(sketchName!, 'close', []);
            });

            if (sketchPlane && sketchName) {
                cm.addOperation(sketchName, 'sketchOnPlane', [sketchPlane]);
            }
        } else {
            // Wireframe fallback
            sketchName = cm.addFeature('draw', null, []);
            let isFirst = true;

            syncedPrimitives.forEach((prim) => {
                // Line-type
                if (['line', 'vline', 'hline', 'polarline', 'tangentline'].includes(prim.type)) {
                    if (prim.points.length >= 2) {
                        const [p1, p2] = prim.points;
                        if (isFirst) {
                            cm.addOperation(sketchName!, 'movePointerTo', [[p1[0], p1[1]]]);
                            isFirst = false;
                        }
                        cm.addOperation(sketchName!, 'lineTo', [[p2[0], p2[1]]]);
                    }
                }
                // Arcs
                else if (['threePointsArc', 'arc', 'tangentArc', 'sagittaArc'].includes(prim.type)) {
                    if (prim.points.length >= 2) {
                        const p1 = prim.points[0];
                        const p2 = prim.points[1];
                        if (isFirst) {
                            cm.addOperation(sketchName!, 'movePointerTo', [[p1[0], p1[1]]]);
                            isFirst = false;
                        }
                        if (prim.points.length >= 3) {
                            const via = prim.points[2];
                            cm.addOperation(sketchName!, 'threePointsArcTo', [[p2[0], p2[1]], [via[0], via[1]]]);
                        } else {
                            cm.addOperation(sketchName!, 'lineTo', [[p2[0], p2[1]]]);
                        }
                    }
                }
                // Splines
                else if (['spline', 'smoothSpline'].includes(prim.type) && prim.points.length >= 2) {
                    if (isFirst && prim.points.length > 0) {
                        cm.addOperation(sketchName!, 'movePointerTo', [[prim.points[0][0], prim.points[0][1]]]);
                        isFirst = false;
                    }
                    for (let i = 1; i < prim.points.length; i++) {
                        cm.addOperation(sketchName!, 'lineTo', [[prim.points[i][0], prim.points[i][1]]]);
                    }
                }
                // Bezier
                else if (['bezier', 'quadraticBezier', 'cubicBezier'].includes(prim.type) && prim.points.length >= 2) {
                    const p1 = prim.points[0];
                    const p2 = prim.points[1];
                    if (isFirst) {
                        cm.addOperation(sketchName!, 'movePointerTo', [[p1[0], p1[1]]]);
                        isFirst = false;
                    }
                    cm.addOperation(sketchName!, 'lineTo', [[p2[0], p2[1]]]);
                }
            });

            if (sketchPlane && sketchName) {
                cm.addOperation(sketchName, 'sketchOnPlane', [sketchPlane]);
            }
            // Note: toast side effect is not here, we leave it to the caller if needed
            // But user wanted "extract pure utility". A toast is a side effect.
            // I'll return info if it was open wire so caller can toast.
        }
    }

    return { code: cm.getCode(), sketchName };
}

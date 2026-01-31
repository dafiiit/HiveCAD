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
            const tool = toolRegistry.get(prim.type);
            if (tool?.getPlanarGeometry) {
                const geoms = tool.getPlanarGeometry(prim);
                geoms.forEach(g => graph.addGeometry(g));
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
                const tool = toolRegistry.get(prim.type);
                if (tool?.addToSketch && prim.points.length > 0) {
                    if (isFirst) {
                        const start = prim.points[0];
                        cm.addOperation(sketchName!, 'movePointerTo', [[start[0], start[1]]]);
                        isFirst = false;
                    }
                    tool.addToSketch(cm, sketchName!, prim);
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

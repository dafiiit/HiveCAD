/**
 * Sketch Code Generator
 * 
 * Converts SketchObject entities into Replicad JavaScript code.
 * Handles both closed profiles (extrudable) and open wires.
 * 
 * The key improvement over the old processSketch() is that this
 * generates code from the persistent SketchObject, not from transient
 * drawing primitives — enabling re-generation at any time.
 */

import { CodeManager } from '../code-manager';
import { PlanarGraph } from '../sketch-graph/Graph';
import {
    GeometryType, LineSegment, ArcSegment, Circle,
    arcFromThreePoints, Point2D as GeoPoint2D
} from '../sketch-graph/Geometry';
import type {
    SketchObject, SketchEntity, SketchPlane, Point2D
} from './types';

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

export interface CodeGenResult {
    /** Updated full source code */
    code: string;
    /** The feature variable name created (e.g., "shape1") */
    featureId: string | null;
    /** Whether profiles were found (closed loops) */
    hasClosedProfile: boolean;
    /** Error message if generation failed */
    error?: string;
}

/**
 * Generate Replicad code from a SketchObject.
 */
export function generateSketchCode(
    sketch: SketchObject,
    existingCode: string,
): CodeGenResult {
    const nonConstructionEntities = sketch.entities.filter(e => !e.construction);

    if (nonConstructionEntities.length === 0) {
        return { code: existingCode, featureId: null, hasClosedProfile: false };
    }

    const cm = new CodeManager(existingCode);

    // Check if this is a single shape wrapper (rectangle, circle, polygon, text)
    const shapeTypes = ['rectangle', 'roundedRectangle', 'circle', 'polygon', 'text', 'ellipse'];
    const isSingleShape = nonConstructionEntities.length === 1 &&
        shapeTypes.includes(nonConstructionEntities[0].type);

    let featureId: string | null = null;
    let hasClosedProfile = false;

    if (isSingleShape) {
        const entity = nonConstructionEntities[0];
        const result = generateShapeCode(cm, entity, sketch.plane);
        featureId = result;
        hasClosedProfile = true;
    } else {
        // Attempt planar graph profile detection for closed profiles
        const graphResult = generateProfileCode(cm, nonConstructionEntities, sketch.plane);
        featureId = graphResult.featureId;
        hasClosedProfile = graphResult.hasClosedProfile;

        if (!hasClosedProfile) {
            // Generate wire code as fallback (still visible + usable)
            const wireResult = generateWireCode(cm, nonConstructionEntities, sketch.plane);
            featureId = wireResult;
        }
    }

    return {
        code: cm.getCode(),
        featureId,
        hasClosedProfile,
    };
}

// ──────────────────────────────────────────────────────────────
// Shape Wrappers
// ──────────────────────────────────────────────────────────────

function generateShapeCode(
    cm: CodeManager,
    entity: SketchEntity,
    plane: SketchPlane,
): string {
    let featureId: string;

    switch (entity.type) {
        case 'rectangle': {
            const [p1, p2] = entity.points;
            const width = Math.abs(p2[0] - p1[0]);
            const height = Math.abs(p2[1] - p1[1]);
            featureId = cm.addFeature('drawRectangle', null, [width, height]);
            const cx = (p1[0] + p2[0]) / 2;
            const cy = (p1[1] + p2[1]) / 2;
            if (cx !== 0 || cy !== 0) {
                cm.addOperation(featureId, 'translate', [cx, cy]);
            }
            break;
        }
        case 'roundedRectangle': {
            const [p1, p2] = entity.points;
            const width = Math.abs(p2[0] - p1[0]);
            const height = Math.abs(p2[1] - p1[1]);
            const r = entity.properties.cornerRadius ?? 3;
            featureId = cm.addFeature('drawRoundedRectangle', null, [width, height, r]);
            const cx = (p1[0] + p2[0]) / 2;
            const cy = (p1[1] + p2[1]) / 2;
            if (cx !== 0 || cy !== 0) {
                cm.addOperation(featureId, 'translate', [cx, cy]);
            }
            break;
        }
        case 'circle': {
            const [center, edge] = entity.points;
            const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
            featureId = cm.addFeature('drawCircle', null, [radius]);
            if (center[0] !== 0 || center[1] !== 0) {
                cm.addOperation(featureId, 'translate', [center[0], center[1]]);
            }
            break;
        }
        case 'polygon': {
            const [center, edge] = entity.points;
            const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
            const sides = entity.properties.sides ?? 6;
            const sagitta = entity.properties.sagitta ?? 0;
            featureId = cm.addFeature('drawPolysides', null, [radius, sides, sagitta]);
            if (center[0] !== 0 || center[1] !== 0) {
                cm.addOperation(featureId, 'translate', [center[0], center[1]]);
            }
            break;
        }
        case 'text': {
            const pos = entity.points[0];
            const text = entity.properties.text ?? 'Text';
            const fontSize = entity.properties.fontSize ?? 16;
            featureId = cm.addFeature('drawText', null, [text, {
                startX: pos[0], startY: pos[1], fontSize
            }]);
            break;
        }
        case 'ellipse': {
            const [center, edge] = entity.points;
            const rx = Math.abs(edge[0] - center[0]);
            const ry = Math.abs(edge[1] - center[1]);
            featureId = cm.addFeature('drawEllipse', null, [rx, ry]);
            if (center[0] !== 0 || center[1] !== 0) {
                cm.addOperation(featureId, 'translate', [center[0], center[1]]);
            }
            break;
        }
        default:
            featureId = cm.addFeature('draw', null, []);
    }

    cm.addOperation(featureId, 'sketchOnPlane', [plane]);
    return featureId;
}

// ──────────────────────────────────────────────────────────────
// Profile Detection (Closed Loops)
// ──────────────────────────────────────────────────────────────

function entityToPlanarGeometry(entity: SketchEntity): any[] {
    const geoms: any[] = [];

    switch (entity.type) {
        case 'line': {
            for (let i = 0; i < entity.points.length - 1; i++) {
                const p1 = { x: entity.points[i][0], y: entity.points[i][1] };
                const p2 = { x: entity.points[i + 1][0], y: entity.points[i + 1][1] };
                geoms.push(new LineSegment(p1, p2));
            }
            break;
        }
        case 'arc': {
            if (entity.points.length >= 3) {
                const p1 = { x: entity.points[0][0], y: entity.points[0][1] };
                const p2 = { x: entity.points[1][0], y: entity.points[1][1] };
                const p3 = { x: entity.points[2][0], y: entity.points[2][1] };
                const arc = arcFromThreePoints(p1, p2, p3);
                if (arc) geoms.push(arc);
            }
            break;
        }
        case 'centerPointArc': {
            // points: [center, start, end]
            if (entity.points.length >= 3) {
                const center = entity.points[0];
                const startPt = entity.points[1];
                const endPt = entity.points[2];
                const radius = Math.hypot(startPt[0] - center[0], startPt[1] - center[1]);
                const startAngle = Math.atan2(startPt[1] - center[1], startPt[0] - center[0]);
                const endAngle = Math.atan2(endPt[1] - center[1], endPt[0] - center[0]);
                // Generate arc segments for approximation in the planar graph
                const SEGS = 16;
                let sweep = endAngle - startAngle;
                if (sweep <= 0) sweep += 2 * Math.PI;
                for (let i = 0; i < SEGS; i++) {
                    const a1 = startAngle + (i / SEGS) * sweep;
                    const a2 = startAngle + ((i + 1) / SEGS) * sweep;
                    geoms.push(new LineSegment(
                        { x: center[0] + radius * Math.cos(a1), y: center[1] + radius * Math.sin(a1) },
                        { x: center[0] + radius * Math.cos(a2), y: center[1] + radius * Math.sin(a2) },
                    ));
                }
            }
            break;
        }
        case 'ellipse': {
            // points: [center, radiusPoint] with properties.radiusY or both radii derived
            if (entity.points.length >= 2) {
                const center = entity.points[0];
                const edge = entity.points[1];
                const rx = Math.abs(edge[0] - center[0]) || 1;
                const ry = entity.properties.radiusY ?? (Math.abs(edge[1] - center[1]) || 1);
                // Approximate as polygon
                const SEGS = 32;
                const pts: GeoPoint2D[] = [];
                for (let i = 0; i <= SEGS; i++) {
                    const theta = (i / SEGS) * Math.PI * 2;
                    pts.push({ x: center[0] + rx * Math.cos(theta), y: center[1] + ry * Math.sin(theta) });
                }
                for (let i = 0; i < pts.length - 1; i++) {
                    geoms.push(new LineSegment(pts[i], pts[i + 1]));
                }
            }
            break;
        }
        case 'circle': {
            if (entity.points.length >= 2) {
                const [center, edge] = entity.points;
                const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
                geoms.push(new Circle({ x: center[0], y: center[1] }, radius));
            }
            break;
        }
        case 'rectangle': {
            if (entity.points.length >= 2) {
                const [p1, p2] = entity.points;
                const corners = [
                    { x: p1[0], y: p1[1] },
                    { x: p2[0], y: p1[1] },
                    { x: p2[0], y: p2[1] },
                    { x: p1[0], y: p2[1] },
                ];
                for (let i = 0; i < 4; i++) {
                    geoms.push(new LineSegment(corners[i], corners[(i + 1) % 4]));
                }
            }
            break;
        }
        case 'roundedRectangle': {
            // Use rectangle edges for graph (simplified)
            if (entity.points.length >= 2) {
                const [p1, p2] = entity.points;
                const corners = [
                    { x: p1[0], y: p1[1] },
                    { x: p2[0], y: p1[1] },
                    { x: p2[0], y: p2[1] },
                    { x: p1[0], y: p2[1] },
                ];
                for (let i = 0; i < 4; i++) {
                    geoms.push(new LineSegment(corners[i], corners[(i + 1) % 4]));
                }
            }
            break;
        }
        case 'polygon': {
            if (entity.points.length >= 2) {
                const center = entity.points[0];
                const edge = entity.points[1];
                const sides = entity.properties.sides ?? 6;
                const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
                const startAngle = Math.atan2(edge[1] - center[1], edge[0] - center[0]);

                const pts: GeoPoint2D[] = [];
                for (let i = 0; i <= sides; i++) {
                    const theta = startAngle + (i / sides) * Math.PI * 2;
                    pts.push({
                        x: center[0] + Math.cos(theta) * radius,
                        y: center[1] + Math.sin(theta) * radius,
                    });
                }
                for (let i = 0; i < pts.length - 1; i++) {
                    geoms.push(new LineSegment(pts[i], pts[i + 1]));
                }
            }
            break;
        }
        case 'smoothSpline':
        case 'bezier':
        case 'quadraticBezier':
        case 'cubicBezier': {
            // Approximate as line segments between control points
            for (let i = 0; i < entity.points.length - 1; i++) {
                const p1 = { x: entity.points[i][0], y: entity.points[i][1] };
                const p2 = { x: entity.points[i + 1][0], y: entity.points[i + 1][1] };
                geoms.push(new LineSegment(p1, p2));
            }
            break;
        }
    }

    return geoms;
}

function generateProfileCode(
    cm: CodeManager,
    entities: SketchEntity[],
    plane: SketchPlane,
): { featureId: string | null; hasClosedProfile: boolean } {
    const graph = new PlanarGraph();

    for (const entity of entities) {
        const geoms = entityToPlanarGeometry(entity);
        for (const g of geoms) {
            graph.addGeometry(g);
        }
    }

    graph.computeTopology();
    const allCycles = graph.findCycles();

    const calculateSignedArea = (cycle: { edges: any[]; direction: boolean[] }) => {
        let area = 0;
        cycle.edges.forEach((edge, i) => {
            const isFwd = cycle.direction[i];
            const p1 = isFwd ? edge.start.point : edge.end.point;
            const p2 = isFwd ? edge.end.point : edge.start.point;
            area += p1.x * p2.y - p2.x * p1.y;
        });
        return area / 2;
    };

    // Filter to exterior boundaries (CCW = negative signed area → reverse)
    const cycles = allCycles
        .filter(c => calculateSignedArea(c) < -1e-9)
        .map(c => ({
            edges: [...c.edges].reverse(),
            direction: [...c.direction].reverse().map(d => !d),
        }));

    if (cycles.length === 0) {
        return { featureId: null, hasClosedProfile: false };
    }

    const featureId = cm.addFeature('draw', null, []);

    for (const cycle of cycles) {
        const firstEdge = cycle.edges[0];
        const isForward = cycle.direction[0];
        let currentPoint = isForward ? firstEdge.start.point : firstEdge.end.point;

        cm.addOperation(featureId, 'movePointerTo', [[currentPoint.x, currentPoint.y]]);

        for (let i = 0; i < cycle.edges.length; i++) {
            const edge = cycle.edges[i];
            const isFwd = cycle.direction[i];

            if (edge.geometry.type === GeometryType.Line) {
                const l = edge.geometry as LineSegment;
                const pEnd = isFwd ? l.end : l.start;
                cm.addOperation(featureId, 'lineTo', [[pEnd.x, pEnd.y]]);
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

                cm.addOperation(featureId, 'threePointsArcTo', [[pEnd.x, pEnd.y], [viaX, viaY]]);
                currentPoint = pEnd;
            }
        }

        cm.addOperation(featureId, 'close', []);
    }

    cm.addOperation(featureId, 'sketchOnPlane', [plane]);

    return { featureId, hasClosedProfile: true };
}

// ──────────────────────────────────────────────────────────────
// Wire Code (open paths — still visible as edges in the 3D view)
// ──────────────────────────────────────────────────────────────

function generateWireCode(
    cm: CodeManager,
    entities: SketchEntity[],
    plane: SketchPlane,
): string {
    const featureId = cm.addFeature('draw', null, []);
    let isFirst = true;

    for (const entity of entities) {
        if (entity.points.length === 0) continue;

        if (isFirst) {
            cm.addOperation(featureId, 'movePointerTo', [
                [entity.points[0][0], entity.points[0][1]],
            ]);
            isFirst = false;
        }

        switch (entity.type) {
            case 'line': {
                for (let i = 1; i < entity.points.length; i++) {
                    cm.addOperation(featureId, 'lineTo', [
                        [entity.points[i][0], entity.points[i][1]],
                    ]);
                }
                break;
            }
            case 'arc': {
                if (entity.points.length >= 3) {
                    cm.addOperation(featureId, 'threePointsArcTo', [
                        [entity.points[1][0], entity.points[1][1]],
                        [entity.points[2][0], entity.points[2][1]],
                    ]);
                }
                break;
            }
            case 'centerPointArc': {
                // points: [center, start, end] → convert to three-point arc
                if (entity.points.length >= 3) {
                    const center = entity.points[0];
                    const startPt = entity.points[1];
                    const endPt = entity.points[2];
                    const radius = Math.hypot(startPt[0] - center[0], startPt[1] - center[1]);
                    const startAngle = Math.atan2(startPt[1] - center[1], startPt[0] - center[0]);
                    const endAngle = Math.atan2(endPt[1] - center[1], endPt[0] - center[0]);
                    let sweep = endAngle - startAngle;
                    if (sweep <= 0) sweep += 2 * Math.PI;
                    const midAngle = startAngle + sweep / 2;
                    const via: [number, number] = [
                        center[0] + radius * Math.cos(midAngle),
                        center[1] + radius * Math.sin(midAngle),
                    ];
                    cm.addOperation(featureId, 'threePointsArcTo', [
                        [endPt[0], endPt[1]], via,
                    ]);
                }
                break;
            }
            case 'smoothSpline': {
                for (let i = 1; i < entity.points.length; i++) {
                    const config: Record<string, any> = {};
                    if (entity.properties.startTangent != null && i === 1) {
                        config.startTangent = entity.properties.startTangent;
                    }
                    if (entity.properties.endTangent != null && i === entity.points.length - 1) {
                        config.endTangent = entity.properties.endTangent;
                    }
                    const args: any[] = [[entity.points[i][0], entity.points[i][1]]];
                    if (Object.keys(config).length > 0) args.push(config);
                    cm.addOperation(featureId, 'smoothSplineTo', args);
                }
                break;
            }
            case 'bezier': {
                if (entity.points.length >= 2) {
                    const end = entity.points[1];
                    const ctrls = entity.points.slice(2).map(p => [p[0], p[1]]);
                    cm.addOperation(featureId, 'bezierCurveTo', [[end[0], end[1]], ctrls]);
                }
                break;
            }
            case 'quadraticBezier': {
                if (entity.points.length >= 2) {
                    const end = entity.points[1];
                    const cp = entity.properties.controlPoints?.[0] ?? [
                        entity.points[0][0] + (entity.properties.startFactor ?? 5),
                        entity.points[0][1] + (entity.properties.endFactor ?? 5),
                    ];
                    cm.addOperation(featureId, 'quadraticBezierCurveTo', [[end[0], end[1]], cp]);
                }
                break;
            }
            case 'cubicBezier': {
                if (entity.points.length >= 2) {
                    const start = entity.points[0];
                    const end = entity.points[1];
                    const ctrl1 = entity.properties.controlPoints?.[0] ?? [
                        start[0] + 3, start[1] + 5,
                    ];
                    const ctrl2 = entity.properties.controlPoints?.[1] ?? [
                        end[0] - 3, end[1] + 5,
                    ];
                    cm.addOperation(featureId, 'cubicBezierCurveTo', [[end[0], end[1]], ctrl1, ctrl2]);
                }
                break;
            }
        }
    }

    // Always sketch on plane — this is what makes open wires visible
    cm.addOperation(featureId, 'sketchOnPlane', [plane]);

    return featureId;
}

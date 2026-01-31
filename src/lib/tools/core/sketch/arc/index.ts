import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../types';
import { arcFromThreePoints } from '../../../../sketch-graph/Geometry';
import { ArcAnnotation, LineAnnotation, PointMarker, createAnnotationContext } from '../../../../../components/cad/SketchAnnotations';
import type { CodeManager } from '../../../../code-manager';
import { generateToolId } from '../../../types';

// Helper to render a line from points
const renderLine = (
    key: string,
    points: THREE.Vector3[],
    color: string
) => {
    if (points.length < 2) return null;
    return React.createElement('line', { key },
        React.createElement('bufferGeometry', null,
            React.createElement('bufferAttribute', {
                attach: 'attributes-position',
                count: points.length,
                array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                itemSize: 3
            })
        ),
        React.createElement('lineBasicMaterial', { color, linewidth: 3, depthTest: false })
    );
};

export const threePointsArcTool: Tool = {
    metadata: {
        id: 'threePointsArc',
        label: '3-Point Arc',
        icon: 'ArrowUpRight',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an arc through three points'
    },
    uiProperties: [],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 3) return [];
        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] }; // End
        const p3 = { x: primitive.points[2][0], y: primitive.points[2][1] }; // Via
        const arc = arcFromThreePoints(p1, p2, p3);
        return arc ? [arc] : [];
    },
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        // points: [start, end, via]
        if (primitive.points.length >= 3) {
            const end = primitive.points[1];
            const via = primitive.points[2];
            codeManager.addOperation(sketchName, 'threePointsArcTo', [[end[0], end[1]], [via[0], via[1]]]);
        }
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'threePointsArc', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'threePointsArc',
            points: [startPoint, startPoint],
            properties: properties || {}
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false
    ) {
        const color = isGhost ? "#00ffff" : "#ffff00";
        // Convert all points to 3D first
        const points3D = primitive.points.map(p => to3D(p[0], p[1]));

        // Check if we have enough points
        if (points3D.length < 2) return null;

        // If only 2 points (Start, End/Mouse), render the chord line
        if (primitive.points.length === 2) {
            return renderLine(primitive.id, points3D, color);
        }

        // If 3 or more points (Start, End, Via/Mouse), try to render the arc
        if (primitive.points.length >= 3) {
            const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
            const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
            const via = { x: primitive.points[2][0], y: primitive.points[2][1] }; // The current mouse position or 3rd click

            const arc = arcFromThreePoints(start, end, via);

            // Check if arc is valid and has reasonable radius
            // (very large radius means points are nearly collinear)
            const maxReasonableRadius = 10000;
            if (arc && arc.radius < maxReasonableRadius && arc.radius > 0.01) {
                const { startAngle, endAngle, clockwise } = sanitizeAngles(arc.startAngle, arc.endAngle, arc.ccw);

                const curve = new THREE.EllipseCurve(
                    arc.center.x, arc.center.y,
                    arc.radius, arc.radius,
                    startAngle, endAngle,
                    clockwise,
                    0
                );

                // Get points for smooth curve
                const arcPoints = curve.getPoints(50).map(p => to3D(p.x, p.y));

                // Validate that we have enough points
                if (arcPoints.length >= 2) {
                    return renderLine(primitive.id, arcPoints, color);
                }
            }

            // Fallback: Render a quadratic Bezier curve through the three points
            // This provides a smooth preview even when the true arc has extreme geometry
            const curvePoints: THREE.Vector3[] = [];
            const segments = 32;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const mt = 1 - t;
                // Quadratic Bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
                // Use via as control point, start and end as endpoints
                const x = mt * mt * start.x + 2 * mt * t * via.x + t * t * end.x;
                const y = mt * mt * start.y + 2 * mt * t * via.y + t * t * end.y;
                curvePoints.push(to3D(x, y));
            }
            return renderLine(primitive.id, curvePoints, color);
        }

        return null;
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        plane: SketchPlane,
    ) {
        // Step 2: While drawing the chord (Start -> End)
        // We can show the chord length using LineAnnotation
        if (primitive.points.length === 2) {
            const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
            const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
            return React.createElement(LineAnnotation, {
                key: `${primitive.id}-annotation-chord`,
                start,
                end,
                plane,
                dimMode: 'aligned'
            });
        }

        if (primitive.points.length < 3) return null;

        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };  // Start
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };  // End
        const p3 = { x: primitive.points[2][0], y: primitive.points[2][1] };  // Via

        const arc = arcFromThreePoints(p1, p2, p3);
        const ctx = createAnnotationContext(plane);

        // If arc is invalid or has extreme radius (nearly collinear points),
        // just show point markers without the confusing radius annotation
        const maxReasonableRadius = 10000;
        if (!arc || arc.radius >= maxReasonableRadius || arc.radius < 0.01) {
            return React.createElement(React.Fragment, null,
                // Show markers for all three points
                React.createElement(PointMarker, {
                    key: `${primitive.id}-start-marker`,
                    position: p1,
                    ctx,
                    size: 0.5,
                    color: '#00ffff',
                    shape: 'sphere'
                }),
                React.createElement(PointMarker, {
                    key: `${primitive.id}-end-marker`,
                    position: p2,
                    ctx,
                    size: 0.5,
                    color: '#00ffff',
                    shape: 'sphere'
                }),
                React.createElement(PointMarker, {
                    key: `${primitive.id}-via-marker`,
                    position: p3,
                    ctx,
                    size: 0.4,
                    color: '#ffff00',
                    shape: 'diamond'
                })
            );
        }

        const { startAngle, endAngle } = sanitizeAngles(arc.startAngle, arc.endAngle, arc.ccw);

        return React.createElement(React.Fragment, null,
            React.createElement(ArcAnnotation, {
                key: `${primitive.id}-annotation`,
                center: arc.center,
                start: p1,
                end: p2,
                radius: arc.radius,
                startAngle,
                endAngle,
                plane
            }),
            // Show marker for the Via point (p3)
            React.createElement(PointMarker, {
                key: `${primitive.id}-via-marker`,
                position: p3,
                ctx,
                size: 0.4,
                color: '#ffff00',
                shape: 'diamond'
            })
        );
    }
};

function sanitizeAngles(start: number, end: number, ccw: boolean) {
    const clockwise = !ccw;
    let s = start;
    let e = end;

    if (!clockwise) {
        // CCW: End must be greater than Start
        if (e < s) e += 2 * Math.PI;
    } else {
        // CW: End must be less than Start
        if (e > s) e -= 2 * Math.PI;
    }
    return { startAngle: s, endAngle: e, clockwise };
}

import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive, SketchPlane } from '../../../types';
import { arcFromThreePoints } from '../../../../sketch-graph/Geometry';
import { ArcAnnotation, LineAnnotation, PointMarker, createAnnotationContext } from '../../../../../components/cad/SketchAnnotations';

// Helper to render a line from points
const renderLine = (
    key: string,
    points: THREE.Vector3[],
    color: string
) => {
    if (points.length < 2) return null;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.flatMap(v => [v.x, v.y, v.z]));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return React.createElement('line', { key, geometry },
        React.createElement('lineBasicMaterial', { color, linewidth: 3, depthTest: false })
    );
};

function sanitizeAngles(start: number, end: number, ccw: boolean) {
    const clockwise = !ccw;
    let s = start;
    let e = end;

    if (!clockwise) {
        if (e < s) e += 2 * Math.PI;
    } else {
        if (e > s) e -= 2 * Math.PI;
    }
    return { startAngle: s, endAngle: e, clockwise };
}

export function renderArcPreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false
) {
    const color = isGhost ? "#00ffff" : "#ffff00";
    const points3D = primitive.points.map(p => to3D(p[0], p[1]));

    if (points3D.length < 2) return null;

    if (primitive.points.length === 2) {
        return renderLine(`${primitive.id}-chord`, points3D, color);
    }

    if (primitive.points.length >= 3) {
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
        const via = { x: primitive.points[2][0], y: primitive.points[2][1] };

        const arc = arcFromThreePoints(start, end, via);

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

            const arcPoints = curve.getPoints(50).map(p => to3D(p.x, p.y));

            if (arcPoints.length >= 2) {
                return renderLine(`${primitive.id}-arc`, arcPoints, color);
            }
        }

        // Fallback: Render a quadratic Bezier curve through the three points
        const curvePoints: THREE.Vector3[] = [];
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const x = mt * mt * start.x + 2 * mt * t * via.x + t * t * end.x;
            const y = mt * mt * start.y + 2 * mt * t * via.y + t * t * end.y;
            curvePoints.push(to3D(x, y));
        }
        return renderLine(`${primitive.id}-bezier`, curvePoints, color);
    }

    return null;
}

export function renderArcAnnotation(
    primitive: SketchPrimitive,
    plane: SketchPlane,
) {
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

    const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
    const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
    const p3 = { x: primitive.points[2][0], y: primitive.points[2][1] };

    const arc = arcFromThreePoints(p1, p2, p3);
    const ctx = createAnnotationContext(plane);

    const maxReasonableRadius = 10000;
    if (!arc || arc.radius >= maxReasonableRadius || arc.radius < 0.01) {
        return React.createElement(React.Fragment, null,
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

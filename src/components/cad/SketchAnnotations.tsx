/**
 * Sketch Annotation System
 * 
 * Provides reusable visual annotation components for 2D sketch editing.
 * Works on any sketch plane (XY, XZ, YZ) with automatic coordinate transformation.
 */

import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";

// ============================================================================
// TYPES
// ============================================================================

export type SketchPlane = 'XY' | 'XZ' | 'YZ';

export interface Point2D {
    x: number;
    y: number;
}

export interface AnnotationContext {
    /** Current sketch plane */
    plane: SketchPlane;
    /** Convert 2D sketch coordinates to 3D world position */
    to3D: (point: Point2D) => THREE.Vector3;
    /** Get the "right" direction vector in 3D for this plane (horizontal in sketch) */
    rightVector: THREE.Vector3;
    /** Get the "up" direction vector in 3D for this plane (vertical in sketch) */
    upVector: THREE.Vector3;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create an annotation context for a given sketch plane.
 * This provides all the coordinate conversion utilities needed for annotations.
 * 
 * PLANE COORDINATE SYSTEM - Using Normal Vectors:
 * | Plane Name | Camera At | Drawing Surface | Normal Vector | 2D→3D Mapping        |
 * |------------|-----------|-----------------|---------------|----------------------|
 * | XY (Top)   | +Y        | Y=0 horizontal  | (0, 1, 0)     | (u,v) → (u, 0, v)    |
 * | XZ (Front) | +Z        | Z=0 vertical    | (0, 0, 1)     | (u,v) → (u, v, 0)    |
 * | YZ (Right) | +X        | X=0 vertical    | (1, 0, 0)     | (u,v) → (0, v, u)    |
 */
export function createAnnotationContext(plane: SketchPlane): AnnotationContext {
    const to3D = (point: Point2D): THREE.Vector3 => {
        switch (plane) {
            case 'XY': return new THREE.Vector3(point.x, 0, point.y);  // Y=0 plane
            case 'XZ': return new THREE.Vector3(point.x, point.y, 0); // Z=0 plane  
            case 'YZ': return new THREE.Vector3(0, point.y, point.x); // X=0 plane
        }
    };

    // Define "right" (horizontal in sketch space) and "up" (vertical in sketch space)
    // for each plane - must match camera orientation
    let rightVector: THREE.Vector3;
    let upVector: THREE.Vector3;

    switch (plane) {
        case 'XY': // Top view from +Y
            rightVector = new THREE.Vector3(1, 0, 0);  // +X is right
            upVector = new THREE.Vector3(0, 0, 1);     // +Z is up
            break;
        case 'XZ': // Front view from +Z
            rightVector = new THREE.Vector3(1, 0, 0);  // +X is right
            upVector = new THREE.Vector3(0, 1, 0);     // +Y is up
            break;
        case 'YZ': // Right view from +X
            rightVector = new THREE.Vector3(0, 0, 1);  // +Z is right
            upVector = new THREE.Vector3(0, 1, 0);     // +Y is up
            break;
    }

    return { plane, to3D, rightVector, upVector };
}

/**
 * Calculate distance between two 2D points
 */
export function distance2D(p1: Point2D, p2: Point2D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate angle from horizontal (0° = right, counterclockwise positive)
 * Returns angle in radians
 */
export function angle2D(from: Point2D, to: Point2D): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.atan2(dy, dx);
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
}

/**
 * Normalize angle to 0-360 range
 */
export function normalizeAngle(degrees: number): number {
    return degrees < 0 ? degrees + 360 : degrees;
}

// ============================================================================
// ANNOTATION COMPONENTS
// ============================================================================

interface PointMarkerProps {
    /** Position in 2D sketch coordinates */
    position: Point2D;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Color of the marker */
    color?: string;
    /** Size of the marker */
    size?: number;
    /** Shape of the marker */
    shape?: 'sphere' | 'square' | 'diamond';
}

/**
 * A point marker (dot) for highlighting important points like endpoints, centers, etc.
 */
export const PointMarker = ({
    position,
    ctx,
    color = "#ffffff",
    size = 0.6,
    shape = 'sphere'
}: PointMarkerProps) => {
    const pos3D = ctx.to3D(position);

    if (shape === 'sphere') {
        return (
            <mesh position={pos3D}>
                <sphereGeometry args={[size, 16, 16]} />
                <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
            </mesh>
        );
    }

    if (shape === 'square') {
        return (
            <mesh position={pos3D}>
                <boxGeometry args={[size * 1.5, size * 1.5, size * 0.2]} />
                <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
            </mesh>
        );
    }

    // Diamond - rotated square
    return (
        <mesh position={pos3D} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[size * 1.2, size * 1.2, size * 0.2]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
        </mesh>
    );
};

interface DimensionBadgeProps {
    /** Position in 2D sketch coordinates */
    position: Point2D;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Value to display */
    value: number;
    /** Unit label */
    unit: string;
    /** Number of decimal places */
    decimals?: number;
    /** Badge style variant */
    variant?: 'primary' | 'secondary';
}

/**
 * A dimension badge showing a measurement value with unit.
 */
export const DimensionBadge = ({
    position,
    ctx,
    value,
    unit,
    decimals = 3,
    variant = 'primary'
}: DimensionBadgeProps) => {
    const pos3D = ctx.to3D(position);

    const styles = variant === 'primary'
        ? "bg-[#1a4a5e] text-[#00e5ff] border-[#00e5ff]/50"
        : "bg-[#2a2a2a] text-white border-slate-500";

    return (
        <Html position={pos3D.toArray()} center className="pointer-events-none select-none">
            <div className={`${styles} text-xs px-2 py-1 rounded border shadow-lg font-mono whitespace-nowrap backdrop-blur-sm`}>
                {value.toFixed(decimals)} {unit}
            </div>
        </Html>
    );
};

interface ReferenceLineProps {
    /** Start point in 2D sketch coordinates */
    from: Point2D;
    /** End point in 2D sketch coordinates */
    to: Point2D;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Line color */
    color?: string;
    /** Whether line is dashed */
    dashed?: boolean;
    /** Line opacity */
    opacity?: number;
}

/**
 * A reference/guide line for showing alignment or direction.
 */
export const ReferenceLine = ({
    from,
    to,
    ctx,
    color = "#00ff00",
    dashed = true,
    opacity = 0.7
}: ReferenceLineProps) => {
    const from3D = ctx.to3D(from);
    const to3D = ctx.to3D(to);

    return (
        <Line
            points={[from3D, to3D]}
            color={color}
            lineWidth={1}
            dashed={dashed}
            dashSize={1}
            gapSize={0.5}
            depthTest={false}
            transparent
            opacity={opacity}
        />
    );
};

interface AngleArcProps {
    /** Center point of the arc in 2D sketch coordinates */
    center: Point2D;
    /** Start angle in radians (usually 0 for horizontal) */
    startAngle: number;
    /** End angle in radians */
    endAngle: number;
    /** Radius of the arc */
    radius: number;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Arc color */
    color?: string;
}

/**
 * An arc showing an angle measurement.
 */
export const AngleArc = ({
    center,
    startAngle,
    endAngle,
    radius,
    ctx,
    color = "#00ff00"
}: AngleArcProps) => {
    const arcPoints = useMemo(() => {
        const angleDiff = Math.abs(endAngle - startAngle);
        const segments = Math.max(16, Math.round(angleDiff * 10));
        const points: THREE.Vector3[] = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const theta = startAngle + t * (endAngle - startAngle);
            const point: Point2D = {
                x: center.x + Math.cos(theta) * radius,
                y: center.y + Math.sin(theta) * radius
            };
            points.push(ctx.to3D(point));
        }

        return points;
    }, [center.x, center.y, startAngle, endAngle, radius, ctx]);

    if (arcPoints.length < 2) return null;

    return (
        <Line
            points={arcPoints}
            color={color}
            lineWidth={1.5}
            depthTest={false}
        />
    );
};

interface DrawingLineProps {
    /** Start point in 2D sketch coordinates */
    from: Point2D;
    /** End point in 2D sketch coordinates */
    to: Point2D;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Line color */
    color?: string;
    /** Whether to show arrow at end */
    showArrow?: boolean;
}

/**
 * The actual line being drawn, with optional arrow head.
 */
export const DrawingLine = ({
    from,
    to,
    ctx,
    color = "#00ffff",
    showArrow = true
}: DrawingLineProps) => {
    const from3D = ctx.to3D(from);
    const to3D = ctx.to3D(to);

    const length = distance2D(from, to);
    const angle = angle2D(from, to);
    const arrowSize = Math.min(length * 0.15, 2);

    // Arrow head points
    const arrow1: Point2D = {
        x: to.x - Math.cos(angle - Math.PI / 6) * arrowSize,
        y: to.y - Math.sin(angle - Math.PI / 6) * arrowSize
    };
    const arrow2: Point2D = {
        x: to.x - Math.cos(angle + Math.PI / 6) * arrowSize,
        y: to.y - Math.sin(angle + Math.PI / 6) * arrowSize
    };

    return (
        <group>
            <Line
                points={[from3D, to3D]}
                color={color}
                lineWidth={2}
                depthTest={false}
            />
            {showArrow && length > 1 && (
                <Line
                    points={[ctx.to3D(arrow1), to3D, ctx.to3D(arrow2)]}
                    color="#00ff00"
                    lineWidth={1.5}
                    depthTest={false}
                />
            )}
        </group>
    );
};

// ============================================================================
// COMPOSITE ANNOTATION OVERLAYS
// ============================================================================

interface LineAnnotationProps {
    /** Start point in 2D sketch coordinates */
    start: Point2D;
    /** End point in 2D sketch coordinates */
    end: Point2D;
    /** Sketch plane */
    plane: SketchPlane;
    /** Locked length value */
    lockedLength?: number | null;
    /** Locked angle value */
    lockedAngle?: number | null;
}

/**
 * Complete annotation overlay for line drawing.
 * Shows endpoints, length, angle, reference line, and angle arc.
 */
export const LineAnnotation = ({
    start,
    end,
    plane,
    lockedLength,
    lockedAngle
}: LineAnnotationProps) => {
    const ctx = useMemo(() => createAnnotationContext(plane), [plane]);

    const length = distance2D(start, end);
    const angleRad = angle2D(start, end);
    const angleDeg = normalizeAngle(radToDeg(angleRad));

    // Don't render for very short lines
    if (length < 0.1) return null;

    // Reference line extends horizontally from start (in +X direction in sketch space)
    const refLineLength = Math.max(length * 1.1, 15);
    const refLineEnd: Point2D = { x: start.x + refLineLength, y: start.y };

    // Arc radius
    const arcRadius = Math.min(length * 0.35, 12);

    // Badge positions - offset from line
    const perpAngle = angleRad + Math.PI / 2;
    const lengthBadgeOffset = 3;
    const lengthBadgePos: Point2D = {
        x: end.x + Math.cos(perpAngle) * lengthBadgeOffset + Math.cos(angleRad) * 2,
        y: end.y + Math.sin(perpAngle) * lengthBadgeOffset + Math.sin(angleRad) * 2
    };

    const angleBadgeMidAngle = angleRad / 2;
    const angleBadgePos: Point2D = {
        x: start.x + Math.cos(angleBadgeMidAngle) * (arcRadius + 8),
        y: start.y + Math.sin(angleBadgeMidAngle) * (arcRadius + 8)
    };

    return (
        <group>
            {/* The line being drawn */}
            <DrawingLine from={start} to={end} ctx={ctx} />

            {/* Start point marker */}
            <PointMarker position={start} ctx={ctx} />

            {/* End point marker */}
            <PointMarker position={end} ctx={ctx} />

            {/* Horizontal reference line */}
            <ReferenceLine from={start} to={refLineEnd} ctx={ctx} />

            {/* Angle arc */}
            {length > 1 && (
                <AngleArc
                    center={start}
                    startAngle={0}
                    endAngle={angleRad}
                    radius={arcRadius}
                    ctx={ctx}
                />
            )}

            {/* Length badge */}
            <DimensionBadge
                position={lengthBadgePos}
                ctx={ctx}
                value={lockedLength ?? length}
                unit="mm"
                variant="primary"
            />

            {/* Angle badge */}
            <DimensionBadge
                position={angleBadgePos}
                ctx={ctx}
                value={lockedAngle ?? angleDeg}
                unit="deg"
                decimals={1}
                variant="secondary"
            />
        </group>
    );
};

interface CircleAnnotationProps {
    /** Center point in 2D sketch coordinates */
    center: Point2D;
    /** Point on the circumference */
    edge: Point2D;
    /** Sketch plane */
    plane: SketchPlane;
}

/**
 * Annotation overlay for circle drawing.
 * Shows center marker, radius line, and radius dimension.
 */
export const CircleAnnotation = ({
    center,
    edge,
    plane
}: CircleAnnotationProps) => {
    const ctx = useMemo(() => createAnnotationContext(plane), [plane]);

    const radius = distance2D(center, edge);

    if (radius < 0.1) return null;

    // Radius badge position - midpoint of radius line, offset
    const angle = angle2D(center, edge);
    const midPoint: Point2D = {
        x: (center.x + edge.x) / 2,
        y: (center.y + edge.y) / 2
    };
    const perpAngle = angle + Math.PI / 2;
    const badgePos: Point2D = {
        x: midPoint.x + Math.cos(perpAngle) * 3,
        y: midPoint.y + Math.sin(perpAngle) * 3
    };

    return (
        <group>
            {/* Radius line */}
            <DrawingLine from={center} to={edge} ctx={ctx} color="#00ffff" showArrow={false} />

            {/* Center marker - diamond shape */}
            <PointMarker position={center} ctx={ctx} shape="diamond" color="#ffff00" />

            {/* Edge point marker */}
            <PointMarker position={edge} ctx={ctx} />

            {/* Radius badge */}
            <DimensionBadge
                position={badgePos}
                ctx={ctx}
                value={radius}
                unit="mm"
                variant="primary"
            />
        </group>
    );
};

interface RectangleAnnotationProps {
    /** First corner in 2D sketch coordinates */
    corner1: Point2D;
    /** Opposite corner in 2D sketch coordinates */
    corner2: Point2D;
    /** Sketch plane */
    plane: SketchPlane;
}

/**
 * Annotation overlay for rectangle drawing.
 * Shows corner markers, width/height dimensions.
 */
export const RectangleAnnotation = ({
    corner1,
    corner2,
    plane
}: RectangleAnnotationProps) => {
    const ctx = useMemo(() => createAnnotationContext(plane), [plane]);

    const width = Math.abs(corner2.x - corner1.x);
    const height = Math.abs(corner2.y - corner1.y);

    if (width < 0.1 && height < 0.1) return null;

    // All four corners
    const corners: Point2D[] = [
        corner1,
        { x: corner2.x, y: corner1.y },
        corner2,
        { x: corner1.x, y: corner2.y }
    ];

    // Center point
    const center: Point2D = {
        x: (corner1.x + corner2.x) / 2,
        y: (corner1.y + corner2.y) / 2
    };

    // Width badge position (top center)
    const widthBadgePos: Point2D = {
        x: center.x,
        y: Math.max(corner1.y, corner2.y) + 4
    };

    // Height badge position (left center)
    const heightBadgePos: Point2D = {
        x: Math.min(corner1.x, corner2.x) - 4,
        y: center.y
    };

    return (
        <group>
            {/* Corner markers */}
            {corners.map((corner, i) => (
                <PointMarker key={i} position={corner} ctx={ctx} shape="square" size={0.4} />
            ))}

            {/* Center marker */}
            <PointMarker position={center} ctx={ctx} shape="diamond" color="#ffff00" size={0.5} />

            {/* Width badge */}
            {width > 0.1 && (
                <DimensionBadge
                    position={widthBadgePos}
                    ctx={ctx}
                    value={width}
                    unit="mm"
                    variant="primary"
                />
            )}

            {/* Height badge */}
            {height > 0.1 && (
                <DimensionBadge
                    position={heightBadgePos}
                    ctx={ctx}
                    value={height}
                    unit="mm"
                    variant="primary"
                />
            )}
        </group>
    );
};

// Export all components
export default {
    PointMarker,
    DimensionBadge,
    ReferenceLine,
    AngleArc,
    DrawingLine,
    LineAnnotation,
    CircleAnnotation,
    RectangleAnnotation,
    createAnnotationContext
};

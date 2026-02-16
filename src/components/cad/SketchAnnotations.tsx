/**
 * Sketch Annotation System
 * 
 * Provides reusable visual annotation components for 2D sketch editing.
 * Works on any sketch plane (XY, XZ, YZ) with automatic coordinate transformation.
 */

import { useMemo, useRef, useEffect, useCallback, useState } from "react";
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
            case 'XY': return new THREE.Vector3(point.x, point.y, 0);  // Z=0 plane (Top)
            case 'XZ': return new THREE.Vector3(point.x, 0, point.y);  // Y=0 plane (Front)
            case 'YZ': return new THREE.Vector3(0, point.x, point.y);  // X=0 plane (Right)
        }
    };

    // Define "right" (horizontal in sketch space) and "up" (vertical in sketch space)
    // for each plane - must match camera orientation and Z-up system
    let rightVector: THREE.Vector3;
    let upVector: THREE.Vector3;

    switch (plane) {
        case 'XY': // Top view (Z-up ground)
            rightVector = new THREE.Vector3(1, 0, 0);  // +X is right
            upVector = new THREE.Vector3(0, 1, 0);     // +Y is up
            break;
        case 'XZ': // Front view (Y=0)
            rightVector = new THREE.Vector3(1, 0, 0);  // +X is right
            upVector = new THREE.Vector3(0, 0, 1);     // +Z is up
            break;
        case 'YZ': // Right view (X=0)
            rightVector = new THREE.Vector3(0, 1, 0);  // +Y is right (horizontal on screen for right view?)
            // Wait, for Right View (YZ plane):
            // Normal is +X.
            // Horizontal usually Y axis? Vertical is Z axis.
            // So Right is +Y. Up is +Z.
            upVector = new THREE.Vector3(0, 0, 1);     // +Z is up
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

// ============================================================================
// EDITABLE DIMENSION INPUT
// ============================================================================

interface EditableDimensionInputProps {
    /** Position in 2D sketch coordinates */
    position: Point2D;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Current measured value */
    value: number;
    /** Unit label */
    unit: string;
    /** Number of decimal places */
    decimals?: number;
    /** Badge style variant */
    variant?: 'primary' | 'secondary';
    /** Whether this input is currently focused */
    isFocused?: boolean;
    /** Callback when value is committed */
    onValueChange?: (value: number) => void;
    /** Callback when focus is requested */
    onFocus?: () => void;
    /** Callback when Tab is pressed (switch to next field) */
    onTab?: () => void;
    /** Callback when Enter is pressed after committing value */
    onEnter?: () => void;
    /** Input field id for external focus management */
    inputId?: string;
}

/**
 * An editable dimension input that shows a measurement value.
 * When focused, allows typing a value. Otherwise displays the measured value.
 * While the user hasn't typed, the input shows the live measured value with
 * all text selected so typing immediately replaces it. Once the user starts
 * typing, the live value stops overwriting the input.
 */
export const EditableDimensionInput = ({
    position,
    ctx,
    value,
    unit,
    decimals = 3,
    variant = 'primary',
    isFocused = false,
    onValueChange,
    onFocus,
    onTab,
    onEnter,
    inputId,
}: EditableDimensionInputProps) => {
    const pos3D = ctx.to3D(position);
    const inputRef = useRef<HTMLInputElement>(null);
    const [localValue, setLocalValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    // Track whether the user has started typing (to stop overwriting with measured value)
    const hasUserTypedRef = useRef(false);

    const baseStyles = variant === 'primary'
        ? "bg-[#1a4a5e] text-[#00e5ff] border-[#00e5ff]/50"
        : "bg-[#2a2a2a] text-white border-slate-500";

    const focusStyles = isFocused
        ? "ring-1 ring-[#00e5ff] border-[#00e5ff]"
        : "";

    // Focus management: run only when isFocused changes
    useEffect(() => {
        if (isFocused && inputRef.current) {
            inputRef.current.focus();
            hasUserTypedRef.current = false;
            setIsEditing(true);
            setLocalValue(value.toFixed(decimals));
            // Use requestAnimationFrame to ensure DOM is ready before selecting
            requestAnimationFrame(() => inputRef.current?.select());
        } else if (!isFocused) {
            setIsEditing(false);
            hasUserTypedRef.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused]);

    // Keep showing the live measured value and maintain selection while user hasn't typed
    useEffect(() => {
        if (isFocused && !hasUserTypedRef.current && inputRef.current) {
            setLocalValue(value.toFixed(decimals));
            // Re-select so the entire value stays highlighted
            requestAnimationFrame(() => inputRef.current?.select());
        }
    }, [value, isFocused, decimals]);

    // Commit the current typed value (if user actually typed something)
    const commitValue = useCallback(() => {
        if (hasUserTypedRef.current) {
            const num = parseFloat(localValue);
            if (!isNaN(num) && num > 0) {
                onValueChange?.(num);
            }
        }
    }, [localValue, onValueChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        hasUserTypedRef.current = true;
        setLocalValue(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            // Commit whatever was typed before switching fields
            commitValue();
            onTab?.();
            return;
        }
        // Prevent other keys from bubbling to window/canvas handlers
        e.stopPropagation();
        if (e.key === 'Enter') {
            commitValue();
            // Reset so the input resumes tracking the live value
            hasUserTypedRef.current = false;
            setLocalValue(value.toFixed(decimals));
            requestAnimationFrame(() => inputRef.current?.select());
            // Notify parent that Enter was pressed (e.g., to finish drawing)
            onEnter?.();
        }
    };

    const handleBlur = () => {
        commitValue();
    };

    const handleFocus = () => {
        setIsEditing(true);
        hasUserTypedRef.current = false;
        setLocalValue(value.toFixed(decimals));
        onFocus?.();
        if (inputRef.current) {
            requestAnimationFrame(() => inputRef.current?.select());
        }
    };

    const handleClick = () => {
        if (inputRef.current) {
            inputRef.current.select();
        }
    };

    // Display the user's typed value when editing, otherwise the live measured value
    const displayValue = isEditing
        ? (hasUserTypedRef.current ? localValue : value.toFixed(decimals))
        : value.toFixed(decimals);

    return (
        <Html position={pos3D.toArray()} center className="select-none" style={{ pointerEvents: 'auto' }} zIndexRange={[100, 0]}>
            <div
                className={`${baseStyles} ${focusStyles} text-xs rounded border shadow-lg font-mono whitespace-nowrap backdrop-blur-sm flex items-center gap-1 px-1 py-0.5`}
                onClick={(e) => { e.stopPropagation(); onFocus?.(); }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    value={displayValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onClick={handleClick}
                    className="bg-transparent border-none outline-none text-inherit font-mono text-xs w-16 text-center"
                    style={{ caretColor: variant === 'primary' ? '#00e5ff' : '#ffffff' }}
                />
                <span className="text-[10px] opacity-70">{unit}</span>
            </div>
        </Html>
    );
};

// ============================================================================
// CAD-STYLE DIMENSION LINE
// ============================================================================

interface CadDimensionLineProps {
    /** Start point of the measured line */
    from: Point2D;
    /** End point of the measured line */
    to: Point2D;
    /** Annotation context */
    ctx: AnnotationContext;
    /** Offset distance for the dimension line from the measured line */
    offset?: number;
    /** Color of the dimension elements */
    color?: string;
    /** Arrow size */
    arrowSize?: number;
}

/**
 * A proper CAD-style dimension line with:
 * - Extension lines perpendicular from the endpoints
 * - A dimension line parallel to the measured line with outward-pointing arrows
 */
export const CadDimensionLine = ({
    from,
    to,
    ctx,
    offset = 6,
    color = "#00e5ff",
    arrowSize = 1.5,
}: CadDimensionLineProps) => {
    const { extStart, extEnd, dimStart, dimEnd, arrow1a, arrow1b, arrow2a, arrow2b, extLineStartFrom, extLineEndFrom } = useMemo(() => {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const perpAngle = angle + Math.PI / 2;
        const perpDx = Math.cos(perpAngle) * offset;
        const perpDy = Math.sin(perpAngle) * offset;

        // Extension line gap (small gap from the actual endpoint)
        const gapDx = Math.cos(perpAngle) * 1.5;
        const gapDy = Math.sin(perpAngle) * 1.5;
        // Extension line overshoot past dimension line
        const overshootDx = Math.cos(perpAngle) * 2;
        const overshootDy = Math.sin(perpAngle) * 2;

        // Dimension line endpoints (parallel to measured line, offset perpendicularly)
        const dimStart: Point2D = { x: from.x + perpDx, y: from.y + perpDy };
        const dimEnd: Point2D = { x: to.x + perpDx, y: to.y + perpDy };

        // Extension lines: from near the actual point to past the dimension line
        const extLineStartFrom: Point2D = { x: from.x + gapDx, y: from.y + gapDy };
        const extStart: Point2D = { x: from.x + perpDx + overshootDx, y: from.y + perpDy + overshootDy };
        const extLineEndFrom: Point2D = { x: to.x + gapDx, y: to.y + gapDy };
        const extEnd: Point2D = { x: to.x + perpDx + overshootDx, y: to.y + perpDy + overshootDy };

        // Arrow directions (pointing outward from the dimension line)
        const lineAngle = angle;
        const aSz = arrowSize;

        // Arrows at dimStart pointing outward (away from dimEnd)
        const arrow1a: Point2D = {
            x: dimStart.x + Math.cos(lineAngle + Math.PI - Math.PI / 6) * aSz,
            y: dimStart.y + Math.sin(lineAngle + Math.PI - Math.PI / 6) * aSz,
        };
        const arrow1b: Point2D = {
            x: dimStart.x + Math.cos(lineAngle + Math.PI + Math.PI / 6) * aSz,
            y: dimStart.y + Math.sin(lineAngle + Math.PI + Math.PI / 6) * aSz,
        };

        // Arrows at dimEnd pointing outward (away from dimStart)
        const arrow2a: Point2D = {
            x: dimEnd.x + Math.cos(lineAngle - Math.PI / 6) * aSz,
            y: dimEnd.y + Math.sin(lineAngle - Math.PI / 6) * aSz,
        };
        const arrow2b: Point2D = {
            x: dimEnd.x + Math.cos(lineAngle + Math.PI / 6) * aSz,
            y: dimEnd.y + Math.sin(lineAngle + Math.PI / 6) * aSz,
        };

        return { extStart, extEnd, dimStart, dimEnd, arrow1a, arrow1b, arrow2a, arrow2b, extLineStartFrom, extLineEndFrom };
    }, [from.x, from.y, to.x, to.y, offset, arrowSize]);

    return (
        <group>
            {/* Extension line from start point */}
            <Line
                points={[ctx.to3D(extLineStartFrom), ctx.to3D(extStart)]}
                color={color}
                lineWidth={1}
                depthTest={false}
            />
            {/* Extension line from end point */}
            <Line
                points={[ctx.to3D(extLineEndFrom), ctx.to3D(extEnd)]}
                color={color}
                lineWidth={1}
                depthTest={false}
            />
            {/* Dimension line (parallel to measured line) */}
            <Line
                points={[ctx.to3D(dimStart), ctx.to3D(dimEnd)]}
                color={color}
                lineWidth={1}
                depthTest={false}
            />
            {/* Arrow at start (pointing outward) */}
            <Line
                points={[ctx.to3D(arrow1a), ctx.to3D(dimStart), ctx.to3D(arrow1b)]}
                color={color}
                lineWidth={1.5}
                depthTest={false}
            />
            {/* Arrow at end (pointing outward) */}
            <Line
                points={[ctx.to3D(arrow2a), ctx.to3D(dimEnd), ctx.to3D(arrow2b)]}
                color={color}
                lineWidth={1.5}
                depthTest={false}
            />
        </group>
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
    /** Dimensioning mode: 'aligned' | 'horizontal' | 'vertical' */
    dimMode?: 'aligned' | 'horizontal' | 'vertical';
    /** Which input field is currently focused: 'length' | 'angle' | null */
    focusedField?: 'length' | 'angle' | null;
    /** Callback when length value is changed by typing */
    onLengthChange?: (value: number) => void;
    /** Callback when angle value is changed by typing */
    onAngleChange?: (value: number) => void;
    /** Callback when focus field changes */
    onFocusChange?: (field: 'length' | 'angle') => void;
    /** Callback when Enter is pressed in an input (to finish drawing) */
    onEnter?: () => void;
}

/**
 * Complete annotation overlay for line drawing.
 * Shows endpoints, CAD-style dimension line with extension lines and arrows,
 * angle arc (always visible), and editable input fields for length and angle.
 */
export const LineAnnotation = ({
    start,
    end,
    plane,
    lockedLength,
    lockedAngle,
    dimMode = 'aligned',
    focusedField = 'length',
    onLengthChange,
    onAngleChange,
    onFocusChange,
    onEnter,
}: LineAnnotationProps) => {
    const ctx = useMemo(() => createAnnotationContext(plane), [plane]);

    const length = distance2D(start, end);
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const angleRad = angle2D(start, end);
    const angleDeg = normalizeAngle(radToDeg(angleRad));

    // Don't render for very short lines
    if (length < 0.1) return null;

    // Dimension line offset
    const dimOffset = 6;
    const perpAngle = angleRad + Math.PI / 2;

    // Length badge: positioned at the midpoint of the dimension line (offset from actual line)
    const lengthBadgePos: Point2D = {
        x: (start.x + end.x) / 2 + Math.cos(perpAngle) * dimOffset,
        y: (start.y + end.y) / 2 + Math.sin(perpAngle) * dimOffset
    };

    // Angle arc radius - always visible
    const arcRadius = Math.min(length * 0.35, 12);

    // Angle badge position: at the bisector of the angle arc, outside the arc
    const angleBadgePos: Point2D = {
        x: start.x + Math.cos(angleRad / 2) * (arcRadius + 8),
        y: start.y + Math.sin(angleRad / 2) * (arcRadius + 8)
    };

    // Horizontal Dimension
    const hDimBadgePos: Point2D = {
        x: (start.x + end.x) / 2,
        y: Math.max(start.y, end.y) + 6
    };

    // Vertical Dimension
    const vDimBadgePos: Point2D = {
        x: Math.min(start.x, end.x) - 10,
        y: (start.y + end.y) / 2
    };

    return (
        <group>
            {/* The line being drawn */}
            <DrawingLine from={start} to={end} ctx={ctx} />

            {/* Start point marker */}
            <PointMarker position={start} ctx={ctx} />

            {/* End point marker */}
            <PointMarker position={end} ctx={ctx} />

            {/* Aligned Dimension */}
            {dimMode === 'aligned' && (
                <>
                    {/* Horizontal reference line from start point */}
                    <ReferenceLine from={start} to={{ x: start.x + Math.max(length * 1.1, 15), y: start.y }} ctx={ctx} />

                    {/* Angle arc — always visible */}
                    <AngleArc
                        center={start}
                        startAngle={0}
                        endAngle={angleRad}
                        radius={arcRadius}
                        ctx={ctx}
                    />

                    {/* CAD-style dimension line with extension lines and arrows */}
                    <CadDimensionLine
                        from={start}
                        to={end}
                        ctx={ctx}
                        offset={dimOffset}
                    />

                    {/* Editable length input */}
                    <EditableDimensionInput
                        position={lengthBadgePos}
                        ctx={ctx}
                        value={lockedLength ?? length}
                        unit="mm"
                        decimals={3}
                        variant="primary"
                        isFocused={focusedField === 'length'}
                        onValueChange={onLengthChange}
                        onFocus={() => onFocusChange?.('length')}
                        onTab={() => onFocusChange?.('angle')}
                        onEnter={onEnter}
                        inputId="sketch-dim-length"
                    />

                    {/* Editable angle input */}
                    <EditableDimensionInput
                        position={angleBadgePos}
                        ctx={ctx}
                        value={lockedAngle ?? angleDeg}
                        unit="deg"
                        decimals={1}
                        variant="secondary"
                        isFocused={focusedField === 'angle'}
                        onValueChange={onAngleChange}
                        onFocus={() => onFocusChange?.('angle')}
                        onTab={() => onFocusChange?.('length')}
                        onEnter={onEnter}
                        inputId="sketch-dim-angle"
                    />
                </>
            )}

            {/* Horizontal Dimension */}
            {dimMode === 'horizontal' && dx > 0.1 && (
                <>
                    <ReferenceLine from={start} to={{ x: start.x, y: hDimBadgePos.y }} ctx={ctx} />
                    <ReferenceLine from={end} to={{ x: end.x, y: hDimBadgePos.y }} ctx={ctx} />
                    <DimensionBadge
                        position={hDimBadgePos}
                        ctx={ctx}
                        value={dx}
                        unit="mm"
                        variant="primary"
                    />
                </>
            )}

            {/* Vertical Dimension */}
            {dimMode === 'vertical' && dy > 0.1 && (
                <>
                    <ReferenceLine from={start} to={{ x: vDimBadgePos.x, y: start.y }} ctx={ctx} />
                    <ReferenceLine from={end} to={{ x: vDimBadgePos.x, y: end.y }} ctx={ctx} />
                    <DimensionBadge
                        position={vDimBadgePos}
                        ctx={ctx}
                        value={dy}
                        unit="mm"
                        variant="primary"
                    />
                </>
            )}
        </group>
    );
};

interface ArcAnnotationProps {
    center: Point2D;
    start: Point2D;
    end: Point2D;
    radius: number;
    startAngle: number;
    endAngle: number;
    plane: SketchPlane;
}

/**
 * Annotation for arcs. Shows radius and center.
 */
export const ArcAnnotation = ({
    center,
    start,
    end,
    radius,
    startAngle,
    endAngle,
    plane
}: ArcAnnotationProps) => {
    const ctx = useMemo(() => createAnnotationContext(plane), [plane]);

    if (radius < 0.1) return null;

    // Radius line to mid angle
    const midAngle = (startAngle + endAngle) / 2;
    const midPoint: Point2D = {
        x: center.x + Math.cos(midAngle) * radius,
        y: center.y + Math.sin(midAngle) * radius
    };

    const badgePos: Point2D = {
        x: center.x + Math.cos(midAngle) * (radius / 2),
        y: center.y + Math.sin(midAngle) * (radius / 2)
    };

    return (
        <group>
            {/* Radius line */}
            <ReferenceLine from={center} to={midPoint} ctx={ctx} color="#00ffff" dashed={false} opacity={0.5} />

            {/* Center marker */}
            <PointMarker position={center} ctx={ctx} shape="diamond" color="#ffff00" />

            {/* Endpoints */}
            <PointMarker position={start} ctx={ctx} />
            <PointMarker position={end} ctx={ctx} />

            {/* Radius badge */}
            <DimensionBadge
                position={badgePos}
                ctx={ctx}
                value={radius}
                unit="R"
                variant="primary"
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
    EditableDimensionInput,
    CadDimensionLine,
    ReferenceLine,
    AngleArc,
    DrawingLine,
    LineAnnotation,
    ArcAnnotation,
    CircleAnnotation,
    RectangleAnnotation,
    createAnnotationContext
};

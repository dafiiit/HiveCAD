import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useThree, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, SketchPrimitive, ToolType } from "../../hooks/useCADStore";
import { SnappingEngine, SnapResult } from "../../lib/snapping";
import SketchToolDialog, { TOOL_PARAMS } from "./SketchToolDialog";
import { LineAnnotation, CircleAnnotation, RectangleAnnotation } from "./SketchAnnotations";

// Type needed for dynamic inputs
interface DynamicInputProps {
    position: [number, number, number];
    value: number;
    label?: string;
    showLabel?: boolean;
    onChange: (val: number) => void;
    onLock: () => void;
    autoFocus?: boolean;
}

const DynamicInputOverlay = ({ position, value, label, showLabel, onChange, onLock, autoFocus }: DynamicInputProps) => {
    return (
        <Html position={position} center className="pointer-events-none">
            <div className="flex flex-col items-center pointer-events-auto">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onLock();
                        if (e.key === 'Tab') {
                            e.preventDefault();
                            onLock();
                        }
                    }}
                    autoFocus={autoFocus}
                    className="w-20 bg-slate-800/90 text-white text-xs px-1.5 py-0.5 rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-center shadow-lg"
                />
                {showLabel && <div className="text-[10px] text-slate-300 bg-slate-900/50 px-1 rounded mt-0.5 backdrop-blur-sm">{label}</div>}
            </div>
        </Html>
    );
};

// Tools that require parameter dialog before drawing
const DIALOG_REQUIRED_TOOLS: ToolType[] = [
    'polarline', 'tangentline',
    'sagittaArc', 'ellipse',
    'smoothSpline', 'bezier', 'quadraticBezier', 'cubicBezier',
    'roundedRectangle', 'polygon', 'text'
];

// Tools that are "shape wrappers" - create a complete shape in one go
const SHAPE_TOOLS: ToolType[] = ['rectangle', 'circle', 'polygon', 'roundedRectangle', 'text'];

// Multi-click tools that require multiple points
const MULTI_POINT_TOOLS: ToolType[] = ['line', 'spline', 'smoothSpline', 'bezier'];

const SketchCanvas = () => {
    const {
        isSketchMode, sketchStep, sketchPlane, activeTool,
        activeSketchPrimitives, currentDrawingPrimitive,
        addSketchPrimitive, updateCurrentDrawingPrimitive,
        lockedValues, setSketchInputLock, clearSketchInputLocks, finishSketch,
        // Solver state and actions
        solverInstance, sketchEntities, draggingEntityId,
        initializeSolver, setDrivingPoint, solveConstraints, setDraggingEntity,
        addSolverLineMacro, addSolverRectangleMacro, addSolverCircleMacro,
        // Snapping state and actions
        activeSnapPoint, snappingEnabled, snappingEngine,
        setSnapPoint, setSnappingEngine
    } = useCADStore();

    const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
    const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
    const [showDialog, setShowDialog] = useState(false);
    const [pendingStartPoint, setPendingStartPoint] = useState<[number, number] | null>(null);
    const [dialogParams, setDialogParams] = useState<Record<string, any>>({});

    // Initialize Snapping Engine
    useEffect(() => {
        if (!snappingEngine) {
            const engine = new SnappingEngine();
            setSnappingEngine(engine);
        }
    }, [snappingEngine, setSnappingEngine]);

    // Update Snapping Entities when primitives change
    useEffect(() => {
        if (snappingEngine) {
            snappingEngine.setEntities(activeSketchPrimitives);
        }
    }, [snappingEngine, activeSketchPrimitives]);

    // Only active in sketch mode drawing step
    if (!isSketchMode || sketchStep !== 'drawing' || !sketchPlane) return null;

    const planeRotation: [number, number, number] =
        sketchPlane === 'XY' ? [0, 0, 0] :
            sketchPlane === 'XZ' ? [Math.PI / 2, 0, 0] :
                [0, Math.PI / 2, 0];

    // Helper to map 3D point to 2D sketch plane coordinates
    const to2D = (p: THREE.Vector3): [number, number] => {
        if (sketchPlane === 'XY') return [p.x, p.y];
        if (sketchPlane === 'XZ') return [p.x, p.z];
        return [p.y, p.z];
    };

    // Helper to map 2D sketch coord back to 3D world
    const to3D = (x: number, y: number): THREE.Vector3 => {
        if (sketchPlane === 'XY') return new THREE.Vector3(x, y, 0);
        if (sketchPlane === 'XZ') return new THREE.Vector3(x, 0, y);
        return new THREE.Vector3(0, x, y);
    };

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (e.intersections.length > 0) {
            const worldPoint = e.intersections[0].point;

            if (sketchPlane === 'XY') worldPoint.z = 0;
            if (sketchPlane === 'XZ') worldPoint.y = 0;
            if (sketchPlane === 'YZ') worldPoint.x = 0;

            const p2d = to2D(worldPoint);
            let finalP2d = [...p2d] as [number, number];
            let currentSnapResult: SnapResult | null = null;

            // NEW: If dragging an entity, use solver-driven updates
            if (draggingEntityId && solverInstance?.isInitialized) {
                setDrivingPoint(draggingEntityId, p2d[0], p2d[1]);
                const result = solveConstraints();
                if (result?.success) {
                    // The store's sketchEntities is now updated with solved positions
                    // Rendering will pick up the new positions automatically
                    setHoverPoint(finalP2d);
                    return;
                }
            }

            // NEW: Snapping Logic
            if (snappingEnabled && snappingEngine && !draggingEntityId) {
                const snap = snappingEngine.findSnapTarget(p2d[0], p2d[1]);
                if (snap) {
                    finalP2d = [snap.x, snap.y];
                    currentSnapResult = snap;
                }
            }

            // Legacy: Apply locked constraints for rectangle
            if (currentDrawingPrimitive && currentDrawingPrimitive.type === 'rectangle' && currentDrawingPrimitive.points.length > 0) {
                const start = currentDrawingPrimitive.points[0];
                if (lockedValues['width'] !== undefined && lockedValues['width'] !== null) {
                    const directionX = p2d[0] >= start[0] ? 1 : -1;
                    finalP2d[0] = start[0] + (lockedValues['width']! * directionX);
                }
                if (lockedValues['height'] !== undefined && lockedValues['height'] !== null) {
                    const directionY = p2d[1] >= start[1] ? 1 : -1;
                    finalP2d[1] = start[1] + (lockedValues['height']! * directionY);
                }
                // Override snap if locked (locks take precedence over snaps usually, or snapping should respect locks? For now locks win)
                currentSnapResult = null;
            }

            setHoverPoint(finalP2d);
            setSnapResult(currentSnapResult);
            setSnapPoint(currentSnapResult?.snapPoint || null); // Update global store

            if (currentDrawingPrimitive && !showDialog) {
                const newPoints = [...currentDrawingPrimitive.points];
                newPoints[newPoints.length - 1] = finalP2d;
                updateCurrentDrawingPrimitive({ ...currentDrawingPrimitive, points: newPoints });

                // Update Solver if drawing
                const solverId = currentDrawingPrimitive.properties?.solverId;
                if (solverId) {
                    setDrivingPoint(solverId as string, finalP2d[0], finalP2d[1]);
                    solveConstraints();
                }
            }
        }
    };

    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0 || !hoverPoint || showDialog) return;
        e.stopPropagation();

        const p2d = hoverPoint;

        if (!currentDrawingPrimitive) {
            clearSketchInputLocks();
        }

        // Check if this tool requires a dialog
        if (!currentDrawingPrimitive && DIALOG_REQUIRED_TOOLS.includes(activeTool as ToolType)) {
            setPendingStartPoint(p2d);
            setShowDialog(true);
            return;
        }

        if (!currentDrawingPrimitive) {
            // Start primitives based on tool type
            startPrimitive(p2d, activeTool as ToolType);
        } else {
            // Continue or finish primitive
            continuePrimitive(p2d);
        }
    };

    const startPrimitive = (p2d: [number, number], tool: ToolType, props?: Record<string, any>) => {
        const baseProps = {
            id: Math.random().toString(),
            points: [p2d, p2d],
            properties: props || {}
        };

        switch (tool) {
            case 'line':
            case 'vline':
            case 'hline':
                updateCurrentDrawingPrimitive({ ...baseProps, type: tool });
                break;
            case 'polarline':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'polarline',
                    properties: { distance: props?.distance || 10, angle: props?.angle || 0 }
                });
                break;
            case 'tangentline':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'tangentline',
                    properties: { distance: props?.distance || 10 }
                });
                break;
            case 'movePointer':
                // movePointer just relocates, add directly
                addSketchPrimitive({ ...baseProps, type: 'movePointer', points: [p2d] });
                break;
            case 'rectangle':
            case 'box':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'rectangle' });
                break;
            case 'roundedRectangle':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'roundedRectangle',
                    properties: { radius: props?.radius || 3 }
                });
                break;
            case 'circle':
            case 'sphere':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'circle' });
                break;
            case 'polygon':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'polygon',
                    properties: { sides: props?.sides || 6, sagitta: props?.sagitta || 0 }
                });
                break;
            case 'threePointsArc':
            case 'arc':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'threePointsArc' });
                break;
            case 'tangentArc':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'tangentArc' });
                break;
            case 'sagittaArc':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'sagittaArc',
                    properties: { sagitta: props?.sagitta || 3 }
                });
                break;
            case 'ellipse':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'ellipse',
                    properties: {
                        xRadius: props?.xRadius || 10,
                        yRadius: props?.yRadius || 5,
                        rotation: props?.rotation || 0,
                        longWay: props?.longWay || false,
                        counterClockwise: props?.counterClockwise || false
                    }
                });
                break;
            case 'smoothSpline':
            case 'spline':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'smoothSpline',
                    properties: {
                        startTangent: props?.startTangent,
                        endTangent: props?.endTangent
                    }
                });
                break;
            case 'bezier':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'bezier',
                    points: [p2d, p2d, [props?.ctrlX || p2d[0] + 5, props?.ctrlY || p2d[1] + 5]]
                });
                break;
            case 'quadraticBezier':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'quadraticBezier',
                    properties: { ctrlX: props?.ctrlX || 5, ctrlY: props?.ctrlY || 5 }
                });
                break;
            case 'cubicBezier':
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'cubicBezier',
                    properties: {
                        ctrlStartX: props?.ctrlStartX || 3,
                        ctrlStartY: props?.ctrlStartY || 5,
                        ctrlEndX: props?.ctrlEndX || 7,
                        ctrlEndY: props?.ctrlEndY || 5
                    }
                });
                break;
            case 'text':
                addSketchPrimitive({
                    id: Math.random().toString(),
                    type: 'text',
                    points: [p2d],
                    properties: { text: props?.text || 'Text', fontSize: props?.fontSize || 16 }
                });
                break;
            default:
                const lineData = addSolverLineMacro(p2d, p2d);
                updateCurrentDrawingPrimitive({
                    ...baseProps,
                    type: 'line',
                    properties: { ...baseProps.properties, solverId: lineData?.p2Id }
                });
        }
    };

    const continuePrimitive = (p2d: [number, number]) => {
        if (!currentDrawingPrimitive) return;

        const type = currentDrawingPrimitive.type;

        // Multi-point tools (splines only - lines are now two-point)
        if (['smoothSpline', 'spline'].includes(type)) {
            updateCurrentDrawingPrimitive({
                ...currentDrawingPrimitive,
                points: [...currentDrawingPrimitive.points, p2d]
            });
            return;
        }

        // Line types - complete on second click (two-point)
        if (['line', 'vline', 'hline', 'polarline', 'tangentline'].includes(type)) {
            // Update the end point and finish the line
            const finalPoints = [currentDrawingPrimitive.points[0], p2d];
            addSketchPrimitive({
                ...currentDrawingPrimitive,
                points: finalPoints
            });
            updateCurrentDrawingPrimitive(null);
            return;
        }

        // Three-point arc (needs start, end, then via point)
        if (type === 'threePointsArc') {
            if (currentDrawingPrimitive.points.length === 2) {
                updateCurrentDrawingPrimitive({
                    ...currentDrawingPrimitive,
                    points: [...currentDrawingPrimitive.points, p2d]
                });
            } else {
                addSketchPrimitive(currentDrawingPrimitive);
                updateCurrentDrawingPrimitive(null);
            }
            return;
        }

        // Two-point finishers (rect, circle, polygon, ellipse, tangentArc, sagittaArc, etc.)
        addSketchPrimitive({
            ...currentDrawingPrimitive,
            points: currentDrawingPrimitive.points
        });
        updateCurrentDrawingPrimitive(null);
    };

    const handleDialogConfirm = (params: Record<string, any>) => {
        setShowDialog(false);
        if (pendingStartPoint) {
            startPrimitive(pendingStartPoint, activeTool as ToolType, params);
            setDialogParams(params);
        }
        setPendingStartPoint(null);
    };

    const handleDialogClose = () => {
        setShowDialog(false);
        setPendingStartPoint(null);
    };

    // Double-click to finish multi-point tools
    const handleDoubleClick = () => {
        if (currentDrawingPrimitive && MULTI_POINT_TOOLS.includes(currentDrawingPrimitive.type as ToolType)) {
            if (currentDrawingPrimitive.points.length > 2) {
                const finalPoints = currentDrawingPrimitive.points.slice(0, -1); // Remove last hover point
                addSketchPrimitive({ ...currentDrawingPrimitive, points: finalPoints });
                updateCurrentDrawingPrimitive(null);
            }
        }
    };

    // Rendering Helpers
    const renderPrimitive = (prim: SketchPrimitive, isGhost: boolean = false) => {
        const color = isGhost ? "#00ffff" : "#ffff00";
        const points = prim.points.map(p => to3D(p[0], p[1]));

        // Line types
        if (['line', 'vline', 'hline', 'polarline', 'tangentline'].includes(prim.type)) {
            return (
                <line key={prim.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={points.length}
                            array={new Float32Array(points.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                </line>
            );
        }

        // Rectangle
        if (prim.type === 'rectangle' || prim.type === 'roundedRectangle') {
            if (points.length < 2) return null;
            const u1 = prim.points[0];
            const u2 = prim.points[1];
            const rectPoints2D = [u1, [u2[0], u1[1]], u2, [u1[0], u2[1]], u1];
            const displayPoints = rectPoints2D.map(p => to3D(p[0], p[1]));

            const width = Math.abs(u2[0] - u1[0]);
            const height = Math.abs(u2[1] - u1[1]);
            const cx = (u1[0] + u2[0]) / 2;
            const cy = (u1[1] + u2[1]) / 2;
            const isDrawing = currentDrawingPrimitive?.id === prim.id;

            return (
                <group key={prim.id}>
                    <line>
                        <bufferGeometry>
                            <bufferAttribute
                                attach="attributes-position"
                                count={displayPoints.length}
                                array={new Float32Array(displayPoints.flatMap(v => [v.x, v.y, v.z]))}
                                itemSize={3}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                    </line>
                    {isDrawing && (
                        <>
                            <DynamicInputOverlay
                                position={to3D(cx, Math.max(u1[1], u2[1]) + 4).toArray()}
                                value={lockedValues['width'] ?? parseFloat(width.toFixed(2))}
                                label="Width"
                                showLabel
                                autoFocus={!lockedValues['width']}
                                onChange={(val) => setSketchInputLock('width', val)}
                                onLock={() => { }}
                            />
                            <DynamicInputOverlay
                                position={to3D(Math.min(u1[0], u2[0]) - 4, cy).toArray()}
                                value={lockedValues['height'] ?? parseFloat(height.toFixed(2))}
                                label="Height"
                                showLabel
                                onChange={(val) => setSketchInputLock('height', val)}
                                onLock={() => { }}
                            />
                        </>
                    )}
                </group>
            );
        }

        // Circle
        if (prim.type === 'circle') {
            if (points.length < 2) return null;
            const center = points[0];
            const edge = points[1];
            const radius = center.distanceTo(edge);
            const segments = 64;
            const circlePoints: THREE.Vector3[] = [];
            const c2d = prim.points[0];

            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                const x = c2d[0] + Math.cos(theta) * radius;
                const y = c2d[1] + Math.sin(theta) * radius;
                circlePoints.push(to3D(x, y));
            }

            return (
                <line key={prim.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={circlePoints.length}
                            array={new Float32Array(circlePoints.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                </line>
            );
        }

        // Polygon
        if (prim.type === 'polygon') {
            if (points.length < 2) return null;
            const center = points[0];
            const edge = points[1];
            const radius = center.distanceTo(edge);
            const sides = prim.properties?.sides || 6;
            const polyPoints: THREE.Vector3[] = [];
            const dx = prim.points[1][0] - prim.points[0][0];
            const dy = prim.points[1][1] - prim.points[0][1];
            const startAngle = Math.atan2(dy, dx);

            for (let i = 0; i <= sides; i++) {
                const theta = startAngle + (i / sides) * Math.PI * 2;
                const x = prim.points[0][0] + Math.cos(theta) * radius;
                const y = prim.points[0][1] + Math.sin(theta) * radius;
                polyPoints.push(to3D(x, y));
            }

            return (
                <line key={prim.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={polyPoints.length}
                            array={new Float32Array(polyPoints.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                </line>
            );
        }

        // Ellipse
        if (prim.type === 'ellipse') {
            if (points.length < 2) return null;
            const startPt = prim.points[0];
            const endPt = prim.points[1];
            const xRadius = prim.properties?.xRadius || 10;
            const yRadius = prim.properties?.yRadius || 5;
            const segments = 64;
            const ellipsePoints: THREE.Vector3[] = [];

            // Simple ellipse approximation centered between start and end
            const cx = (startPt[0] + endPt[0]) / 2;
            const cy = (startPt[1] + endPt[1]) / 2;

            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                const x = cx + Math.cos(theta) * xRadius;
                const y = cy + Math.sin(theta) * yRadius;
                ellipsePoints.push(to3D(x, y));
            }

            return (
                <line key={prim.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={ellipsePoints.length}
                            array={new Float32Array(ellipsePoints.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                </line>
            );
        }

        // Spline / smoothSpline
        if (['spline', 'smoothSpline'].includes(prim.type)) {
            if (points.length < 2) return null;
            const curve = new THREE.CatmullRomCurve3(points);
            const splinePoints = curve.getPoints(50);

            return (
                <group key={prim.id}>
                    <line>
                        <bufferGeometry>
                            <bufferAttribute
                                attach="attributes-position"
                                count={splinePoints.length}
                                array={new Float32Array(splinePoints.flatMap(v => [v.x, v.y, v.z]))}
                                itemSize={3}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                    </line>
                    {isGhost && points.map((p, i) => (
                        <mesh key={i} position={p}>
                            <boxGeometry args={[0.3, 0.3, 0.3]} />
                            <meshBasicMaterial color="#ff00ff" depthTest={false} />
                        </mesh>
                    ))}
                </group>
            );
        }

        // Arcs (threePointsArc, tangentArc, sagittaArc)
        if (['threePointsArc', 'tangentArc', 'sagittaArc', 'arc'].includes(prim.type)) {
            if (points.length < 2) return null;

            if (points.length === 2) {
                // Draw line for preview
                return (
                    <line key={prim.id}>
                        <bufferGeometry>
                            <bufferAttribute
                                attach="attributes-position"
                                count={2}
                                array={new Float32Array([...points[0].toArray(), ...points[1].toArray()])}
                                itemSize={3}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                    </line>
                );
            }

            // 3 points: use CatmullRom for smooth preview
            const splineCurve = new THREE.CatmullRomCurve3([
                points[0],
                points.length > 2 ? points[2] : points[1], // via point
                points[1]
            ]);
            const arcPoints = splineCurve.getPoints(20);

            return (
                <line key={prim.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={arcPoints.length}
                            array={new Float32Array(arcPoints.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                </line>
            );
        }

        // Bezier curves
        if (['bezier', 'quadraticBezier'].includes(prim.type)) {
            if (points.length < 2) return null;
            const start = points[0];
            const end = points[1];
            const ctrl = points.length > 2 ? points[2] :
                new THREE.Vector3(
                    (start.x + end.x) / 2 + (prim.properties?.ctrlY || 5),
                    (start.y + end.y) / 2 + (prim.properties?.ctrlX || 5),
                    (start.z + end.z) / 2
                );

            const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
            const bezierPoints = curve.getPoints(30);

            return (
                <group key={prim.id}>
                    <line>
                        <bufferGeometry>
                            <bufferAttribute
                                attach="attributes-position"
                                count={bezierPoints.length}
                                array={new Float32Array(bezierPoints.flatMap(v => [v.x, v.y, v.z]))}
                                itemSize={3}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                    </line>
                    {/* Control point marker */}
                    <mesh position={ctrl}>
                        <sphereGeometry args={[0.3, 16, 16]} />
                        <meshBasicMaterial color="#ff8800" depthTest={false} />
                    </mesh>
                </group>
            );
        }

        // Cubic Bezier
        if (prim.type === 'cubicBezier') {
            if (points.length < 2) return null;
            const start = points[0];
            const end = points[1];
            const props = prim.properties || {};
            const ctrl1 = to3D(
                prim.points[0][0] + (props.ctrlStartX || 3),
                prim.points[0][1] + (props.ctrlStartY || 5)
            );
            const ctrl2 = to3D(
                prim.points[1][0] - (props.ctrlEndX || 3),
                prim.points[1][1] + (props.ctrlEndY || 5)
            );

            const curve = new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end);
            const bezierPoints = curve.getPoints(30);

            return (
                <group key={prim.id}>
                    <line>
                        <bufferGeometry>
                            <bufferAttribute
                                attach="attributes-position"
                                count={bezierPoints.length}
                                array={new Float32Array(bezierPoints.flatMap(v => [v.x, v.y, v.z]))}
                                itemSize={3}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                    </line>
                    {/* Control point markers */}
                    <mesh position={ctrl1}>
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshBasicMaterial color="#ff8800" depthTest={false} />
                    </mesh>
                    <mesh position={ctrl2}>
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshBasicMaterial color="#ff8800" depthTest={false} />
                    </mesh>
                </group>
            );
        }

        // Text (show as marker for now)
        if (prim.type === 'text') {
            const pos = points[0];
            return (
                <group key={prim.id}>
                    <Html position={pos} center>
                        <div className="text-white bg-slate-800/80 px-2 py-1 rounded text-xs">
                            {prim.properties?.text || 'Text'}
                        </div>
                    </Html>
                </group>
            );
        }

        // Move pointer marker
        if (prim.type === 'movePointer') {
            const pos = points[0];
            return (
                <mesh key={prim.id} position={pos}>
                    <ringGeometry args={[0.3, 0.5, 32]} />
                    <meshBasicMaterial color="#00ff00" depthTest={false} side={THREE.DoubleSide} />
                </mesh>
            );
        }

        return null;
    };

    const renderSolverEntity = (entity: any) => {
        const color = "#ffffff";
        if (entity.type === 'line') {
            const p1 = sketchEntities.get(entity.p1Id);
            const p2 = sketchEntities.get(entity.p2Id);
            if (!p1 || !p2 || p1.type !== 'point' || p2.type !== 'point') return null;
            const points = [to3D(p1.x, p1.y), to3D(p2.x, p2.y)];
            return (
                <line key={entity.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={2}
                            array={new Float32Array(points.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={2} depthTest={false} transparent opacity={0.8} />
                </line>
            );
        }
        if (entity.type === 'circle') {
            const center = sketchEntities.get(entity.centerId);
            if (!center || center.type !== 'point') return null;
            const segments = 64;
            const circlePoints: THREE.Vector3[] = [];
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                const x = center.x + Math.cos(theta) * entity.radius;
                const y = center.y + Math.sin(theta) * entity.radius;
                circlePoints.push(to3D(x, y));
            }
            return (
                <line key={entity.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={circlePoints.length}
                            array={new Float32Array(circlePoints.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={2} depthTest={false} transparent opacity={0.8} />
                </line>
            );
        }
        if (entity.type === 'point' && draggingEntityId === entity.id) {
            return (
                <mesh key={entity.id} position={to3D(entity.x, entity.y)}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshBasicMaterial color="#00ffff" depthTest={false} />
                </mesh>
            );
        }
        return null;
    };

    return (
        <group>
            {/* Invisible plane for raycasting */}
            <mesh
                visible={false}
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                onDoubleClick={handleDoubleClick}
                rotation={planeRotation}
                position={[0, 0, 0]}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial color="red" wireframe side={THREE.DoubleSide} />
            </mesh>

            {/* Render Solver Entities */}
            {Array.from(sketchEntities.values()).map(entity => renderSolverEntity(entity))}

            {/* Render Active Primitives (Legacy) */}
            {activeSketchPrimitives.map(prim => renderPrimitive(prim, false))}

            {/* Render Current Drawing Primitive */}
            {currentDrawingPrimitive && renderPrimitive(currentDrawingPrimitive, true)}

            {/* Line Drawing Overlay - Visual feedback for line tool */}
            {currentDrawingPrimitive &&
                ['line', 'vline', 'hline', 'polarline', 'tangentline'].includes(currentDrawingPrimitive.type) &&
                currentDrawingPrimitive.points.length >= 2 && (
                    <LineAnnotation
                        start={{ x: currentDrawingPrimitive.points[0][0], y: currentDrawingPrimitive.points[0][1] }}
                        end={{ x: currentDrawingPrimitive.points[currentDrawingPrimitive.points.length - 1][0], y: currentDrawingPrimitive.points[currentDrawingPrimitive.points.length - 1][1] }}
                        plane={sketchPlane!}
                        lockedLength={lockedValues['length']}
                        lockedAngle={lockedValues['angle']}
                    />
                )}

            {/* Circle Drawing Overlay */}
            {currentDrawingPrimitive &&
                currentDrawingPrimitive.type === 'circle' &&
                currentDrawingPrimitive.points.length >= 2 && (
                    <CircleAnnotation
                        center={{ x: currentDrawingPrimitive.points[0][0], y: currentDrawingPrimitive.points[0][1] }}
                        edge={{ x: currentDrawingPrimitive.points[1][0], y: currentDrawingPrimitive.points[1][1] }}
                        plane={sketchPlane!}
                    />
                )}

            {/* Rectangle Drawing Overlay */}
            {currentDrawingPrimitive &&
                ['rectangle', 'roundedRectangle'].includes(currentDrawingPrimitive.type) &&
                currentDrawingPrimitive.points.length >= 2 && (
                    <RectangleAnnotation
                        corner1={{ x: currentDrawingPrimitive.points[0][0], y: currentDrawingPrimitive.points[0][1] }}
                        corner2={{ x: currentDrawingPrimitive.points[1][0], y: currentDrawingPrimitive.points[1][1] }}
                        plane={sketchPlane!}
                    />
                )}

            {/* Hover Cursor */}
            {hoverPoint && !showDialog && (
                <group position={to3D(hoverPoint[0], hoverPoint[1])}>
                    {/* Default Cursor Ring */}
                    <mesh visible={!snapResult}>
                        <ringGeometry args={[0.5, 0.7, 32]} />
                        <meshBasicMaterial color="#00ffff" depthTest={false} side={THREE.DoubleSide} />
                    </mesh>

                    {/* Snap Markers */}
                    {snapResult && (
                        <>
                            {/* Visual Marker based on Type */}
                            {snapResult.snapPoint.type === 'endpoint' && (
                                <mesh>
                                    <boxGeometry args={[1, 1, 1]} /> {/* Square */}
                                    <meshBasicMaterial color="#00ff00" depthTest={false} />
                                </mesh>
                            )}
                            {snapResult.snapPoint.type === 'midpoint' && (
                                <mesh rotation={[0, 0, Math.PI / 6]}>
                                    <coneGeometry args={[0.8, 0, 3]} /> {/* Triangle (hacky cone) */}
                                    <meshBasicMaterial color="#00ff00" depthTest={false} />
                                </mesh>
                            )}
                            {snapResult.snapPoint.type === 'center' && (
                                <mesh rotation={[0, 0, Math.PI / 4]}>
                                    <boxGeometry args={[0.8, 0.8, 0.8]} /> {/* Diamond (rotated square) */}
                                    <meshBasicMaterial color="#00ff00" depthTest={false} />
                                </mesh>
                            )}
                            {(snapResult.snapPoint.type === 'grid' || snapResult.snapPoint.type.includes('horizontal') || snapResult.snapPoint.type.includes('vertical')) && (
                                <mesh>
                                    <ringGeometry args={[0.3, 0.5, 32]} />
                                    <meshBasicMaterial color="#ffffff" depthTest={false} />
                                </mesh>
                            )}
                        </>
                    )}
                </group>
            )}

            {/* Guide Lines from Snap Result */}
            {snapResult?.guideLines?.map((guide, i) => (
                <line key={`guide-${i}`}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={2}
                            array={new Float32Array([...to3D(guide.from.x, guide.from.y).toArray(), ...to3D(guide.to.x, guide.to.y).toArray()])}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineDashedMaterial color="#ffffff" dashSize={1} gapSize={1} depthTest={false} />
                </line>
            ))}

            {/* Tool Parameter Dialog */}
            {showDialog && pendingStartPoint && (
                <Html position={to3D(pendingStartPoint[0] + 5, pendingStartPoint[1] + 5)} center>
                    <SketchToolDialog
                        isVisible={showDialog}
                        onClose={handleDialogClose}
                        onConfirm={handleDialogConfirm}
                    />
                </Html>
            )}
        </group>
    );
};

export default SketchCanvas;

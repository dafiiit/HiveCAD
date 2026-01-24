import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useThree, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, SketchPrimitive, ToolType } from "../../hooks/useCADStore";
import { SnappingEngine, SnapResult } from "../../lib/snapping";
import { toolRegistry } from "../../lib/tools";
import SketchToolDialog, { TOOL_PARAMS } from "./SketchToolDialog";
import { DimensionBadge, createAnnotationContext } from "./SketchAnnotations";

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
        selectedIds, selectObject, clearSelection,
        lockedValues, setSketchInputLock, clearSketchInputLocks, finishSketch,
        // Solver state and actions
        solverInstance, sketchEntities, sketchConstraints, draggingEntityId,
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

    const annotationCtx = useMemo(() => sketchPlane ? createAnnotationContext(sketchPlane) : null, [sketchPlane]);

    // Only active in sketch mode drawing step
    if (!isSketchMode || sketchStep !== 'drawing' || !sketchPlane) return null;

    /**
     * PLANE COORDINATE SYSTEM - Using Normal Vectors
     * 
     * In Three.js Y-up, a PlaneGeometry defaults to XY plane with normal +Z.
     * Camera positions determine what the user SEES:
     * 
     * | Plane Name | Camera At | User Sees    | Drawing Surface | Normal Vector | Raycast Rotation |
     * |------------|-----------|--------------|-----------------|---------------|------------------|
     * | XY (Top)   | +Y        | XZ plane     | Y=0 horizontal  | (0, 1, 0)     | [-π/2, 0, 0]     |
     * | XZ (Front) | +Z        | XY plane     | Z=0 vertical    | (0, 0, 1)     | [0, 0, 0]        |
     * | YZ (Right) | +X        | YZ plane     | X=0 vertical    | (1, 0, 0)     | [0, π/2, 0]      |
     * 
     * 2D Sketch Coordinates: (u, v) where u=horizontal, v=vertical on screen
     * 3D World Mapping must match what camera sees!
     */

    // Raycast plane rotation - rotates default XY plane to match the actual drawing surface
    // Normal (0,0,1) → target normal via rotation
    const planeRotation: [number, number, number] =
        sketchPlane === 'XY' ? [-Math.PI / 2, 0, 0] :  // Normal → (0,1,0), horizontal plane at Y=0
            sketchPlane === 'XZ' ? [0, 0, 0] :              // Normal stays (0,0,1), vertical plane at Z=0
                [0, Math.PI / 2, 0];     // Normal → (1,0,0), vertical plane at X=0

    // Helper to map 3D world point to 2D sketch coordinates
    // Must extract the two coordinates visible on screen for each camera view
    const to2D = (p: THREE.Vector3): [number, number] => {
        if (sketchPlane === 'XY') return [p.x, p.z];  // Top view: X is horizontal, Z is vertical
        if (sketchPlane === 'XZ') return [p.x, p.y];  // Front view: X is horizontal, Y is vertical
        return [p.z, p.y];                             // Right view: Z is horizontal, Y is vertical
    };

    // Helper to map 2D sketch coord back to 3D world
    // The fixed coordinate is on the plane (e.g., Y=0 for horizontal XY/Top plane)
    const to3D = (u: number, v: number): THREE.Vector3 => {
        if (sketchPlane === 'XY') return new THREE.Vector3(u, 0, v);  // Y=0 plane, u→X, v→Z
        if (sketchPlane === 'XZ') return new THREE.Vector3(u, v, 0);  // Z=0 plane, u→X, v→Y
        return new THREE.Vector3(0, v, u);                             // X=0 plane, u→Z, v→Y
    };

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (e.intersections.length > 0) {
            const worldPoint = e.intersections[0].point;

            // Clamp to exact plane to avoid floating point drift
            if (sketchPlane === 'XY') worldPoint.y = 0;  // Y=0 plane
            if (sketchPlane === 'XZ') worldPoint.z = 0;  // Z=0 plane
            if (sketchPlane === 'YZ') worldPoint.x = 0;  // X=0 plane

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

    // Hit Test Helper
    const hitTest = (p: [number, number]) => {
        const hitThreshold = 0.5;
        let closestEntityId: string | null = null;
        let minDistance = hitThreshold;

        sketchEntities.forEach((entity) => {
            let distance = Infinity;

            if (entity.type === 'point') {
                const dx = entity.x - p[0];
                const dy = entity.y - p[1];
                distance = Math.sqrt(dx * dx + dy * dy);
            } else if (entity.type === 'line') {
                const p1 = sketchEntities.get(entity.p1Id);
                const p2 = sketchEntities.get(entity.p2Id);
                if (p1 && p2 && p1.type === 'point' && p2.type === 'point') {
                    // Distance from point to line segment
                    const A = p[0] - p1.x;
                    const B = p[1] - p1.y;
                    const C = p2.x - p1.x;
                    const D = p2.y - p1.y;

                    const dot = A * C + B * D;
                    const lenSq = C * C + D * D;
                    let param = -1;
                    if (lenSq !== 0) // in case of 0 length line
                        param = dot / lenSq;

                    let xx, yy;

                    if (param < 0) {
                        xx = p1.x;
                        yy = p1.y;
                    }
                    else if (param > 1) {
                        xx = p2.x;
                        yy = p2.y;
                    }
                    else {
                        xx = p1.x + param * C;
                        yy = p1.y + param * D;
                    }

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

            if (distance < minDistance) {
                minDistance = distance;
                closestEntityId = entity.id;
            }
        });
        return closestEntityId;
    };

    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0 || !hoverPoint || showDialog) return;
        e.stopPropagation();

        const p2d = hoverPoint;

        if (!currentDrawingPrimitive) {
            clearSketchInputLocks();
        }

        // Handle Selection and Dimension Tools
        if (activeTool === 'select' || activeTool === 'dimension') {
            const hitId = hitTest(p2d);

            if (hitId) {
                // For dimension tool, we want to accumulate selection (multi-select behavior mostly)
                // but if we click the same thing, maybe toggle?
                const multiSelect = e.ctrlKey || e.metaKey || e.shiftKey || activeTool === 'dimension';
                selectObject(hitId, multiSelect);

                if (activeTool === 'dimension') {
                    // Check if we can apply a dimension with current selection
                    const state = useCADStore.getState();
                    // We need to fetch FRESH selectedIds from state because selectObject updates store asynchronously? 
                    // No, Zustand updates are synchronous usually.
                    // But we should use the updated selection.
                    // We can check 'selectedIds' from hook + hitId? 
                    // Or just re-read state.
                    const currentSelected = new Set(state.selectedIds);
                    // Filter for sketch entities
                    const sEntities = Array.from(currentSelected)
                        .filter(id => sketchEntities.has(id))
                        .map(id => sketchEntities.get(id)!);

                    let applied = false;
                    const { applyConstraintToSelection, clearSelection: clear } = state;

                    // Case: 1 Circle -> Radius
                    if (sEntities.length === 1 && sEntities[0].type === 'circle') {
                        applyConstraintToSelection('radius');
                        applied = true;
                    }
                    // Case: 2 Points -> Distance
                    else if (sEntities.length === 2 && sEntities.every(e => e.type === 'point')) {
                        applyConstraintToSelection('distance');
                        applied = true;
                    }

                    if (applied) {
                        clear();
                        toast.success("Dimension added");
                    }
                }
            } else {
                if (activeTool === 'select' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    clearSelection();
                }
            }
            return;
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
        // Try to use tool registry first
        const toolDef = toolRegistry.get(tool);
        if (toolDef?.createInitialPrimitive) {
            const primitive = toolDef.createInitialPrimitive(p2d, props) as SketchPrimitive;
            // Special case: text is added immediately
            if (tool === 'text') {
                addSketchPrimitive(primitive);
            } else {
                updateCurrentDrawingPrimitive(primitive);
            }
            return;
        }

        // Fallback for tools not yet in registry (box/sphere aliases)
        const baseProps = {
            id: Math.random().toString(),
            points: [p2d, p2d],
            properties: props || {}
        };

        switch (tool) {
            case 'box':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'rectangle' });
                break;
            case 'sphere':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'circle' });
                break;
            case 'arc':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'threePointsArc' });
                break;
            case 'spline':
                updateCurrentDrawingPrimitive({ ...baseProps, type: 'smoothSpline', properties: { startTangent: props?.startTangent, endTangent: props?.endTangent } });
                break;
            default:
                // Default fallback: use line with solver
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
        if (['line'].includes(type)) {
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

    // Rendering helper - delegates to tool registry
    const renderPrimitive = (prim: SketchPrimitive, isGhost: boolean = false) => {
        // Look up tool in registry and use its renderPreview if available
        const toolDef = toolRegistry.get(prim.type);
        if (toolDef?.renderPreview) {
            return toolDef.renderPreview(
                prim as any, // Cast to tool's SketchPrimitive type
                to3D,
                isGhost
            );
        }

        // Fallback: render as simple line for any unregistered primitives
        const color = isGhost ? "#00ffff" : "#ffff00";
        const points = prim.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

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
    };

    // Render annotation overlay - delegates to tool registry
    const renderAnnotation = (prim: SketchPrimitive) => {
        const toolDef = toolRegistry.get(prim.type);
        if (toolDef?.renderAnnotation) {
            return toolDef.renderAnnotation(prim as any, sketchPlane!, lockedValues as any);
        }
        return null;
    };

    const renderSolverEntity = (entity: any) => {
        const isSelected = selectedIds.has(entity.id);
        const baseColor = isSelected ? "#ff9900" : "#ffffff";
        const lineWidth = isSelected ? 3 : 2;
        const opacity = isSelected ? 1.0 : 0.8;

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
                    <lineBasicMaterial color={baseColor} linewidth={lineWidth} depthTest={false} transparent opacity={opacity} />
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
                    <lineBasicMaterial color={baseColor} linewidth={lineWidth} depthTest={false} transparent opacity={opacity} />
                </line>
            );
        }
        // Points rendering
        if (entity.type === 'point') {
            // We generally only render points if they are significant (corners, etc.) or selected/dragged
            // For now, let's render points if they are selected or if they are terminals of lines/arcs?
            // Actually, usually CAD tools show points as small dots.
            // Let's show points if selected or if they are "driving points" (dragging)
            // The original code only showed points if draggingEntityId === entity.id

            if (isSelected || draggingEntityId === entity.id) {
                return (
                    <mesh key={entity.id} position={to3D(entity.x, entity.y)}>
                        <sphereGeometry args={[isSelected ? 0.3 : 0.2, 8, 8]} />
                        <meshBasicMaterial color={isSelected ? "#ff9900" : "#00ffff"} depthTest={false} />
                    </mesh>
                );
            }
            // Also render points slightly to give a target for clicking?
            return (
                <mesh key={entity.id} position={to3D(entity.x, entity.y)} visible={false}>
                    <sphereGeometry args={[0.3, 8, 8]} />
                    <meshBasicMaterial color="red" />
                </mesh>
            )
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

            {/* Drawing Annotations - delegates to tool registry */}
            {currentDrawingPrimitive && currentDrawingPrimitive.points.length >= 2 && renderAnnotation(currentDrawingPrimitive)}

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

            {/* Dimension Annotations */}
            {annotationCtx && sketchConstraints.map(c => {
                if (c.type === 'distance' && c.value !== undefined && c.entityIds.length >= 2) {
                    const p1 = sketchEntities.get(c.entityIds[0]);
                    const p2 = sketchEntities.get(c.entityIds[1]);
                    if (p1?.type === 'point' && p2?.type === 'point') {
                        const midX = (p1.x + p2.x) / 2;
                        const midY = (p1.y + p2.y) / 2;
                        return <DimensionBadge key={c.id} position={{ x: midX, y: midY }} value={c.value} unit="mm" ctx={annotationCtx} />;
                    }
                }
                if (c.type === 'radius' && c.value !== undefined) {
                    const circle = sketchEntities.get(c.entityIds[0]);
                    if (circle?.type === 'circle') {
                        const center = sketchEntities.get(circle.centerId);
                        if (center?.type === 'point') {
                            return <DimensionBadge key={c.id} position={{ x: center.x + circle.radius * 0.7, y: center.y + circle.radius * 0.7 }} value={c.value} unit="R" ctx={annotationCtx} />;
                        }
                    }
                }
                return null;
            })}

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

import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import { useThree, ThreeEvent } from "@react-three/fiber";
import { Html, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, useCADStoreApi, SketchPrimitive, ToolType } from "../../hooks/useCADStore";
import { SnappingEngine, SnapResult } from "../../lib/snapping";
import { toolRegistry } from "../../lib/tools";
import SketchToolDialog from "./SketchToolDialog";
import { DimensionBadge, createAnnotationContext } from "./SketchAnnotations";
import { snapToGrid } from "../../lib/sketch/rendering";

// Import tool types once at startup for efficiency
const DIALOG_REQUIRED_TOOLS: ToolType[] = toolRegistry.getDialogTools().map(t => t.metadata.id as ToolType);
const SHAPE_TOOLS: ToolType[] = toolRegistry.getAll()
    .filter(t => t.createShape !== undefined)
    .map(t => t.metadata.id as ToolType);
const MULTI_POINT_TOOLS: ToolType[] = toolRegistry.getAll()
    .filter(t => t.metadata.category === 'sketch' && !SHAPE_TOOLS.includes(t.metadata.id as ToolType))
    .map(t => t.metadata.id as ToolType);

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
        setSnapPoint, setSnappingEngine,
        // New sketch features
        chainMode, gridSnapSize,
    } = useCADStore();

    const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
    const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
    const [showDialog, setShowDialog] = useState(false);
    const [pendingStartPoint, setPendingStartPoint] = useState<[number, number] | null>(null);
    const [dialogParams, setDialogParams] = useState<Record<string, any>>({});

    const gridRef = useRef<any>(null);

    // Drag detection state
    const dragStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
    const IS_CLICK_THRESHOLD = 5; // Pixels

    // Initialize Snapping Engine
    useEffect(() => {
        if (!snappingEngine) {
            const engine = new SnappingEngine();
            setSnappingEngine(engine);
        }
    }, [snappingEngine, setSnappingEngine]);

    // Ensure Grid is double-sided so it's visible from all angles
    useLayoutEffect(() => {
        if (gridRef.current) {
            // Apply to all meshes in the group (Grid helper might be a group)
            gridRef.current.traverse((obj: any) => {
                if (obj.isMesh && obj.material) {
                    obj.material.side = THREE.DoubleSide;
                    obj.material.needsUpdate = true;
                }
            });
        }
    }, [sketchPlane]); // Re-run when plane changes just in case component remounts/updates

    // Update Snapping Entities when primitives change
    useEffect(() => {
        if (snappingEngine) {
            snappingEngine.setEntities(activeSketchPrimitives);
        }
    }, [snappingEngine, activeSketchPrimitives]);

    // DEBUG: Log selection changes
    useEffect(() => {
        console.log("Selection State Changed:", Array.from(selectedIds));
    }, [selectedIds]);

    // Keyboard shortcuts for sketch mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape: cancel current drawing / exit chain
            if (e.key === 'Escape') {
                if (currentDrawingPrimitive) {
                    updateCurrentDrawingPrimitive(null);
                    e.preventDefault();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentDrawingPrimitive, updateCurrentDrawingPrimitive]);

    const annotationCtx = useMemo(() => sketchPlane ? createAnnotationContext(sketchPlane) : null, [sketchPlane]);

    // Only active in sketch mode drawing step
    if (!isSketchMode || sketchStep !== 'drawing' || !sketchPlane) return null;

    /**
     * PLANE COORDINATE SYSTEM - Z-Up (Replicad/OpenCascade Convention)
     * 
     * In Z-up, the three standard planes are:
     * - XY Plane: horizontal ground plane at Z=0 (Top view from +Z)
     * - XZ Plane: vertical front plane at Y=0 (Front view from -Y)
     * - YZ Plane: vertical side plane at X=0 (Right view from +X)
     * 
     * | Plane Name | Fixed Coord | Camera At | Screen Horizontal | Screen Vertical |
     * |------------|-------------|-----------|-------------------|-----------------|
     * | XY (Top)   | Z=0         | +Z        | X                 | Y               |
     * | XZ (Front) | Y=0         | -Y        | X                 | Z               |
     * | YZ (Right) | X=0         | +X        | Y                 | Z               |
     * 
     * 2D Sketch Coordinates: (u, v) where u=horizontal, v=vertical on screen
     */

    // Raycast plane rotation - rotates default XY plane to match the actual drawing surface
    // PlaneGeometry defaults to XY plane with normal +Z
    // For Z-up: XY plane needs no rotation (ground), XZ needs 90° around X, YZ needs 90° around Y
    const planeRotation: [number, number, number] =
        sketchPlane === 'XY' ? [0, 0, 0] :                         // Z=0 horizontal (ground) - no rotation
            sketchPlane === 'XZ' ? [Math.PI / 2, 0, 0] :           // Y=0 vertical (front) - rotate around X
                [0, Math.PI / 2, 0];                                // X=0 vertical (side) - rotate around Y

    // Helper to map 3D world point to 2D sketch coordinates
    // Must extract the two coordinates visible on screen for each camera view
    const to2D = (p: THREE.Vector3): [number, number] => {
        if (sketchPlane === 'XY') return [p.x, p.y];  // Top view: X is horizontal, Y is vertical
        if (sketchPlane === 'XZ') return [p.x, p.z];  // Front view: X is horizontal, Z is vertical
        return [p.y, p.z];                             // Right view: Y is horizontal, Z is vertical
    };

    // Helper to map 2D sketch coord back to 3D world
    // The fixed coordinate is on the plane (e.g., Z=0 for horizontal XY/Top plane)
    const to3D = (u: number, v: number): THREE.Vector3 => {
        if (sketchPlane === 'XY') return new THREE.Vector3(u, v, 0);  // Z=0 plane, u→X, v→Y
        if (sketchPlane === 'XZ') return new THREE.Vector3(u, 0, v);  // Y=0 plane, u→X, v→Z
        return new THREE.Vector3(0, u, v);                             // X=0 plane, u→Y, v→Z
    };

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (e.intersections.length > 0) {
            const worldPoint = e.intersections[0].point;

            // Transform World Point -> Local Point (Z-up)
            // Scene is rotated by -90 deg X (Z_UP_ROTATION), so we apply +90 deg X to transform back
            const localPoint = worldPoint.clone().applyEuler(new THREE.Euler(Math.PI / 2, 0, 0));

            // Clamp to exact local plane to avoid floating point drift
            if (sketchPlane === 'XY') localPoint.z = 0;  // Z=0 plane (Ground)
            if (sketchPlane === 'XZ') localPoint.y = 0;  // Y=0 plane (Front)
            if (sketchPlane === 'YZ') localPoint.x = 0;  // X=0 plane (Right)

            const p2d = to2D(localPoint);
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

            // Grid snapping — applies when no entity snap was found
            if (!currentSnapResult && gridSnapSize > 0) {
                finalP2d = snapToGrid(finalP2d, gridSnapSize);
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

                // NEW: Calculate dimension mode for lines
                let dimMode: 'aligned' | 'horizontal' | 'vertical' = 'aligned';
                if (currentDrawingPrimitive.type === 'line' && currentDrawingPrimitive.points.length >= 2) {
                    const start = currentDrawingPrimitive.points[0];
                    const distH = Math.abs(p2d[1] - start[1]);
                    const distV = Math.abs(p2d[0] - start[0]);

                    // If mouse is significantly further away in one axis than the other 
                    // and also far from the aligned path, switch mode
                    const threshold = 15;
                    if (distH > threshold && distH > distV * 1.5) {
                        dimMode = 'horizontal';
                    } else if (distV > threshold && distV > distH * 1.5) {
                        dimMode = 'vertical';
                    }
                }

                updateCurrentDrawingPrimitive({
                    ...currentDrawingPrimitive,
                    points: newPoints,
                    properties: { ...currentDrawingPrimitive.properties, dimMode } as any
                });

                // Update Solver if drawing
                const solverId = currentDrawingPrimitive.properties?.solverId;
                if (solverId) {
                    setDrivingPoint(solverId as string, finalP2d[0], finalP2d[1]);
                    solveConstraints();
                }
            }
        }
    };

    const hitTest = (p: [number, number]) => {
        // Higher threshold for easier clicking
        const hitThreshold = 6.0;
        let closestEntityId: string | null = null;
        let minDistance = hitThreshold;

        console.log("Hit testing at:", p);

        // 1. Check Solver Entities (Existing Logic)
        sketchEntities.forEach((entity) => {
            let distance = Infinity;
            let weight = 1.0;

            if (entity.type === 'point') {
                const dx = entity.x - p[0];
                const dy = entity.y - p[1];
                distance = Math.sqrt(dx * dx + dy * dy);
                // Give points a selection priority over lines if they are both close
                weight = 0.8;
            } else if (entity.type === 'line') {
                const p1 = sketchEntities.get(entity.p1Id);
                const p2 = sketchEntities.get(entity.p2Id);
                if (p1 && p2 && p1.type === 'point' && p2.type === 'point') {
                    const A = p[0] - p1.x;
                    const B = p[1] - p1.y;
                    const C = p2.x - p1.x;
                    const D = p2.y - p1.y;

                    const dot = A * C + B * D;
                    const lenSq = C * C + D * D;
                    let param = -1;
                    if (lenSq !== 0) param = dot / lenSq;

                    let xx, yy;
                    if (param < 0) { xx = p1.x; yy = p1.y; }
                    else if (param > 1) { xx = p2.x; yy = p2.y; }
                    else { xx = p1.x + param * C; yy = p1.y + param * D; }

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

            const weightedDistance = distance * weight;
            if (weightedDistance < minDistance) {
                minDistance = weightedDistance;
                closestEntityId = entity.id;
            }
        });

        // 2. NEW: Check Active Primitives (The shapes you just drew)
        // console.log("Checking Active Primitives:", activeSketchPrimitives.length, "at point:", p);
        activeSketchPrimitives.forEach((prim) => {
            let distance = Infinity;

            // Check Points (Endpoints)
            for (const pt of prim.points) {
                const dx = pt[0] - p[0];
                const dy = pt[1] - p[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDistance) {
                    minDistance = d;
                    closestEntityId = prim.id;
                }
            }

            // Check Lines
            if (prim.type === 'line' && prim.points.length >= 2) {
                const p1 = prim.points[0];
                const p2 = prim.points[1];
                const A = p[0] - p1[0];
                const B = p[1] - p1[1];
                const C = p2[0] - p1[0];
                const D = p2[1] - p1[1];
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = -1;
                if (lenSq !== 0) param = dot / lenSq;

                let xx, yy;
                if (param < 0) { xx = p1[0]; yy = p1[1]; }
                else if (param > 1) { xx = p2[0]; yy = p2[1]; }
                else { xx = p1[0] + param * C; yy = p1[1] + param * D; }

                const dx = p[0] - xx;
                const dy = p[1] - yy;
                distance = Math.sqrt(dx * dx + dy * dy);

                // console.log(`Line ${prim.id}: distance=${distance}, p1=${p1}, p2=${p2}, param=${param}`);
            } else {
                // console.log("Prim is not line or missing points:", prim.type, prim.points);
            }

            // Add other types (circle, arc) as needed...
            if (prim.type === 'circle' && prim.points.length >= 2) {
                const center = prim.points[0];
                const end = prim.points[1];
                const radius = Math.sqrt(Math.pow(end[0] - center[0], 2) + Math.pow(end[1] - center[1], 2));
                const dx = center[0] - p[0];
                const dy = center[1] - p[1];
                distance = Math.abs(Math.sqrt(dx * dx + dy * dy) - radius);
            }

            if (distance < minDistance) {
                minDistance = distance;
                closestEntityId = prim.id;
            }
        });

        console.log("Closest entity:", closestEntityId, "distance:", minDistance);
        return closestEntityId;
    };


    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        // Record potential start of interaction
        if (e.button === 0) {
            dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                time: Date.now()
            };
        }
    };

    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0 || !hoverPoint || showDialog) return;

        // Check drag
        if (dragStartRef.current) {
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            dragStartRef.current = null;
            if (dist > IS_CLICK_THRESHOLD) return;
        }

        e.stopPropagation();
        const p2d = hoverPoint;

        if (!currentDrawingPrimitive) {
            clearSketchInputLocks();
        }

        // IMPROVED: Hit test for all entity types
        const hitId = hitTest(p2d);
        if (hitId && (activeTool === 'select' || activeTool === 'dimension' || selectedIds.has(hitId))) {
            const multiSelect = e.ctrlKey || e.metaKey || e.shiftKey || activeTool === 'dimension';
            selectObject(hitId, multiSelect);

            // Handle dimension tool logic
            if (activeTool === 'dimension') {
                // Check if we can apply a dimension with current selection
                const state = useCADStoreApi().getState();
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
                }
            }
            return;
        }

        if (!hitId && (activeTool === 'select' || activeTool === 'dimension')) {
            if (activeTool === 'select' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                clearSelection();
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
        // Resolve legacy aliases to their canonical tool IDs
        const aliasMap: Record<string, string> = {
            'box': 'rectangle',
            'sphere': 'circle',
            'arc': 'threePointsArc',
            'spline': 'smoothSpline',
        };
        const resolvedTool = aliasMap[tool] || tool;

        // Use tool registry for all tools
        const toolDef = toolRegistry.get(resolvedTool);
        if (toolDef?.createInitialPrimitive) {
            const primitive = toolDef.createInitialPrimitive(p2d, props) as SketchPrimitive;
            // Special case: text is added immediately
            if (resolvedTool === 'text') {
                addSketchPrimitive(primitive);
            } else {
                updateCurrentDrawingPrimitive(primitive);
            }
            return;
        }

        // Final fallback: default to line
        const baseProps = {
            id: Math.random().toString(),
            points: [p2d, p2d],
            properties: props || {}
        };
        const lineData = addSolverLineMacro(p2d, p2d);
        updateCurrentDrawingPrimitive({
            ...baseProps,
            type: 'line',
            properties: { ...baseProps.properties, solverId: lineData?.p2Id }
        });
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

        // Line types - complete on second click, then auto-chain
        if (['line', 'constructionLine'].includes(type)) {
            const finalPoints = [currentDrawingPrimitive.points[0], p2d];
            addSketchPrimitive({
                ...currentDrawingPrimitive,
                points: finalPoints
            });

            // Chain mode: auto-start a new line from the endpoint
            if (chainMode) {
                const toolDef = toolRegistry.get('line');
                if (toolDef?.createInitialPrimitive) {
                    const newPrimitive = toolDef.createInitialPrimitive(p2d) as SketchPrimitive;
                    updateCurrentDrawingPrimitive(newPrimitive);
                } else {
                    updateCurrentDrawingPrimitive(null);
                }
            } else {
                updateCurrentDrawingPrimitive(null);
            }
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
                // Chain from arc endpoint
                if (chainMode) {
                    const endpoint = currentDrawingPrimitive.points[1]; // end point of arc
                    const toolDef = toolRegistry.get(activeTool as string);
                    if (toolDef?.createInitialPrimitive) {
                        const newPrimitive = toolDef.createInitialPrimitive(endpoint) as SketchPrimitive;
                        updateCurrentDrawingPrimitive(newPrimitive);
                    } else {
                        updateCurrentDrawingPrimitive(null);
                    }
                } else {
                    updateCurrentDrawingPrimitive(null);
                }
            }
            return;
        }

        // Center-point arc (3 clicks: center, start of arc, end of arc)
        if (type === 'centerPointArc') {
            if (currentDrawingPrimitive.points.length === 2) {
                // Second click → defines the start point of the arc (= radius)
                updateCurrentDrawingPrimitive({
                    ...currentDrawingPrimitive,
                    points: [...currentDrawingPrimitive.points, p2d],
                });
            } else if (currentDrawingPrimitive.points.length === 3) {
                // Third click → defines the sweep end → finalize
                addSketchPrimitive(currentDrawingPrimitive);
                updateCurrentDrawingPrimitive(null);
            }
            return;
        }

        // Two-point finishers (rect, circle, polygon, etc.)
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

    // Double-click to finish multi-point tools or break chain
    const handleDoubleClick = () => {
        if (currentDrawingPrimitive) {
            if (MULTI_POINT_TOOLS.includes(currentDrawingPrimitive.type as ToolType)) {
                if (currentDrawingPrimitive.points.length > 2) {
                    const finalPoints = currentDrawingPrimitive.points.slice(0, -1);
                    addSketchPrimitive({ ...currentDrawingPrimitive, points: finalPoints });
                    updateCurrentDrawingPrimitive(null);
                }
            } else {
                // For line chains: double-click finishes the chain
                updateCurrentDrawingPrimitive(null);
            }
        }
    };

    // Rendering helper - delegates to tool registry
    const renderPrimitive = (prim: SketchPrimitive, isGhost: boolean = false) => {
        const toolDef = toolRegistry.get(prim.type);
        if (toolDef?.renderPreview) {
            const rendered = toolDef.renderPreview(prim as any, to3D, isGhost);

            // Wrap with selection handlers if not a ghost
            if (!isGhost && rendered) {
                return React.cloneElement(rendered as React.ReactElement, {
                    onPointerDown: handlePointerDown as any,
                    onPointerUp: handlePointerUp as any,
                    key: prim.id
                });
            }
            return rendered;
        }

        // Fallback: render as simple line for any unregistered primitives
        const color = isGhost ? "#00ffff" : "#ffff00";
        const points = prim.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

        return (
            <Line
                key={prim.id}
                points={points}
                color={color}
                lineWidth={3}
                depthTest={false}
                onPointerDown={!isGhost ? (handlePointerDown as any) : undefined}
                onPointerUp={!isGhost ? (handlePointerUp as any) : undefined}
            />
        );
    };

    // Render annotation overlay - delegates to tool registry
    const renderAnnotation = (prim: SketchPrimitive) => {
        const toolDef = toolRegistry.get(prim.type);
        if (toolDef?.renderAnnotation) {
            return toolDef.renderAnnotation(
                prim as any,
                sketchPlane!,
                lockedValues as any,
                (prim.properties as any)?.dimMode
            );
        }
        return null;
    };

    const renderSolverEntity = (entity: any) => {
        const isSelected = selectedIds.has(entity.id);

        // DEBUG: High contrast for testing
        const baseColor = isSelected ? "#ff00ff" : "#ffffff";
        const lineWidth = isSelected ? 10 : 2;
        const opacity = isSelected ? 1.0 : 0.8;

        if (isSelected) {
            console.log(`Rendering selected entity ${entity.id} with color ${baseColor} and width ${lineWidth}`);
        }

        if (entity.type === 'line') {
            const p1 = sketchEntities.get(entity.p1Id);
            const p2 = sketchEntities.get(entity.p2Id);
            if (!p1 || !p2 || p1.type !== 'point' || p2.type !== 'point') return null;
            const points = [to3D(p1.x, p1.y), to3D(p2.x, p2.y)];
            return (
                <Line
                    key={entity.id}
                    points={points}
                    color={baseColor}
                    lineWidth={lineWidth} // Drei Line takes direct number
                    opacity={opacity}
                    transparent
                    depthTest={false}
                    onPointerDown={handlePointerDown as any}
                    onPointerUp={handlePointerUp as any}
                />
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
                <Line
                    key={entity.id}
                    points={circlePoints}
                    color={baseColor}
                    lineWidth={lineWidth}
                    opacity={opacity}
                    transparent
                    depthTest={false}
                    onPointerDown={handlePointerDown as any}
                    onPointerUp={handlePointerUp as any}
                />
            );
        }
        // Points rendering
        if (entity.type === 'point') {
            // ALWAYS render a hit target, even if not selected
            return (
                <group key={entity.id} position={to3D(entity.x, entity.y)}>
                    {/* Visual Dot (Small) */}
                    <mesh visible={true} onPointerDown={handlePointerDown as any} onPointerUp={handlePointerUp as any}>
                        <sphereGeometry args={[0.2, 8, 8]} /> {/* Small visible radius */}
                        <meshBasicMaterial
                            color={isSelected ? "#ff9900" : "#aaddff"}
                            depthTest={false}
                        />
                    </mesh>

                    {/* Invisible Hit Target (Larger) - This ensures easier clicking */}
                    <mesh visible={false} onPointerDown={handlePointerDown as any} onPointerUp={handlePointerUp as any}>
                        <sphereGeometry args={[0.6, 8, 8]} /> {/* Larger click radius */}
                        <meshBasicMaterial color="red" />
                    </mesh>
                </group>
            );
        }
        return null;
    };

    // Grid rotation - Drei Grid defaults to XZ plane (Normal Y)
    // We need to rotate it to match the target Z-up plane
    const gridRotation: [number, number, number] =
        sketchPlane === 'XY' ? [Math.PI / 2, 0, 0] :           // Base XZ (Y+) -> Target XY (Z+). Rotate X 90.
            sketchPlane === 'XZ' ? [0, 0, 0] :                     // Base XZ -> Target XZ. No rotation.
                [0, 0, Math.PI / 2];                               // Base XZ -> Target YZ (X+). Rotate Z 90 (Y->X).

    return (
        <group>
            {/* Sketch Grid - aligned with the active plane */}
            <Grid
                ref={gridRef}
                args={[200, 200]}
                cellSize={gridSnapSize > 0 ? gridSnapSize : 1}
                cellThickness={0.5}
                cellColor="#4a6080"
                sectionSize={gridSnapSize > 0 ? gridSnapSize * 10 : 10}
                sectionThickness={1}
                sectionColor="#5a7090"
                fadeDistance={200}
                rotation={gridRotation}
                position={[0, 0, -0.01]} // Slightly behind drawing plane
            />

            {/* Invisible plane for raycasting */}
            <mesh
                visible={false}
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
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
                                    <coneGeometry args={[0.8, 0, 3]} /> {/* todo:refine Triangle marker uses a hacky cone. */}
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

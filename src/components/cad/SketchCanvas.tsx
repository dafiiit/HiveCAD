import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import { useThree, useFrame, ThreeEvent } from "@react-three/fiber";
import { Html, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, useCADStoreApi, SketchPrimitive, ToolType } from "../../hooks/useCADStore";
import { SnappingEngine, SnapResult } from "../../lib/snapping";
import { toolRegistry } from "../../lib/tools";
import SketchToolDialog from "./SketchToolDialog";
import { DimensionBadge, createAnnotationContext, PointMarker } from "./SketchAnnotations";
import { snapToGrid } from "../../lib/sketch/rendering";
import {
    getHandlePoints, getEntityColor, getEntityDash, getEntityLineWidth,
    getHandleSize, getHandleColor, isConstructionPrimitive,
    type HandlePoint, type SketchEntityState
} from "../../lib/sketch/interaction-types";
import { reflectPrimitive } from "../../lib/tools/core/modify/mirror";

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
        // Sketch interaction state
        hoveredPrimitiveId, draggingHandle, selectedPrimitiveIds,
        setHoveredPrimitive, setDraggingHandle, selectPrimitive,
        clearPrimitiveSelection, updatePrimitivePoint, togglePrimitiveConstruction,
        // View controls
        setCameraControlsDisabled,
    } = useCADStore();

    const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
    const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
    const [showDialog, setShowDialog] = useState(false);
    const [pendingStartPoint, setPendingStartPoint] = useState<[number, number] | null>(null);
    const [dialogParams, setDialogParams] = useState<Record<string, any>>({});

    // Dimension annotations: lightweight local state for sketch dimensions
    interface SketchDimension {
        id: string;
        type: 'length' | 'radius' | 'distance' | 'angle';
        primitiveIds: string[];
        value: number;
        position: [number, number];       // Badge location
        endpoints: [[number, number], [number, number]]; // Reference line endpoints
    }
    const [sketchDimensions, setSketchDimensions] = useState<SketchDimension[]>([]);
    // Pending first selection for two-entity distance dimensions
    const dimensionFirstPrimRef = useRef<string | null>(null);

    const gridRef = useRef<any>(null);

    // Store API ref for direct state mutation (trim, mirror, offset)
    const storeApi = useCADStoreApi();
    const storeApiRef = useRef(storeApi);
    storeApiRef.current = storeApi;

    // Drag detection state
    const dragStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
    const IS_CLICK_THRESHOLD = 5; // Pixels

    // Offset drag state: tracks the 2D origin point for offset dragging
    const offsetDragOriginRef = useRef<[number, number] | null>(null);

    // Zoom-independent sizing: compute a scale factor from camera distance
    const { camera } = useThree();
    const [pixelScale, setPixelScale] = useState(0.02);
    useFrame(() => {
        // For perspective camera: scale by distance to origin
        // For orthographic camera: scale by zoom
        let s: number;
        if ((camera as any).isPerspectiveCamera) {
            s = camera.position.length() * 0.004;
        } else {
            s = 1 / ((camera as any).zoom || 1) * 2;
        }
        // Only update if changed meaningfully to avoid re-renders
        if (Math.abs(s - pixelScale) > pixelScale * 0.05) {
            setPixelScale(s);
        }
    });

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

    // Reset dimension first-prim selection when switching tools
    useEffect(() => {
        dimensionFirstPrimRef.current = null;
    }, [activeTool]);

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
            // 'X' key: toggle construction mode on selected primitives
            if (e.key === 'x' || e.key === 'X') {
                if (selectedPrimitiveIds.size > 0 && !currentDrawingPrimitive) {
                    selectedPrimitiveIds.forEach(id => togglePrimitiveConstruction(id));
                    e.preventDefault();
                }
            }
            // Delete/Backspace: delete selected primitives  
            // (This is handled globally, but we can add sketch-specific behavior here if needed)
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentDrawingPrimitive, updateCurrentDrawingPrimitive, selectedPrimitiveIds, togglePrimitiveConstruction]);

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

            // NEW: If dragging a handle point on a committed primitive, update it in real-time
            if (draggingHandle) {
                let handleP2d = [...p2d] as [number, number];
                // Apply snapping to handle drag
                if (snappingEnabled && snappingEngine) {
                    const snap = snappingEngine.findSnapTarget(handleP2d[0], handleP2d[1]);
                    if (snap) {
                        handleP2d = [snap.x, snap.y];
                        currentSnapResult = snap;
                    }
                }
                if (!currentSnapResult && gridSnapSize > 0) {
                    handleP2d = snapToGrid(handleP2d, gridSnapSize);
                }
                const primId = draggingHandle.id.split(':')[0];
                if (draggingHandle.pointIndex === -1) {
                    // Special: translate all points by delta from handle's current position
                    const dx = handleP2d[0] - draggingHandle.position[0];
                    const dy = handleP2d[1] - draggingHandle.position[1];
                    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
                        // Translate all points
                        const prim = activeSketchPrimitives.find(p => p.id === primId);
                        if (prim) {
                            for (let i = 0; i < prim.points.length; i++) {
                                updatePrimitivePoint(primId, i, [
                                    prim.points[i][0] + dx,
                                    prim.points[i][1] + dy,
                                ]);
                            }
                        }
                        // Update handle position so next frame computes correct delta
                        setDraggingHandle({ ...draggingHandle, position: handleP2d });
                    }
                } else {
                    updatePrimitivePoint(primId, draggingHandle.pointIndex, handleP2d);
                }
                setHoverPoint(handleP2d);
                setSnapResult(currentSnapResult);
                setSnapPoint(currentSnapResult?.snapPoint || null);
                return;
            }

            // Offset drag: translate all selected primitives by delta
            if (offsetDragOriginRef.current && activeTool === 'offset' && selectedPrimitiveIds.size > 0) {
                let handleP2d = [...p2d] as [number, number];
                if (gridSnapSize > 0) {
                    handleP2d = snapToGrid(handleP2d, gridSnapSize);
                }
                const dx = handleP2d[0] - offsetDragOriginRef.current[0];
                const dy = handleP2d[1] - offsetDragOriginRef.current[1];
                if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
                    const storeApi = storeApiRef.current;
                    if (storeApi) {
                        for (const selId of selectedPrimitiveIds) {
                            const prim = storeApi.getState().activeSketchPrimitives.find(p => p.id === selId);
                            if (prim) {
                                for (let i = 0; i < prim.points.length; i++) {
                                    updatePrimitivePoint(selId, i, [
                                        prim.points[i][0] + dx,
                                        prim.points[i][1] + dy,
                                    ]);
                                }
                            }
                        }
                    }
                    offsetDragOriginRef.current = handleP2d;
                }
                setHoverPoint(handleP2d);
                return;
            }

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

            // Hover detection for committed primitives (when not drawing)
            if (!currentDrawingPrimitive && (activeTool === 'select' || activeTool === 'toggleConstruction' || activeTool === 'dimension' || activeTool === 'trim' || activeTool === 'mirror' || activeTool === 'offset')) {
                const hoveredPrim = hitTestPrimitives(finalP2d);
                setHoveredPrimitive(hoveredPrim);
            }

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

    /**
     * Hit-test handle points on committed primitives.
     * Returns the closest HandlePoint if within threshold, else null.
     */
    const hitTestHandles = (p: [number, number]): HandlePoint | null => {
        const threshold = 1.5 * pixelScale;
        let bestHandle: HandlePoint | null = null;
        let bestDist = threshold;

        for (const prim of activeSketchPrimitives) {
            const handles = getHandlePoints(prim);
            for (const h of handles) {
                const dx = h.position[0] - p[0];
                const dy = h.position[1] - p[1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestHandle = h;
                }
            }
        }
        return bestHandle;
    };

    /**
     * Hit-test committed sketch primitives (lines, arcs, circles, etc.)
     * Returns the closest primitive ID if within threshold, else null.
     */
    const hitTestPrimitives = (p: [number, number]): string | null => {
        const threshold = 6.0 * pixelScale;
        let closestId: string | null = null;
        let minDist = threshold;

        for (const prim of activeSketchPrimitives) {
            let distance = Infinity;

            // Check proximity to endpoints first
            for (const pt of prim.points) {
                const dx = pt[0] - p[0];
                const dy = pt[1] - p[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) {
                    minDist = d;
                    closestId = prim.id;
                }
            }

            // Check line segments
            if (['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'].includes(prim.type) && prim.points.length >= 2) {
                const p1 = prim.points[0];
                const p2 = prim.points[prim.points.length - 1];
                distance = pointToSegmentDist(p, p1, p2);
            }

            // Check circles
            if (['circle', 'constructionCircle'].includes(prim.type) && prim.points.length >= 2) {
                const center = prim.points[0];
                const edge = prim.points[1];
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
                const distToCenter = Math.sqrt(Math.pow(center[0] - p[0], 2) + Math.pow(center[1] - p[1], 2));
                distance = Math.abs(distToCenter - radius);
            }

            // Check rectangles
            if (['rectangle', 'roundedRectangle'].includes(prim.type) && prim.points.length >= 2) {
                const p1 = prim.points[0];
                const p2 = prim.points[1];
                const corners: [number, number][] = [p1, [p2[0], p1[1]], p2, [p1[0], p2[1]]];
                for (let i = 0; i < 4; i++) {
                    const d = pointToSegmentDist(p, corners[i], corners[(i + 1) % 4]);
                    distance = Math.min(distance, d);
                }
            }

            if (distance < minDist) {
                minDist = distance;
                closestId = prim.id;
            }
        }

        return closestId;
    };

    /** Point-to-segment distance utility */
    const pointToSegmentDist = (p: [number, number], a: [number, number], b: [number, number]): number => {
        const A = p[0] - a[0];
        const B = p[1] - a[1];
        const C = b[0] - a[0];
        const D = b[1] - a[1];
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = lenSq !== 0 ? dot / lenSq : -1;
        let xx: number, yy: number;
        if (param < 0) { xx = a[0]; yy = a[1]; }
        else if (param > 1) { xx = b[0]; yy = b[1]; }
        else { xx = a[0] + param * C; yy = a[1] + param * D; }
        return Math.sqrt(Math.pow(p[0] - xx, 2) + Math.pow(p[1] - yy, 2));
    };

    /**
     * Apply a dimension annotation to a clicked sketch primitive.
     * - Line types → length dimension
     * - Circle → radius dimension
     * - Arc → radius dimension
     * - Two consecutive clicks on different primitives → distance between midpoints
     */
    const applyDimensionToPrimitive = (prim: SketchPrimitive) => {
        const id = `dim-${prim.id}-${Date.now()}`;

        // Check for two-primitive dimension: if we have a pending first primitive
        if (dimensionFirstPrimRef.current && dimensionFirstPrimRef.current !== prim.id) {
            const lineTypes = ['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'];
            const firstPrim = activeSketchPrimitives.find(p => p.id === dimensionFirstPrimRef.current);

            // Two lines → angle dimension
            if (firstPrim && lineTypes.includes(firstPrim.type) && lineTypes.includes(prim.type)
                && firstPrim.points.length >= 2 && prim.points.length >= 2) {
                const l1p1 = firstPrim.points[0];
                const l1p2 = firstPrim.points[firstPrim.points.length - 1];
                const l2p1 = prim.points[0];
                const l2p2 = prim.points[prim.points.length - 1];
                // Compute angle between the two lines (0..π)
                const d1x = l1p2[0] - l1p1[0], d1y = l1p2[1] - l1p1[1];
                const d2x = l2p2[0] - l2p1[0], d2y = l2p2[1] - l2p1[1];
                const dot = d1x * d2x + d1y * d2y;
                const mag1 = Math.hypot(d1x, d1y);
                const mag2 = Math.hypot(d2x, d2y);
                const cosAngle = mag1 > 1e-10 && mag2 > 1e-10 ? Math.max(-1, Math.min(1, dot / (mag1 * mag2))) : 1;
                const angleRad = Math.acos(cosAngle);
                const angleDeg = angleRad * (180 / Math.PI);
                // Badge position: midpoint of the two lines' midpoints, offset up
                const mid1 = getMidpoint(firstPrim);
                const mid2 = getMidpoint(prim);
                const badgePos: [number, number] = [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2 + 4 * pixelScale];
                setSketchDimensions(prev => [...prev, {
                    id,
                    type: 'angle',
                    primitiveIds: [dimensionFirstPrimRef.current!, prim.id],
                    value: angleDeg,
                    position: badgePos,
                    endpoints: [mid1, mid2],
                }]);
                dimensionFirstPrimRef.current = null;
                clearPrimitiveSelection();
                return;
            }

            // Otherwise → distance between midpoints
            const isOriginFirst = dimensionFirstPrimRef.current === '__origin__';
            const mid1: [number, number] = isOriginFirst ? [0, 0] : (() => {
                return firstPrim ? getMidpoint(firstPrim) : [0, 0] as [number, number];
            })();
            const mid2 = getMidpoint(prim);

            if (mid1 && mid2) {
                const dist = Math.sqrt(Math.pow(mid2[0] - mid1[0], 2) + Math.pow(mid2[1] - mid1[1], 2));
                const badgePos: [number, number] = [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2 + 2 * pixelScale];
                setSketchDimensions(prev => [...prev, {
                    id,
                    type: 'distance',
                    primitiveIds: [dimensionFirstPrimRef.current!, prim.id],
                    value: dist,
                    position: badgePos,
                    endpoints: [mid1, mid2],
                }]);
            }
            dimensionFirstPrimRef.current = null;
            clearPrimitiveSelection();
            return;
        }

        // Single-entity dimension
        const lineTypes = ['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'];
        const arcTypes = ['threePointsArc', 'centerPointArc'];

        if (lineTypes.includes(prim.type) && prim.points.length >= 2) {
            // Line → length
            const p1 = prim.points[0];
            const p2 = prim.points[prim.points.length - 1];
            const length = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
            const mx = (p1[0] + p2[0]) / 2;
            const my = (p1[1] + p2[1]) / 2;
            // Offset badge perpendicular to the line
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const offsetDist = 8 * pixelScale;
            const badgePos: [number, number] = [mx - (dy / len) * offsetDist, my + (dx / len) * offsetDist];
            setSketchDimensions(prev => [...prev, {
                id,
                type: 'length',
                primitiveIds: [prim.id],
                value: length,
                position: badgePos,
                endpoints: [p1, p2],
            }]);
            // Store this line as potential first-click for angle dimension
            // If user clicks another line next, we'll create an angle dimension
            dimensionFirstPrimRef.current = prim.id;
        } else if (prim.type === 'circle' && prim.points.length >= 2) {
            // Circle → radius
            const center = prim.points[0];
            const edge = prim.points[1];
            const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
            const badgePos: [number, number] = [(center[0] + edge[0]) / 2, (center[1] + edge[1]) / 2 + 4 * pixelScale];
            setSketchDimensions(prev => [...prev, {
                id,
                type: 'radius',
                primitiveIds: [prim.id],
                value: radius,
                position: badgePos,
                endpoints: [center, edge],
            }]);
            dimensionFirstPrimRef.current = null;
        } else if (arcTypes.includes(prim.type) && prim.points.length >= 3) {
            // Arc → radius via circumcenter
            const pts = prim.points;
            const ax = pts[0][0], ay = pts[0][1];
            const bx = pts[1][0], by = pts[1][1];
            const cx = pts[2][0], cy = pts[2][1];
            const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
            if (Math.abs(d) > 1e-10) {
                const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
                const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
                const radius = Math.sqrt(Math.pow(ax - ux, 2) + Math.pow(ay - uy, 2));
                const badgePos: [number, number] = [(ux + ax) / 2, (uy + ay) / 2 + 4 * pixelScale];
                setSketchDimensions(prev => [...prev, {
                    id,
                    type: 'radius',
                    primitiveIds: [prim.id],
                    value: radius,
                    position: badgePos,
                    endpoints: [[ux, uy], pts[0]],
                }]);
            }
            dimensionFirstPrimRef.current = null;
        } else if (prim.type === 'rectangle' && prim.points.length >= 2) {
            // Rectangle → width and height
            const p1 = prim.points[0];
            const p2 = prim.points[1];
            const width = Math.abs(p2[0] - p1[0]);
            const height = Math.abs(p2[1] - p1[1]);
            const offset = 5 * pixelScale;
            // Width dimension (bottom)
            setSketchDimensions(prev => [...prev,
                {
                    id: `${id}-w`,
                    type: 'length',
                    primitiveIds: [prim.id],
                    value: width,
                    position: [(p1[0] + p2[0]) / 2, Math.min(p1[1], p2[1]) - offset],
                    endpoints: [[p1[0], Math.min(p1[1], p2[1])], [p2[0], Math.min(p1[1], p2[1])]],
                },
                {
                    id: `${id}-h`,
                    type: 'length',
                    primitiveIds: [prim.id],
                    value: height,
                    position: [Math.max(p1[0], p2[0]) + offset, (p1[1] + p2[1]) / 2],
                    endpoints: [[Math.max(p1[0], p2[0]), p1[1]], [Math.max(p1[0], p2[0]), p2[1]]],
                },
            ]);
            dimensionFirstPrimRef.current = null;
        } else {
            // Unknown single entity: set as first primitive for distance
            dimensionFirstPrimRef.current = prim.id;
        }
    };

    /** Get the midpoint of a primitive (for distance dimensions). */
    const getMidpoint = (prim: SketchPrimitive): [number, number] => {
        if (prim.points.length === 0) return [0, 0];
        if (prim.points.length === 1) return prim.points[0];
        // For lines: midpoint of first and last
        const p1 = prim.points[0];
        const p2 = prim.points[prim.points.length - 1];
        return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    };

    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        // Record potential start of interaction
        if (e.button === 0) {
            dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                time: Date.now()
            };

            // Check if we're clicking a handle to start dragging
            if (hoverPoint && activeTool === 'select' && !currentDrawingPrimitive) {
                const handleHit = hitTestHandles(hoverPoint);
                if (handleHit) {
                    setDraggingHandle(handleHit);
                    setCameraControlsDisabled(true);
                    e.stopPropagation();
                }
            }

            // Offset tool: start drag on a selected primitive
            if (hoverPoint && activeTool === 'offset' && !currentDrawingPrimitive && selectedPrimitiveIds.size > 0) {
                const primHit = hitTestPrimitives(hoverPoint);
                if (primHit && selectedPrimitiveIds.has(primHit)) {
                    offsetDragOriginRef.current = hoverPoint;
                    setCameraControlsDisabled(true);
                    e.stopPropagation();
                }
            }
        }
    };

    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0 || !hoverPoint || showDialog) return;

        // Finalize handle drag
        if (draggingHandle) {
            setDraggingHandle(null);
            setCameraControlsDisabled(false);
            return;
        }

        // Finalize offset drag
        if (offsetDragOriginRef.current) {
            offsetDragOriginRef.current = null;
            setCameraControlsDisabled(false);
            return;
        }

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

        // NEW: Check handle hit first (for starting handle drags)
        const handleHit = hitTestHandles(p2d);
        if (handleHit && (activeTool === 'select')) {
            // Select the parent primitive, don't start drag on a click (drag starts on pointerDown+move)
            const primId = handleHit.id.split(':')[0];
            selectPrimitive(primId, e.ctrlKey || e.metaKey || e.shiftKey);
            return;
        }

        // NEW: Check primitive hit for selection
        const primHit = hitTestPrimitives(p2d);

        // Toggle construction mode when using the toggleConstruction tool
        if (primHit && activeTool === 'toggleConstruction') {
            togglePrimitiveConstruction(primHit);
            return;
        }

        // Trim tool: remove the clicked primitive from the sketch
        if (primHit && activeTool === 'trim') {
            // Remove the primitive by filtering it out
            const storeApi = storeApiRef.current;
            if (storeApi) {
                const state = storeApi.getState();
                const filtered = state.activeSketchPrimitives.filter(p => p.id !== primHit);
                storeApi.setState({ activeSketchPrimitives: filtered });
            }
            setHoveredPrimitive(null);
            return;
        }

        // Mirror tool: select entities first, then on second click select the axis line
        if (primHit && activeTool === 'mirror') {
            const prim = activeSketchPrimitives.find(p => p.id === primHit);
            if (prim) {
                // If we already have selected primitives, this click selects the mirror axis
                if (selectedPrimitiveIds.size > 0 && !selectedPrimitiveIds.has(primHit)) {
                    // This primitive is the mirror axis — apply mirror
                    const axisPrim = prim;
                    if (axisPrim.points.length >= 2) {
                        const lineP1 = axisPrim.points[0];
                        const lineP2 = axisPrim.points[axisPrim.points.length - 1];
                        const storeApi = storeApiRef.current;
                        if (storeApi) {
                            const state = storeApi.getState();
                            const newPrimitives: SketchPrimitive[] = [];
                            for (const selId of selectedPrimitiveIds) {
                                const selPrim = state.activeSketchPrimitives.find(p => p.id === selId);
                                if (selPrim) {
                                    const mirroredPoints = reflectPrimitive(selPrim.points, lineP1, lineP2);
                                    newPrimitives.push({
                                        ...selPrim,
                                        id: Math.random().toString(36).slice(2),
                                        points: mirroredPoints,
                                        properties: { ...selPrim.properties },
                                    });
                                }
                            }
                            storeApi.setState({
                                activeSketchPrimitives: [...state.activeSketchPrimitives, ...newPrimitives],
                            });
                        }
                        clearPrimitiveSelection();
                    }
                } else {
                    // Select this primitive for mirroring
                    selectPrimitive(primHit, true);
                }
            }
            return;
        }

        if (primHit && (activeTool === 'select' || activeTool === 'dimension' || activeTool === 'offset')) {
            const multiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
            selectPrimitive(primHit, multiSelect);

            // Dimension tool: apply dimension directly on sketch primitives
            if (activeTool === 'dimension') {
                const prim = activeSketchPrimitives.find(p => p.id === primHit);
                if (prim) {
                    applyDimensionToPrimitive(prim);
                }
            }
            return;
        }

        // IMPROVED: Hit test for all entity types (solver entities)
        const hitId = hitTest(p2d);
        if (hitId && (activeTool === 'select' || activeTool === 'dimension' || selectedIds.has(hitId))) {
            const multiSelect = e.ctrlKey || e.metaKey || e.shiftKey || activeTool === 'dimension';
            selectObject(hitId, multiSelect);
            return;
        }

        if (!hitId && (activeTool === 'select' || activeTool === 'dimension')) {
            if (activeTool === 'select' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                clearSelection();
                clearPrimitiveSelection();
            }
            return;
        }

        // Tools that don't create primitives should return early on empty click
        const nonDrawingTools = ['trim', 'offset', 'mirror', 'toggleConstruction', 'dimension'];
        if (!primHit && nonDrawingTools.includes(activeTool as string)) {
            // For offset tool, clear selection on background click (like 3D view)
            if (activeTool === 'offset') {
                clearPrimitiveSelection();
                offsetDragOriginRef.current = null;
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

        // Line types - always require two clicks (start + end), then finish
        if (['line', 'constructionLine'].includes(type)) {
            const finalPoints = [currentDrawingPrimitive.points[0], p2d];
            addSketchPrimitive({
                ...currentDrawingPrimitive,
                points: finalPoints
            });

            // Always clear after finishing — user must click twice for each line
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

    /**
     * Determine the visual state of a committed sketch primitive.
     */
    const getPrimitiveState = (prim: SketchPrimitive): SketchEntityState => {
        if (isConstructionPrimitive(prim)) return 'construction';
        if (selectedPrimitiveIds.has(prim.id)) return 'selected';
        if (hoveredPrimitiveId === prim.id) return 'hovered';
        // TODO: check fully constrained
        return 'default';
    };

    // Rendering helper — delegates to tool registry, applies state-based coloring
    const renderPrimitive = (prim: SketchPrimitive, isGhost: boolean = false) => {
        const state: SketchEntityState = isGhost ? 'drawing' : getPrimitiveState(prim);
        const color = getEntityColor(state);
        const lineWidth = getEntityLineWidth(state);
        const isConst = isConstructionPrimitive(prim);
        const dash = getEntityDash(state, isConst);

        const toolDef = toolRegistry.get(prim.type);

        // For construction primitives, use fallback renderer to get proper dashed lines
        // because tool renderers use lineBasicMaterial which doesn't support dashing
        const useToolRenderer = toolDef?.renderPreview && !isConst;

        // Use tool registry renderer if available
        if (useToolRenderer) {
            const rendered = toolDef.renderPreview(prim as any, to3D, isGhost);
            if (!isGhost && rendered) {
                // Clone the rendered element and apply our state-based styling + handlers
                // IMPORTANT: Do NOT override `key` — the renderer includes point data
                // in the key to force geometry remount when points change during drag.
                const styledElement = React.cloneElement(rendered as React.ReactElement, {
                    // Try to override color if it's a line/mesh material
                    children: React.Children.map(
                        (rendered as React.ReactElement).props.children,
                        (child: any) => {
                            if (!child) return child;
                            // If it's a material, override color
                            if (child.type === 'lineBasicMaterial' || child.type === 'meshBasicMaterial') {
                                return React.cloneElement(child, {
                                    color,
                                    linewidth: lineWidth,
                                });
                            }
                            // If it's a lineDashedMaterial, apply dash
                            if (child.type === 'lineDashedMaterial' && dash) {
                                return React.cloneElement(child, {
                                    color,
                                    dashSize: dash[0],
                                    gapSize: dash[1],
                                });
                            }
                            return child;
                        }
                    ),
                    onPointerDown: handlePointerDown as any,
                    onPointerUp: handlePointerUp as any,
                });
                return styledElement;
            }
            return rendered;
        }

        // Fallback: render as simple line for any unregistered primitives
        const points3D = prim.points.map(p => to3D(p[0], p[1]));
        if (points3D.length < 2) return null;

        return (
            <Line
                key={prim.id}
                points={points3D}
                color={color}
                lineWidth={lineWidth}
                depthTest={false}
                dashed={!!dash}
                dashSize={dash?.[0]}
                gapSize={dash?.[1]}
                onPointerDown={!isGhost ? (handlePointerDown as any) : undefined}
                onPointerUp={!isGhost ? (handlePointerUp as any) : undefined}
            />
        );
    };

    /**
     * Render handle dots on a committed sketch primitive's endpoints/control points.
     */
    const renderHandles = (prim: SketchPrimitive) => {
        const handles = getHandlePoints(prim);
        return handles.map(h => {
            const isDrag = draggingHandle?.id === h.id;
            const isHover = false; // TODO: per-handle hover
            const size = getHandleSize(h.type) * pixelScale;
            const handleColor = getHandleColor(h.type, isDrag, isHover);

            return (
                <group key={h.id} position={to3D(h.position[0], h.position[1])}>
                    {/* Visible dot */}
                    <mesh>
                        <sphereGeometry args={[size, 16, 16]} />
                        <meshBasicMaterial color={handleColor} depthTest={false} transparent opacity={0.9} />
                    </mesh>
                    {/* Invisible larger hit target */}
                    <mesh visible={false}
                        onPointerDown={handlePointerDown as any}
                        onPointerUp={handlePointerUp as any}
                    >
                        <sphereGeometry args={[size * 2.5, 8, 8]} />
                        <meshBasicMaterial color="red" />
                    </mesh>
                </group>
            );
        });
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
                    {/* Visual Dot */}
                    <mesh visible={true} onPointerDown={handlePointerDown as any} onPointerUp={handlePointerUp as any}>
                        <sphereGeometry args={[0.6 * pixelScale, 12, 12]} />
                        <meshBasicMaterial
                            color={isSelected ? "#ff9900" : "#aaddff"}
                            depthTest={false}
                        />
                    </mesh>

                    {/* Invisible Hit Target (Larger) */}
                    <mesh visible={false} onPointerDown={handlePointerDown as any} onPointerUp={handlePointerUp as any}>
                        <sphereGeometry args={[2.0 * pixelScale, 8, 8]} />
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

            {/* Clickable 2D Axes and Origin Point */}
            {(() => {
                const axisLength = 100;
                const axisWidth = 1.5;
                const originSize = 1.2 * pixelScale;
                const hitSize = 3.0 * pixelScale;
                const isOriginSelected = selectedPrimitiveIds.has('__origin__');
                const isXAxisSelected = selectedPrimitiveIds.has('__xaxis__');
                const isYAxisSelected = selectedPrimitiveIds.has('__yaxis__');

                const handleAxisClick = (axisId: string) => (e: any) => {
                    e.stopPropagation();
                    if (activeTool === 'dimension') {
                        // Create a synthetic line primitive for the axis to dimension against
                        const axisPrim: SketchPrimitive = {
                            id: axisId,
                            type: 'line' as any,
                            points: axisId === '__xaxis__'
                                ? [[-axisLength, 0], [axisLength, 0]]
                                : [[0, -axisLength], [0, axisLength]],
                        };
                        selectPrimitive(axisId, false);
                        applyDimensionToPrimitive(axisPrim);
                    } else if (activeTool === 'select') {
                        selectPrimitive(axisId, e.ctrlKey || e.metaKey || e.shiftKey);
                    }
                };

                const handleOriginClick = (e: any) => {
                    e.stopPropagation();
                    if (activeTool === 'dimension') {
                        // Origin as a point for distance measurement
                        const originPrim: SketchPrimitive = {
                            id: '__origin__',
                            type: 'line' as any,
                            points: [[0, 0]],
                        };
                        selectPrimitive('__origin__', false);
                        // For the dimension tool, set as first prim for distance
                        dimensionFirstPrimRef.current = '__origin__';
                    } else if (activeTool === 'select') {
                        selectPrimitive('__origin__', e.ctrlKey || e.metaKey || e.shiftKey);
                    }
                };

                return (
                    <>
                        {/* X Axis (horizontal) - Red */}
                        <Line
                            points={[to3D(-axisLength, 0), to3D(axisLength, 0)]}
                            color={isXAxisSelected ? '#FF6666' : '#CC3333'}
                            lineWidth={isXAxisSelected ? 3 : axisWidth}
                            depthTest={false}
                            transparent
                            opacity={0.7}
                        />
                        {/* X Axis hit target */}
                        <mesh
                            visible={false}
                            onPointerDown={handleAxisClick('__xaxis__')}
                            rotation={planeRotation}
                            position={to3D(0, 0).toArray() as [number, number, number]}
                        >
                            <planeGeometry args={[axisLength * 2, hitSize * 2]} />
                            <meshBasicMaterial />
                        </mesh>

                        {/* Y Axis (vertical) - Green */}
                        <Line
                            points={[to3D(0, -axisLength), to3D(0, axisLength)]}
                            color={isYAxisSelected ? '#66FF66' : '#33CC33'}
                            lineWidth={isYAxisSelected ? 3 : axisWidth}
                            depthTest={false}
                            transparent
                            opacity={0.7}
                        />
                        {/* Y Axis hit target */}
                        <mesh
                            visible={false}
                            onPointerDown={handleAxisClick('__yaxis__')}
                            rotation={planeRotation}
                            position={to3D(0, 0).toArray() as [number, number, number]}
                        >
                            <planeGeometry args={[hitSize * 2, axisLength * 2]} />
                            <meshBasicMaterial />
                        </mesh>

                        {/* Origin Point */}
                        <group position={to3D(0, 0)}>
                            {/* Visual origin marker */}
                            <mesh onPointerDown={handleOriginClick}>
                                <sphereGeometry args={[originSize, 16, 16]} />
                                <meshBasicMaterial
                                    color={isOriginSelected ? '#FFFF00' : '#FFFFFF'}
                                    depthTest={false}
                                />
                            </mesh>
                            {/* Outer ring for visual accent */}
                            <mesh>
                                <ringGeometry args={[originSize * 1.2, originSize * 1.6, 32]} />
                                <meshBasicMaterial
                                    color={isOriginSelected ? '#FFFF00' : '#888888'}
                                    depthTest={false}
                                    side={THREE.DoubleSide}
                                    transparent
                                    opacity={0.5}
                                />
                            </mesh>
                            {/* Invisible hit target */}
                            <mesh visible={false} onPointerDown={handleOriginClick}>
                                <sphereGeometry args={[hitSize, 8, 8]} />
                                <meshBasicMaterial />
                            </mesh>
                        </group>
                    </>
                );
            })()}

            {/* Render Solver Entities */}
            {Array.from(sketchEntities.values()).map(entity => renderSolverEntity(entity))}

            {/* Render Active Primitives with state-based coloring */}
            {activeSketchPrimitives.map(prim => renderPrimitive(prim, false))}

            {/* Render Handle Points on committed primitives */}
            {activeSketchPrimitives.map(prim => (
                <React.Fragment key={`handles-${prim.id}`}>
                    {renderHandles(prim)}
                </React.Fragment>
            ))}

            {/* Render Current Drawing Primitive */}
            {currentDrawingPrimitive && renderPrimitive(currentDrawingPrimitive, true)}

            {/* Drawing Annotations - delegates to tool registry */}
            {currentDrawingPrimitive && currentDrawingPrimitive.points.length >= 2 && renderAnnotation(currentDrawingPrimitive)}

            {/* Hover Cursor */}
            {hoverPoint && !showDialog && (
                <group position={to3D(hoverPoint[0], hoverPoint[1])}>
                    {/* Default Cursor Ring */}
                    <mesh visible={!snapResult}>
                        <ringGeometry args={[0.5 * pixelScale, 0.7 * pixelScale, 32]} />
                        <meshBasicMaterial color="#00ffff" depthTest={false} side={THREE.DoubleSide} />
                    </mesh>

                    {/* Snap Markers */}
                    {snapResult && (
                        <>
                            {/* Endpoint snap: round dot */}
                            {snapResult.snapPoint.type === 'endpoint' && (
                                <mesh>
                                    <sphereGeometry args={[0.5 * pixelScale, 32, 32]} />
                                    <meshBasicMaterial color="#00ff00" depthTest={false} />
                                </mesh>
                            )}
                            {/* Midpoint snap: triangle marker */}
                            {snapResult.snapPoint.type === 'midpoint' && (
                                <mesh rotation={[0, 0, Math.PI / 6]}>
                                    <coneGeometry args={[0.8 * pixelScale, 0, 3]} />
                                    <meshBasicMaterial color="#00ff00" depthTest={false} />
                                </mesh>
                            )}
                            {/* Center snap: diamond */}
                            {snapResult.snapPoint.type === 'center' && (
                                <mesh rotation={[0, 0, Math.PI / 4]}>
                                    <boxGeometry args={[0.8 * pixelScale, 0.8 * pixelScale, 0.8 * pixelScale]} />
                                    <meshBasicMaterial color="#00ff00" depthTest={false} />
                                </mesh>
                            )}
                            {/* Grid / H / V snap: small ring */}
                            {(snapResult.snapPoint.type === 'grid') && (
                                <mesh>
                                    <ringGeometry args={[0.3 * pixelScale, 0.5 * pixelScale, 32]} />
                                    <meshBasicMaterial color="#ffffff" depthTest={false} side={THREE.DoubleSide} />
                                </mesh>
                            )}
                            {/* Horizontal/Vertical: small round dot at snap position */}
                            {(snapResult.snapPoint.type === 'horizontal' || snapResult.snapPoint.type === 'vertical') && (
                                <mesh>
                                    <sphereGeometry args={[0.3 * pixelScale, 16, 16]} />
                                    <meshBasicMaterial color="#66B2FF" depthTest={false} />
                                </mesh>
                            )}
                            {/* Intersection of H/V guides: cross marker */}
                            {snapResult.snapPoint.type === 'intersection' && (
                                <mesh rotation={[0, 0, Math.PI / 4]}>
                                    <boxGeometry args={[0.6 * pixelScale, 0.6 * pixelScale, 0.6 * pixelScale]} />
                                    <meshBasicMaterial color="#FFD700" depthTest={false} />
                                </mesh>
                            )}
                        </>
                    )}
                </group>
            )}

            {/* Guide Lines from Snap Result — dashed lines from cursor to snap source */}
            {snapResult?.guideLines?.map((guide, i) => {
                const guideColor = guide.type === 'horizontal' ? '#FF6666' : guide.type === 'vertical' ? '#66FF66' : '#AAAAAA';
                return (
                    <Line
                        key={`guide-${i}`}
                        points={[to3D(guide.from.x, guide.from.y), to3D(guide.to.x, guide.to.y)]}
                        color={guideColor}
                        lineWidth={1}
                        dashed
                        dashSize={0.5}
                        gapSize={0.3}
                        depthTest={false}
                    />
                );
            })}

            {/* Dimension Annotations (solver constraints) */}
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

            {/* Sketch Primitive Dimension Annotations */}
            {annotationCtx && sketchDimensions.map(dim => (
                <React.Fragment key={dim.id}>
                    {/* Reference line between endpoints */}
                    <Line
                        points={[to3D(dim.endpoints[0][0], dim.endpoints[0][1]), to3D(dim.endpoints[1][0], dim.endpoints[1][1])]}
                        color="#00e5ff"
                        lineWidth={1}
                        dashed
                        dashSize={0.5 * pixelScale * 10}
                        gapSize={0.3 * pixelScale * 10}
                        depthTest={false}
                    />
                    {/* Arrowhead dots at endpoints */}
                    <mesh position={to3D(dim.endpoints[0][0], dim.endpoints[0][1])}>
                        <sphereGeometry args={[0.3 * pixelScale, 8, 8]} />
                        <meshBasicMaterial color="#00e5ff" depthTest={false} />
                    </mesh>
                    <mesh position={to3D(dim.endpoints[1][0], dim.endpoints[1][1])}>
                        <sphereGeometry args={[0.3 * pixelScale, 8, 8]} />
                        <meshBasicMaterial color="#00e5ff" depthTest={false} />
                    </mesh>
                    {/* Dimension badge */}
                    <DimensionBadge
                        position={{ x: dim.position[0], y: dim.position[1] }}
                        value={dim.type === 'angle' ? Number(dim.value.toFixed(1)) : dim.value}
                        unit={dim.type === 'radius' ? 'R' : dim.type === 'angle' ? '°' : 'mm'}
                        ctx={annotationCtx}
                    />
                </React.Fragment>
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

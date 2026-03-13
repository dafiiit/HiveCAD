
import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import { toast } from 'sonner';
import { useThree, useFrame, ThreeEvent } from "@react-three/fiber";
import { Html, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, useCADStoreApi, SketchPrimitive, ToolType } from "../../hooks/useCADStore";
import { SnappingEngine, SnapResult } from "../../lib/snapping";
import { toolRegistry } from "../../lib/tools";
import SketchToolDialog from "./SketchToolDialog";
import { DimensionBadge, createAnnotationContext, PointMarker } from "./SketchAnnotations";
import { IconResolver } from "../ui/IconResolver";
import { snapToGrid } from "../../lib/sketch/rendering";
import {
    buildPrimitiveCoincidentConstraintId,
} from "../../lib/sketch/primitiveConstraints";
import {
    getHandlePoints, getEntityColor, getEntityDash, getEntityLineWidth,
    getHandleSize, getHandleColor, isConstructionPrimitive,
    type HandlePoint, type SketchEntityState
} from "../../lib/sketch/interaction-types";
import { reflectPrimitive } from "../../lib/tools/core/modify/mirror";
import { useSketchHitTest } from "./useSketchHitTest";
import { useSketchConstraintOverlay } from "./useSketchConstraintOverlay";
import { useSketchDimensions } from "./useSketchDimensions";

type ConstraintOverlayTarget = {
    kind: 'handle' | 'primitive';
    id: string;
    anchorPoint?: [number, number];
};
const DIALOG_REQUIRED_TOOLS: ToolType[] = toolRegistry.getDialogTools().map(t => t.metadata.id as ToolType);
const SHAPE_TOOLS: ToolType[] = toolRegistry.getAll()
    .filter(t => t.createShape !== undefined)
    .map(t => t.metadata.id as ToolType);
const MULTI_POINT_TOOLS: ToolType[] = toolRegistry.getAll()
    .filter(t => t.metadata.category === 'sketch' && !SHAPE_TOOLS.includes(t.metadata.id as ToolType))
    .map(t => t.metadata.id as ToolType);

export const useSketchCanvas = () => {
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
        addSolverPoint, addSolverLine, addSolverConstraint,
        // Constraint interaction state
        activeConstraintType, constraintSelectionIds, constraintSelectionPrompt,
        addEntityToConstraintSelection, cancelConstraintMode, autoApplyCoincident,
        applyConstraintToSelection,
        // Snapping state and actions
        activeSnapPoint, snappingEnabled, snappingEngine,
        setSnapPoint, setSnappingEngine,
        // New sketch features
        chainMode, gridSnapSize,
        // Sketch interaction state
        hoveredPrimitiveId, draggingHandle, selectedPrimitiveIds, selectedHandleIds,
        setHoveredPrimitive, setDraggingHandle, selectPrimitive, selectHandle,
        clearPrimitiveSelection, clearHandleSelection, updatePrimitivePoint, togglePrimitiveConstruction,
        addPrimitiveCoincident, setPrimitivePointOnLine,
        // Coincident constraints
        primitiveCoincidents,
        removeSolverConstraint,
        // View controls
        setCameraControlsDisabled,
    } = useCADStore();
    const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);

    const [snapResult, setSnapResult] = useState<SnapResult | null>(null);

    const [showDialog, setShowDialog] = useState(false);

    const [pendingStartPoint, setPendingStartPoint] = useState<[number, number] | null>(null);

    const [dialogParams, setDialogParams] = useState<Record<string, any>>({});
    const gridRef = useRef<any>(null);

    const storeApi = useCADStoreApi();

    const storeApiRef = useRef(storeApi);

    storeApiRef.current = storeApi;

    const dragStartRef = useRef<{ x: number, y: number, time: number } | null>(null);

    const IS_CLICK_THRESHOLD = 5;

    const handlePressedRef = useRef<HandlePoint | null>(null);

    const offsetDragOriginRef = useRef<[number, number] | null>(null);

    const hoverPointRef = useRef<[number, number] | null>(null);

    const snapResultRef = useRef<SnapResult | null>(null);

    const { camera } = useThree();

    const [pixelScale, setPixelScale] = useState(0.02);

    const { 
        pointToSegmentDist, hitTestPrimitives, hitTestHandles, hitTest 
    } = useSketchHitTest({ pixelScale, activeSketchPrimitives, sketchEntities });

    const { 
        constraintOverlayTarget, setConstraintOverlayTarget,
        selectedConstraintOverlayId, setSelectedConstraintOverlayId,
        clearConstraintOverlay, setConstraintOverlayForHandle, setConstraintOverlayForPrimitive,
        constraintOverlay, overlayConstraintItems, parseEndpointHandleId
    } = useSketchConstraintOverlay({ activeSketchPrimitives, sketchConstraints });

    const {
        dimFocusedField, setDimFocusedField,
        sketchDimensions, dimensionFirstPrimRef,
        applyDimensionToPrimitive, handleDimLengthChange, handleDimAngleChange,
        handleDimFocusChange, handleDimEnter
    } = useSketchDimensions({
        pixelScale, activeSketchPrimitives, storeApiRef, clearPrimitiveSelection,
        setSketchInputLock, clearSketchInputLocks, addSketchPrimitive, updateCurrentDrawingPrimitive
    });

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

    useEffect(() => {
        if (!snappingEngine) {
            const engine = new SnappingEngine();
            setSnappingEngine(engine);
        }
    }, [snappingEngine, setSnappingEngine]);

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
    }, [sketchPlane]);

    useEffect(() => {
        if (snappingEngine) {
            snappingEngine.setEntities(activeSketchPrimitives);
        }
    }, [snappingEngine, activeSketchPrimitives]);

    useEffect(() => {
        dimensionFirstPrimRef.current = null;
    }, [activeTool]);

    useEffect(() => {
        console.log("Selection State Changed:", Array.from(selectedIds));
    }, [selectedIds]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape: cancel constraint mode, then cancel current drawing
            if (e.key === 'Escape') {
                if (activeConstraintType) {
                    cancelConstraintMode();
                    e.preventDefault();
                    return;
                }
                if (selectedConstraintOverlayId) {
                    setSelectedConstraintOverlayId(null);
                    e.preventDefault();
                    return;
                }
                if (currentDrawingPrimitive) {
                    updateCurrentDrawingPrimitive(null);
                    clearSketchInputLocks();
                    setDimFocusedField('length');
                    e.preventDefault();
                }
            }
            if (e.key === 'Enter' && selectedConstraintOverlayId && !currentDrawingPrimitive) {
                removeSolverConstraint(selectedConstraintOverlayId);
                setSelectedConstraintOverlayId(null);
                e.preventDefault();
                return;
            }
            // 'X' key: toggle construction mode on selected primitives
            if (e.key === 'x' || e.key === 'X') {
                if (selectedPrimitiveIds.size > 0 && !currentDrawingPrimitive) {
                    selectedPrimitiveIds.forEach(id => togglePrimitiveConstruction(id));
                    e.preventDefault();
                }
            }
            // Tab key: switch between dimension input fields during line drawing
            if (e.key === 'Tab' && currentDrawingPrimitive && currentDrawingPrimitive.type === 'line') {
                e.preventDefault();
                setDimFocusedField(prev => prev === 'length' ? 'angle' : 'length');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentDrawingPrimitive, updateCurrentDrawingPrimitive, selectedPrimitiveIds, togglePrimitiveConstruction, activeConstraintType, cancelConstraintMode, clearSketchInputLocks, selectedConstraintOverlayId, removeSolverConstraint]);

    useEffect(() => {
        if (currentDrawingPrimitive && currentDrawingPrimitive.points.length >= 2) {
            setDimFocusedField('length');
        } else if (!currentDrawingPrimitive) {
            setDimFocusedField(null);
        }
    }, [currentDrawingPrimitive?.id]);

    const annotationCtx = useMemo(() => sketchPlane ? createAnnotationContext(sketchPlane) : null, [sketchPlane]);
    useEffect(() => {
        if (!selectedConstraintOverlayId) return;
        if (!overlayConstraintItems.some(constraint => constraint.id === selectedConstraintOverlayId)) {
            setSelectedConstraintOverlayId(null);
        }
    }, [overlayConstraintItems, selectedConstraintOverlayId]);
    // Early return logic moved to SketchCanvas.tsx to prevent hook rule violations.

    const planeRotation: [number, number, number] =
        sketchPlane === 'XY' ? [0, 0, 0] :                         // Z=0 horizontal (ground) - no rotation
            sketchPlane === 'XZ' ? [Math.PI / 2, 0, 0] :           // Y=0 vertical (front) - rotate around X
                [0, Math.PI / 2, 0];

    const to2D = (p: THREE.Vector3): [number, number] => {
        if (sketchPlane === 'XY') return [p.x, p.y];  // Top view: X is horizontal, Y is vertical
        if (sketchPlane === 'XZ') return [p.x, p.z];  // Front view: X is horizontal, Z is vertical
        return [p.y, p.z];                             // Right view: Y is horizontal, Z is vertical
    };

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

            // Check if we should start dragging a pressed handle
            if (handlePressedRef.current && !draggingHandle && dragStartRef.current) {
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > IS_CLICK_THRESHOLD) {
                    // Movement detected - start dragging
                    setDraggingHandle(handlePressedRef.current);
                    setCameraControlsDisabled(true);
                    handlePressedRef.current = null;
                }
            }

            // NEW: If dragging a handle point on a committed primitive, update it in real-time
            if (draggingHandle) {
                let handleP2d = [...p2d] as [number, number];
                // Apply snapping to handle drag
                if (snappingEnabled && snappingEngine) {
                    const snap = snappingEngine.findSnapTarget(
                        handleP2d[0],
                        handleP2d[1],
                        draggingHandle.id.split(':')[0],
                    );
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
                        // Translate all points, then propagate coincident constraints
                        const prim = activeSketchPrimitives.find(p => p.id === primId);
                        if (prim) {
                            // Compute all new positions from the captured snapshot first
                            const newPointPositions: [number, number][] = prim.points.map(
                                pt => [pt[0] + dx, pt[1] + dy]
                            );
                            // Apply via updatePrimitivePoint — each call propagates its coincidents
                            for (let i = 0; i < newPointPositions.length; i++) {
                                updatePrimitivePoint(primId, i, newPointPositions[i]);
                            }
                        }
                        // Update handle position so next frame computes correct delta
                        setDraggingHandle({ ...draggingHandle, position: handleP2d });
                    }
                } else {
                    updatePrimitivePoint(primId, draggingHandle.pointIndex, handleP2d);
                }
                setHoverPoint(handleP2d);
                snapResultRef.current = currentSnapResult;
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
                        // Snapshot all target points BEFORE any updates to avoid double-
                        // translation when coincident partners are also in the selection.
                        type PointUpdate = { id: string; idx: number; pt: [number, number] };
                        const batchUpdates: PointUpdate[] = [];
                        const currentPrims = storeApi.getState().activeSketchPrimitives;
                        for (const selId of selectedPrimitiveIds) {
                            const prim = currentPrims.find(p => p.id === selId);
                            if (prim) {
                                for (let i = 0; i < prim.points.length; i++) {
                                    batchUpdates.push({
                                        id: selId,
                                        idx: i,
                                        pt: [prim.points[i][0] + dx, prim.points[i][1] + dy],
                                    });
                                }
                            }
                        }
                        // Apply updates; propagate coincident only for primitives outside
                        // the selection (those not being explicitly translated).
                        const selSet = selectedPrimitiveIds as Set<string>;
                        const { primitiveCoincidents } = storeApi.getState();
                        storeApi.setState(s => {
                            const prims = s.activeSketchPrimitives.map(prim => ({ ...prim, points: [...prim.points] as [number, number][] }));
                            const primMap = new Map(prims.map(p => [p.id, p]));

                            for (const { id, idx, pt } of batchUpdates) {
                                const target = primMap.get(id);
                                if (target) target.points[idx] = pt;

                                // Propagate to NON-selected coincident partners
                                const key = `${id}:${idx}`;
                                const partners = primitiveCoincidents.get(key);
                                if (partners) {
                                    for (const partnerKey of partners) {
                                        const colonIdx = partnerKey.lastIndexOf(':');
                                        const pId = partnerKey.slice(0, colonIdx);
                                        const pIdx = parseInt(partnerKey.slice(colonIdx + 1), 10);
                                        if (!selSet.has(pId)) {
                                            const partner = primMap.get(pId);
                                            if (partner) partner.points[pIdx] = pt;
                                        }
                                    }
                                }
                            }

                            return { activeSketchPrimitives: prims };
                        });
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

            // Apply locked constraints for line tool (length and/or angle)
            if (currentDrawingPrimitive && currentDrawingPrimitive.type === 'line' && currentDrawingPrimitive.points.length >= 2) {
                const start = currentDrawingPrimitive.points[0];
                const hasLockedLength = lockedValues['length'] !== undefined && lockedValues['length'] !== null;
                const hasLockedAngle = lockedValues['angle'] !== undefined && lockedValues['angle'] !== null;

                if (hasLockedLength || hasLockedAngle) {
                    const dxRaw = finalP2d[0] - start[0];
                    const dyRaw = finalP2d[1] - start[1];
                    let currentAngle = Math.atan2(dyRaw, dxRaw);
                    let currentLength = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw);

                    if (hasLockedAngle) {
                        currentAngle = (lockedValues['angle']! * Math.PI) / 180;
                    }
                    if (hasLockedLength) {
                        currentLength = lockedValues['length']!;
                    }

                    finalP2d[0] = start[0] + Math.cos(currentAngle) * currentLength;
                    finalP2d[1] = start[1] + Math.sin(currentAngle) * currentLength;
                    currentSnapResult = null;
                }
            }

            hoverPointRef.current = finalP2d;
            setHoverPoint(finalP2d);
            snapResultRef.current = currentSnapResult;
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

                // For line tool, always use aligned dimension mode (shows angle + length with CAD-style dimension line)
                const dimMode: 'aligned' | 'horizontal' | 'vertical' = 
                    currentDrawingPrimitive.type === 'line' ? 'aligned' : 'aligned';

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
    const findSnapEndpointKey = (handle: HandlePoint, currentSnap: SnapResult | null): string | null => {
        if (handle.pointIndex < 0 || currentSnap?.snapPoint.type !== 'endpoint') return null;

        const sourcePrimitiveId = handle.id.split(':')[0];
        const targetPrimitiveId = currentSnap.snapPoint.sourceEntityId;
        if (!targetPrimitiveId || targetPrimitiveId === sourcePrimitiveId) return null;

        const targetPrimitive = activeSketchPrimitives.find(prim => prim.id === targetPrimitiveId);
        if (!targetPrimitive) return null;

        const targetHandle = getHandlePoints(targetPrimitive).find(candidate => {
            if (candidate.type !== 'endpoint') return false;
            const dx = candidate.position[0] - currentSnap.x;
            const dy = candidate.position[1] - currentSnap.y;
            return Math.sqrt(dx * dx + dy * dy) <= 1e-6;
        });

        if (!targetHandle || targetHandle.pointIndex < 0) return null;
        return `${targetPrimitive.id}:${targetHandle.pointIndex}`;
    };

    const finalizeHandleDrag = (handle: HandlePoint | null, currentSnap: SnapResult | null) => {
        if (!handle || handle.pointIndex < 0) return;

        const sourceKey = `${handle.id.split(':')[0]}:${handle.pointIndex}`;

        if (currentSnap?.snapPoint.metadata?.primitiveConstraintType === 'pointOnLine') {
            const targetPrimitiveId = currentSnap.snapPoint.sourceEntityId;
            const sourcePrimitiveId = handle.id.split(':')[0];
            if (targetPrimitiveId && targetPrimitiveId !== sourcePrimitiveId) {
                setPrimitivePointOnLine(sourceKey, targetPrimitiveId, currentSnap.snapPoint.metadata.constraintValue);
            }
            return;
        }

        const targetKey = findSnapEndpointKey(handle, currentSnap);
        if (!targetKey) return;

        if (sourceKey !== targetKey) {
            addPrimitiveCoincident(sourceKey, targetKey);
        }
    };

    const getSelectedEndpointPair = (): [string, string] | null => {
        const endpointHandleIds = Array.from(storeApiRef.current.getState().selectedHandleIds).filter(
            id => !isNaN(parseInt(id.split(':').pop() ?? '', 10))
        );

        if (endpointHandleIds.length < 2) {
            return null;
        }

        const pair = endpointHandleIds.slice(-2);
        return [pair[0], pair[1]];
    };

    const applyCoincidentFromSelectedHandles = (): boolean => {
        const pair = getSelectedEndpointPair();
        if (!pair || pair[0] === pair[1]) {
            return false;
        }

        addPrimitiveCoincident(pair[0], pair[1]);
        clearHandleSelection();
        cancelConstraintMode();
        toast.success('Applied Coincident constraint');
        return true;
    };

    const isHandleSelectedInCoincidentGroup = (handleId: string): boolean => {
        if (selectedHandleIds.has(handleId)) {
            return true;
        }

        const visited = new Set<string>();
        const pending = [handleId];

        while (pending.length > 0) {
            const current = pending.pop()!;
            if (visited.has(current)) {
                continue;
            }
            visited.add(current);

            const partners = primitiveCoincidents.get(current);
            if (!partners) {
                continue;
            }

            for (const partnerId of partners) {
                if (selectedHandleIds.has(partnerId)) {
                    return true;
                }
                if (!visited.has(partnerId)) {
                    pending.push(partnerId);
                }
            }
        }

        return false;
    };
    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        // Record potential start of interaction
        if (e.button === 0) {
            dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                time: Date.now()
            };

            // Use the always-current ref so we never get a stale closure value.
            // Falls back to the React state if the ref hasn't been seeded yet.
            const clickP = hoverPointRef.current ?? hoverPoint;

            // Detect handle press in both select mode and constraint-first mode.
            if (clickP && !currentDrawingPrimitive && (activeTool === 'select' || activeConstraintType !== null)) {
                const handleHit = hitTestHandles(clickP);
                if (handleHit) {
                    handlePressedRef.current = handleHit;
                    e.stopPropagation();
                    return;
                }
            }

            // Offset tool: start drag on a selected primitive
            if (clickP && activeTool === 'offset' && !currentDrawingPrimitive && selectedPrimitiveIds.size > 0) {
                const primHit = hitTestPrimitives(clickP);
                if (primHit && selectedPrimitiveIds.has(primHit)) {
                    offsetDragOriginRef.current = clickP;
                    setCameraControlsDisabled(true);
                    e.stopPropagation();
                }
            }
        }
    };

    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0 || !hoverPoint || showDialog) return;

        // Finalize handle drag or handle click-to-select
        if (draggingHandle) {
            finalizeHandleDrag(draggingHandle, snapResultRef.current);
            setConstraintOverlayForHandle(draggingHandle.id);
            setDraggingHandle(null);
            setCameraControlsDisabled(false);
            handlePressedRef.current = null;
            return;
        }
        
        // Handle was pressed but not dragged - treat as selection click
        if (handlePressedRef.current) {
            const pressedHandle = handlePressedRef.current;
            handlePressedRef.current = null;

            if (activeConstraintType === 'coincident') {
                // Coincident mode: add to selection additively
                selectHandle(pressedHandle.id, true);
                setConstraintOverlayForHandle(pressedHandle.id);
                applyCoincidentFromSelectedHandles();
            } else {
                selectHandle(pressedHandle.id, true);
                setConstraintOverlayForHandle(pressedHandle.id);
            }
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

        clearConstraintOverlay();

        e.stopPropagation();
        const p2d = hoverPoint;

        if (!currentDrawingPrimitive) {
            clearSketchInputLocks();
        }

        // NOTE: Handle selection is now handled directly by handle meshes via handlePressedRef
        // No need for canvas-level handle hit test fallback

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

                            // Find the axis line's solver entity ID for symmetric constraints
                            const axisLineEntityId = axisPrim.properties?.solverId as string | undefined;
                            // Also search sketchEntities for a line entity matching this axis
                            let axisLineSolverId: string | undefined = axisLineEntityId;
                            if (!axisLineSolverId) {
                                // Try to find a solver line entity whose points match the axis primitive's points
                                for (const [eid, ent] of sketchEntities) {
                                    if (ent.type === 'line') {
                                        axisLineSolverId = eid;
                                        break;
                                    }
                                }
                            }

                            for (const selId of selectedPrimitiveIds) {
                                const selPrim = state.activeSketchPrimitives.find(p => p.id === selId);
                                if (selPrim) {
                                    const mirroredPoints = reflectPrimitive(selPrim.points, lineP1, lineP2);
                                    const mirroredId = Math.random().toString(36).slice(2);

                                    // Register mirrored points with solver and collect point pairs
                                    const originalPointEntityIds: string[] = [];
                                    const mirroredPointEntityIds: string[] = [];

                                    // Get original primitive's solver point IDs
                                    const origSolverIds = (selPrim.properties?.solverEntityIds as string[] | undefined) || [];

                                    for (let i = 0; i < mirroredPoints.length; i++) {
                                        const mp = mirroredPoints[i];
                                        const mirrorPointId = addSolverPoint(mp[0], mp[1]);
                                        if (mirrorPointId) {
                                            mirroredPointEntityIds.push(mirrorPointId);
                                        }
                                        if (origSolverIds[i]) {
                                            originalPointEntityIds.push(origSolverIds[i]);
                                        }
                                    }

                                    // Create solver line entity if the mirrored primitive is a line
                                    let mirroredLineSolverId: string | undefined;
                                    if (mirroredPointEntityIds.length >= 2 && (selPrim.type === 'line' || selPrim.type === 'constructionLine')) {
                                        mirroredLineSolverId = addSolverLine(mirroredPointEntityIds[0], mirroredPointEntityIds[1]) ?? undefined;
                                    }

                                    newPrimitives.push({
                                        ...selPrim,
                                        id: mirroredId,
                                        points: mirroredPoints,
                                        properties: {
                                            ...selPrim.properties,
                                            solverId: mirroredLineSolverId ?? mirroredPointEntityIds[0],
                                            solverEntityIds: mirroredPointEntityIds,
                                            mirroredFrom: selId,
                                        } as any,
                                    });

                                    // Apply symmetric constraints: each original point ↔ mirrored point across axis
                                    if (axisLineSolverId) {
                                        const pairCount = Math.min(originalPointEntityIds.length, mirroredPointEntityIds.length);
                                        for (let i = 0; i < pairCount; i++) {
                                            addSolverConstraint(
                                                'symmetric',
                                                [originalPointEntityIds[i], mirroredPointEntityIds[i], axisLineSolverId],
                                            );
                                        }
                                    }
                                }
                            }
                            storeApi.setState({
                                activeSketchPrimitives: [...state.activeSketchPrimitives, ...newPrimitives],
                            });
                            // Solve after adding constraints
                            solveConstraints();
                            toast.success(`Mirrored ${newPrimitives.length} element(s) with symmetric constraints`);
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

        if (primHit && (activeTool === 'select' || activeTool === 'dimension' || activeTool === 'offset' || activeConstraintType !== null)) {
            // In constraint mode selection is additive so partial selections cumulate
            selectPrimitive(primHit, true);

            if (activeTool === 'select' && activeConstraintType === null) {
                setConstraintOverlayForPrimitive(primHit, p2d);
            }

            // Dimension tool: apply dimension directly on sketch primitives
            if (activeTool === 'dimension') {
                const prim = activeSketchPrimitives.find(p => p.id === primHit);
                if (prim) {
                    applyDimensionToPrimitive(prim);
                }
            }

            // Constraint-first mode: apply constraint to this primitive
            if (activeConstraintType !== null) {
                const prim = activeSketchPrimitives.find(p => p.id === primHit);
                if (prim && (activeConstraintType === 'horizontal' || activeConstraintType === 'vertical') &&
                    (prim.type === 'line' || prim.type === 'constructionLine')) {
                    // H/V: direct primitive manipulation — the primitive is now selected
                    applyConstraintToSelection(activeConstraintType);
                    cancelConstraintMode();
                } else if (activeConstraintType === 'coincident' && prim) {
                    // Coincident: select the nearest endpoint handle of the clicked primitive
                    const handles = getHandlePoints(prim);
                    const endpointHandles = handles.filter(h => h.type === 'endpoint' && h.pointIndex >= 0);
                    if (endpointHandles.length > 0) {
                        let nearestHandle = endpointHandles[0];
                        let nearestDist = Infinity;
                        for (const h of endpointHandles) {
                            const d = Math.hypot(h.position[0] - p2d[0], h.position[1] - p2d[1]);
                            if (d < nearestDist) { nearestDist = d; nearestHandle = h; }
                        }
                        selectHandle(nearestHandle.id, true);
                        setConstraintOverlayForHandle(nearestHandle.id);
                        applyCoincidentFromSelectedHandles();
                    }
                } else {
                    // Other constraints: forward to solver entity path
                    const solverLineId = prim?.properties?.solverId as string | undefined;
                    if (solverLineId && sketchEntities.has(solverLineId)) {
                        addEntityToConstraintSelection(solverLineId);
                    }
                }
            }
            return;
        }

        // IMPROVED: Hit test for all entity types (solver entities)
        const hitId = hitTest(p2d);

        // ─── Constraint-first mode: clicking entities to satisfy constraint ───
        if (activeConstraintType && hitId && sketchEntities.has(hitId)) {
            addEntityToConstraintSelection(hitId);
            return;
        }

        if (hitId && (activeTool === 'select' || activeTool === 'dimension' || selectedIds.has(hitId))) {
            selectObject(hitId, true);
            return;
        }

        if (!hitId && (activeTool === 'select' || activeTool === 'dimension')) {
            if (activeTool === 'select' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                clearSelection();
                clearPrimitiveSelection();
                clearHandleSelection();
                clearConstraintOverlay();
                // Cancel constraint mode on background click
                if (activeConstraintType) {
                    cancelConstraintMode();
                }
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

            // Clear locked dimension values and reset focus for next line
            clearSketchInputLocks();
            setDimFocusedField('length');

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


    return {
        isSketchMode,
        sketchStep,
        selectedPrimitiveIds,
        hoveredPrimitiveId,
        to3D,
        handlePointerDown,
        handlePointerUp,
        draggingHandle,
        isHandleSelectedInCoincidentGroup,
        pixelScale,
        activeTool,
        activeConstraintType,
        finalizeHandleDrag,
        snapResultRef,
        setConstraintOverlayForHandle,
        setDraggingHandle,
        setCameraControlsDisabled,
        handlePressedRef,
        dragStartRef,
        IS_CLICK_THRESHOLD,
        selectHandle,
        applyCoincidentFromSelectedHandles,
        sketchPlane,
        lockedValues,
        dimFocusedField,
        handleDimLengthChange,
        handleDimAngleChange,
        handleDimFocusChange,
        handleDimEnter,
        selectedIds,
        sketchEntities,
        gridRef,
        gridSnapSize,
        handlePointerMove,
        handleDoubleClick,
        planeRotation,
        selectPrimitive,
        applyDimensionToPrimitive,
        dimensionFirstPrimRef,
        activeSketchPrimitives,
        currentDrawingPrimitive,
        constraintOverlay,
        overlayConstraintItems,
        selectedConstraintOverlayId,
        setSelectedConstraintOverlayId,
        hoverPoint,
        showDialog,
        snapResult,
        annotationCtx,
        sketchConstraints,
        sketchDimensions,
        pendingStartPoint,
        handleDialogClose,
        handleDialogConfirm,
        constraintSelectionPrompt,
        constraintSelectionIds,
        primitiveCoincidents,
        selectedHandleIds,
        removeSolverConstraint
    };
};

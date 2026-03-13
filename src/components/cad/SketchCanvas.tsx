
import React from 'react';
import { useThree, useFrame, ThreeEvent } from "@react-three/fiber";
import { Html, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import { SketchPrimitive, ToolType } from "../../hooks/useCADStore";
import { SnapResult } from "../../lib/snapping";
import SketchToolDialog from "./SketchToolDialog";
import { DimensionBadge, PointMarker } from "./SketchAnnotations";
import { IconResolver } from "../ui/IconResolver";
import { buildPrimitiveCoincidentConstraintId } from "../../lib/sketch/primitiveConstraints";
import { getHandlePoints, getEntityColor, getEntityDash, getEntityLineWidth, getHandleSize, getHandleColor, isConstructionPrimitive, type HandlePoint, type SketchEntityState } from "../../lib/sketch/interaction-types";
import { useSketchCanvas } from "./useSketchCanvas";
import { toolRegistry } from "../../lib/tools";

const SketchCanvas = () => {
    const canvasScope = useSketchCanvas();
    const { isSketchMode, sketchStep, sketchPlane } = canvasScope;

    if (!isSketchMode || sketchStep !== 'drawing' || !sketchPlane) return null;

    const {
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
    } = canvasScope;

    const getPrimitiveState = (prim: SketchPrimitive): SketchEntityState => {
        if (isConstructionPrimitive(prim)) return 'construction';
        if (selectedPrimitiveIds.has(prim.id)) return 'selected';
        if (hoveredPrimitiveId === prim.id) return 'hovered';
        // TODO: check fully constrained
        return 'default';
    };

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
            // For committed (non-ghost) primitives: prefer Drei <Line> via getDisplayPoints,
            // which uses Line2 and reliably supports lineWidth in all WebGL implementations.
            // lineBasicMaterial.linewidth is ignored in WebGL2 / capped on many platforms.
            if (!isGhost && toolDef.getDisplayPoints) {
                const pts3D = toolDef.getDisplayPoints(prim as any, to3D);
                if (pts3D && pts3D.length >= 2) {
                    return (
                        <Line
                            key={prim.id}
                            points={pts3D}
                            color={color}
                            lineWidth={lineWidth}
                            depthTest={false}
                            dashed={!!dash}
                            dashSize={dash?.[0]}
                            gapSize={dash?.[1]}
                            onPointerDown={handlePointerDown as any}
                            onPointerUp={handlePointerUp as any}
                        />
                    );
                }
            }

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

    const renderHandles = (prim: SketchPrimitive) => {
        const handles = getHandlePoints(prim);
        return handles.map(h => {
            const isDrag = draggingHandle?.id === h.id;
            const isHover = false; // TODO: per-handle hover
            const isHandleSelected = isHandleSelectedInCoincidentGroup(h.id);
            const size = getHandleSize(h.type) * pixelScale;
            const handleColor = getHandleColor(h.type, isDrag, isHover, isHandleSelected);

            // Dedicated handler for handle pointer up
            const handleHandlePointerUp = (e: any) => {
                if (e.button !== 0) return;

                // Allow interaction in select mode and in constraint-first mode.
                // Let other drawing tools receive the click via the canvas.
                if (activeTool !== 'select' && activeConstraintType === null) return;

                e.stopPropagation();

                // Finalize handle drag (whether releasing over this handle or a different one)
                if (draggingHandle) {
                    finalizeHandleDrag(draggingHandle, snapResultRef.current);
                    setConstraintOverlayForHandle(draggingHandle.id);
                    setDraggingHandle(null);
                    setCameraControlsDisabled(false);
                    handlePressedRef.current = null;
                    return;
                }

                // A handle was pressed (DOWN) but not dragged — treat as a selection click.
                // IMPORTANT: we intentionally check `!== null` (not `?.id === h.id`) because
                // for coincident endpoints the UP event may fire on a different overlapping
                // handle than the one that received DOWN. We always honour the DOWN handle.
                if (handlePressedRef.current !== null) {
                    if (dragStartRef.current) {
                        const dx = e.clientX - dragStartRef.current.x;
                        const dy = e.clientY - dragStartRef.current.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist <= IS_CLICK_THRESHOLD) {
                            const pressedHandle = handlePressedRef.current;

                            if (activeConstraintType === 'coincident') {
                                // Coincident mode: add to selection additively
                                selectHandle(pressedHandle.id, true);
                                setConstraintOverlayForHandle(pressedHandle.id);
                                applyCoincidentFromSelectedHandles();
                            } else {
                                selectHandle(pressedHandle.id, true);
                                setConstraintOverlayForHandle(pressedHandle.id);
                            }
                        }
                    }
                    handlePressedRef.current = null;
                    dragStartRef.current = null;
                }
            };

            return (
                <group key={h.id} position={to3D(h.position[0], h.position[1])}>
                    {/* Visible dot */}
                    <mesh>
                        <sphereGeometry args={[size, 16, 16]} />
                        <meshBasicMaterial color={handleColor} depthTest={false} transparent opacity={0.9} />
                    </mesh>
                    {/* Invisible larger hit target */}
                    <mesh visible={false}
                        onPointerDown={(e: any) => {
                            if (e.button === 0 && (activeTool === 'select' || activeConstraintType !== null)) {
                                e.stopPropagation();
                                // Record handle press - don't start dragging yet
                                handlePressedRef.current = h;
                                dragStartRef.current = {
                                    x: e.clientX,
                                    y: e.clientY,
                                    time: Date.now()
                                };
                            }
                        }}
                        onPointerUp={handleHandlePointerUp}
                    >
                        <sphereGeometry args={[size * 3.5, 8, 8]} />
                        <meshBasicMaterial color="red" />
                    </mesh>
                </group>
            );
        });
    };

    const renderAnnotation = (prim: SketchPrimitive) => {
        const toolDef = toolRegistry.get(prim.type);
        if (toolDef?.renderAnnotation) {
            return toolDef.renderAnnotation(
                prim as any,
                sketchPlane!,
                lockedValues as any,
                (prim.properties as any)?.dimMode,
                prim.type === 'line' ? {
                    focusedField: dimFocusedField,
                    onLengthChange: handleDimLengthChange,
                    onAngleChange: handleDimAngleChange,
                    onFocusChange: handleDimFocusChange,
                    onEnter: handleDimEnter,
                } : undefined
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

    const gridRotation: [number, number, number] =
        sketchPlane === 'XY' ? [Math.PI / 2, 0, 0] :           // Base XZ (Y+) -> Target XY (Z+). Rotate X 90.
            sketchPlane === 'XZ' ? [0, 0, 0] :                     // Base XZ -> Target XZ. No rotation.
                [0, 0, Math.PI / 2];

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
                        selectPrimitive(axisId, true);
                        applyDimensionToPrimitive(axisPrim);
                    } else if (activeTool === 'select') {
                        selectPrimitive(axisId, true);
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
                        selectPrimitive('__origin__', true);
                        // For the dimension tool, set as first prim for distance
                        dimensionFirstPrimRef.current = '__origin__';
                    } else if (activeTool === 'select') {
                        selectPrimitive('__origin__', true);
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

            {/* Constraint Icons */}
            {constraintOverlay && overlayConstraintItems.length > 0 && (
                <Html
                    position={to3D(
                        constraintOverlay.anchorPoint[0] + 8 * pixelScale,
                        constraintOverlay.anchorPoint[1] + 8 * pixelScale,
                    )}
                    center
                    className="select-none"
                >
                    <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/40 bg-background/90 px-1.5 py-1 shadow-lg backdrop-blur-sm">
                        {overlayConstraintItems.map(constraint => {
                            const isSelected = constraint.id === selectedConstraintOverlayId;
                            return (
                                <button
                                    key={`constraint-overlay-${constraint.id}`}
                                    type="button"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedConstraintOverlayId(current => current === constraint.id ? null : constraint.id);
                                    }}
                                    className={`flex h-6 w-6 items-center justify-center rounded-sm border transition-colors ${isSelected
                                        ? 'border-red-500 bg-red-500/15 text-red-500'
                                        : 'border-primary/25 bg-background/95 text-primary hover:border-primary/50 hover:bg-primary/10'
                                    }`}
                                    title={constraint.label}
                                >
                                    <IconResolver name={constraint.iconName} className="h-3.5 w-3.5" />
                                </button>
                            );
                        })}
                        {selectedConstraintOverlayId && (
                            <div className="ml-1 whitespace-nowrap text-[10px] text-muted-foreground">
                                Press Enter to delete
                            </div>
                        )}
                    </div>
                </Html>
            )}

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
                            {/* Curve snap: small square ring */}
                            {snapResult.snapPoint.type === 'curve' && (
                                <mesh rotation={[0, 0, Math.PI / 4]}>
                                    <ringGeometry args={[0.35 * pixelScale, 0.6 * pixelScale, 4]} />
                                    <meshBasicMaterial color="#00ff00" depthTest={false} side={THREE.DoubleSide} />
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

            {/* Constraint mode prompt overlay */}
            {activeConstraintType && constraintSelectionPrompt && (
                <Html position={to3D(0, -20)} center>
                    <div className="bg-background/90 border border-primary/40 rounded-md px-4 py-2 text-xs text-foreground shadow-lg pointer-events-none select-none max-w-[300px] text-center">
                        <div className="font-semibold text-primary mb-0.5">
                            {activeConstraintType.charAt(0).toUpperCase() + activeConstraintType.slice(1)} Constraint
                        </div>
                        <div className="text-muted-foreground">{constraintSelectionPrompt}</div>
                        {constraintSelectionIds.length > 0 && (
                            <div className="mt-1 text-[10px] text-muted-foreground/70">
                                {constraintSelectionIds.length} selected — ESC to cancel
                            </div>
                        )}
                    </div>
                </Html>
            )}

            {/* Highlight entities selected for constraint mode */}
            {activeConstraintType && constraintSelectionIds.map(eid => {
                const entity = sketchEntities.get(eid);
                if (!entity || entity.type !== 'point') return null;
                return (
                    <mesh key={`constraint-sel-${eid}`} position={to3D(entity.x, entity.y)}>
                        <circleGeometry args={[0.8, 16]} />
                        <meshBasicMaterial color="#FFD700" transparent opacity={0.6} />
                    </mesh>
                );
            })}

            {/* ─── Coincident Constraint Indicators ───────────────────────────────────
                Show a small "two-circles" symbol next to endpoints that have
                coincident constraints when the affected primitive is selected or hovered. */}
            {(() => {
                if (!primitiveCoincidents || primitiveCoincidents.size === 0) return null;

                // Collect all endpoint keys belonging to selected/hovered primitives
                const relevantPrimIds = new Set<string>();
                for (const id of selectedPrimitiveIds) relevantPrimIds.add(id);
                if (hoveredPrimitiveId) relevantPrimIds.add(hoveredPrimitiveId);
                const selectedEndpointKeys = new Set<string>();
                for (const handleId of selectedHandleIds) {
                    const colonIdx = handleId.lastIndexOf(':');
                    if (colonIdx === -1) continue;
                    const primId = handleId.slice(0, colonIdx);
                    const pointIdx = Number(handleId.slice(colonIdx + 1));
                    if (!Number.isFinite(pointIdx) || pointIdx < 0) continue;
                    relevantPrimIds.add(primId);
                    selectedEndpointKeys.add(`${primId}:${pointIdx}`);
                }
                if (relevantPrimIds.size === 0 && selectedEndpointKeys.size === 0) return null;

                // Build set of coincident endpoint pairs to render (avoid duplicates)
                const rendered = new Set<string>();
                const indicators: React.ReactNode[] = [];

                for (const primId of relevantPrimIds) {
                    const prim = activeSketchPrimitives.find(p => p.id === primId);
                    if (!prim) continue;

                    // Check each point index
                    for (let idx = 0; idx < prim.points.length; idx++) {
                        const key = `${primId}:${idx}`;
                        const partners = primitiveCoincidents.get(key);
                        if (!partners || partners.size === 0) continue;

                        // Sort keys so we don't render the same pair twice
                        for (const partnerKey of partners) {
                            const pairKey = [key, partnerKey].sort().join('|');
                            if (rendered.has(pairKey)) continue;
                            rendered.add(pairKey);

                            const shouldRender = selectedEndpointKeys.size === 0
                                ? true
                                : selectedEndpointKeys.has(key) || selectedEndpointKeys.has(partnerKey);
                            if (!shouldRender) continue;

                            const pt = prim.points[idx];
                            if (!pt) continue;

                            const constraintId = buildPrimitiveCoincidentConstraintId(key, partnerKey);

                            // Offset the symbol slightly (perpendicular to cursor)
                            const offsetScale = 2.5 * pixelScale;
                            const pos3D = to3D(pt[0] + offsetScale, pt[1] + offsetScale);

                            indicators.push(
                                <group key={`ci-${pairKey}`} position={pos3D}>
                                    <mesh
                                        onPointerDown={(e) => {
                                            e.stopPropagation();
                                            removeSolverConstraint(constraintId);
                                        }}
                                    >
                                        <circleGeometry args={[1.8 * pixelScale, 24]} />
                                        <meshBasicMaterial transparent opacity={0.001} depthTest={false} />
                                    </mesh>
                                    {/* Outer ring (first circle of the "coincident" symbol) */}
                                    <mesh onPointerDown={(e) => {
                                        e.stopPropagation();
                                        removeSolverConstraint(constraintId);
                                    }}>
                                        <ringGeometry args={[0.7 * pixelScale, 1.0 * pixelScale, 24]} />
                                        <meshBasicMaterial
                                            color="#22c55e"
                                            depthTest={false}
                                            side={THREE.DoubleSide}
                                            transparent
                                            opacity={0.9}
                                        />
                                    </mesh>
                                    {/* Second (overlapping) ring shifted slightly */}
                                    <mesh position={[0.9 * pixelScale, 0, 0]} onPointerDown={(e) => {
                                        e.stopPropagation();
                                        removeSolverConstraint(constraintId);
                                    }}>
                                        <ringGeometry args={[0.7 * pixelScale, 1.0 * pixelScale, 24]} />
                                        <meshBasicMaterial
                                            color="#22c55e"
                                            depthTest={false}
                                            side={THREE.DoubleSide}
                                            transparent
                                            opacity={0.9}
                                        />
                                    </mesh>
                                </group>
                            );
                        }
                    }
                }
                return <>{indicators}</>;
            })()}
        </group>
    );


};
export default SketchCanvas;

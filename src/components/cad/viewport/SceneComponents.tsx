import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useCADStore } from '../../../hooks/useCADStore';
import { toolRegistry } from '../../../lib/tools';
import type { ArcballControls as ArcballControlsImpl } from 'three-stdlib';

/**
 * CAD ground grid component.
 * Grid is defined in Z-up coordinates (XY is ground); parent ZUpContainer applies rotation.
 */
export const CADGrid = ({ isSketchMode }: { isSketchMode: boolean }) => {
    const gridRef = useRef<any>(null);

    React.useLayoutEffect(() => {
        if (gridRef.current) {
            gridRef.current.traverse((obj: any) => {
                if (obj.isMesh && obj.material) {
                    obj.material.side = THREE.DoubleSide;
                    obj.material.polygonOffset = true;
                    obj.material.polygonOffsetFactor = 1;
                    obj.material.polygonOffsetUnits = 1;
                    obj.material.needsUpdate = true;
                }
            });
        }
    }, []);

    if (isSketchMode) return null;
    return (
        <>
            <Grid
                ref={gridRef}
                args={[1000, 1000]}
                cellSize={5}
                cellThickness={0.5}
                cellColor="#3a4a5a"
                sectionSize={25}
                sectionThickness={1}
                sectionColor="#4a5a6a"
                fadeDistance={4000}
                fadeStrength={1}
                infiniteGrid
                position={[0, 0, -0.01]}
                rotation={[Math.PI / 2, 0, 0]}
            />
        </>
    );
};

/**
 * Configure raycaster thresholds for line/point selection.
 */
export const RaycasterSetup = () => {
    const { raycaster } = useThree();

    useEffect(() => {
        raycaster.params.Line.threshold = 0.3;
        raycaster.params.Points.threshold = 0.25;
    }, [raycaster]);

    return null;
};

/**
 * Registers a thumbnail capturer from the WebGL canvas.
 */
export const ThumbnailCapturer = () => {
    const { gl } = useThree();
    const setThumbnailCapturer = useCADStore(state => state.setThumbnailCapturer);

    useEffect(() => {
        setThumbnailCapturer(() => {
            try {
                return gl.domElement.toDataURL('image/jpeg', 0.5);
            } catch (e) {
                console.error("Failed to capture thumbnail", e);
                return null;
            }
        });

        return () => setThumbnailCapturer(() => null);
    }, [gl, setThumbnailCapturer]);

    return null;
};

/**
 * Plane selector - planes are in Z-up coordinates, parent ZUpContainer applies rotation.
 */
export const PlaneSelector = () => {
    const { sketchStep, setSketchPlane, isSketchMode, planeVisibility, originVisible } = useCADStore();
    const [hoveredPlane, setHoveredPlane] = useState<string | null>(null);

    const isSelectPlaneStep = isSketchMode && sketchStep === 'select-plane';
    const isDrawingStep = isSketchMode && sketchStep === 'drawing';

    if (!isSelectPlaneStep && !originVisible) return null;

    const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
        setSketchPlane(plane);
    };

    const getPlaneVisibility = (plane: 'XY' | 'XZ' | 'YZ') => {
        if (isSelectPlaneStep) return true;
        if (isDrawingStep) return false;
        return originVisible && planeVisibility[plane];
    };

    return (
        <group>
            {/* XY Plane - ground in Z-up (Blue) */}
            {getPlaneVisibility('XY') && (
                <mesh
                    onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('XY'); }}
                    onPointerOut={() => setHoveredPlane(null)}
                    onClick={(e) => { e.stopPropagation(); handlePlaneClick('XY'); }}
                    position={[20, 20, 0]}
                >
                    <planeGeometry args={[40, 40]} />
                    <meshBasicMaterial
                        color="#5577ee"
                        transparent
                        opacity={hoveredPlane === 'XY' ? 0.5 : 0.2}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={-1}
                        polygonOffsetUnits={-1}
                        depthWrite={false}
                    />
                </mesh>
            )}

            {/* XZ Plane - front in Z-up (Red) */}
            {getPlaneVisibility('XZ') && (
                <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[20, 0, 20]}
                    onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('XZ'); }}
                    onPointerOut={() => setHoveredPlane(null)}
                    onClick={(e) => { e.stopPropagation(); handlePlaneClick('XZ'); }}
                >
                    <planeGeometry args={[40, 40]} />
                    <meshBasicMaterial
                        color="#e05555"
                        transparent
                        opacity={hoveredPlane === 'XZ' ? 0.5 : 0.2}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={-1}
                        polygonOffsetUnits={-1}
                        depthWrite={false}
                    />
                </mesh>
            )}

            {/* YZ Plane - right in Z-up (Green) */}
            {getPlaneVisibility('YZ') && (
                <mesh
                    rotation={[0, Math.PI / 2, 0]}
                    position={[0, 20, 20]}
                    onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('YZ'); }}
                    onPointerOut={() => setHoveredPlane(null)}
                    onClick={(e) => { e.stopPropagation(); handlePlaneClick('YZ'); }}
                >
                    <planeGeometry args={[40, 40]} />
                    <meshBasicMaterial
                        color="#55e055"
                        transparent
                        opacity={hoveredPlane === 'YZ' ? 0.5 : 0.2}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={-1}
                        polygonOffsetUnits={-1}
                        depthWrite={false}
                    />
                </mesh>
            )}
        </group>
    );
};

/**
 * Renders tool-specific 3D preview of the active operation.
 */
export const OperationPreview = () => {
    const activeOperation = useCADStore((state) => state.activeOperation);
    const selectedIds = useCADStore((state) => state.selectedIds);
    const objects = useCADStore((state) => state.objects);
    const updateOperationParams = useCADStore((state) => state.updateOperationParams);
    const setCameraControlsDisabled = useCADStore((state) => state.setCameraControlsDisabled);

    if (!activeOperation) return null;

    const { type, params } = activeOperation;
    const tool = toolRegistry.get(type);

    if (tool && tool.render3DPreview) {
        return (
            <group>
                {tool.render3DPreview(params || {}, {
                    selectedIds: Array.from(selectedIds),
                    objects,
                    updateOperationParams,
                    setCameraControlsDisabled
                })}
            </group>
        );
    }

    return null;
};

/**
 * Camera controller - handles sketch mode camera orientation only.
 * Camera positions are in Y-up (Three.js) space, content is rotated to Z-up.
 */
export const CameraController = ({ controlsRef }: { controlsRef: React.RefObject<ArcballControlsImpl | null> }) => {
    const { camera } = useThree();
    const { sketchPlane, isSketchMode, sketchOptions } = useCADStore();
    const lastPlaneRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isSketchMode || !sketchPlane || sketchPlane === lastPlaneRef.current) return;
        lastPlaneRef.current = sketchPlane;

        if (!sketchOptions.lookAt) return;

        const controls = controlsRef.current;
        if (!controls) return;

        const dist = 100;

        if (sketchPlane === 'XY') {
            camera.position.set(0, dist, 0);
            camera.up.set(0, 0, -1);
        } else if (sketchPlane === 'XZ') {
            camera.position.set(0, 0, dist);
            camera.up.set(0, 1, 0);
        } else if (sketchPlane === 'YZ') {
            camera.position.set(dist, 0, 0);
            camera.up.set(0, 1, 0);
        }

        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();

    }, [isSketchMode, sketchPlane, controlsRef, camera, sketchOptions.lookAt]);

    useEffect(() => {
        if (!isSketchMode && lastPlaneRef.current) {
            lastPlaneRef.current = null;
        }
    }, [isSketchMode]);

    return null;
};

/**
 * Scene controller - handles zoom synchronization, view changes, fit-to-screen, and mouse button config.
 */
export const SceneController = ({ controlsRef }: { controlsRef: React.RefObject<ArcballControlsImpl | null> }) => {
    const { camera, scene } = useThree();
    const { zoom, activeTool, currentView, projectionMode, fitToScreenSignal } = useCADStore();

    // Handle Projection Mode / Hybrid Mode
    useEffect(() => {
        if (projectionMode !== 'perspective-with-ortho-faces') return;

        const controls = controlsRef.current as any;
        if (!controls) return;

        const checkOrientation = () => {
            if (projectionMode !== 'perspective-with-ortho-faces') return;

            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);

            const threshold = 0.999;
            const isAligned = (
                Math.abs(dir.x) > threshold ||
                Math.abs(dir.y) > threshold ||
                Math.abs(dir.z) > threshold
            );

            if (camera instanceof THREE.PerspectiveCamera) {
                const targetFov = isAligned ? 5 : 45;
                if (Math.abs(camera.fov - targetFov) > 0.1) {
                    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
                    camera.updateProjectionMatrix();
                }
            }
        };

        controls.addEventListener('change', checkOrientation);
        return () => controls.removeEventListener('change', checkOrientation);
    }, [projectionMode, camera, controlsRef]);

    // Sync camera zoom with store
    useEffect(() => {
        const controls = controlsRef.current as any;
        if (!controls) return;

        const targetCamera = camera;
        if (!targetCamera) return;

        if (targetCamera instanceof THREE.PerspectiveCamera) {
            const target = controls.target;
            if (!target) return;
            const distance = targetCamera.position.distanceTo(target);
            const baseDistance = 173.205;

            const fovFactor = projectionMode === 'perspective-with-ortho-faces' ? (targetCamera.fov / 45) : 1;
            const desiredDistance = (baseDistance * (100 / zoom)) / fovFactor;

            if (Math.abs(distance - desiredDistance) > 0.1) {
                const direction = new THREE.Vector3().subVectors(targetCamera.position, target).normalize();
                const newPos = target.clone().add(direction.multiplyScalar(desiredDistance));
                targetCamera.position.copy(newPos);
                controls.update();
            }
        } else if (targetCamera instanceof THREE.OrthographicCamera) {
            if (Math.abs(targetCamera.zoom - (zoom / 5)) > 0.01) {
                targetCamera.zoom = zoom / 5;
                targetCamera.updateProjectionMatrix();
            }
        }
    }, [zoom, camera, controlsRef, projectionMode]);

    // Handle View Changes (Home)
    useEffect(() => {
        if (currentView === 'home') {
            const controls = controlsRef.current as any;
            if (!controls) return;

            const targetCamera = camera;
            if (!targetCamera) return;

            targetCamera.position.set(400, 400, -400);
            controls.target.set(0, 0, 0);
            targetCamera.up.set(0, 1, 0);

            if (targetCamera instanceof THREE.PerspectiveCamera) {
                targetCamera.fov = 45;
                targetCamera.updateProjectionMatrix();
            } else if (targetCamera instanceof THREE.OrthographicCamera) {
                targetCamera.zoom = 5;
                targetCamera.updateProjectionMatrix();
            }

            controls.update();
        }
    }, [currentView, camera, controlsRef]);

    // Handle fitToScreen
    useEffect(() => {
        if (!fitToScreenSignal) return;

        const controls = controlsRef.current as any;
        if (!controls) return;

        const targetCamera = camera;
        if (!targetCamera) return;

        const box = new THREE.Box3().setFromObject(scene);
        if (box.isEmpty()) return;

        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);

        if (targetCamera instanceof THREE.PerspectiveCamera) {
            const distance = sphere.radius / Math.tan(Math.PI * targetCamera.fov / 360);
            targetCamera.position.set(sphere.center.x + distance, sphere.center.y + distance, sphere.center.z + distance);
        } else {
            const distance = sphere.radius * 2;
            targetCamera.position.set(sphere.center.x + distance, sphere.center.y + distance, sphere.center.z + distance);
        }

        controls.target.copy(sphere.center);
        controls.update();
    }, [fitToScreenSignal, camera, scene, controlsRef]);

    // Configure mouse buttons
    useEffect(() => {
        const controls = controlsRef.current as any;
        if (!controls) return;

        if (typeof controls.setMouseAction === 'function') {
            try {
                if (activeTool === 'pan') {
                    controls.setMouseAction('PAN', 0);
                    controls.setMouseAction('ROTATE', 2);
                } else {
                    controls.setMouseAction('ROTATE', 0);
                    controls.setMouseAction('PAN', 2);
                }
            } catch (err) {
                console.warn("Failed to configure ArcballControls:", err);
            }
        }
    }, [activeTool, controlsRef]);

    return null;
};

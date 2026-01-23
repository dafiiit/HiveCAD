import { useRef, useState } from "react";
import { useThree, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, SketchPrimitive } from "../../hooks/useCADStore";

const SketchCanvas = () => {
    const {
        isSketchMode, sketchStep, sketchPlane, activeTool,
        activeSketchPrimitives, currentDrawingPrimitive,
        addSketchPrimitive, updateCurrentDrawingPrimitive
    } = useCADStore();

    // Use local state effectively for high frequency updates before committing to store
    const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);

    // Only active in sketch mode drawing step
    if (!isSketchMode || sketchStep !== 'drawing' || !sketchPlane) return null;

    // Determine plane rotation
    const rotation: [number, number, number] =
        sketchPlane === 'XY' ? [0, 0, 0] :
            sketchPlane === 'XZ' ? [-Math.PI / 2, 0, 0] :
                [0, Math.PI / 2, 0];

    // Wait, Plane geometries are XY by default. 
    // If we want to draw on XZ (Front), we rotate X -90.
    // If we want to draw on YZ (Right), we rotate Y 90.
    const planeRotation: [number, number, number] =
        sketchPlane === 'XY' ? [0, 0, 0] :
            sketchPlane === 'XZ' ? [Math.PI / 2, 0, 0] : // Standard Three Plane is XY. XZ needs X rot.
                [0, Math.PI / 2, 0];

    // Helper to map 3D point to 2D sketch plane coordinates
    const to2D = (p: THREE.Vector3): [number, number] => {
        if (sketchPlane === 'XY') return [p.x, p.y];
        if (sketchPlane === 'XZ') return [p.x, p.z];
        return [p.y, p.z]; // YZ usually Y is horizontal? No, Y is depth. 
        // Let's stick to standard mapping:
        // XY: x->x, y->y
        // XZ: x->x, z->y
        // YZ: y->x, z->y
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

            // Adjust for plane precision
            if (sketchPlane === 'XY') worldPoint.z = 0;
            if (sketchPlane === 'XZ') worldPoint.y = 0;
            if (sketchPlane === 'YZ') worldPoint.x = 0;

            const p2d = to2D(worldPoint);
            setHoverPoint(p2d);

            if (currentDrawingPrimitive) {
                // Update the primitive being drawn
                const newPoints = [...currentDrawingPrimitive.points];
                // Update last point (the cursor point)
                newPoints[newPoints.length - 1] = p2d;

                updateCurrentDrawingPrimitive({
                    ...currentDrawingPrimitive,
                    points: newPoints
                });
            }
        }
    };

    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0 || !hoverPoint) return;
        e.stopPropagation();

        const p2d = hoverPoint;

        if (!currentDrawingPrimitive) {
            // Start simple primitives
            if (activeTool === 'line') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'line',
                    points: [p2d, p2d] // Start with 2 points (start, current)
                });
            } else if (activeTool === 'rectangle' || activeTool === 'box') { // 'box' mapped to rect for sketch
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'rectangle',
                    points: [p2d, p2d]
                });
            } else if (activeTool === 'circle' || activeTool === 'sphere') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'circle',
                    points: [p2d, p2d] // Center, Edge
                });
            }
        } else {
            // Continue or Finish primitive
            if (currentDrawingPrimitive.type === 'line') {
                // Add new point segment
                updateCurrentDrawingPrimitive({
                    ...currentDrawingPrimitive,
                    points: [...currentDrawingPrimitive.points, p2d]
                });
                // Double click logic handled elsewhere? Or just click limit?
                // For now, let's keep drawing lines until "Finish" or Escape (global key)
            } else {
                // Rect/Circle finish on 2nd click
                addSketchPrimitive({
                    ...currentDrawingPrimitive,
                    points: currentDrawingPrimitive.points // Finalize
                });
                updateCurrentDrawingPrimitive(null);
            }
        }
    };

    // Rendering Helpers
    const renderPrimitive = (prim: SketchPrimitive, isGhost: boolean = false) => {
        const color = isGhost ? "#00ffff" : "#ffff00";
        const points = prim.points.map(p => to3D(p[0], p[1]));

        if (prim.type === 'line') {
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
        } else if (prim.type === 'rectangle') {
            if (points.length < 2) return null;
            const [p1, p2] = points;
            // Create 4 corners mapped back to 3D
            const corners = [
                p1,
                to3D(p2.x, p1.y), // This logic depends on plane mapping! to3D takes (x,y) of Sketch Plane
                // Wait, to3D args are (u, v). 
                // p1 is Vector3. We need its 2D coords.
                // Re-calculate local coords
                p2,
                to3D(p1.x, p2.y), // This is wrong if we mix up axes.
                p1 // Close loop
            ];

            // Correct approach: work in 2D then project all
            const u1 = prim.points[0];
            const u2 = prim.points[1];
            const rectPoints2D = [
                u1,
                [u2[0], u1[1]],
                u2,
                [u1[0], u2[1]],
                u1
            ];
            const displayPoints = rectPoints2D.map(p => to3D(p[0], p[1]));

            return (
                <line key={prim.id}>
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
            );
        } else if (prim.type === 'circle') {
            if (points.length < 2) return null;
            // Radius
            const center = points[0];
            const edge = points[1];
            const radius = center.distanceTo(edge);

            // Draw circle using LineLoop and many segments
            const segments = 64;
            const circlePoints: THREE.Vector3[] = [];
            // We need to generate points in the Sketch Plane
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
        return null;
    };

    return (
        <group>
            {/* Invisible plane for raycasting */}
            <mesh
                visible={false}
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                rotation={planeRotation}
                position={[0, 0, 0]}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial color="red" wireframe side={THREE.DoubleSide} />
            </mesh>

            {/* Render Active Primitives */}
            {activeSketchPrimitives.map(prim => renderPrimitive(prim, false))}

            {/* Render Current Drawing Primitive */}
            {currentDrawingPrimitive && renderPrimitive(currentDrawingPrimitive, true)}

            {/* Hover Cursor */}
            {hoverPoint && (
                <mesh position={to3D(hoverPoint[0], hoverPoint[1])}>
                    <ringGeometry args={[0.5, 0.7, 32]} />
                    <meshBasicMaterial color="#00ffff" depthTest={false} side={THREE.DoubleSide} />
                </mesh>
            )}
        </group>
    );
};

export default SketchCanvas;

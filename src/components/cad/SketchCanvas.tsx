import { useRef, useState } from "react";
import { useThree, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, SketchPrimitive } from "../../hooks/useCADStore";

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
                            onLock(); // Lock current and move focus logic handles next
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

const SketchCanvas = () => {
    const {
        isSketchMode, sketchStep, sketchPlane, activeTool,
        activeSketchPrimitives, currentDrawingPrimitive,
        addSketchPrimitive, updateCurrentDrawingPrimitive,
        lockedValues, setSketchInputLock, clearSketchInputLocks, finishSketch
    } = useCADStore();

    // Input Refs for tab navigation
    const widthInputRef = useRef<HTMLInputElement>(null);
    const heightInputRef = useRef<HTMLInputElement>(null);

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

            // Logic to respect Locked Values for Rectangle
            let finalP2d = [...p2d] as [number, number];

            if (currentDrawingPrimitive && currentDrawingPrimitive.type === 'rectangle' && currentDrawingPrimitive.points.length > 0) {
                const start = currentDrawingPrimitive.points[0];

                // If width is locked (x-diff)
                if (lockedValues['width'] !== undefined && lockedValues['width'] !== null) {
                    const directionX = p2d[0] >= start[0] ? 1 : -1;
                    finalP2d[0] = start[0] + (lockedValues['width']! * directionX);
                }

                // If height is locked (y-diff)
                if (lockedValues['height'] !== undefined && lockedValues['height'] !== null) {
                    const directionY = p2d[1] >= start[1] ? 1 : -1;
                    finalP2d[1] = start[1] + (lockedValues['height']! * directionY);
                }
            }

            setHoverPoint(finalP2d);

            if (currentDrawingPrimitive) {
                // Update the primitive being drawn
                const newPoints = [...currentDrawingPrimitive.points];
                // Update last point (the cursor point)
                newPoints[newPoints.length - 1] = finalP2d;

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

        // Reset locks when starting new primitive
        if (!currentDrawingPrimitive) {
            clearSketchInputLocks();
        }

        if (!currentDrawingPrimitive) {
            // Start simple primitives
            if (activeTool === 'line' || activeTool === 'spline') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: activeTool,
                    points: [p2d, p2d] // Start with 2 points (start, current)
                });
            } else if (activeTool === 'rectangle' || activeTool === 'box') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'rectangle',
                    points: [p2d, p2d]
                });
            } else if (activeTool === 'circle' || activeTool === 'sphere') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'circle',
                    points: [p2d, p2d]
                });
            } else if (activeTool === 'polygon') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'polygon',
                    points: [p2d, p2d],
                    properties: { sides: 6 }
                });
            } else if (activeTool === 'arc') {
                updateCurrentDrawingPrimitive({
                    id: Math.random().toString(),
                    type: 'arc',
                    points: [p2d, p2d] // Start, End... then Mid
                });
            }
        } else {
            // Continue or Finish primitive
            if (currentDrawingPrimitive.type === 'line' || currentDrawingPrimitive.type === 'spline') {
                // Add new point segment
                updateCurrentDrawingPrimitive({
                    ...currentDrawingPrimitive,
                    points: [...currentDrawingPrimitive.points, p2d]
                });
            } else if (currentDrawingPrimitive.type === 'arc') {
                if (currentDrawingPrimitive.points.length === 2) {
                    // We just defined End point. Now adding Mid point placeholder
                    updateCurrentDrawingPrimitive({
                        ...currentDrawingPrimitive,
                        points: [...currentDrawingPrimitive.points, p2d] // [Start, End, Mid(current)]
                    });
                } else {
                    // We defined Mid point. Finish.
                    addSketchPrimitive({
                        ...currentDrawingPrimitive,
                        points: currentDrawingPrimitive.points
                    });
                    updateCurrentDrawingPrimitive(null);
                }
            } else {
                // Rect/Circle/Polygon finish on 2nd click
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


            // Dimensions for display
            const width = Math.abs(u2[0] - u1[0]);
            const height = Math.abs(u2[1] - u1[1]);
            const cx = (u1[0] + u2[0]) / 2;
            const cy = (u1[1] + u2[1]) / 2;

            // Determine if we are actively drawing this primitive to show inputs
            const isDrawing = currentDrawingPrimitive?.id === prim.id;

            return (
                <group key={prim.id}>
                    {/* Main Rectangle Line */}
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

                    {/* Visual Guides (Only when drawing) */}
                    {isDrawing && (
                        <>
                            {/* Dashed Center Lines (Diagonals) */}
                            <line>
                                <bufferGeometry>
                                    <bufferAttribute
                                        attach="attributes-position"
                                        count={2}
                                        array={new Float32Array([...to3D(u1[0], u1[1]).toArray(), ...to3D(u2[0], u2[1]).toArray()])}
                                        itemSize={3}
                                    />
                                </bufferGeometry>
                                <lineDashedMaterial color="#666" dashSize={2} gapSize={2} depthTest={false} />
                            </line>
                            <line>
                                <bufferGeometry>
                                    <bufferAttribute
                                        attach="attributes-position"
                                        count={2}
                                        array={new Float32Array([...to3D(u1[0], u2[1]).toArray(), ...to3D(u2[0], u1[1]).toArray()])}
                                        itemSize={3}
                                    />
                                </bufferGeometry>
                                <lineDashedMaterial color="#666" dashSize={2} gapSize={2} depthTest={false} />
                            </line>

                            {/* Dimension Lines (Green) */}
                            {/* Width Dimension (Top) */}
                            <line>
                                <bufferGeometry>
                                    <bufferAttribute
                                        attach="attributes-position"
                                        count={2}
                                        array={new Float32Array([
                                            ...to3D(u1[0], Math.max(u1[1], u2[1]) + 2).toArray(),
                                            ...to3D(u2[0], Math.max(u1[1], u2[1]) + 2).toArray()
                                        ])}
                                        itemSize={3}
                                    />
                                </bufferGeometry>
                                <lineBasicMaterial color="#4ade80" linewidth={1} depthTest={false} />
                            </line>
                            {/* Height Dimension (Left) */}
                            <line>
                                <bufferGeometry>
                                    <bufferAttribute
                                        attach="attributes-position"
                                        count={2}
                                        array={new Float32Array([
                                            ...to3D(Math.min(u1[0], u2[0]) - 2, u1[1]).toArray(),
                                            ...to3D(Math.min(u1[0], u2[0]) - 2, u2[1]).toArray()
                                        ])}
                                        itemSize={3}
                                    />
                                </bufferGeometry>
                                <lineBasicMaterial color="#4ade80" linewidth={1} depthTest={false} />
                            </line>

                            {/* Dynamic Inputs */}
                            <DynamicInputOverlay
                                position={to3D(cx, Math.max(u1[1], u2[1]) + 4).toArray()}
                                value={lockedValues['width'] ?? parseFloat(width.toFixed(2))}
                                label="Width"
                                showLabel
                                autoFocus={!lockedValues['width']}
                                onChange={(val) => {
                                    setSketchInputLock('width', val);
                                    // If both locked, finish? Or wait for enter?
                                }}
                                onLock={() => {
                                    // If we lock width, focus height next?
                                    // Actually just setting the value locks it based on my logic above
                                    // We might want to auto-focus the next field
                                }}
                            />

                            <DynamicInputOverlay
                                position={to3D(Math.min(u1[0], u2[0]) - 4, cy).toArray()}
                                value={lockedValues['height'] ?? parseFloat(height.toFixed(2))}
                                label="Height"
                                showLabel
                                onChange={(val) => setSketchInputLock('height', val)}
                                onLock={() => {
                                    // Finish if confirmed?
                                    if (lockedValues['width']) {
                                        // Both locked, user pressed enter on height -> Finish
                                        finishSketch(); // This finishes the whole sketch mode though. 
                                        // We want to finish just the RECTANGLE.
                                        // Trigger a fake click event? Or call primitive add logic directly?
                                    }
                                }}
                            />
                        </>
                    )}
                </group>
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
        } else if (prim.type === 'polygon') {
            if (points.length < 2) return null;
            const center = points[0];
            const edge = points[1];
            const radius = center.distanceTo(edge);
            const sides = prim.properties?.sides || 6;

            const polyPoints: THREE.Vector3[] = [];

            // Calculate starting angle based on mouse position to allow rotation
            // Vector from center to edge
            const dx = prim.points[1][0] - prim.points[0][0];
            const dy = prim.points[1][1] - prim.points[0][1];
            const startAngle = Math.atan2(dy, dx);

            for (let i = 0; i <= sides; i++) {
                const theta = startAngle + (i / sides) * Math.PI * 2;
                // Polygon vertices usually start at angle 0 if not rotated.
                // But here we want one vertex to be at 'edge'.
                // If we use startAngle as offset, vertex 0 is at edge.

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
        } else if (prim.type === 'spline') {
            if (points.length < 2) return null;
            // Draw lines between control points for visual feedback
            // Ideally we should draw a CatmullRomCurve3 or similar for preview

            const curve = new THREE.CatmullRomCurve3(points);
            const splinePoints = curve.getPoints(50); // Resolution

            return (
                <line key={prim.id}>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={splinePoints.length}
                            array={new Float32Array(splinePoints.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} linewidth={3} depthTest={false} />
                    {/* Show control points */}
                    {isGhost && points.map((p, i) => (
                        <mesh key={i} position={p}>
                            <boxGeometry args={[0.2, 0.2, 0.2]} />
                            <meshBasicMaterial color="#ff00ff" depthTest={false} />
                        </mesh>
                    ))}
                </line>
            );
        } else if (prim.type === 'arc') {
            if (points.length < 2) return null; // Need at least start and end
            // 3-point arc: Start, End, Mid
            // If we only have 2 points (Start, End), draw line?
            if (points.length === 2) {
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

            // 3 points: Calculate Arc
            const p1 = prim.points[0]; // Start
            const p2 = prim.points[1]; // End
            const p3 = prim.points[2]; // Mid (visual only)

            // For visualization in Three.js, create a QuadraticBezierCurve3 or similar?
            // Or actually calculate the circle center and radius from 3 points.

            // Simplified: Draw curved line through points using Spline for preview?
            // Or better: QuadraticBezier

            const curve = new THREE.QuadraticBezierCurve3(
                to3D(p1[0], p1[1]),
                to3D(p3[0], p3[1]), // Using 3rd point as control point for Quadratic is wrong for a circular arc passing through it.
                to3D(p2[0], p2[1])
            );
            // But 'arc' in replicad `threePointsArc` passes THROUGH the mid point.
            // A CatmullRom with 3 points passes through them.

            const splineCurve = new THREE.CatmullRomCurve3([
                to3D(p1[0], p1[1]),
                to3D(p3[0], p3[1]),
                to3D(p2[0], p2[1])
            ]);
            // Force it to be an "arc" is hard in preview without circle math.
            // Let's use CatmullRom for smooth preview.

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

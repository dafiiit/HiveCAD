import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';

interface InteractivePreviewHandleProps {
    position: [number, number, number]; // Base position
    direction: [number, number, number]; // Vector direction
    distance: number; // Current distance from base
    onDrag: (distance: number) => void;
    color?: string;
    label?: string;
}

export const InteractivePreviewHandle: React.FC<InteractivePreviewHandleProps> = ({
    position,
    direction: dirArr,
    distance,
    onDrag,
    color = "#80c0ff",
    label
}) => {
    const { camera, gl, raycaster, size } = useThree();
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);

    // Convert direction array to Vector3 and normalize
    const direction = React.useMemo(() => new THREE.Vector3(...dirArr).normalize(), [dirArr]);
    const basePosition = React.useMemo(() => new THREE.Vector3(...position), [position]);

    // Calculate current handle position
    const handlePosition = React.useMemo(() => {
        return basePosition.clone().add(direction.clone().multiplyScalar(distance));
    }, [basePosition, direction, distance]);

    // Dragging logic
    const dragData = useRef({
        startMouse: new THREE.Vector2(),
        startDistance: 0,
        dragPlane: new THREE.Plane()
    });

    const handlePointerDown = (e: any) => {
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);

        setDragging(true);

        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);

        const planeSide = new THREE.Vector3().crossVectors(direction, cameraDir).normalize();
        const planeNormal = new THREE.Vector3().crossVectors(direction, planeSide).normalize();

        dragData.current = {
            startMouse: new THREE.Vector2(e.nativeEvent.clientX, e.nativeEvent.clientY),
            startDistance: distance,
            dragPlane: new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, handlePosition)
        };
    };

    const handlePointerMove = (e: any) => {
        if (!dragging) return;

        // Raycast to the drag plane
        const mouse = new THREE.Vector2(
            (e.clientX / size.width) * 2 - 1,
            -(e.clientY / size.height) * 2 + 1
        );

        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragData.current.dragPlane, intersectPoint)) {
            // Project the vector from base to intersection onto the direction vector
            const offset = intersectPoint.clone().sub(basePosition);
            const newDistance = offset.dot(direction);

            // Allow negative extrusion if needed (user might want to drag backwards)
            // But usually CAD tools have a min/max
            onDrag(Number(newDistance.toFixed(2)));
        }
    };

    const handlePointerUp = (e: any) => {
        if (dragging) {
            setDragging(false);
            e.target.releasePointerCapture(e.pointerId);
        }
    };

    // Calculate rotation to align the cone with the direction
    const rotation = React.useMemo(() => {
        const arrowDir = direction.clone();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, arrowDir);
        return new THREE.Euler().setFromQuaternion(quaternion);
    }, [direction]);

    return (
        <group position={handlePosition}>
            {/* The actual visual handle - a cone */}
            <mesh
                rotation={rotation}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
                renderOrder={999}
            >
                <coneGeometry args={[1.5, 4, 16]} />
                <meshStandardMaterial
                    color={dragging ? "#ffffff" : (hovered ? "#ffd700" : color)}
                    transparent
                    opacity={0.8}
                    depthTest={false}
                />
            </mesh>

            {/* Visual line connecting base to handle */}
            <group position={[-handlePosition.x, -handlePosition.y, -handlePosition.z]}>
                <line>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={2}
                            array={new Float32Array([
                                basePosition.x, basePosition.y, basePosition.z,
                                handlePosition.x, handlePosition.y, handlePosition.z
                            ])}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color={color} transparent opacity={0.5} />
                </line>
            </group>

            {/* Optional Label */}
            {(dragging || hovered || label) && (
                <Html position={[0, 4, 0]} center>
                    <div className="bg-black/70 text-white px-2 py-1 rounded text-[10px] whitespace-nowrap pointer-events-none border border-white/20">
                        {label || `${distance} mm`}
                    </div>
                </Html>
            )}
        </group>
    );
};

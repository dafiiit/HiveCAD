import { useRef, useState, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ArcballControls, Grid, PerspectiveCamera, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, CADObject } from "../../hooks/useCADStore";
import SketchCanvas from "./SketchCanvas";
import type { ArcballControls as ArcballControlsImpl } from "three-stdlib";

interface ViewportProps {
  isSketchMode: boolean;
}

// Z-up to Y-up rotation: -90° around X axis
// This allows Replicad Z-up geometry to display correctly while keeping ArcballControls stable
const Z_UP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

// Grid helper component
// Grid is defined in Z-up coordinates (XY is ground), rotation applied by parent ZUpContainer
const CADGrid = ({ isSketchMode }: { isSketchMode: boolean }) => {
  return (
    <>
      {/* Main grid - on XY plane (ground in Z-up) */}
      <Grid
        args={[200, 200]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#3a4a5a"
        sectionSize={25}
        sectionThickness={1}
        sectionColor="#4a5a6a"
        fadeDistance={400}
        fadeStrength={1}
        infiniteGrid
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* Axis lines - Z-up coordinate system (Z is up, XY is ground) */}
      <group>
        {/* X axis - Red */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([-100, 0, 0, 100, 0, 0])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#e05555" linewidth={2} />
        </line>

        {/* Y axis - Green */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([0, -100, 0, 0, 100, 0])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#55e055" linewidth={2} />
        </line>

        {/* Z axis - Blue (UP in Replicad/CAD) */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([0, 0, -100, 0, 0, 100])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#5577ee" linewidth={2} />
        </line>
      </group>

      {/* Sketch mode grid overlay - moved to SketchCanvas for proper rotation */}
    </>
  );
};

const SceneObjects = () => {
  const objects = useCADStore((state) => state.objects);

  return (
    <group>
      {objects.map((obj) => (
        <CADObjectRenderer key={obj.id} object={obj} />
      ))}
    </group>
  );
};

const CADObjectRenderer = ({ object }: { object: CADObject }) => {
  const selectObject = useCADStore((state) => state.selectObject);
  const selectedIds = useCADStore((state) => state.selectedIds);
  const isSketch = object.type === 'sketch';
  const isSelected = selectedIds.has(object.id);

  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const IS_CLICK_THRESHOLD = 5;

  const handlePointerDown = (e: any) => {
    // Record start position
    if (e.button === 0) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY
      };
    }
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();

    // Check click validity
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      dragStartRef.current = null;

      if (dist > IS_CLICK_THRESHOLD) return;
    }

    // Check if shift is held for multi-select
    const multiSelect = e.nativeEvent?.shiftKey || false;
    selectObject(object.id, multiSelect);
  };

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'default';
  };

  return (
    <group position={object.position} rotation={object.rotation} scale={object.scale}>
      {object.geometry && (
        <mesh
          geometry={object.geometry}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <meshStandardMaterial
            color={isSelected ? '#80c0ff' : object.color}
            metalness={0.1}
            roughness={0.8}
            transparent={isSketch || isSelected}
            opacity={isSketch ? 0.3 : 1.0}
            side={THREE.DoubleSide}
            emissive={isSelected ? '#4080ff' : '#000000'}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </mesh>
      )}
      {object.edgeGeometry && (
        <lineSegments geometry={object.edgeGeometry}>
          <lineBasicMaterial
            color={isSelected ? '#80c0ff' : (isSketch ? "#00ffff" : "#222222")}
            transparent={isSketch}
            opacity={isSketch ? 0.8 : 1.0}
            depthTest={true}
          />
        </lineSegments>
      )}
    </group>
  );
};


// Camera controller - handles sketch mode camera orientation only
// Camera positions are in Y-up (Three.js) space, content is rotated to Z-up
const CameraController = ({ controlsRef }: { controlsRef: React.RefObject<ArcballControlsImpl | null> }) => {
  const { camera } = useThree();
  const { sketchPlane, isSketchMode, sketchOptions } = useCADStore();
  const lastPlaneRef = useRef<string | null>(null);

  useEffect(() => {
    // Only run when sketch mode + plane changes
    if (!isSketchMode || !sketchPlane || sketchPlane === lastPlaneRef.current) return;
    lastPlaneRef.current = sketchPlane;

    if (!sketchOptions.lookAt) return;

    const controls = controlsRef.current;
    if (!controls) return;

    // Position camera in Y-up space to view Z-up planes (content is rotated)
    // After Z_UP_ROTATION: XY (Z-up ground) becomes XZ (Y-up ground)
    const dist = 100;

    // We need to update the camera position AND the target
    // controls.reset() resets to default target (0,0,0) and default camera pos? No, to initial.
    // We want to force a specific view.

    if (sketchPlane === 'XY') {
      // XY in Z-up is the ground plane -> look from above (Y+ in Y-up)
      camera.position.set(0, dist, 0);
      camera.up.set(0, 0, -1); // Rotate so "Top" is readable
    } else if (sketchPlane === 'XZ') {
      // XZ in Z-up is front plane -> after rotation becomes XY in Y-up -> look from Z+
      camera.position.set(0, 0, dist);
      camera.up.set(0, 1, 0);
    } else if (sketchPlane === 'YZ') {
      // YZ in Z-up is right plane -> look from X+
      camera.position.set(dist, 0, 0);
      camera.up.set(0, 1, 0);
    }

    // Ensure we are looking at the center
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

  }, [isSketchMode, sketchPlane, controlsRef, camera, sketchOptions.lookAt]);

  // Reset tracking when exiting sketch mode
  useEffect(() => {
    if (!isSketchMode && lastPlaneRef.current) {
      lastPlaneRef.current = null;
    }
  }, [isSketchMode]);

  return null;
};

// Plane selector - planes are in Z-up coordinates, parent ZUpContainer applies rotation
const PlaneSelector = () => {
  const { sketchStep, setSketchPlane, isSketchMode } = useCADStore();
  const [hoveredPlane, setHoveredPlane] = useState<string | null>(null);

  if (!isSketchMode || sketchStep !== 'select-plane') return null;

  const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
    setSketchPlane(plane);
  };

  return (
    <group>
      {/* XY Plane - ground in Z-up (Blue) */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('XY'); }}
        onPointerOut={() => setHoveredPlane(null)}
        onClick={(e) => { e.stopPropagation(); handlePlaneClick('XY'); }}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial
          color="#5577ee"
          transparent
          opacity={hoveredPlane === 'XY' ? 0.5 : 0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* XZ Plane - front in Z-up (Red) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
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
        />
      </mesh>

      {/* YZ Plane - right in Z-up (Green) */}
      <mesh
        rotation={[0, Math.PI / 2, 0]}
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
        />
      </mesh>
    </group>
  );
};

// Extrusion Preview - shows a semi-transparent preview when extrusion operation is active
const ExtrusionPreview = () => {
  const activeOperation = useCADStore((state) => state.activeOperation);
  const objects = useCADStore((state) => state.objects);

  // Only show preview for extrusion-type operations
  if (!activeOperation) return null;
  if (activeOperation.type !== 'extrusion' && activeOperation.type !== 'extrude' && activeOperation.type !== 'revolve') {
    return null;
  }

  const { params } = activeOperation;
  const selectedShapeId = params?.selectedShape;
  const distance = params?.distance || 10;

  if (!selectedShapeId) return null;

  // Find the source object
  const sourceObject = objects.find(obj => obj.id === selectedShapeId);
  if (!sourceObject || !sourceObject.geometry) return null;

  // For the preview, we'll create a simple extrusion visualization
  // by displaying a scaled version of the original geometry offset along Y axis
  // In a full implementation, this would use replicad to generate actual preview geometry

  return (
    <group position={sourceObject.position}>
      {/* Preview mesh - semi-transparent */}
      <mesh
        geometry={sourceObject.geometry}
        position={[0, distance / 2, 0]}
        scale={[1, distance / 2, 1]}
      >
        <meshStandardMaterial
          color="#80c0ff"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Top cap indicator */}
      <mesh
        geometry={sourceObject.geometry}
        position={[0, distance, 0]}
      >
        <meshStandardMaterial
          color="#80c0ff"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>

      {/* Direction arrow / indicator line */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, 0, 0, 0, distance, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#80c0ff" linewidth={2} />
      </line>

      {/* Arrow head at the end */}
      <mesh position={[0, distance, 0]}>
        <coneGeometry args={[1.5, 3, 8]} />
        <meshStandardMaterial color="#80c0ff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
};



const Viewport = ({ isSketchMode }: ViewportProps) => {
  const controlsRef = useRef<ArcballControlsImpl>(null);

  return (
    <div className="cad-viewport w-full h-full">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        style={{ background: "hsl(210, 30%, 16%)" }}
      >
        {/* Camera - stays Y-up for stable ArcballControls */}
        <PerspectiveCamera
          makeDefault
          position={[50, 50, 50]}
          fov={45}
          near={0.1}
          far={2000}
        />

        {/* Lighting - outside rotation group for consistent lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 50, 25]} intensity={0.8} />
        <directionalLight position={[-30, -30, -30]} intensity={0.3} />

        {/* Z-up content container - rotates Z-up content to display in Y-up Three.js */}
        <group rotation={Z_UP_ROTATION}>
          <CADGrid isSketchMode={isSketchMode} />
          <PlaneSelector />
          <SceneObjects />
          <ExtrusionPreview />
          <SketchCanvas />
        </group>

        {/* Controls - Y-up compatible */}
        <ArcballControls
          ref={controlsRef}
          makeDefault
          cursorZoom={true}
          minDistance={5}
          maxDistance={500}
        />

        {/* Camera controller for sketch mode */}
        <CameraController controlsRef={controlsRef} />

        {/* ViewCube - outside rotation for correct orientation labels */}
        <GizmoHelper
          alignment="top-right"
          margin={[80, 80]}
        >
          <GizmoViewcube
            color="#1a1a2e"
            hoverColor="#80c0ff"
            textColor="#ffffff"
            strokeColor="#8ab4f8"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
};

export default Viewport;

import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ArcballControls, Grid, PerspectiveCamera, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, CADObject } from "../../hooks/useCADStore";
import SketchCanvas from "./SketchCanvas";

interface ViewportProps {
  isSketchMode: boolean;
}

// Grid helper component
const CADGrid = ({ isSketchMode }: { isSketchMode: boolean }) => {
  return (
    <>
      {/* Main grid */}
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
      />

      {/* Axis lines */}
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

        {/* Z axis - Blue */}
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

      {/* Sketch mode grid overlay */}
      {isSketchMode && (
        <Grid
          args={[200, 200]}
          cellSize={2.5}
          cellThickness={0.3}
          cellColor="#4a6080"
          sectionSize={12.5}
          sectionThickness={0.6}
          sectionColor="#5a7090"
          fadeDistance={200}
          position={[0, 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}
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
  const isSketch = object.type === 'sketch';

  return (
    <group position={object.position} rotation={object.rotation} scale={object.scale}>
      {object.geometry && (
        <mesh geometry={object.geometry}>
          <meshStandardMaterial
            color={object.color}
            metalness={0.1}
            roughness={0.8}
            transparent={isSketch}
            opacity={isSketch ? 0.3 : 1.0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {object.edgeGeometry && (
        <lineSegments geometry={object.edgeGeometry}>
          <lineBasicMaterial
            color={isSketch ? "#00ffff" : "#222222"}
            transparent={isSketch}
            opacity={isSketch ? 0.8 : 1.0}
            depthTest={true}
          />
        </lineSegments>
      )}
    </group>
  );
};

// Camera controller - handles camera sync between ViewCube and Viewport
const CameraController = () => {
  const { camera } = useThree();
  const { sketchPlane, isSketchMode, cameraRotation, setCameraRotation } = useCADStore();
  const lastPlaneRef = useRef<string | null>(null);
  const lastUpdateFromCubeRef = useRef<string>("");
  const isUserDraggingRef = useRef(false);

  useFrame(() => {
    // Sketch mode camera orientation takes priority
    if (isSketchMode && sketchPlane && sketchPlane !== lastPlaneRef.current) {
      lastPlaneRef.current = sketchPlane;

      // Move camera to face the selected plane
      const dist = 100;
      if (sketchPlane === 'XY') {
        // XY is Top View (Red/Green axes)
        camera.position.set(0, dist, 0);
        camera.up.set(0, 0, -1);
      } else if (sketchPlane === 'XZ') {
        // XZ is Front View (Red/Blue axes)
        camera.position.set(0, 0, dist);
        camera.up.set(0, 1, 0);
      } else if (sketchPlane === 'YZ') {
        // YZ is Right View (Green/Blue axes)
        camera.position.set(dist, 0, 0);
        camera.up.set(0, 1, 0);
      }
      camera.lookAt(0, 0, 0);
      return;
    }

    // Reset tracking when exiting sketch mode
    if (!isSketchMode && lastPlaneRef.current) {
      lastPlaneRef.current = null;
    }

    // Sync camera position from cameraRotation state (set by ViewCube)
    if (cameraRotation) {
      const rotationKey = `${cameraRotation.x.toFixed(4)},${cameraRotation.y.toFixed(4)}`;

      if (rotationKey !== lastUpdateFromCubeRef.current) {
        lastUpdateFromCubeRef.current = rotationKey;

        // Convert spherical coordinates to camera position
        const distance = camera.position.length() || 100;
        const x = distance * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
        const y = distance * Math.sin(cameraRotation.x);
        const z = distance * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);

        camera.position.set(x, y, z);
        camera.lookAt(0, 0, 0);
      }
    }
  });

  return null;
};

const PlaneSelector = () => {
  const { sketchStep, setSketchPlane } = useCADStore();
  const [hoveredPlane, setHoveredPlane] = useState<string | null>(null);
  const { camera } = useThree();

  if (sketchStep !== 'select-plane') return null;

  const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
    // setSketchPlane(plane);
    // For now, keep simple plane selection. The Arcball will eventually adapt.
    setSketchPlane(plane);

    // Animate camera to look at the plane
    // This is a simple instantaneous move for now, animation can be added with useFrame
    const dist = 100;
    if (plane === 'XY') {
      // Top
      camera.position.set(0, dist, 0);
      camera.up.set(0, 0, -1);
    } else if (plane === 'XZ') {
      // Front
      camera.position.set(0, 0, dist);
      camera.up.set(0, 1, 0);
    } else if (plane === 'YZ') {
      // Right
      camera.position.set(dist, 0, 0);
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(0, 0, 0);
  };

  return (
    <group>
      {/* XY Plane (Front in standard Z-up, but usually XY is Top in math? 
          Standard CAD: Z is up. XY is ground. XZ is Front. YZ is Right. 
          Replicad/OCCT default: Z is up.
      */}

      {/* XY Plane - Blueish - Ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
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

      {/* XZ Plane - Redish - Front */}
      <mesh
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

      {/* YZ Plane - Greenish - Right */}
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

// GizmoHelper + GizmoViewcube are now used instead of custom camera sync
// They render in a HUD overlay and directly use the main camera

const Viewport = ({ isSketchMode }: ViewportProps) => {
  return (
    <div className="cad-viewport w-full h-full">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        style={{ background: "hsl(210, 30%, 16%)" }}
      >
        <PerspectiveCamera
          makeDefault
          position={[50, 40, 50]}
          fov={45}
          near={0.1}
          far={2000}
        />

        <PlaneSelector />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 50, 25]} intensity={0.8} />
        <directionalLight position={[-30, -30, -30]} intensity={0.3} />

        {/* Grid */}
        <CADGrid isSketchMode={isSketchMode} />

        {/* Real CAD objects */}
        <SceneObjects />

        {/* Controls */}
        {/* Controls */}
        <ArcballControls
          makeDefault
          dampingFactor={100} // High damping to simulate no inertia
          cursorZoom={true}
          minDistance={5}
          maxDistance={500}
        />

        <SketchCanvas />

        {/* ViewCube using drei's GizmoHelper - renders in HUD overlay with smooth animations */}
        <GizmoHelper
          alignment="top-right"
          margin={[80, 80]}
        >
          <GizmoViewcube
            faces={['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']}
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

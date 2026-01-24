import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, PerspectiveCamera } from "@react-three/drei";
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
            transparent
            opacity={isSketch ? 0.3 : 0.85}
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

// Camera controller
const CameraController = () => {
  const { camera } = useThree();

  useFrame(() => {
    // Camera updates if needed
  });

  return null;
};

const PlaneSelector = () => {
  const { sketchStep, setSketchPlane } = useCADStore();
  const [hoveredPlane, setHoveredPlane] = useState<string | null>(null);
  const { camera } = useThree();

  if (sketchStep !== 'select-plane') return null;

  const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
    setSketchPlane(plane);

    // Animate camera to look at the plane
    // This is a simple instantaneous move for now, animation can be added with useFrame
    const dist = 100;
    if (plane === 'XY') {
      camera.position.set(0, 0, dist);
      camera.up.set(0, 1, 0);
    } else if (plane === 'XZ') {
      camera.position.set(0, dist, 0);
      camera.up.set(0, 0, -1); // Standard CAD View
    } else if (plane === 'YZ') {
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
        position={[0, 20, 0]} // Just to visualize center? No center is 0.
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
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          panSpeed={0.5}
          zoomSpeed={0.8}
          minDistance={5}
          maxDistance={500}
        />

        <SketchCanvas />

        <CameraController />
      </Canvas>
    </div>
  );
};

export default Viewport;

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

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

// Sample 3D object for demo
const SampleGeometry = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  return (
    <group position={[0, 0, 0]}>
      {/* A simple box as placeholder geometry */}
      <mesh ref={meshRef} position={[0, 5, 0]}>
        <boxGeometry args={[10, 10, 10]} />
        <meshStandardMaterial 
          color="#6090c0" 
          metalness={0.3} 
          roughness={0.7}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Edges */}
      <lineSegments position={[0, 5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(10, 10, 10)]} />
        <lineBasicMaterial color="#80b0e0" />
      </lineSegments>
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

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 50, 25]} intensity={0.8} />
        <directionalLight position={[-30, -30, -30]} intensity={0.3} />

        {/* Grid */}
        <CADGrid isSketchMode={isSketchMode} />

        {/* Sample geometry - replace with actual CAD objects */}
        <SampleGeometry />

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

        <CameraController />
      </Canvas>
    </div>
  );
};

export default Viewport;

import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ArcballControls, Grid, PerspectiveCamera } from "@react-three/drei";
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

const CameraSync = () => {
  const { camera } = useThree();
  const setCameraQuaternion = useCADStore(state => state.setCameraQuaternion);
  const cameraQuaternion = useCADStore(state => state.cameraQuaternion); // Read from store to avoid loop

  const lastQuaternionRef = useRef<string>("");

  useFrame(() => {
    // Sync using Quaternions to support full 3D rotation (including roll)
    const q = camera.quaternion;
    const quatKey = `${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)},${q.w.toFixed(4)}`;

    // Only update if changed (to avoid infinite loops)
    if (quatKey !== lastQuaternionRef.current) {

      // CHECK: Did this change come from the store?
      // If the current camera quaternion matches the store quaternion (within epsilon), don't write back.
      // This breaks the loop: ViewCube -> Store -> Viewport -> Store -> ...
      let matchesStore = false;
      if (cameraQuaternion) {
        const dq = q.dot(new THREE.Quaternion().fromArray(cameraQuaternion));
        // Dot product of quats: 1 = same, -1 = same (double cover), 0 = 90 deg.
        if (Math.abs(dq) > 0.9999) {
          matchesStore = true;
        }
      }

      if (!matchesStore) {
        lastQuaternionRef.current = quatKey;
        setCameraQuaternion([q.x, q.y, q.z, q.w]);
      } else {
        // It matches store, so we update our ref to match current state but don't dispatch
        lastQuaternionRef.current = quatKey;
      }
    }
  });

  return null;
};

// Component to LISTEN to store updates and force-apply to ArcballControls
// This was previously done by CameraController but logic needs to be robust for Arcball
const StoreToCameraSync = () => {
  const { camera } = useThree();
  const cameraQuaternion = useCADStore(state => state.cameraQuaternion);
  const lastAppliedQuatRef = useRef<string>("");

  useFrame(() => {
    if (cameraQuaternion) {
      const quatKey = `${cameraQuaternion[0].toFixed(4)},${cameraQuaternion[1].toFixed(4)},${cameraQuaternion[2].toFixed(4)},${cameraQuaternion[3].toFixed(4)}`;

      if (quatKey !== lastAppliedQuatRef.current) {
        // Store changed! Apply to camera.

        // Check if camera is ALREADY there (e.g. we dragged it)
        const currentQ = camera.quaternion;
        const dq = currentQ.dot(new THREE.Quaternion().fromArray(cameraQuaternion));
        if (Math.abs(dq) < 0.9999) {
          // Difference is significant, apply store value
          const newQ = new THREE.Quaternion().fromArray(cameraQuaternion);

          // ARCBALL HACK: Arcball rotates camera AROUND target (0,0,0) usually.
          // Just setting quaternion rotates the camera in place, but doesn't move it on the sphere surface.
          // We need to move the camera position too!
          const dist = camera.position.length();
          const newPos = new THREE.Vector3(0, 0, dist).applyQuaternion(newQ);
          camera.position.copy(newPos);
          camera.quaternion.copy(newQ);
          camera.updateMatrixWorld();

          lastAppliedQuatRef.current = quatKey;
        } else {
          // Camera is already there, just update ref
          lastAppliedQuatRef.current = quatKey;
        }
      }
    }
  });
  return null;
}

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

        {/* <CameraController />  Replaced by StoreToCameraSync for cleaner split */}
        <StoreToCameraSync />
        <CameraSync />
      </Canvas>
    </div>
  );
};

export default Viewport;

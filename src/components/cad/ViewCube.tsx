import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Home } from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";

interface ViewCubeProps {
  onViewChange?: (view: string) => void;
}

// The cube mesh with colored faces
const CubeMesh = ({ onFaceClick, hoveredFace, setHoveredFace }: {
  onFaceClick: (face: string) => void;
  hoveredFace: string | null;
  setHoveredFace: (face: string | null) => void;
}) => {
  // Face colors matching the plane colors
  // Blue = XY (top/bottom), Red = XZ (front/back), Green = YZ (left/right)
  const faceColors = {
    front: "#e05555",   // XZ Front - Red
    back: "#cc3333",    // XZ Back - Dark Red
    right: "#55e055",   // YZ Right - Green
    left: "#33cc33",    // YZ Left - Dark Green
    top: "#5577ee",     // XY Top - Blue
    bottom: "#3355cc",  // XY Bottom - Dark Blue
  };

  // Face definitions: name, position offset, rotation
  const faces: {
    name: string;
    position: [number, number, number];
    rotation: [number, number, number];
    color: string;
  }[] = [
      { name: "front", position: [0, 0, 0.51], rotation: [0, 0, 0], color: faceColors.front },
      { name: "back", position: [0, 0, -0.51], rotation: [0, Math.PI, 0], color: faceColors.back },
      { name: "right", position: [0.51, 0, 0], rotation: [0, Math.PI / 2, 0], color: faceColors.right },
      { name: "left", position: [-0.51, 0, 0], rotation: [0, -Math.PI / 2, 0], color: faceColors.left },
      { name: "top", position: [0, 0.51, 0], rotation: [-Math.PI / 2, 0, 0], color: faceColors.top },
      { name: "bottom", position: [0, -0.51, 0], rotation: [Math.PI / 2, 0, 0], color: faceColors.bottom },
    ];

  return (
    <group>
      {/* Solid inner cube to prevent seeing through edges */}
      <mesh>
        <boxGeometry args={[0.96, 0.96, 0.96]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>

      {/* Edge wireframe for cube outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
        <lineBasicMaterial color="#8ab4f8" linewidth={2} />
      </lineSegments>

      {/* Colored face planes */}
      {faces.map(face => (
        <mesh
          key={face.name}
          position={face.position}
          rotation={face.rotation}
          onPointerEnter={(e) => { e.stopPropagation(); setHoveredFace(face.name); }}
          onPointerLeave={() => setHoveredFace(null)}
          onClick={(e) => { e.stopPropagation(); onFaceClick(face.name); }}
        >
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial
            color={hoveredFace === face.name ? "#80c0ff" : face.color}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// Camera sync component - syncs ViewCube camera with main viewport
const CameraSyncer = () => {
  const { camera } = useThree();
  const cameraQuaternion = useCADStore(state => state.cameraQuaternion);
  const lastQuaternionRef = useRef<string>("");

  useFrame(() => {
    // Check if main viewport camera rotation changed (via quaternion)
    if (cameraQuaternion) {
      const quatKey = `${cameraQuaternion[0].toFixed(4)},${cameraQuaternion[1].toFixed(4)},${cameraQuaternion[2].toFixed(4)},${cameraQuaternion[3].toFixed(4)}`;

      // Only update if rotation is different (to avoid feedback loops)
      if (quatKey !== lastQuaternionRef.current) {
        lastQuaternionRef.current = quatKey;

        // --- PREVENT WRITING BACK TO STORE ---
        // If we are updating ViewCube FROM store, we must NOT let ViewCube controls write back to store immediately.
        // (However, ViewCubeControls only writes on drag, so this might be safe).

        // Position camera at distance 3 from origin, apply rotation
        const distance = 3;
        const q = new THREE.Quaternion().fromArray(cameraQuaternion);

        const v = new THREE.Vector3(0, 0, distance);
        v.applyQuaternion(q);

        camera.position.copy(v);
        camera.quaternion.copy(q);
        camera.updateMatrixWorld();
      }
    }
  });

  return null;
};

// Orbit controls handler for ViewCube dragging
const ViewCubeControls = ({ onRotationChange }: { onRotationChange: (x: number, y: number, z: number, w: number) => void }) => {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const isDragging = useRef(false);

  useFrame(() => {
    // Only send rotation updates when user is actively dragging the ViewCube
    if (controlsRef.current && isDragging.current) {
      // We need to pass the quaternion
      // But the prop is (x, y). We should change the interface or ignore it and do logic here?
      // Let's rely on stored state or ref?
      // Actually, we should change the parent to accept Quaternion.
      // For minimal refactor, let's just NOT do anything here and rely on a sync component? 
      // No, we need to push changes to the store.

      const q = camera.quaternion;
      onRotationChange(q.x, q.y, q.z, q.w);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={false}
      enablePan={false}
      rotateSpeed={0.5}
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI - 0.1}
      onStart={() => { isDragging.current = true; }}
      onEnd={() => { isDragging.current = false; }}
    />
  );
};

const ViewCube = ({ onViewChange }: ViewCubeProps) => {
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);
  const setCameraQuaternion = useCADStore(state => state.setCameraQuaternion);
  const setView = useCADStore(state => state.setView);

  const handleFaceClick = (face: string) => {
    // Set standard view based on clicked face
    const views: Record<string, { x: number; y: number }> = {
      front: { x: 0, y: 0 },
      back: { x: 0, y: Math.PI },
      right: { x: 0, y: Math.PI / 2 },
      left: { x: 0, y: -Math.PI / 2 },
      top: { x: Math.PI / 2, y: 0 },
      bottom: { x: -Math.PI / 2, y: 0 },
    };

    const view = views[face];
    if (view) {
      // Create quaternion from Euler (XZ view logic is specific)
      // ViewCube logic was: x=polar, y=azimuth.
      // We need to convert this "idea" to a quaternion that Arcball respects.
      // Note: Arcball is free, so "up" changes. 
      // It's safer to just set the position and LookAt, then capture the Quaternion?
      // Or construct the Quaternion manually.

      // Let's use a temporary dummy object to compute the quaternion
      const distance = 50; // Arbitrary distance
      const dummyCam = new THREE.Object3D();

      // Calculate position from spherical coords (ViewCube logic match)
      const x = view.x;
      const y = view.y;

      const px = distance * Math.sin(y) * Math.cos(x);
      const py = distance * Math.sin(x);
      const pz = distance * Math.cos(y) * Math.cos(x);

      dummyCam.position.set(px, py, pz);
      dummyCam.lookAt(0, 0, 0);
      dummyCam.updateMatrix();

      // Force update by setting a new array reference
      const newQuat: [number, number, number, number] = [dummyCam.quaternion.x, dummyCam.quaternion.y, dummyCam.quaternion.z, dummyCam.quaternion.w];
      setCameraQuaternion(newQuat);
    }

    onViewChange?.(face);
    setView(face as any);
  };

  const handleRotationChange = (x: number, y: number, z: number, w: number) => {
    setCameraQuaternion([x, y, z, w]);
  };

  const handleHomeClick = () => {
    // Isometric home view
    // Calculate iso quaternion
    const dummyCam = new THREE.Object3D();
    dummyCam.position.set(50, 40, 50); // Matches default Viewport camera pos
    dummyCam.lookAt(0, 0, 0);
    setCameraQuaternion([dummyCam.quaternion.x, dummyCam.quaternion.y, dummyCam.quaternion.z, dummyCam.quaternion.w]);
    onViewChange?.("home");
    setView("home");
  };

  return (
    <div className="cad-viewcube select-none">
      {/* Home button - positioned to the left */}
      <button
        className="absolute -top-1 -left-8 p-1.5 hover:bg-secondary/80 rounded-lg transition-colors bg-panel/80 border border-border/50"
        onClick={handleHomeClick}
        title="Home View"
      >
        <Home className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* 3D Cube Canvas */}
      <Canvas
        camera={{ position: [2, 1.5, 2], fov: 40 }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-3, -3, -3]} intensity={0.3} />

        <CubeMesh
          onFaceClick={handleFaceClick}
          hoveredFace={hoveredFace}
          setHoveredFace={setHoveredFace}
        />

        <ViewCubeControls onRotationChange={handleRotationChange} />
        <CameraSyncer />
      </Canvas>
    </div>
  );
};

export default ViewCube;

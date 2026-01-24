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
    if (cameraQuaternion) {
      const quatKey = `${cameraQuaternion[0].toFixed(4)},${cameraQuaternion[1].toFixed(4)},${cameraQuaternion[2].toFixed(4)},${cameraQuaternion[3].toFixed(4)}`;

      // Only update if rotation is different (to avoid feedback loops)
      if (quatKey !== lastQuaternionRef.current) {
        lastQuaternionRef.current = quatKey;

        const distance = 3;
        const q = new THREE.Quaternion().fromArray(cameraQuaternion);

        // Calculate camera position from quaternion
        // The camera should look at origin from a distance
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(q);

        camera.position.copy(direction.multiplyScalar(distance));
        camera.quaternion.copy(q);
        camera.lookAt(0, 0, 0);
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
    const distance = 50;
    const dummyCam = new THREE.Object3D();

    // Default up vector
    dummyCam.up.set(0, 1, 0);

    // Determine position based on face
    switch (face) {
      case "front":
        dummyCam.position.set(0, 0, distance);
        break;
      case "back":
        dummyCam.position.set(0, 0, -distance);
        break;
      case "right":
        dummyCam.position.set(distance, 0, 0);
        break;
      case "left":
        dummyCam.position.set(-distance, 0, 0);
        break;
      case "top":
        dummyCam.position.set(0, distance, 0);
        dummyCam.up.set(0, 0, -1); // Adjust up vector for top view
        break;
      case "bottom":
        dummyCam.position.set(0, -distance, 0);
        dummyCam.up.set(0, 0, 1); // Adjust up vector for bottom view
        break;
    }

    dummyCam.lookAt(0, 0, 0);
    dummyCam.updateMatrix();

    const newQuat: [number, number, number, number] = [
      dummyCam.quaternion.x,
      dummyCam.quaternion.y,
      dummyCam.quaternion.z,
      dummyCam.quaternion.w
    ];

    setCameraQuaternion(newQuat);
    onViewChange?.(face);
    setView(face as any);
  };

  const handleRotationChange = (x: number, y: number, z: number, w: number) => {
    setCameraQuaternion([x, y, z, w]);
  };

  const handleHomeClick = () => {
    const dummyCam = new THREE.Object3D();
    dummyCam.position.set(50, 40, 50); // Matches default Viewport camera pos
    dummyCam.up.set(0, 1, 0);
    dummyCam.lookAt(0, 0, 0);
    dummyCam.updateMatrix();

    setCameraQuaternion([
      dummyCam.quaternion.x,
      dummyCam.quaternion.y,
      dummyCam.quaternion.z,
      dummyCam.quaternion.w
    ]);
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

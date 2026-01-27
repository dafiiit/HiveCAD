import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ArcballControls, Grid, PerspectiveCamera, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, useCADStoreApi, CADObject } from "../../hooks/useCADStore";
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from "sonner";
import { GitHubTokenDialog } from "../ui/GitHubTokenDialog";
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
  if (isSketchMode) return null;
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

const FaceHighlighter = ({ object, faceIds }: { object: CADObject, faceIds: number[] }) => {
  const geometry = React.useMemo(() => {
    if (!object.geometry || !object.faceMapping) return null;

    const subset = new THREE.BufferGeometry();
    subset.setAttribute('position', object.geometry.getAttribute('position'));
    if (object.geometry.attributes.normal) {
      subset.setAttribute('normal', object.geometry.getAttribute('normal'));
    }

    const indices: number[] = [];
    const indexAttr = object.geometry.index;

    if (!indexAttr) return null;

    faceIds.forEach(fid => {
      const mapping = object.faceMapping?.find(m => m.faceId === fid);
      if (mapping) {
        for (let i = 0; i < mapping.count; i++) {
          indices.push(indexAttr.getX(mapping.start + i));
        }
      }
    });

    if (indices.length === 0) return null;
    subset.setIndex(indices);
    return subset;
  }, [object, faceIds]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#ffaa00"
        transparent
        opacity={0.5}
        depthTest={false} // Overlay effect
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const EdgeHighlighter = ({ object, edgeIds }: { object: CADObject, edgeIds: number[] }) => {
  const geometry = React.useMemo(() => {
    if (!object.edgeGeometry || !object.edgeMapping) return null;

    const subset = new THREE.BufferGeometry();
    const posAttr = object.edgeGeometry.getAttribute('position');
    const positions: number[] = [];

    edgeIds.forEach(eid => {
      const mapping = object.edgeMapping?.find(m => m.edgeId === eid);
      if (mapping) {
        for (let i = 0; i < mapping.count; i++) {
          positions.push(posAttr.getX(mapping.start + i));
          positions.push(posAttr.getY(mapping.start + i));
          positions.push(posAttr.getZ(mapping.start + i));
        }
      }
    });

    if (positions.length === 0) return null;
    subset.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return subset;
  }, [object, edgeIds]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial color="#ffff00" linewidth={3} depthTest={false} />
    </lineSegments>
  );
};

const CADObjectRenderer = ({ object }: { object: CADObject }) => {
  const { selectObject, selectedIds, isSketchMode, sketchPlane, sketchesVisible, bodiesVisible, originVisible } = useCADStore();
  const isSketch = object.type === 'sketch';
  const isSelected = selectedIds.has(object.id);
  const isAxis = object.type === 'datumAxis';

  // Identify sub-selections
  const selectedFaces = React.useMemo(() => {
    const faces: number[] = [];
    selectedIds.forEach(id => {
      if (id.startsWith(object.id + ':face-')) {
        const faceId = parseInt(id.split(':face-')[1]);
        if (!isNaN(faceId)) faces.push(faceId);
      }
    });
    return faces;
  }, [selectedIds, object.id]);

  const selectedEdges = React.useMemo(() => {
    const edges: number[] = [];
    selectedIds.forEach(id => {
      if (id.startsWith(object.id + ':edge-')) {
        const edgeId = parseInt(id.split(':edge-')[1]);
        if (!isNaN(edgeId)) edges.push(edgeId);
      }
    });
    return edges;
  }, [selectedIds, object.id]);

  // Check if this axis is normal to the current sketch plane (to hide it for better visibility)
  const isNormalAxisToSketch = (
    (sketchPlane === 'XY' && object.id === 'AXIS_Z') ||
    (sketchPlane === 'XZ' && object.id === 'AXIS_Y') ||
    (sketchPlane === 'YZ' && object.id === 'AXIS_X')
  );

  // Axes are ONLY selectable via the Sidebar Browser
  const isSelectableType = object.type !== 'datumAxis';

  // Determine visibility based on object type, folder visibility, and individual visibility
  let shouldBeVisible = object.visible;

  if (isAxis) {
    shouldBeVisible = shouldBeVisible && originVisible && !(isSketchMode && isNormalAxisToSketch);
  } else if (isSketch) {
    shouldBeVisible = shouldBeVisible && sketchesVisible;
  } else {
    // Bodies or other objects
    shouldBeVisible = shouldBeVisible && bodiesVisible;
  }

  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const IS_CLICK_THRESHOLD = 5;

  const handlePointerDown = (e: any) => {
    if (!isSelectableType) return;
    // Record start position
    if (e.button === 0) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY
      };
    }
  };

  const handlePointerUp = (e: any) => {
    if (!isSelectableType) return;
    e.stopPropagation();

    // Check click validity
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      dragStartRef.current = null;

      if (dist > IS_CLICK_THRESHOLD) return;
    }

    // Determine Selection ID
    let selectionId = object.id;

    // Check Sub-Selection
    if (e.object.type === 'Mesh' && object.faceMapping && e.faceIndex !== undefined) {
      const triangleStartIndex = e.faceIndex * 3;
      const face = object.faceMapping.find(m => triangleStartIndex >= m.start && triangleStartIndex < m.start + m.count);
      if (face) {
        selectionId = `${object.id}:face-${face.faceId}`;
      }
    } else if (e.object.type === 'LineSegments' && object.edgeMapping && e.index !== undefined) {
      // Determine edge index (segment index to float offset)
      // e.index is segment index
      const floatOffset = e.index * 6;
      const edge = object.edgeMapping.find(m => floatOffset >= m.start && floatOffset < m.start + m.count);
      if (edge) {
        selectionId = `${object.id}:edge-${edge.edgeId}`;
      }
    }

    // Check if shift is held for multi-select
    const multiSelect = e.nativeEvent?.shiftKey || false;
    selectObject(selectionId, multiSelect);
  };

  const handlePointerOver = (e: any) => {
    if (!isSelectableType) return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'default';
  };

  return (
    <group position={object.position} rotation={object.rotation} scale={object.scale} visible={shouldBeVisible}>
      {object.geometry && object.type !== 'datumAxis' && (
        <>
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
              transparent={true}
              opacity={isSketch ? 0.3 : 1.0}
              side={THREE.DoubleSide}
              emissive={isSelected ? '#4080ff' : '#000000'}
              emissiveIntensity={isSelected ? 0.3 : 0}
              polygonOffset={true}
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          </mesh>

          {selectedFaces.length > 0 && (
            <FaceHighlighter object={object} faceIds={selectedFaces} />
          )}
        </>
      )}
      {object.edgeGeometry && (
        <>
          <lineSegments
            geometry={object.edgeGeometry}
            renderOrder={0}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          >
            <lineBasicMaterial
              color={isSelected ? '#80c0ff' : (isSketch ? "#00ffff" : (object.type === 'datumAxis' ? object.color : "#222222"))}
              transparent={isSketch}
              opacity={isSketch ? 0.8 : 1.0}
              depthTest={true}
              linewidth={2}
            />
          </lineSegments>
          {selectedEdges.length > 0 && (
            <EdgeHighlighter object={object} edgeIds={selectedEdges} />
          )}
        </>
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
  const { sketchStep, setSketchPlane, isSketchMode, planeVisibility, originVisible } = useCADStore();
  const [hoveredPlane, setHoveredPlane] = useState<string | null>(null);

  // If origin is hidden, we don't show any planes unless we are in select-plane mode
  const shouldShowEverything = isSketchMode && sketchStep === 'select-plane';
  if (!shouldShowEverything && !originVisible) return null;

  const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
    setSketchPlane(plane);
  };

  return (
    <group>
      {/* XY Plane - ground in Z-up (Blue) */}
      {(shouldShowEverything || planeVisibility['XY']) && (
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('XY'); }}
          onPointerOut={() => setHoveredPlane(null)}
          onClick={(e) => { e.stopPropagation(); handlePlaneClick('XY'); }}
          visible={shouldShowEverything || (originVisible && planeVisibility['XY'])}
        >
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial
            color="#5577ee"
            transparent
            opacity={hoveredPlane === 'XY' ? 0.5 : 0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* XZ Plane - front in Z-up (Red) */}
      {(shouldShowEverything || planeVisibility['XZ']) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('XZ'); }}
          onPointerOut={() => setHoveredPlane(null)}
          onClick={(e) => { e.stopPropagation(); handlePlaneClick('XZ'); }}
          visible={shouldShowEverything || (originVisible && planeVisibility['XZ'])}
        >
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial
            color="#e05555"
            transparent
            opacity={hoveredPlane === 'XZ' ? 0.5 : 0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* YZ Plane - right in Z-up (Green) */}
      {(shouldShowEverything || planeVisibility['YZ']) && (
        <mesh
          rotation={[0, Math.PI / 2, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('YZ'); }}
          onPointerOut={() => setHoveredPlane(null)}
          onClick={(e) => { e.stopPropagation(); handlePlaneClick('YZ'); }}
          visible={shouldShowEverything || (originVisible && planeVisibility['YZ'])}
        >
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial
            color="#55e055"
            transparent
            opacity={hoveredPlane === 'YZ' ? 0.5 : 0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};

// Operation Preview - handles visualization for Extrude and Revolve
const OperationPreview = () => {
  const activeOperation = useCADStore((state) => state.activeOperation);
  const objects = useCADStore((state) => state.objects);

  if (!activeOperation) return null;

  const { type, params } = activeOperation;

  // Handle Extrusion
  if (type === 'extrusion' || type === 'extrude') {
    const selectedShapeId = params?.selectedShape || params?.profile; // 'profile' is used in new Revolve, 'selectedShape' in old Extrude
    const distance = params?.distance || 10;

    if (!selectedShapeId) return null;

    const sourceObject = objects.find(obj => obj.id === selectedShapeId);
    if (!sourceObject || !sourceObject.geometry) return null;

    const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';

    let dir: [number, number, number] = [0, 0, 1];
    let coneRotation: [number, number, number] = [Math.PI / 2, 0, 0];

    if (sketchPlane === 'XZ') {
      dir = [0, 1, 0];
      coneRotation = [0, 0, 0];
    } else if (sketchPlane === 'YZ') {
      dir = [1, 0, 0];
      coneRotation = [0, 0, -Math.PI / 2];
    }

    const offsetHalf = [dir[0] * distance / 2, dir[1] * distance / 2, dir[2] * distance / 2] as [number, number, number];
    const offsetFull = [dir[0] * distance, dir[1] * distance, dir[2] * distance] as [number, number, number];

    return (
      <group position={sourceObject.position} rotation={sourceObject.rotation}>
        <mesh geometry={sourceObject.geometry} position={offsetHalf}>
          <meshStandardMaterial color="#80c0ff" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh geometry={sourceObject.geometry} position={offsetFull}>
          <meshStandardMaterial color="#80c0ff" transparent opacity={0.6} side={THREE.DoubleSide} wireframe />
        </mesh>
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([0, 0, 0, ...offsetFull])} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#80c0ff" linewidth={2} />
        </line>
        <mesh position={offsetFull} rotation={coneRotation}>
          <coneGeometry args={[1.5, 3, 8]} />
          <meshStandardMaterial color="#80c0ff" transparent opacity={0.8} />
        </mesh>
      </group>
    );
  }

  // Handle Revolve
  if (type === 'revolve') {
    const profileId = params?.profile;
    const axisId = params?.axis; // We might not be able to fully visualize without axis data
    const angle = params?.angle || 360;

    if (!profileId) return null;

    const sourceObject = objects.find(obj => obj.id === profileId);
    if (!sourceObject || !sourceObject.geometry) return null;

    // Create "ghosts" rotated around the axis
    // Without known axis data, we default to local Y axis of the sketch? 
    // Or we try to use the selected axis object if it's a DatumAxis?

    // Basic visualization: Show 4 steps of rotation
    const steps = 6;
    const ghosts = [];
    const angleRad = (angle * Math.PI) / 180;

    // Determine rotation axis. Default to local X for now if no axis selected?
    // Or if checking sketchPlane...
    const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';
    let axisVec = new THREE.Vector3(0, 1, 0); // Default revolve axis often Y
    if (sketchPlane === 'XZ') axisVec.set(0, 0, 1); // Z

    // If we could resolve `axisId`, we would use that direction. 
    // For now, this is a "nice" enough visualization of *a* revolve.

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rotAngle = angleRad * t;

      ghosts.push(
        <group key={i} rotation={[
          axisVec.x * rotAngle,
          axisVec.y * rotAngle,
          axisVec.z * rotAngle
        ]}>
          <mesh geometry={sourceObject.geometry}>
            <meshStandardMaterial
              color="#80c0ff"
              transparent
              opacity={0.1 + (0.5 * t)}
              side={THREE.DoubleSide}
              wireframe={i === steps}
            />
          </mesh>
        </group>
      );
    }

    // Add Arcs to indicate flow?

    return (
      <group position={sourceObject.position} rotation={sourceObject.rotation}>
        {ghosts}
        {/* Axis Line Indicator (Visual only) */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                -axisVec.x * 50, -axisVec.y * 50, -axisVec.z * 50,
                axisVec.x * 50, axisVec.y * 50, axisVec.z * 50
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffaa00" linewidth={1} />
        </line>
      </group>
    );
  }

  return null;
};



const ThumbnailCapturer = forwardRef<any, { onShowExitDialog: () => void }>((props, ref) => {
  const { gl } = useThree();
  const { fileName, updateThumbnail, closeProject, code, objects, save } = useCADStore();
  const { user } = useGlobalStore();

  // Define the core exit logic
  const finalizeExit = useCallback((shouldSave: boolean) => {
    if (shouldSave) {
      console.log('[ThumbnailCapturer] Finalizing exit with save');
      const screenshot = gl.domElement.toDataURL('image/jpeg', 0.5);
      updateThumbnail(fileName, screenshot);
      save();
    } else {
      console.log('[ThumbnailCapturer] Finalizing exit with DISCARD');
    }
    closeProject();
  }, [gl, fileName, updateThumbnail, save, closeProject]);

  useImperativeHandle(ref, () => ({
    finalizeExit
  }));

  useEffect(() => {
    const handleExit = () => {
      if (fileName === 'Untitled') return;

      const isDefaultCode = code.trim() === 'const main = () => { return; };';
      const isEmpty = objects.length === 0 && isDefaultCode;

      if (isEmpty) {
        finalizeExit(false);
        return;
      }

      // If non-empty but NO PAT, trigger parent to show dialog
      if (!user?.pat) {
        props.onShowExitDialog();
        return;
      }

      // Standard exit with auto-save
      finalizeExit(true);
    };

    window.addEventListener('hivecad-exit-project', handleExit);
    return () => window.removeEventListener('hivecad-exit-project', handleExit);
  }, [fileName, code, objects.length, user?.pat, props, finalizeExit]);

  return null;
});

const Viewport = ({ isSketchMode }: ViewportProps) => {
  const controlsRef = useRef<ArcballControlsImpl>(null);
  const capturerRef = useRef<any>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const activeTool = useCADStore(state => state.activeTool);

  // Configure mouse buttons based on active tool
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // We need to cast to any because setMouseAction is marked private in three-stdlib types
    const c = controls as any;

    // Check if setMouseAction exists
    if (typeof c.setMouseAction === 'function') {
      try {
        if (activeTool === 'pan') {
          // Pan Tool: Left Click = Pan
          // Remap: Left(0) -> PAN, Right(2) -> ROTATE

          // Note: unsetMouseAction does not exist in ArcballControls, setMouseAction replaces existing bindings
          c.setMouseAction('PAN', 0); // Left = Pan
          c.setMouseAction('ROTATE', 2); // Right = Rotate
        } else {
          // Default: Left Click = Rotate
          c.setMouseAction('ROTATE', 0); // Left = Rotate
          c.setMouseAction('PAN', 2); // Right = Pan
        }
      } catch (err) {
        console.warn("Failed to configure ArcballControls:", err);
      }
    }
  }, [activeTool]);

  return (
    <div className="cad-viewport w-full h-full relative">
      <Canvas
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        style={{ background: "hsl(210, 30%, 16%)" }}
        onPointerMissed={() => useCADStoreApi().getState().clearSelection()}
      >
        <ThumbnailCapturer ref={capturerRef} onShowExitDialog={() => setShowExitDialog(true)} />
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
          <OperationPreview />
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

      <GitHubTokenDialog
        open={showExitDialog}
        onOpenChange={setShowExitDialog}
        mode="exit"
        onConfirm={() => capturerRef.current?.finalizeExit(true)}
        onSecondaryAction={() => capturerRef.current?.finalizeExit(false)}
      />
    </div>
  );
};

export default Viewport;

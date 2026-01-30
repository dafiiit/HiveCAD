import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ArcballControls, Grid, PerspectiveCamera, OrthographicCamera, GizmoHelper, GizmoViewcube, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, useCADStoreApi, CADObject } from "../../hooks/useCADStore";
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from "sonner";
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
  const gridRef = useRef<any>(null);

  React.useLayoutEffect(() => {
    if (gridRef.current) {
      gridRef.current.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
          obj.material.side = THREE.DoubleSide;
          obj.material.polygonOffset = true;
          obj.material.polygonOffsetFactor = 1;
          obj.material.polygonOffsetUnits = 1;
          obj.material.needsUpdate = true;
        }
      });
    }
  }, []);

  if (isSketchMode) return null;
  return (
    <>
      {/* Main grid - on XY plane (ground in Z-up) */}
      <Grid
        ref={gridRef}
        args={[1000, 1000]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#3a4a5a"
        sectionSize={25}
        sectionThickness={1}
        sectionColor="#4a5a6a"
        fadeDistance={4000}
        fadeStrength={1}
        infiniteGrid
        position={[0, 0, -0.01]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </>
  );
};

const SceneObjects = ({ clippingPlanes = [] }: { clippingPlanes?: THREE.Plane[] }) => {
  const objects = useCADStore((state) => state.objects);

  return (
    <group>
      {objects.map((obj) => (
        <CADObjectRenderer key={obj.id} object={obj} clippingPlanes={clippingPlanes} />
      ))}
    </group>
  );
};

const FaceHighlighter = ({ object, faceIds, clippingPlanes = [] }: { object: CADObject, faceIds: number[], clippingPlanes?: THREE.Plane[] }) => {
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
        clippingPlanes={clippingPlanes}
      />
    </mesh>
  );
};

const EdgeHighlighter = ({ object, edgeIds, clippingPlanes = [] }: { object: CADObject, edgeIds: number[], clippingPlanes?: THREE.Plane[] }) => {
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
      <lineBasicMaterial color="#ffff00" linewidth={3} depthTest={false} clippingPlanes={clippingPlanes} />
    </lineSegments>
  );
};

const VertexHighlighter = ({ object, vertexIds }: { object: CADObject, vertexIds: number[] }) => {
  const geometry = React.useMemo(() => {
    if (!object.vertexGeometry) return null;
    const posAttr = object.vertexGeometry.getAttribute('position');
    const positions: number[] = [];

    vertexIds.forEach(vid => {
      // Simple mapping: index in vertexGeometry corresponds to vertex ID
      if (vid < posAttr.count) {
        positions.push(posAttr.getX(vid), posAttr.getY(vid), posAttr.getZ(vid));
      }
    });

    if (positions.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [object.vertexGeometry, vertexIds]);

  if (!geometry) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ff0000" size={10} sizeAttenuation={false} depthTest={false} transparent opacity={0.8} />
    </points>
  );
};

const CADObjectRenderer = ({ object, clippingPlanes = [] }: { object: CADObject, clippingPlanes?: THREE.Plane[] }) => {
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

  const selectedVertices = React.useMemo(() => {
    const verts: number[] = [];
    selectedIds.forEach(id => {
      if (id.startsWith(object.id + ':vertex-')) {
        const vid = parseInt(id.split(':vertex-')[1]);
        if (!isNaN(vid)) verts.push(vid);
      }
    });
    return verts;
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

    // We use a small hack to determine what was hit:
    // R3F events 'e' have an 'intersections' array.
    // We can look for the first Point or LineSegment intersection to prioritize sub-elements.
    const prioritizedIntersection = e.intersections.find((hit: any) => hit.object.type === 'Points' || hit.object.type === 'LineSegments');

    if (prioritizedIntersection) {
      const hitObj = prioritizedIntersection.object;
      const hitIndex = prioritizedIntersection.index;

      if (hitObj.type === 'Points' && hitIndex !== undefined) {
        selectionId = `${object.id}:vertex-${hitIndex}`;
      } else if (hitObj.type === 'LineSegments' && object.edgeMapping && hitIndex !== undefined) {
        const floatOffset = hitIndex * 6;
        const edge = object.edgeMapping.find(m => floatOffset >= m.start && floatOffset < m.start + m.count);
        if (edge) {
          selectionId = `${object.id}:edge-${edge.edgeId}`;
        }
      }
    }
    // Fallback to the primary intersection (which might be the Mesh face)
    else if (e.object.type === 'Mesh' && object.faceMapping && e.faceIndex !== undefined) {
      const triangleStartIndex = e.faceIndex * 3;
      const face = object.faceMapping.find(m => triangleStartIndex >= m.start && triangleStartIndex < m.start + m.count);
      if (face) {
        selectionId = `${object.id}:face-${face.faceId}`;
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
              clippingPlanes={clippingPlanes}
              clipShadows={true}
            />
          </mesh>

          {selectedFaces.length > 0 && (
            <FaceHighlighter object={object} faceIds={selectedFaces} clippingPlanes={clippingPlanes} />
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
              linewidth={object.type === 'datumAxis' ? 3 : 2} // Stronger lines for axes
              clippingPlanes={clippingPlanes}
              polygonOffset={object.type === 'datumAxis'}
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </lineSegments>
          {selectedEdges.length > 0 && (
            <EdgeHighlighter object={object} edgeIds={selectedEdges} clippingPlanes={clippingPlanes} />
          )}
        </>
      )}
      {object.vertexGeometry && (
        <>
          <points
            geometry={object.vertexGeometry}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          >
            <pointsMaterial
              color="#ffaa00"
              size={12} // Visual size for hover/hit detection
              sizeAttenuation={false}
              transparent
              opacity={0} // Invisible hit target by default
              depthTest={false}
            />
          </points>
          {selectedVertices.length > 0 && (
            <VertexHighlighter object={object} vertexIds={selectedVertices} />
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
  const isSelectPlaneStep = isSketchMode && sketchStep === 'select-plane';
  const isDrawingStep = isSketchMode && sketchStep === 'drawing';

  if (!isSelectPlaneStep && !originVisible) return null;

  const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
    setSketchPlane(plane);
  };

  // Visibility logic:
  // 1. Show all planes if in select-plane step
  // 2. Hide all planes if in drawing step (user request)
  // 3. Otherwise show based on originVisible and individual planeVisibility
  const getPlaneVisibility = (plane: 'XY' | 'XZ' | 'YZ') => {
    if (isSelectPlaneStep) return true;
    if (isDrawingStep) return false;
    return originVisible && planeVisibility[plane];
  };

  return (
    <group>
      {/* XY Plane - ground in Z-up (Blue) */}
      {getPlaneVisibility('XY') && (
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane('XY'); }}
          onPointerOut={() => setHoveredPlane(null)}
          onClick={(e) => { e.stopPropagation(); handlePlaneClick('XY'); }}
          position={[20, 20, 0]}
        >
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial
            color="#5577ee"
            transparent
            opacity={hoveredPlane === 'XY' ? 0.5 : 0.2}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* XZ Plane - front in Z-up (Red) */}
      {getPlaneVisibility('XZ') && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[20, 0, 20]}
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
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* YZ Plane - right in Z-up (Green) */}
      {getPlaneVisibility('YZ') && (
        <mesh
          rotation={[0, Math.PI / 2, 0]}
          position={[0, 20, 20]}
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
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            depthWrite={false}
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



const ThumbnailCapturer = () => {
  const { gl } = useThree();
  const setThumbnailCapturer = useCADStore(state => state.setThumbnailCapturer);

  useEffect(() => {
    // Register the capturer function
    setThumbnailCapturer(() => {
      try {
        return gl.domElement.toDataURL('image/jpeg', 0.5);
      } catch (e) {
        console.error("Failed to capture thumbnail", e);
        return null;
      }
    });

    // Cleanup
    return () => setThumbnailCapturer(() => null);
  }, [gl, setThumbnailCapturer]);

  return null;
};

const SceneController = ({ controlsRef }: { controlsRef: React.RefObject<ArcballControlsImpl | null> }) => {
  const { camera, scene } = useThree();
  const { zoom, activeTool, currentView, projectionMode, fitToScreenSignal } = useCADStore();

  // Handle Projection Mode / Hybrid Mode
  useEffect(() => {
    if (projectionMode !== 'perspective-with-ortho-faces') return;

    const controls = controlsRef.current as any;
    if (!controls) return;

    const checkOrientation = () => {
      if (projectionMode !== 'perspective-with-ortho-faces') return;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      // Check if aligned with major axes
      const threshold = 0.999; // Very close to aligned
      const isAligned = (
        Math.abs(dir.x) > threshold ||
        Math.abs(dir.y) > threshold ||
        Math.abs(dir.z) > threshold
      );

      // In hybrid mode, we just adjust the FOV of the perspective camera if it's perspective
      // or we could technically swap but FOV trick is smoother
      if (camera instanceof THREE.PerspectiveCamera) {
        const targetFov = isAligned ? 5 : 45;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
          camera.updateProjectionMatrix();
        }
      }
    };

    // Register listener for controls change
    controls.addEventListener('change', checkOrientation);
    return () => controls.removeEventListener('change', checkOrientation);
  }, [projectionMode, camera, controlsRef]);

  // Sync camera zoom with store
  useEffect(() => {
    const controls = controlsRef.current as any;
    if (!controls) return;

    const targetCamera = camera;
    if (!targetCamera) return;

    if (targetCamera instanceof THREE.PerspectiveCamera) {
      const target = controls.target;
      if (!target) return;
      const distance = targetCamera.position.distanceTo(target);
      // baseDistance corresponds to the distance at zoom=100. 
      // Home position is [100, 100, -100], distance to [0,0,0] is sqrt(30000) ~= 173.2
      const baseDistance = 173.205;

      // FoV adjustment for hybrid mode means we need to compensate zoom
      const fovFactor = projectionMode === 'perspective-with-ortho-faces' ? (targetCamera.fov / 45) : 1;
      const desiredDistance = (baseDistance * (100 / zoom)) / fovFactor;

      if (Math.abs(distance - desiredDistance) > 0.1) {
        const direction = new THREE.Vector3().subVectors(targetCamera.position, target).normalize();
        const newPos = target.clone().add(direction.multiplyScalar(desiredDistance));
        targetCamera.position.copy(newPos);
        controls.update();
      }
    } else if (targetCamera instanceof THREE.OrthographicCamera) {
      if (Math.abs(targetCamera.zoom - (zoom / 5)) > 0.01) {
        targetCamera.zoom = zoom / 5;
        targetCamera.updateProjectionMatrix();
      }
    }
  }, [zoom, camera, controlsRef, projectionMode]);

  // Handle View Changes (Home)
  useEffect(() => {
    if (currentView === 'home') {
      const controls = controlsRef.current as any;
      if (!controls) return;

      const targetCamera = camera;
      if (!targetCamera) return;

      // Reset to default isometric view
      targetCamera.position.set(400, 400, -400);
      controls.target.set(0, 0, 0);
      targetCamera.up.set(0, 1, 0);

      if (targetCamera instanceof THREE.PerspectiveCamera) {
        targetCamera.fov = 45;
        targetCamera.updateProjectionMatrix();
      } else if (targetCamera instanceof THREE.OrthographicCamera) {
        targetCamera.zoom = 5;
        targetCamera.updateProjectionMatrix();
      }

      controls.update();
    }
  }, [currentView, camera, controlsRef]);

  // Handle fitToScreen
  useEffect(() => {
    if (!fitToScreenSignal) return;

    const controls = controlsRef.current as any;
    if (!controls) return;

    const targetCamera = camera;
    if (!targetCamera) return;

    // Use the scene from useThree
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    if (targetCamera instanceof THREE.PerspectiveCamera) {
      const distance = sphere.radius / Math.tan(Math.PI * targetCamera.fov / 360);
      targetCamera.position.set(sphere.center.x + distance, sphere.center.y + distance, sphere.center.z + distance);
    } else {
      const distance = sphere.radius * 2;
      targetCamera.position.set(sphere.center.x + distance, sphere.center.y + distance, sphere.center.z + distance);
    }

    controls.target.copy(sphere.center);
    controls.update();
  }, [fitToScreenSignal, camera, scene, controlsRef]);

  // Configure mouse buttons
  useEffect(() => {
    const controls = controlsRef.current as any;
    if (!controls) return;

    if (typeof controls.setMouseAction === 'function') {
      try {
        if (activeTool === 'pan') {
          controls.setMouseAction('PAN', 0); // Left = Pan
          controls.setMouseAction('ROTATE', 2); // Right = Rotate
        } else {
          controls.setMouseAction('ROTATE', 0); // Left = Rotate
          controls.setMouseAction('PAN', 2); // Right = Pan
        }
      } catch (err) {
        console.warn("Failed to configure ArcballControls:", err);
      }
    }
  }, [activeTool, controlsRef]);

  return null;
};

const Viewport = ({ isSketchMode }: ViewportProps) => {
  const controlsRef = useRef<ArcballControlsImpl>(null);
  const api = useCADStoreApi();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const { backgroundMode, projectionMode, sectionViewEnabled, gridVisible } = useCADStore();
  const getBackgroundColor = () => {
    switch (backgroundMode) {
      case 'dark': return "hsl(210, 20%, 8%)";
      case 'light': return "hsl(210, 10%, 90%)";
      case 'blue': return "hsl(220, 40%, 25%)";
      case 'studio': return "#f0f0f0";
      case 'nature': return "#87ceeb";
      case 'city': return "#a9a9a9";
      case 'sunset': return "#ff4500";
      case 'warehouse': return "#333333";
      default: return "hsl(210, 20%, 8%)";
    }
  };

  const getEnvironmentPreset = () => {
    switch (backgroundMode) {
      case 'studio': return 'studio';
      case 'nature': return 'park';
      case 'city': return 'city';
      case 'sunset': return 'sunset';
      case 'warehouse': return 'warehouse';
      default: return null;
    }
  };

  const envPreset = getEnvironmentPreset();

  // Section view clipping planes
  const clippingPlanes = React.useMemo(() => {
    if (!sectionViewEnabled) return [];
    // Just a simple X-plane for now as a demo
    return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)];
  }, [sectionViewEnabled]);

  useEffect(() => {
    // Apply clipping planes to all materials? 
    // This is hard with SceneObjects being deeply nested.
    // Three.js gl.localClippingEnabled must be true.
  }, [sectionViewEnabled]);


  return (
    <div className="cad-viewport w-full h-full relative">
      <Canvas
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, localClippingEnabled: true }}
        onPointerMissed={() => api.getState().clearSelection()}
        raycaster={{
          params: {
            Line: { threshold: 3 },
            Points: { threshold: 3 },
            Mesh: {},
            LOD: {},
            Sprite: {}
          }
        }}
      >
        <ThumbnailCapturer />

        {/* Background & Environment */}
        {envPreset && <Environment preset={envPreset as any} background={true} blur={0.5} />}
        {!envPreset && (
          <color attach="background" args={[getBackgroundColor()]} />
        )}

        {/* Ambient lighting is reduced when environment is active to maintain realism */}
        <ambientLight intensity={envPreset ? 0.2 : 0.4} />
        {!envPreset && (
          <>
            <directionalLight position={[50, 50, 25]} intensity={0.8} />
            <directionalLight position={[-30, -30, -30]} intensity={0.3} />
          </>
        )}



        {/* Z-up content container - rotates Z-up content to display in Y-up Three.js */}
        <group rotation={Z_UP_ROTATION}>
          {gridVisible && <CADGrid isSketchMode={isSketchMode} />}
          <PlaneSelector />
          <SceneObjects clippingPlanes={clippingPlanes} />
          <OperationPreview />
          <SketchCanvas />
        </group>

        {/* Standard Perspective Camera */}
        <PerspectiveCamera
          makeDefault={projectionMode === 'perspective' || projectionMode === 'perspective-with-ortho-faces'}
          position={[400, 400, -400]}
          fov={45}
          near={0.1}
          far={10000}
        />

        {/* Standard Orthographic Camera */}
        <OrthographicCamera
          makeDefault={projectionMode === 'orthographic'}
          position={[400, 400, -400]}
          zoom={5}
          near={0.1}
          far={10000}
        />

        {/* Controls - Y-up compatible */}
        <ArcballControls
          ref={controlsRef}
          makeDefault
          cursorZoom={true}
          minDistance={5}
          maxDistance={5000}
        />

        <SceneController controlsRef={controlsRef} />

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

import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ArcballControls, Grid, PerspectiveCamera, OrthographicCamera, GizmoHelper, GizmoViewcube, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { useCADStore, useCADStoreApi, CADObject } from "../../hooks/useCADStore";
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from "sonner";
import SketchCanvas from "./SketchCanvas";
import type { ArcballControls as ArcballControlsImpl } from "three-stdlib";
import { computeDoubleClickSelection } from "../../lib/selection/SelectionManager";

// Extracted sub-components
import { FaceHighlighter, EdgeHighlighter, VertexHighlighter, VertexBasePoints, SELECTION_COLORS } from "./viewport/SelectionHighlighters";
import {
  CADGrid,
  RaycasterSetup,
  ThumbnailCapturer,
  PlaneSelector,
  OperationPreview,
  CameraController,
  SceneController,
} from "./viewport/SceneComponents";

interface ViewportProps {
  isSketchMode: boolean;
}

// Z-up to Y-up rotation: -90° around X axis
// This allows Replicad Z-up geometry to display correctly while keeping ArcballControls stable
const Z_UP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

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

// Hover state for highlighting
interface HoverState {
  type: 'face' | 'edge' | 'vertex' | null;
  id: number | null;
}

const CADObjectRenderer = ({ object, clippingPlanes = [] }: { object: CADObject, clippingPlanes?: THREE.Plane[] }) => {
  const { selectObject, clearSelection, selectedIds, isSketchMode, sketchPlane, sketchesVisible, bodiesVisible, originVisible } = useCADStore();
  const isSketch = object.type === 'sketch';
  const isSelected = selectedIds.has(object.id);
  const isAxis = object.type === 'datumAxis';

  // Hover state for visual feedback
  const [hoverState, setHoverState] = useState<HoverState>({ type: null, id: null });

  // Double-click detection for body selection
  const lastClickTimeRef = useRef<number>(0);
  const lastClickIdRef = useRef<string | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

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

  // Helper to analyze ALL intersections from a raycast event and find the best selection.
  // Uses proximity-aware priority: vertex > edge > face, but only if the higher-priority
  // hit is close in distance to the lower-priority hit. This ensures that clicking on
  // the center of a face selects the face, not a distant vertex/edge.
  const findBestSelection = (intersections: any[]): { type: 'face' | 'edge' | 'vertex' | 'body', id: number | null, selectionId: string } => {
    let bestVertex: { id: number, distance: number } | null = null;
    let bestEdge: { id: number, distance: number } | null = null;
    let bestFace: { id: number, distance: number } | null = null;

    for (const hit of intersections) {
      const objType = hit.object?.type;
      const hitGeometry = hit.object?.geometry;
      const dist = hit.distance;

      // Filter: only process intersections that belong to THIS CAD object
      const isOurMesh = hitGeometry && hitGeometry === object.geometry;
      const isOurEdge = hitGeometry && hitGeometry === object.edgeGeometry;
      const isOurVertex = hitGeometry && hitGeometry === object.vertexGeometry;

      // Check for vertex hit (Points)
      if (objType === 'Points' && isOurVertex && hit.index !== undefined) {
        if (!bestVertex || dist < bestVertex.distance) {
          bestVertex = { id: hit.index, distance: dist };
        }
      }
      // Check for edge hit (LineSegments)
      else if (objType === 'LineSegments' && isOurEdge && object.edgeMapping) {
        const vertexIndex = hit.index;
        if (vertexIndex !== undefined) {
          const edge = object.edgeMapping.find(m => vertexIndex >= m.start && vertexIndex < m.start + m.count);
          if (edge && (!bestEdge || dist < bestEdge.distance)) {
            bestEdge = { id: edge.edgeId, distance: dist };
          }
        }
      }
      // Check for face hit (Mesh)
      else if (objType === 'Mesh' && isOurMesh && object.faceMapping && hit.faceIndex !== undefined) {
        const triangleStartIndex = hit.faceIndex * 3;
        const face = object.faceMapping.find(m => triangleStartIndex >= m.start && triangleStartIndex < m.start + m.count);
        if (face && (!bestFace || dist < bestFace.distance)) {
          bestFace = { id: face.faceId, distance: dist };
        }
      }
    }

    // Proximity-aware priority
    const PROXIMITY_TOLERANCE = 1.5; // world units
    const referenceDistance = bestFace?.distance ?? Infinity;

    if (bestVertex && (bestVertex.distance <= referenceDistance + PROXIMITY_TOLERANCE)) {
      return { type: 'vertex', id: bestVertex.id, selectionId: `${object.id}:vertex-${bestVertex.id}` };
    }

    if (bestEdge && (bestEdge.distance <= referenceDistance + PROXIMITY_TOLERANCE)) {
      return { type: 'edge', id: bestEdge.id, selectionId: `${object.id}:edge-${bestEdge.id}` };
    }

    if (bestFace) {
      return { type: 'face', id: bestFace.id, selectionId: `${object.id}:face-${bestFace.id}` };
    }

    return { type: 'body', id: null, selectionId: object.id };
  };

  const handlePointerDown = (e: any) => {
    if (!isSelectableType) return;
    if (e.button === 0) {
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: any) => {
    if (!isSelectableType) return;
    e.stopPropagation();

    // Check if this was a click (not a drag)
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      dragStartRef.current = null;
      if (dist > IS_CLICK_THRESHOLD) return;
    }

    // Use ALL intersections from the event to find best selection
    const intersections = e.intersections || [e];
    const { type, selectionId } = findBestSelection(intersections);

    // Double-click detection for body selection
    const now = Date.now();
    const isDoubleClick = (
      now - lastClickTimeRef.current < DOUBLE_CLICK_THRESHOLD &&
      lastClickIdRef.current === object.id
    );
    lastClickTimeRef.current = now;
    lastClickIdRef.current = object.id;

    if (isDoubleClick) {
      const newSelection = computeDoubleClickSelection(selectedIds, object.id);
      clearSelection();
      newSelection.forEach(id => selectObject(id));
    } else {
      selectObject(selectionId);
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isSelectableType) return;
    e.stopPropagation();

    const allIntersections = e.intersections || [e];
    const ourIntersections = allIntersections.filter((hit: any) => {
      const hitGeometry = hit.object?.geometry;
      return hitGeometry === object.geometry ||
        hitGeometry === object.edgeGeometry ||
        hitGeometry === object.vertexGeometry;
    });

    if (ourIntersections.length === 0) {
      setHoverState({ type: null, id: null });
      return;
    }

    const { type, id } = findBestSelection(allIntersections);
    setHoverState(type !== 'body' ? { type, id } : { type: null, id: null });
  };

  const handlePointerOver = (e: any) => {
    if (!isSelectableType) return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';

    const intersections = e.intersections || [e];
    const { type, id } = findBestSelection(intersections);
    setHoverState(type !== 'body' ? { type, id } : { type: null, id: null });
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'default';
    setHoverState({ type: null, id: null });
  };

  // Compute hovered IDs for highlighting
  const hoveredFaces = hoverState.type === 'face' && hoverState.id !== null ? [hoverState.id] : [];
  const hoveredEdges = hoverState.type === 'edge' && hoverState.id !== null ? [hoverState.id] : [];
  const hoveredVertices = hoverState.type === 'vertex' && hoverState.id !== null ? [hoverState.id] : [];

  return (
    <group
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      visible={shouldBeVisible}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* The solid mesh (faces) */}
      {object.geometry && object.type !== 'datumAxis' && (
        <>
          <mesh geometry={object.geometry}>
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

          {/* Hover highlight for faces */}
          {hoveredFaces.length > 0 && (
            <FaceHighlighter object={object} faceIds={hoveredFaces} clippingPlanes={clippingPlanes} isHover={true} />
          )}

          {/* Selected faces highlight */}
          {selectedFaces.length > 0 && (
            <FaceHighlighter object={object} faceIds={selectedFaces} clippingPlanes={clippingPlanes} />
          )}
        </>
      )}
      {/* The edges (lines) */}
      {object.edgeGeometry && (
        <>
          <lineSegments geometry={object.edgeGeometry} renderOrder={1}>
            <lineBasicMaterial
              color={isSelected ? '#80c0ff' : (isSketch ? "#00ffff" : (object.type === 'datumAxis' ? object.color : "#222222"))}
              transparent={isSketch}
              opacity={isSketch ? 0.8 : 1.0}
              depthTest={true}
              linewidth={4}
              clippingPlanes={clippingPlanes}
              polygonOffset={object.type === 'datumAxis'}
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </lineSegments>

          {/* Hover highlight for edges */}
          {hoveredEdges.length > 0 && (
            <EdgeHighlighter object={object} edgeIds={hoveredEdges} clippingPlanes={clippingPlanes} isHover={true} />
          )}

          {/* Selected edges highlight */}
          {selectedEdges.length > 0 && (
            <EdgeHighlighter object={object} edgeIds={selectedEdges} clippingPlanes={clippingPlanes} />
          )}
        </>
      )}
      {/* The vertices (corner points) */}
      {object.vertexGeometry && (
        <>
          {/* Visible vertex dots - rendered as circles */}
          <VertexBasePoints geometry={object.vertexGeometry} />

          {/* Hover highlight for vertices */}
          {hoveredVertices.length > 0 && (
            <VertexHighlighter object={object} vertexIds={hoveredVertices} isHover={true} />
          )}

          {/* Selected vertices highlight */}
          {selectedVertices.length > 0 && (
            <VertexHighlighter object={object} vertexIds={selectedVertices} />
          )}
        </>
      )}
    </group>
  );
};


const Viewport = ({ isSketchMode }: ViewportProps) => {
  const controlsRef = useRef<ArcballControlsImpl>(null);
  const api = useCADStoreApi();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const { backgroundMode, projectionMode, sectionViewEnabled, gridVisible, cameraControlsDisabled } = useCADStore();
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
    // todo:refine Build section planes from user-defined cutters instead of a fixed demo plane.
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
            Line: { threshold: 0.3 },    // For edge selection
            Points: { threshold: 0.25 },  // For vertex selection
            Mesh: {},
            LOD: {},
            Sprite: {}
          }
        }}
      >
        <ThumbnailCapturer />
        <RaycasterSetup />

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
          enabled={!cameraControlsDisabled}
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

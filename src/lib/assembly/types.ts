
import * as THREE from 'three';

export type ComponentId = string;
export type MateId = string;

/**
 * Represents a discrete part in the assembly.
 * It references a source "Body" or geometry (by `partId`)
 * and holds its own transformation in the assembly.
 */
export interface AssemblyComponent {
    id: ComponentId;
    name: string;
    partId: string; // Reference to the source CADObject/Part

    // Transformation matrix (4x4) stored as an array or object
    // relative to the Assembly (World)
    transform: THREE.Matrix4;

    // If true, this component does not move during solve (Ground)
    fixed: boolean;
}

/**
 * A connector defines a local coordinate system on a component.
 * Mates are defined by aligning Connectors.
 */
export interface MateConnector {
    componentId: ComponentId;

    // Local transformation relative to the Component's origin
    // Defines the "attachment point" and orientation
    localTransform: THREE.Matrix4;
}

export type MateType =
    | 'rigid'        // Fully constrained (0 DOF)
    | 'revolute'     // Rotates around Z axis (1 DOF)
    | 'slider'       // Slides along Z axis (1 DOF)
    | 'cylindrical'  // Rotate around Z + Slide along Z (2 DOF)
    | 'planar'       // slide on XY plane + rotate around Z (3 DOF)
    | 'ball'         // Rotate around center (3 DOF)
    | 'fastened'     // Alias for rigid
    | 'coincident';  // Origins match (Points only)

export interface AssemblyMate {
    id: MateId;
    name: string;
    type: MateType;

    connector1: MateConnector;
    connector2: MateConnector;

    // Optional limits or offsets
    limits?: {
        min?: number;
        max?: number;
    };
    offset?: number; // Distance or Angle offset

    suppressed: boolean;
}

export interface AssemblyState {
    components: Map<ComponentId, AssemblyComponent>;
    mates: Map<MateId, AssemblyMate>;
}

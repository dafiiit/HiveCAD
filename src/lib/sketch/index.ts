/**
 * Sketch Module — Public API
 * 
 * The sketch system provides persistent, editable, re-generable sketches
 * for the CAD application. Sketches are stored as first-class objects
 * and can be serialized to JSON for version control.
 */

export type {
    SketchObject,
    SketchEntity,
    SketchEntityType,
    SketchEntityProperties,
    SketchConstraint,
    SketchPlane,
    Point2D,
    SerializedSketch,
} from './types';

export {
    createSketchObject,
    generateSketchId,
    generateEntityId,
    serializeSketch,
    deserializeSketch,
} from './types';

export {
    generateSketchCode,
    type CodeGenResult,
} from './code-generator';

export {
    getEntityDisplayPoints,
    createTo3D,
    createTo2D,
    computeArcFromThreePoints,
    snapToGrid,
    snapToGridValue,
    type ArcResult,
} from './rendering';

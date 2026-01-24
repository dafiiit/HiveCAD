import { initCAD, replicadToThreeGeometry } from '../lib/cad-kernel';
import * as replicad from 'replicad';

async function testSketchConversion() {
    await initCAD();
    console.log("Testing Sketch Conversion...");

    // Create a simple rectangle sketch
    const drawing = replicad.drawRectangle(10, 20);
    const sketch = drawing.sketchOnPlane("XY");

    console.log("Sketch object:", sketch);
    console.log("Sketch properties:", Object.keys(sketch));

    try {
        const geometry = replicadToThreeGeometry(sketch);
        console.log("Geometry created:", !!geometry);
        if (geometry) {
            console.log("Attributes:", Object.keys(geometry.attributes));
            console.log("Index:", !!geometry.index);
        }
    } catch (e) {
        console.error("Conversion failed for Sketch:", e);
    }

    // Try converting the face explicitly
    try {
        const face = sketch.face;
        console.log("Face object:", face);
        const geometry = replicadToThreeGeometry(face);
        console.log("Face Geometry created:", !!geometry);
    } catch (e) {
        console.error("Conversion failed for Face:", e);
    }
}

testSketchConversion();

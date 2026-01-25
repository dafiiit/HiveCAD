
import { initCAD } from '../lib/cad-kernel';
import * as replicad from 'replicad';

async function testDrawingFix() {
    await initCAD();
    console.log("Testing Replicad Drawing Fix...");

    try {
        // The user's code, but with the corrected API
        const shape1 = replicad.draw()
            .movePointerTo([-13.955176058235498, 6.788025110228427])
            .lineTo([16.018531261146187, 15.542300888936428])
            .sketchOnPlane("YZ");

        console.log("Shape created successfully:", !!shape1);
        console.log("Shape type:", shape1.constructor.name);
    } catch (e) {
        console.error("Failed to create shape:", e);
        process.exit(1);
    }
}

testDrawingFix();

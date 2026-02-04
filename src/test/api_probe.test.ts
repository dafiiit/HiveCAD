
// todo:refine Convert this probe into assertions or remove once the API behavior is understood.
import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import { describe, it, expect, beforeAll } from 'vitest';

describe('Replicad API Probe', () => {
    beforeAll(async () => {
        const OC = await opencascade();
        replicad.setOC(OC);
    });



    it('should inspect sketch plane properties', () => {
        const keys = Object.keys(replicad);
        console.log('Replicad keys count:', keys.length);
        console.log('Replicad keys (filtered):', keys.filter(k => k.toLowerCase().includes('make') || k.toLowerCase().includes('face') || k.toLowerCase().includes('extr')));
        const sketch = replicad.drawRectangle(10, 10).sketchOnPlane("XZ");


        // Inspect the sketch object
        console.log('Sketch keys:', Object.keys(sketch));

        // Inspect the plane
        // How do we access the plane?
        // Typically sketch.plane or similar.
        // Let's dump the sketch object properties blindly

        try {
            console.log('Sketch structure:', JSON.stringify(sketch, (key, value) => {
                if (key === 'oc') return '[OC Object]';
                if (typeof value === 'object' && value !== null) {
                    if (value.constructor && value.constructor.name === 'gp_Pln') return '[gp_Pln]';
                    if (value.constructor && value.constructor.name === 'Geom_Plane') return '[Geom_Plane]';
                }
                return value;
            }, 2));


            // Check for defaultDirection getter
            // @ts-ignore
            if (sketch.defaultDirection) {
                // @ts-ignore
                console.log('Sketch.defaultDirection:', sketch.defaultDirection);
            }
            // @ts-ignore
            if (sketch._defaultDirection) {
                // @ts-ignore
                const d = sketch._defaultDirection;
                console.log('Sketch._defaultDirection:', d);
                // Check if it's a vector-like object
                console.log('keys:', Object.keys(d));
                // Try x, y, z
                // @ts-ignore
                console.log('XYZ:', d.x, d.y, d.z);
                // Try toArray

                // @ts-ignore
                if (d.toArray) console.log('toArray:', d.toArray());

                // Verify extrude with default direction
                try {
                    // @ts-ignore
                    const solid = sketch.extrude(10, { extrusionDirection: d });
                    console.log('Extrude successful');
                    const bbox = solid.boundingBox;
                    // @ts-ignore
                    const xLen = bbox.max[0] - bbox.min[0];
                    // @ts-ignore
                    const yLen = bbox.max[1] - bbox.min[1];
                    // @ts-ignore
                    const zLen = bbox.max[2] - bbox.min[2];
                    console.log('Extrude dims:', xLen, yLen, zLen);
                } catch (err) {
                    console.error('Extrude failed:', err);
                }
            }


            // Also try to see if there is a helper method to get normal


        } catch (e) {
            console.error('Error inspecting sketch:', e);
        }

        try {
            console.log('--- Probing Face ---');
            const face = replicad.drawRectangle(10, 10).sketchOnPlane("XZ").face();
            // @ts-ignore
            if (face._defaultDirection) {
                console.log('Face has _defaultDirection');
            } else {
                console.log('Face does NOT have _defaultDirection');
            }
            console.log('Face keys:', Object.keys(face));

        } catch (e) {
            console.error('Error probing face:', e);
        }

        try {
            console.log('--- Probing Sketch Prototype ---');
            const proto = Object.getPrototypeOf(sketch);
            console.log('Sketch prototype keys:', Object.getOwnPropertyNames(proto));
        } catch (e) {
            console.error('Error probing prototype:', e);
        }
    });
});


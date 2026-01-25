
import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import { describe, it, expect, beforeAll } from 'vitest';

describe('Replicad Extrusion Workaround Probe', () => {
    beforeAll(async () => {
        const OC = await opencascade();
        replicad.setOC(OC);
    });

    it('should find working params for extrude', () => {
        const { drawRectangle, sketchOnPlane } = replicad;
        const rectBase = drawRectangle(10, 10).sketchOnPlane("XZ");
        const dir = [0, -1, 0];

        // Attempt 6: replicad.extrude?
        try {
            // @ts-ignore
            if (replicad.extrude) {
                // @ts-ignore
                const s6 = replicad.extrude(rectBase, 10, { extrusionDirection: dir });
                console.log('Attempt 6 (replicad.extrude):', objectToString(s6.boundingBox));
            } else {
                console.log('replicad.extrude not found');
            }
        } catch (e) { console.log('Attempt 6 failed:', e); }

        // Attempt 7: replicad.makePrism?
        try {
            // @ts-ignore
            if (replicad.makePrism) {
                // makePrism(shape, vec)
                // vec needs to be [x,y,z] or wrapped?
                // @ts-ignore
                const s7 = replicad.makePrism(rectBase, dir);
                console.log('Attempt 7 (replicad.makePrism):', objectToString(s7.boundingBox));
            } else {
                console.log('replicad.makePrism not found');
            }
        } catch (e) { console.log('Attempt 7 failed:', e); }

        // Attempt 8: Check if Sketch has .face() method and call it
        try {
            // @ts-ignore
            if (typeof rectBase.face === 'function') {
                // @ts-ignore
                const f = rectBase.face();
                console.log('Face created via .face()');
                // Does face have extrude?
                // @ts-ignore
                if (f.extrude) {
                    // @ts-ignore
                    const s8 = f.extrude(10, { extrusionDirection: dir });
                    console.log('Attempt 8 (face.extrude):', objectToString(s8.boundingBox));
                } else {
                    console.log('Face does not have .extrude()');
                }
            } else {
                console.log('Sketch does not have .face() method');
            }
        } catch (e) { console.log('Attempt 8 failed:', e); }
    });
});

function objectToString(obj: any) {
    if (!obj) return 'undefined';
    const min = obj.min || obj._min;
    const max = obj.max || obj._max;
    if (min && max) {
        const toA = (p: any) => Array.isArray(p) ? p : (p.x !== undefined ? [p.x, p.y, p.z] : p);
        return `Min: ${toA(min)}, Max: ${toA(max)}`;
    }
    return JSON.stringify(obj);
}

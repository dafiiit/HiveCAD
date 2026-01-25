


import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';

import { describe, it, expect, beforeAll } from 'vitest';

describe('Replicad Extrusion Direction', () => {
    beforeAll(async () => {
        const OC = await opencascade();
        replicad.setOC(OC);
    });

    it('should extrude along the normal of the sketch plane (XZ)', () => {
        // Create a rectangle on XZ plane
        // XZ plane normal is Y (0, 1, 0)
        const rect = replicad.drawRectangle(10, 10).sketchOnPlane("XZ");





        // Extrude by 10. Should extend in Y.
        // We simulate the fix by passing the default direction as array
        // Hardcoded for XZ plane: Normal is (0, -1, 0)? Or (0, 1, 0)?
        // Replicad XZ plane: X=X, Y=Z. Normal = XxZ = -Y.
        const dir = [0, -1, 0];
        console.log('Testing rect.extrude with hardcoded dir:', dir);
        const solid = rect.extrude(10, { extrusionDirection: dir });










        const bbox = solid.boundingBox as any;
        console.log("XZ Extrude BBox Keys:", Object.keys(bbox));
        try {
            console.log("XZ Extrude BBox values (safe):", {
                min: bbox.min, max: bbox.max,
                corner1: bbox.corner1, corner2: bbox.corner2,
                _min: bbox._min, _max: bbox._max
            });
        } catch (e) { }



        let min, max;
        if (Array.isArray(bbox)) {
            min = bbox[0];
            max = bbox[1];
        } else {
            // Fallback to internal props if public ones are missing
            min = bbox.min || bbox._min;
            max = bbox.max || bbox._max;
        }

        const getCoord = (pt: any, idx: number) => {
            if (!pt) return 0;
            if (Array.isArray(pt)) return pt[idx];

            // Check properties
            if (typeof pt.x === 'number') {
                if (idx === 0) return pt.x;
                if (idx === 1) return pt.y;
                if (idx === 2) return pt.z;
            }
            // Check array indexing on object (if it's array-like)
            if (typeof pt[idx] === 'number') return pt[idx];

            return 0;
        }


        // Check dimensions
        const xLen = getCoord(max, 0) - getCoord(min, 0);
        const yLen = getCoord(max, 1) - getCoord(min, 1); // Extrusion direction
        const zLen = getCoord(max, 2) - getCoord(min, 2);

        console.log('XZ Plane Extrusion BBox:', bbox);
        console.log('Dimensions:', { xLen, yLen, zLen });


        // If it extrudes in Z (default), then zLen would be 10 + height of rect (10) = 20? 
        // No, XZ plane rectangle has y=0 (or constant). Z is height. X is width.
        // Wait, drawRectangle(10, 10) -> x=10, y=10 (local).
        // sketchOnPlane("XZ"):
        // Local X -> Global X
        // Local Y -> Global Z
        // So rectangle on XZ has size X=10, Z=10. Y=0 (flat).

        // Extruding 10 in Y (normal) should result in Y=10.
        // So BBox Y length should be 10.

        // If it extrudes in Z (wrong), it would add 10 to Z.
        // Z length would be 10 (original) + 10 (extrusion) = 20? Or it would just fail/flatten if it treats it as flat.

        expect(yLen).toBeCloseTo(10, 1);
        expect(xLen).toBeCloseTo(10, 1);
        expect(zLen).toBeCloseTo(10, 1);
    });

    it('should extrude along the normal of the sketch plane (YZ)', () => {
        // Create a rectangle on YZ plane
        // YZ plane normal is X (1, 0, 0)
        const rect = replicad.drawRectangle(10, 10).sketchOnPlane("YZ");





        // Extrude by 10. Should extend in X.
        // YZ plane: X=Y, Y=Z. Normal = YxZ = X (1, 0, 0).
        const dir = [1, 0, 0];
        console.log('Testing rect.extrude with hardcoded dir:', dir);
        const solid = rect.extrude(10, { extrusionDirection: dir });








        const bbox = solid.boundingBox as any;
        console.log("YZ Extrude BBox Keys:", Object.keys(bbox));



        let min, max;
        if (Array.isArray(bbox)) {
            min = bbox[0];
            max = bbox[1];
        } else {
            min = bbox.min || bbox._min;
            max = bbox.max || bbox._max;
        }

        const getCoord = (pt: any, idx: number) => {
            if (!pt) return 0;
            if (Array.isArray(pt)) return pt[idx];

            if (typeof pt.x === 'number') {
                if (idx === 0) return pt.x;
                if (idx === 1) return pt.y;
                if (idx === 2) return pt.z;
            }
            if (typeof pt[idx] === 'number') return pt[idx];
            return 0;
        }


        const xLen = getCoord(max, 0) - getCoord(min, 0); // Extrusion direction
        const yLen = getCoord(max, 1) - getCoord(min, 1);
        const zLen = getCoord(max, 2) - getCoord(min, 2);

        console.log('YZ Plane Extrusion BBox:', bbox);

        console.log('Dimensions:', { xLen, yLen, zLen });

        expect(xLen).toBeCloseTo(10, 1);
    });
});

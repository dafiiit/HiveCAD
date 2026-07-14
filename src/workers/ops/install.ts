/**
 * Installs the owned operation layer into replicad (Stage 2 foundation).
 *
 * `fuse`/`cut`/`intersect` live on `_3DShape.prototype`, shared by every 3D
 * shape (`Solid`, `Compound`, `Shell`, `CompSolid`). We replace them with
 * history-capturing equivalents so that *existing* generated code — `a.fuse(b)`
 * from the boolean tools — flows through our ops layer and records its
 * `Modified`/`Generated` history, with no change to code generation.
 *
 * This prototype patch is the deliberate, single seam where we "own" these
 * operations. It is transparent (same signature, same result) and reversible.
 * When Stage 2c moves code generation to explicit op calls, this can retire.
 */

import { Solid } from 'replicad';
import { booleanWithHistory, type BooleanOptions } from './booleans';

let installed = false;

export function installOps(): void {
    if (installed) return;

    // _3DShape isn't exported, but it's the prototype of every exported 3D shape.
    const shape3DProto: any = Object.getPrototypeOf(Solid.prototype);
    if (!shape3DProto || typeof shape3DProto.fuse !== 'function') {
        console.warn('Ops: could not locate _3DShape prototype; leaving replicad booleans in place');
        return;
    }

    shape3DProto.fuse = function (this: any, other: any, options: BooleanOptions = {}) {
        return booleanWithHistory('fuse', this, other, options).shape;
    };
    shape3DProto.cut = function (this: any, tool: any, options: BooleanOptions = {}) {
        return booleanWithHistory('cut', this, tool, options).shape;
    };
    // replicad's intersect takes no options.
    shape3DProto.intersect = function (this: any, tool: any) {
        return booleanWithHistory('intersect', this, tool).shape;
    };

    installed = true;
    console.log('Ops: history-capturing boolean layer installed');
}

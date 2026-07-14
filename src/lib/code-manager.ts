import { parse } from '@babel/parser';
import parseBabel from '@babel/parser';
import generateBabel from '@babel/generator';
import traverseBabel from '@babel/traverse';
import * as t from '@babel/types';

// Workaround for some build/test environment import issues
const generate = (generateBabel as any).default || generateBabel;
const traverse = (traverseBabel as any).default || traverseBabel;

export interface CodeRange {
    start: { line: number; column: number };
    end: { line: number; column: number };
}

export interface FeatureOperation {
    name: string;
    args: any[];
    index?: number; // Index in the method chain
    codeRange: CodeRange;
}

export interface FeatureNode {
    id: string; // Variable name (e.g., "body1") or UUID
    type: 'Feature';
    source: string; // The variable or object being operated on (e.g., 'replicad' or 'sketch1')
    operations: FeatureOperation[];
    codeRange: CodeRange;
    path?: any; // Babel path to the VariableDeclarator
}

function collectDeclaredNames(ast: t.File): Set<string> {
    const names = new Set<string>();

    traverse(ast, {
        VariableDeclarator(path: any) {
            if (t.isIdentifier(path.node.id)) {
                names.add(path.node.id.name);
            }
        },
        FunctionDeclaration(path: any) {
            if (path.node.id && t.isIdentifier(path.node.id)) {
                names.add(path.node.id.name);
            }
        },
        ClassDeclaration(path: any) {
            if (path.node.id && t.isIdentifier(path.node.id)) {
                names.add(path.node.id.name);
            }
        },
    });

    return names;
}

export class CodeManager {
    code: string;
    ast: t.File | null;
    features: FeatureNode[];

    constructor(code: string = "") {
        this.code = code;
        this.ast = null;
        this.features = [];
        if (code) {
            this.parse();
        }
    }

    parse() {
        try {
            this.ast = parse(this.code, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript']
            });
            this.mapFeatures();
        } catch (e) {
            console.error("Failed to parse code:", e);
        }
    }

    private allocateName(prefix: string) {
        if (!this.ast) return `${prefix}1`;

        const usedNames = collectDeclaredNames(this.ast);
        let suffix = 1;

        while (usedNames.has(`${prefix}${suffix}`)) {
            suffix += 1;
        }

        return `${prefix}${suffix}`;
    }

    mapFeatures() {
        this.features = [];
        if (!this.ast) return;

        traverse(this.ast, {
            VariableDeclarator: (path: any) => {
                const decl = path.node;
                if (t.isIdentifier(decl.id) && decl.init) {
                    const varName = decl.id.name;
                    const operations: FeatureOperation[] = [];
                    let source = "";

                    // Re-evaluating the traversal strategy
                    let ptr = decl.init;
                    while (true) {
                        if (t.isCallExpression(ptr)) {
                            // It's a method call: operationName(...args)
                            // We need to grab the location of this specific call expression.
                            // The location of the MemberExpression property is often what we want for highlighting "line", "arc", etc.
                            // But usually, the CallExpression covers the `name(args)` part roughly.

                            // Let's look at the callee.
                            // chain.method(args)
                            if (t.isMemberExpression(ptr.callee)) {
                                const propName = (ptr.callee.property as t.Identifier).name;
                                const loc = ptr.loc ? { start: ptr.loc.start, end: ptr.loc.end } : { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };

                                // Check for replicad.draw case (base of chain)
                                if (t.isIdentifier(ptr.callee.object) && ptr.callee.object.name === 'replicad') {
                                    operations.unshift({
                                        name: propName,
                                        args: ptr.arguments,
                                        codeRange: loc
                                    });
                                    source = 'replicad';
                                    break; // Stop at replicad
                                }

                                operations.unshift({
                                    name: propName,
                                    args: ptr.arguments,
                                    codeRange: loc
                                });
                                ptr = ptr.callee.object;
                            } else if (t.isIdentifier(ptr.callee)) {
                                // Direct function call: func(args)
                                const loc = ptr.loc ? { start: ptr.loc.start, end: ptr.loc.end } : { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
                                operations.unshift({
                                    name: ptr.callee.name,
                                    args: ptr.arguments,
                                    codeRange: loc
                                });
                                break; // Stop at base function
                            } else {
                                break;
                            }
                        } else if (t.isMemberExpression(ptr)) {
                            // Just a property access without call? e.g. obj.prop
                            // usually we skip unless it's the end of a chain that isn't called
                            ptr = ptr.object;
                        } else if (t.isIdentifier(ptr)) {
                            source = ptr.name;
                            break;
                        } else {
                            break;
                        }
                    }

                    if (source || operations.length > 0) {
                        this.features.push({
                            id: varName,
                            type: 'Feature',
                            source: source || 'unknown',
                            operations,
                            codeRange: path.node.loc ? { start: path.node.loc.start, end: path.node.loc.end } : { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
                            path // VariableDeclarator path
                        });
                    }
                }
            }
        });
    }

    transformForExecution(): string {
        if (!this.ast) return this.code;

        const astForExec = parse(this.code, { sourceType: 'module' });

        traverse(astForExec, {
            VariableDeclaration: (path: any) => {
                path.node.declarations.forEach((decl: any) => {
                    if (t.isIdentifier(decl.id) && decl.init) {
                        const varName = decl.id.name;
                        const wrapper = t.callExpression(
                            t.identifier('__record'),
                            [
                                t.stringLiteral(varName),
                                decl.init
                            ]
                        );
                        decl.init = wrapper;
                    }
                });
            }
        });

        const output = generate(astForExec);
        return output.code;
    }

    /**
     * Transform for incremental (memoized) execution in the worker.
     *
     * Each top-level feature declaration inside `main()` is rewritten from an
     * eager expression into a lazy, memoized one:
     *
     *     const shape1 = makeBaseBox(...);
     *   → const shape1 = await __memo("shape1", async () => (makeBaseBox(...)));
     *
     * The thunk is the whole point: `__memo` can return a cached shape from the
     * worker's persistent store *without ever evaluating the constructor*, so a
     * clean feature costs nothing. `transformForExecution`'s eager `__record`
     * cannot do this — its argument has already been computed by the time the
     * wrapper runs.
     *
     * Only statements that are direct children of the `main` body are wrapped:
     * `await` is illegal at module scope, and module-level helpers are not
     * features. `main` is forced async so the injected `await`s are valid.
     */
    transformForIncremental(): string {
        if (!this.ast) return this.code;

        const astForExec = parse(this.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });

        const memoizeBody = (body: any[]) => {
            for (const stmt of body) {
                if (!t.isVariableDeclaration(stmt)) continue;
                for (const decl of stmt.declarations) {
                    if (t.isIdentifier(decl.id) && decl.init) {
                        const thunk = t.arrowFunctionExpression([], decl.init, true /* async */);
                        decl.init = t.awaitExpression(
                            t.callExpression(t.identifier('__memo'), [
                                t.stringLiteral(decl.id.name),
                                thunk,
                            ])
                        );
                    }
                }
            }
        };

        traverse(astForExec, {
            FunctionDeclaration: (path: any) => {
                if (path.node.id?.name === 'main' && t.isBlockStatement(path.node.body)) {
                    path.node.async = true;
                    memoizeBody(path.node.body.body);
                    path.stop();
                }
            },
            VariableDeclarator: (path: any) => {
                if (
                    t.isIdentifier(path.node.id) && path.node.id.name === 'main' &&
                    (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init)) &&
                    t.isBlockStatement(path.node.init.body)
                ) {
                    path.node.init.async = true;
                    memoizeBody(path.node.init.body.body);
                    path.stop();
                }
            },
        });

        const output = generate(astForExec);
        return output.code;
    }

    private injectIntoBody(body: any[], decl: any, varName: string) {
        // Find the return statement in the body
        const returnIdx = body.findIndex(n => t.isReturnStatement(n));

        if (returnIdx !== -1) {
            // Insert the new variable declaration BEFORE the return statement
            body.splice(returnIdx, 0, decl);

            // Update the return statement to include the new variable
            const returnStmt = body[returnIdx + 1]; // +1 because we inserted a node

            if (!returnStmt.argument) {
                // return; -> return [newVar];
                returnStmt.argument = t.arrayExpression([t.identifier(varName)]);
            } else if (t.isArrayExpression(returnStmt.argument)) {
                // return [a, b]; -> return [a, b, newVar];
                returnStmt.argument.elements.push(t.identifier(varName));
            } else {
                // return a; -> return [a, newVar];
                returnStmt.argument = t.arrayExpression([
                    returnStmt.argument,
                    t.identifier(varName)
                ]);
            }
        } else {
            // No return statement found? Append variable and add a return.
            body.push(decl);
            body.push(t.returnStatement(t.arrayExpression([t.identifier(varName)])));
        }
    }

    addFeature(type: string, sourceId: string | null, params: any[]) {
        if (!this.ast) return;

        const newVarName = this.allocateName('shape');
        let init: t.Expression;

        const args = params.map(p => this.convertArgToAST(p));

        if (sourceId) {
            init = t.callExpression(
                t.memberExpression(t.identifier(sourceId), t.identifier(type)),
                args
            );
        } else {
            init = t.callExpression(
                t.memberExpression(t.identifier('replicad'), t.identifier(type)),
                args
            );
        }

        const decl = t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(newVarName), init)
        ]);

        let injected = false;

        // Traverse to find 'main' function and inject code there
        traverse(this.ast, {
            // Handle: function main() { ... }
            FunctionDeclaration: (path: any) => {
                if (path.node.id?.name === 'main') {
                    this.injectIntoBody(path.node.body.body, decl, newVarName);
                    injected = true;
                    path.stop();
                }
            },
            // Handle: const main = () => { ... }
            VariableDeclarator: (path: any) => {
                if (t.isIdentifier(path.node.id) && path.node.id.name === 'main' &&
                    (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))) {
                    if (t.isBlockStatement(path.node.init.body)) {
                        this.injectIntoBody(path.node.init.body.body, decl, newVarName);
                        injected = true;
                        path.stop();
                    }
                }
            }
        });

        // Fallback: if no main function is found, append to global scope (legacy behavior)
        if (!injected) {
            (this.ast.program.body as any[]).push(decl);
        }

        this.regenerate();
        return newVarName;
    }

    /**
     * Combine several existing features into one via a boolean-style operation.
     *
     * Generates a NEW result feature that references the operands by name, e.g.
     *
     *     const shape3 = shape1.fuse(shape2);
     *
     * and removes the operands from the return array — but KEEPS their
     * declarations, since the result references them. (The previous approach
     * appended `.fuse(secondary)` to the primary and then deleted the secondary's
     * declaration, leaving a dangling reference → "secondary is not defined".)
     *
     * The operands stay in the code as consumed sub-features; they no longer
     * render because the worker drives the render set off the return array.
     *
     * @param op            method name on the primary (e.g. 'fuse', 'cut', 'intersect')
     * @param primaryId     the base operand
     * @param secondaryIds  operands applied in order
     * @param options.keepTools  when true, the operands stay in the return array
     *                           (rendered as individual bodies alongside the result);
     *                           when false (default) they are consumed.
     * @returns the new result feature's variable name
     */
    combineFeatures(
        op: string,
        primaryId: string,
        secondaryIds: string[],
        options: { keepTools?: boolean } = {},
    ): string | undefined {
        if (!this.ast) return;

        // A selection id may be a sub-entity like "shape2:face-0"; the boolean
        // operates on the owning solid, so strip the suffix. Then dedupe and drop
        // any operand equal to the primary.
        const base = (id: string) => id.split(':')[0];
        primaryId = base(primaryId);
        secondaryIds = [...new Set(secondaryIds.map(base))].filter(id => id !== primaryId);
        if (secondaryIds.length === 0) return;

        // Build: primary.op(sec1).op(sec2)...
        let init: t.Expression = t.identifier(primaryId);
        for (const secId of secondaryIds) {
            init = t.callExpression(
                t.memberExpression(init, t.identifier(op)),
                [t.identifier(secId)],
            );
        }

        // Operands are consumed (removed from the return array) unless the caller
        // asked to keep them as individual bodies.
        const consumed = options.keepTools ? [] : [primaryId, ...secondaryIds];
        return this.insertResultFeature(init, consumed);
    }

    /**
     * Apply an edge/face feature operation (fillet, chamfer, shell) to a base
     * body, referencing the sub-entities by their stable MappedNames. Generates:
     *
     *     const shape3 = __fillet(shape1, ["E[shape1#F0~shape1#F1]"], 2);
     *
     * The base body is consumed (replaced by the result); the worker resolves the
     * names to the current edges/faces at execution time, so the operation keeps
     * targeting the right entities after upstream edits.
     *
     * @param fnName    worker global to call ('__fillet' | '__chamfer' | '__shell')
     * @param baseId    the body being modified
     * @param refNames  stable names of the selected edges/faces
     * @param value     radius / distance / thickness
     * @returns the new result feature's variable name
     */
    applyReferenceOp(
        fnName: string,
        baseId: string,
        refNames: string[],
        value: number,
    ): string | undefined {
        if (!this.ast) return;
        baseId = baseId.split(':')[0];
        const names = [...new Set(refNames)].filter(Boolean);
        if (names.length === 0) return;

        const init = t.callExpression(t.identifier(fnName), [
            t.identifier(baseId),
            t.arrayExpression(names.map(n => t.stringLiteral(n))),
            t.numericLiteral(value),
        ]);

        return this.insertResultFeature(init, [baseId]);
    }

    /**
     * Inject `const shapeN = <init>` into main(), add it to the returned array,
     * and remove the `consumed` operands from the return array (keeping their
     * declarations, since the result references them). Shared by combineFeatures
     * and applyReferenceOp. Returns the new feature name, or undefined if main()
     * could not be found.
     */
    private insertResultFeature(init: t.Expression, consumed: string[]): string | undefined {
        if (!this.ast) return;

        const resultName = this.allocateName('shape');
        const decl = t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(resultName), init),
        ]);
        const consumedSet = new Set(consumed);

        const patchBody = (body: any[]) => {
            this.injectIntoBody(body, decl, resultName);
            body.forEach((node: any) => {
                if (!t.isReturnStatement(node) || !node.argument) return;
                if (t.isArrayExpression(node.argument)) {
                    node.argument.elements = node.argument.elements.filter(
                        (el: any) => !(t.isIdentifier(el) && consumedSet.has(el.name)),
                    );
                }
            });
        };

        let patched = false;
        traverse(this.ast, {
            FunctionDeclaration: (path: any) => {
                if (path.node.id?.name === 'main' && t.isBlockStatement(path.node.body)) {
                    patchBody(path.node.body.body);
                    patched = true;
                    path.stop();
                }
            },
            VariableDeclarator: (path: any) => {
                if (
                    t.isIdentifier(path.node.id) && path.node.id.name === 'main' &&
                    (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init)) &&
                    t.isBlockStatement(path.node.init.body)
                ) {
                    patchBody(path.node.init.body.body);
                    patched = true;
                    path.stop();
                }
            },
        });

        if (!patched) return;
        this.regenerate();
        return resultName;
    }

    addOperation(featureId: string, type: string, params: any[]) {
        const feature = this.features.find(f => f.id === featureId);
        if (!feature) {
            console.error("Feature not found", featureId);
            return;
        }

        // We assume the feature maps to a VariableDeclarator
        // We want to append a method call to the init expression.
        // const v = init;  --> const v = init.type(params);

        if (feature.path && feature.path.node.init) {
            const currentInit = feature.path.node.init;
            const args = params.map(p => this.convertArgToAST(p));

            const newInit = t.callExpression(
                t.memberExpression(currentInit, t.identifier(type)),
                args
            );

            feature.path.node.init = newInit;
            this.regenerate();
        }
    }

    /**
     * Generate code to extrude a face from an existing solid
     * Uses the extrudeFace helper function available in the worker execution context
     * 
     * Generates:
     *   const _ext1 = extrudeFace(solid, faceIndex, distance, {fuseWithOriginal: false});
     *   const faceExt1 = solid.fuse(_ext1);
     * 
     * @param solidId - The variable name of the solid
     * @param faceIndex - The display-time face index
     * @param distance - Extrusion distance
     * @param options - Optional extrusion options
     * @returns The variable name of the new fused shape
     */
    addFaceExtrusion(solidId: string, faceIndex: number, distance: number, options?: Record<string, any>): string {
        if (!this.ast) return '';

        const tempVarName = this.allocateName('_ext');
        const newVarName = this.allocateName('faceExt');

        // Build options with fuseWithOriginal: false so extrudeFace returns just the extrusion
        const extrudeOpts = { ...options, fuseWithOriginal: false };

        // Build: extrudeFace(solid, faceIndex, distance, {fuseWithOriginal: false})
        const extrudeArgs: t.Expression[] = [
            t.identifier(solidId),
            t.numericLiteral(faceIndex),
            t.numericLiteral(distance),
            this.convertArgToAST(extrudeOpts)
        ];
        const extrudeCall = t.callExpression(t.identifier('extrudeFace'), extrudeArgs);

        // Step 1: const _ext1 = extrudeFace(solid, faceIndex, distance, {fuseWithOriginal: false});
        const tempDecl = t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(tempVarName), extrudeCall)
        ]);

        // Step 2: const faceExt1 = solid.fuse(_ext1);
        const fuseCall = t.callExpression(
            t.memberExpression(t.identifier(solidId), t.identifier('fuse')),
            [t.identifier(tempVarName)]
        );
        const fuseDecl = t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(newVarName), fuseCall)
        ]);

        let injected = false;

        // Inject both statements into main function
        traverse(this.ast, {
            FunctionDeclaration: (path: any) => {
                if (path.node.id?.name === 'main') {
                    const body = path.node.body.body;
                    const returnIdx = body.findIndex((n: any) => t.isReturnStatement(n));
                    if (returnIdx !== -1) {
                        // Insert both declarations before return
                        body.splice(returnIdx, 0, tempDecl, fuseDecl);
                        // Update return to include the new variable
                        const returnStmt = body[returnIdx + 2];
                        if (returnStmt && t.isReturnStatement(returnStmt)) {
                            if (!returnStmt.argument) {
                                returnStmt.argument = t.arrayExpression([t.identifier(newVarName)]);
                            } else if (t.isArrayExpression(returnStmt.argument)) {
                                returnStmt.argument.elements.push(t.identifier(newVarName));
                            } else {
                                returnStmt.argument = t.arrayExpression([
                                    returnStmt.argument,
                                    t.identifier(newVarName)
                                ]);
                            }
                        }
                    } else {
                        body.push(tempDecl, fuseDecl);
                        body.push(t.returnStatement(t.arrayExpression([t.identifier(newVarName)])));
                    }
                    injected = true;
                    path.stop();
                }
            },
            VariableDeclarator: (path: any) => {
                if (t.isIdentifier(path.node.id) && path.node.id.name === 'main' &&
                    (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))) {
                    if (t.isBlockStatement(path.node.init.body)) {
                        const body = path.node.init.body.body;
                        const returnIdx = body.findIndex((n: any) => t.isReturnStatement(n));
                        if (returnIdx !== -1) {
                            body.splice(returnIdx, 0, tempDecl, fuseDecl);
                            const returnStmt = body[returnIdx + 2];
                            if (returnStmt && t.isReturnStatement(returnStmt)) {
                                if (!returnStmt.argument) {
                                    returnStmt.argument = t.arrayExpression([t.identifier(newVarName)]);
                                } else if (t.isArrayExpression(returnStmt.argument)) {
                                    returnStmt.argument.elements.push(t.identifier(newVarName));
                                } else {
                                    returnStmt.argument = t.arrayExpression([
                                        returnStmt.argument,
                                        t.identifier(newVarName)
                                    ]);
                                }
                            }
                        } else {
                            body.push(tempDecl, fuseDecl);
                            body.push(t.returnStatement(t.arrayExpression([t.identifier(newVarName)])));
                        }
                        injected = true;
                        path.stop();
                    }
                }
            }
        });

        if (!injected) {
            (this.ast.program.body as any[]).push(tempDecl, fuseDecl);
        }

        this.regenerate();
        return newVarName;
    }

    updateOperation(featureId: string, opIndex: number, args: any[]) {
        const feature = this.features.find(f => f.id === featureId);
        if (!feature) {
            console.error("Feature not found", featureId);
            return;
        }

        if (feature.path && feature.path.node.init) {
            let ptr = feature.path.node.init;

            const chainStack: any[] = [];
            let temp = ptr;
            while (temp) {
                if (t.isCallExpression(temp)) {
                    chainStack.push(temp);
                    if (t.isMemberExpression(temp.callee)) {
                        temp = temp.callee.object;
                    } else {
                        break;
                    }
                } else if (t.isMemberExpression(temp)) {
                    temp = temp.object;
                } else {
                    break;
                }
            }

            const targetNode = chainStack[chainStack.length - 1 - opIndex];

            if (targetNode) {
                targetNode.arguments = args.map((val: any) => {
                    if (typeof val === 'number') return t.numericLiteral(val);
                    if (typeof val === 'string') return t.stringLiteral(val);
                    if (Array.isArray(val)) {
                        return t.arrayExpression(val.map(v => typeof v === 'number' ? t.numericLiteral(v) : t.stringLiteral(v)));
                    }
                    if (typeof val === 'object' && val !== null) {
                        // Very basic object literal support
                        const properties = Object.entries(val).map(([k, v]) =>
                            t.objectProperty(t.identifier(k), typeof v === 'number' ? t.numericLiteral(v) : t.stringLiteral(v as string))
                        );
                        return t.objectExpression(properties);
                    }
                    return t.identifier('undefined');
                });
                this.regenerate();
            }
        }
    }

    removeFeature(featureId: string) {
        const feature = this.features.find(f => f.id === featureId);
        if (!feature) return;

        if (feature.path) {
            const updateReturnStatements = (body: any[]) => {
                body.forEach(node => {
                    if (!t.isReturnStatement(node)) return;

                    const arg = node.argument;
                    if (!arg) return;

                    if (t.isArrayExpression(arg)) {
                        const filtered = arg.elements.filter((element) => {
                            return !(t.isIdentifier(element) && element.name === featureId);
                        });
                        node.argument = t.arrayExpression(filtered as any[]);
                        return;
                    }

                    if (t.isIdentifier(arg) && arg.name === featureId) {
                        node.argument = t.arrayExpression([]);
                    }
                });
            };

            traverse(this.ast, {
                FunctionDeclaration: (path: any) => {
                    if (path.node.id?.name === 'main') {
                        updateReturnStatements(path.node.body.body);
                        path.stop();
                    }
                },
                VariableDeclarator: (path: any) => {
                    if (t.isIdentifier(path.node.id) && path.node.id.name === 'main' &&
                        (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))) {
                        if (t.isBlockStatement(path.node.init.body)) {
                            updateReturnStatements(path.node.init.body.body);
                            path.stop();
                        }
                    }
                }
            });

            feature.path.remove(); // Removes VariableDeclarator
            this.regenerate();
        }
    }

    regenerate() {
        const output = generate(this.ast!);
        this.code = output.code;
        this.parse();
    }

    private convertArgToAST(p: any): t.Expression {
        if (typeof p === 'string') return t.stringLiteral(p);
        if (typeof p === 'number') return t.numericLiteral(p);
        if (p === null || p === undefined) return t.identifier('undefined');
        if (Array.isArray(p)) {
            return t.arrayExpression(p.map(el => this.convertArgToAST(el)));
        }
        if (typeof p === 'object') {
            if (p.type === 'raw' && p.content) {
                try {
                    const ast = parse(`const x = ${p.content}`, { sourceType: 'module' });
                    return (ast.program.body[0] as any).declarations[0].init;
                } catch (e) {
                    console.error("Failed to parse raw argument", p.content);
                    return t.identifier('undefined');
                }
            }
            // General object literal
            const properties = Object.entries(p).map(([k, v]) =>
                t.objectProperty(t.identifier(k), this.convertArgToAST(v))
            );
            return t.objectExpression(properties);
        }
        return t.identifier('undefined');
    }

    getCode() {
        return this.code;
    }

    getFeatures() {
        return this.features;
    }
}

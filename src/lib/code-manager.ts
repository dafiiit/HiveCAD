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

    addFeature(type: string, sourceId: string | null, params: any[]) {
        if (!this.ast) return;

        const newVarName = `shape${this.features.length + 1}`;

        let init: t.Expression;

        if (sourceId) {
            const args = params.map(p => typeof p === 'string' ? t.stringLiteral(p) : t.numericLiteral(p));
            init = t.callExpression(
                t.memberExpression(t.identifier(sourceId), t.identifier(type)),
                args
            );
        } else {
            const args = params.map(p => typeof p === 'string' ? t.stringLiteral(p) : t.numericLiteral(p));
            init = t.callExpression(
                t.memberExpression(t.identifier('replicad'), t.identifier(type)),
                args
            );
        }

        const decl = t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(newVarName), init)
        ]);

        (this.ast.program.body as any[]).push(decl);

        this.regenerate();
        return newVarName;
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

            const args = params.map(p => {
                if (typeof p === 'string') return t.stringLiteral(p);
                if (typeof p === 'number') return t.numericLiteral(p);
                // Handle raw code/predicate object { type: 'raw', content: '...' }
                if (typeof p === 'object' && p.type === 'raw' && p.content) {
                    try {
                        // Parse the expression: e.g. "(e) => e.inPlane('XY')"
                        // parse is used, returns File -> Program -> Body -> Declaration -> Init
                        const ast = parse(`const x = ${p.content}`, { sourceType: 'module' });
                        return (ast.program.body[0] as any).declarations[0].init;
                    } catch (e) {
                        console.error("Failed to parse raw argument", p.content);
                        return t.identifier('undefined');
                    }
                }
                return t.identifier('undefined');
            });

            const newInit = t.callExpression(
                t.memberExpression(currentInit, t.identifier(type)),
                args
            );

            feature.path.node.init = newInit;
            this.regenerate();
        }
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

            // console.log("Chain stack size:", chainStack.length);
            // console.log("Targeting opIndex:", opIndex);

            const targetNode = chainStack[chainStack.length - 1 - opIndex];

            if (targetNode) {
                targetNode.arguments = args.map((val: any) => {
                    if (typeof val === 'number') return t.numericLiteral(val);
                    if (typeof val === 'string') return t.stringLiteral(val);
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
            feature.path.remove(); // Removes VariableDeclarator
            this.regenerate();
        }
    }

    regenerate() {
        const output = generate(this.ast!);
        this.code = output.code;
        this.parse();
    }

    getCode() {
        return this.code;
    }

    getFeatures() {
        return this.features;
    }
}

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

        const newVarName = `shape${this.features.length + 1}`;
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

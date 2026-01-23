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

export interface ASTNodeInfo {
    uuid: string;
    type: string;
    codeRange: CodeRange;
    node: t.Node;
    path?: any; // Babel path for manipulations
}

export class CodeManager {
    code: string;
    ast: t.File | null;
    nodeMap: Map<string, ASTNodeInfo>; // UUID -> Node Info

    constructor(code: string = "") {
        this.code = code;
        this.ast = null;
        this.nodeMap = new Map();
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
            this.mapNodes();
        } catch (e) {
            console.error("Failed to parse code:", e);
        }
    }

    mapNodes() {
        this.nodeMap.clear();
        if (!this.ast) return;

        let shapeCount = 0;

        traverse(this.ast, {
            CallExpression: (path: any) => {
                const callee = path.node.callee;
                let functionName = "";

                if (t.isMemberExpression(callee)) {
                    if (t.isIdentifier(callee.object) && callee.object.name === 'replicad') {
                        functionName = (callee.property as any).name;
                    } else if (t.isCallExpression(callee.object)) {
                        functionName = (callee.property as any).name;
                    }
                } else if (t.isIdentifier(callee)) {
                    functionName = callee.name;
                }

                const interestingFunctions = [
                    'makeBox', 'makeCylinder', 'makeSphere', 'makeTorus',
                    'draw', 'drawEllipse', 'drawRectangle', 'drawCircle', 'drawPolysides'
                ];

                if (interestingFunctions.includes(functionName)) {
                    const uuid = `node-${shapeCount++}`;
                    this.nodeMap.set(uuid, {
                        uuid,
                        type: functionName,
                        codeRange: path.node.loc ? { start: path.node.loc.start, end: path.node.loc.end } : { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } },
                        node: path.node,
                        path
                    });
                }
            }
        });
    }

    transformForExecution(): string {
        if (!this.ast) return this.code;

        const astForExec = parse(this.code, { sourceType: 'module' });
        let shapeIndex = 0;

        traverse(astForExec, {
            CallExpression: (path: any) => {
                const callee = path.node.callee;
                let isInteresting = false;

                if (t.isMemberExpression(callee)) {
                    if (t.isIdentifier(callee.object) && callee.object.name === 'replicad') {
                        isInteresting = true;
                    }
                } else if (t.isIdentifier(callee)) {
                    if (['makeBox', 'makeCylinder', 'makeSphere', 'draw', 'drawEllipse'].includes(callee.name)) {
                        isInteresting = true;
                    }
                }

                if (isInteresting && path.parent.type !== 'CallExpression') {
                    const uuid = `node-${shapeIndex++}`;

                    const wrapper = t.callExpression(
                        t.identifier('__record'),
                        [
                            t.stringLiteral(uuid),
                            path.node
                        ]
                    );

                    path.replaceWith(wrapper);
                    path.skip();
                }
            }
        });

        const output = generate(astForExec);
        return output.code;
    }

    updateArgument(uuid: string, argIndex: number, value: any) {
        const nodeInfo = this.nodeMap.get(uuid);
        if (!nodeInfo) {
            console.error(`Node ${uuid} not found in AST map`);
            return;
        }

        if (t.isCallExpression(nodeInfo.node)) {
            const args = nodeInfo.node.arguments;
            if (args.length > argIndex) {
                if (typeof value === 'number') {
                    args[argIndex] = t.numericLiteral(value);
                } else if (typeof value === 'string') {
                    args[argIndex] = t.stringLiteral(value);
                }
            }
        }

        this.regenerate();
    }

    removeNode(uuid: string) {
        const nodeInfo = this.nodeMap.get(uuid);
        if (!nodeInfo) {
            console.error(`Node ${uuid} not found in AST map`);
            return;
        }

        if (nodeInfo.path) {
            let pathToRemove = nodeInfo.path;

            if (pathToRemove.parentPath && t.isCallExpression(pathToRemove.parentPath.node)) {
                const callee = pathToRemove.parentPath.node.callee;
                if (t.isMemberExpression(callee) && (callee.property as any).name === 'push') {
                    pathToRemove = pathToRemove.parentPath;
                }
            }

            if (pathToRemove.parentPath && t.isExpressionStatement(pathToRemove.parentPath.node)) {
                pathToRemove = pathToRemove.parentPath;
            }

            pathToRemove.remove();
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
}

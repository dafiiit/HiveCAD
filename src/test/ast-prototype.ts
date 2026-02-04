
// todo:refine Prototype script; convert into a real test or integrate into production codegen.
import parser from '@babel/parser';
import traverseBabel from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
const traverse = (traverseBabel as any).default || traverseBabel;
const parse = (parser as any).default || parser;
const code = `
const sketch = replicad.draw().line(10, 0).line(0, 10).close();
const body = sketch.sketchOnPlane('XY').extrude(10);
const body2 = body.fillet(2, (e) => e.inPlane('XY'));
`;

const ast = parser.parse(code, { sourceType: 'module' });

interface FeatureNode {
    id: string; // Variable name
    type: string;
    source?: string; // The variable it mimics calling upon
    operations: { name: string, args: any[] }[];
}

const features: FeatureNode[] = [];

traverse(ast, {
    VariableDeclaration(path) {
        path.node.declarations.forEach(decl => {
            if (t.isIdentifier(decl.id) && decl.init) {
                const varName = decl.id.name;
                const operations: { name: string, args: any[] }[] = [];
                let source = "";

                // Traverse the call chain
                let current = decl.init;
                while (t.isCallExpression(current)) {
                    if (t.isMemberExpression(current.callee)) {
                        const propName = (current.callee.property as t.Identifier).name;

                        // Check for replicad.draw case (base of chain)
                        if (t.isIdentifier(current.callee.object) && current.callee.object.name === 'replicad') {
                            operations.unshift({ name: propName, args: current.arguments });
                            source = 'replicad';
                            current = current.callee.object as any; // becomes Identifier replicad
                            break;
                        }

                        operations.unshift({ name: propName, args: current.arguments }); // Add to front as we go up
                        current = current.callee.object as any;
                    } else if (t.isIdentifier(current.callee)) {
                        // Base call? e.g. someFunc()
                        operations.unshift({ name: current.callee.name, args: current.arguments });
                        break;
                    } else {
                        break;
                    }
                }

                if (t.isIdentifier(current) && source !== 'replicad') {
                    source = current.name;
                }

                features.push({
                    id: varName,
                    type: 'Feature',
                    source,
                    operations
                });
            }
        });
    }
});

console.log(JSON.stringify(features, null, 2));

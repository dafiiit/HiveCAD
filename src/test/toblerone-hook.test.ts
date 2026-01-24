import { describe, it, expect } from 'vitest';

/**
 * Test for replicad code patterns that use defaultParams.
 * This tests the detection logic used in useCADStore.runCode()
 * to properly pass defaultParams to main().
 */
describe('DefaultParams Detection', () => {

    // This regex is the same as used in useCADStore.ts
    const hasDefaultParamsPattern = /const\s+defaultParams\s*=/;

    it('should detect defaultParams in toblerone hook code', () => {
        const code = `
const defaultParams = {
  height: 85.0,
  width: 120.0,
  thickness: 2.0,
  holeDia: 50.0,
  hookHeight: 10.0,
};

const { drawCircle, draw, makePlane } = replicad;

function main(
  r,
  { width: inputWidth, height, thickness, holeDia, hookHeight }
) {
  const length = inputWidth;
  const width = inputWidth * 0.9;

  const tobleroneShape = draw([-width / 2, 0])
    .lineTo([0, height])
    .lineTo([width / 2, 0])
    .close()
    .sketchOnPlane("XZ", -length / 2)
    .extrude(length)
    .shell(thickness, (f) => f.parallelTo("XZ"))
    .fillet(thickness / 2, (e) =>
      e
        .inDirection("Y")
        .either([(f) => f.inPlane("XY"), (f) => f.inPlane("XY", height)])
    );

  const hole = drawCircle(holeDia / 2)
    .sketchOnPlane(makePlane("YZ").translate([-length / 2, 0, height / 3]))
    .extrude(length);

  const base = tobleroneShape.cut(hole);
  const body = base.clone().fuse(base.rotate(90));

  const hookWidth = length / 2;
  const hook = draw([0, hookHeight / 2])
    .smoothSplineTo([hookHeight / 2, 0], -45)
    .lineTo([hookWidth / 2, 0])
    .line(-hookWidth / 4, hookHeight / 2)
    .smoothSplineTo([0, hookHeight], {
      endTangent: 180,
      endFactor: 0.6,
    })
    .closeWithMirror()
    .sketchOnPlane("XZ")
    .extrude(thickness)
    .translate([0, thickness / 2, height - thickness / 2]);

  return body.fuse(hook);
}
`;

        const hasDefaultParams = hasDefaultParamsPattern.test(code);
        expect(hasDefaultParams).toBe(true);

        // Verify the correct main call is generated
        const mainCall = hasDefaultParams
            ? "\nreturn main(replicad, defaultParams);"
            : "\nreturn main();";
        expect(mainCall).toBe("\nreturn main(replicad, defaultParams);");
    });

    it('should NOT detect defaultParams in simple code', () => {
        const code = `
function main() {
  const { makeBaseBox } = replicad;
  return makeBaseBox(10, 10, 10);
}
`;

        const hasDefaultParams = hasDefaultParamsPattern.test(code);
        expect(hasDefaultParams).toBe(false);

        const mainCall = hasDefaultParams
            ? "\nreturn main(replicad, defaultParams);"
            : "\nreturn main();";
        expect(mainCall).toBe("\nreturn main();");
    });

    it('should detect defaultParams with different spacing', () => {
        // Test various spacing patterns
        const patterns = [
            'const defaultParams = { foo: 1 };',
            'const defaultParams= { foo: 1 };',
            'const  defaultParams  =  { foo: 1 };',
            'const\ndefaultParams\n=\n{ foo: 1 };',
        ];

        for (const pattern of patterns) {
            expect(hasDefaultParamsPattern.test(pattern)).toBe(true);
        }
    });

    it('should NOT detect similar but different patterns', () => {
        const notDefaultParams = [
            'let defaultParams = { foo: 1 };', // 'let' not 'const'
            'const DefaultParams = { foo: 1 };', // Different case
            'const myDefaultParams = { foo: 1 };', // Different name
            'const defaultParamsConfig = { foo: 1 };', // Suffix
        ];

        for (const pattern of notDefaultParams) {
            expect(hasDefaultParamsPattern.test(pattern)).toBe(false);
        }
    });

    it('should handle the generated main call formation', () => {
        // Test that Function constructor can be created with the main call pattern
        const codeWithParams = `
const defaultParams = { value: 42 };
function main(r, { value }) { return value * 2; }
`;

        const mainCall = "\nreturn main(replicad, defaultParams);";

        // This should not throw
        const evaluator = new Function('replicad', codeWithParams + mainCall);

        // Execute with a mock replicad object
        const mockReplicad = {};
        const result = evaluator(mockReplicad);
        expect(result).toBe(84);
    });

    it('should handle main without params', () => {
        const codeWithoutParams = `
function main() { return 42; }
`;

        const mainCall = "\nreturn main();";
        const evaluator = new Function('replicad', codeWithoutParams + mainCall);

        const result = evaluator({});
        expect(result).toBe(42);
    });
});

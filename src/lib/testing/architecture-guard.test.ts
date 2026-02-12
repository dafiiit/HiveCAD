import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const toolsCoreRoot = path.resolve(process.cwd(), 'src/lib/tools/core');
const invokeFile = path.resolve(process.cwd(), 'src/lib/tools/invoke.ts');
const idGeneratorFile = path.resolve(process.cwd(), 'src/lib/utils/id-generator.ts');

function listFilesRecursively(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listFilesRecursively(fullPath));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

describe('architecture guards', () => {
    test('core tools never use legacy positional method signatures', () => {
        const files = listFilesRecursively(toolsCoreRoot).filter((file) =>
            (file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.test.ts'),
        );

        const legacySignaturePatterns: RegExp[] = [
            /\bcreate\s*\(\s*codeManager\s*:\s*CodeManager/i,
            /\bexecute\s*\(\s*codeManager\s*:\s*CodeManager/i,
            /\baddToSketch\s*\(\s*codeManager\s*:\s*CodeManager/i,
            /\bcreateShape\s*\(\s*codeManager\s*:\s*CodeManager/i,
        ];

        const violations: string[] = [];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            for (const pattern of legacySignaturePatterns) {
                if (pattern.test(content)) {
                    violations.push(path.relative(process.cwd(), file));
                    break;
                }
            }
        }

        expect(violations).toEqual([]);
    });

    test('tool invoker has no legacy arity fallback', () => {
        const content = fs.readFileSync(invokeFile, 'utf-8');

        expect(content.includes('.length <= 1')).toBe(false);
        expect(content.includes('context.codeManager, context.params')).toBe(false);
        expect(content.includes('context.codeManager, context.scene.selectedIds, context.params')).toBe(false);
    });

    test('lib does not call crypto.randomUUID directly except id generator service', () => {
        const libRoot = path.resolve(process.cwd(), 'src/lib');
        const files = listFilesRecursively(libRoot).filter((file) =>
            (file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.test.ts'),
        );

        const violations: string[] = [];
        for (const file of files) {
            if (path.resolve(file) === idGeneratorFile) continue;
            const content = fs.readFileSync(file, 'utf-8');
            if (content.includes('crypto.randomUUID')) {
                violations.push(path.relative(process.cwd(), file));
            }
        }

        expect(violations).toEqual([]);
    });
});

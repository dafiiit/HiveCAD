import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../lib/tools/registry';
import {
    boxTool, cylinderTool, sphereTool,
    lineTool, circleTool, rectangleTool
} from '../lib/tools';

describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    describe('registration', () => {
        it('should register and retrieve a tool', () => {
            registry.register(boxTool);
            const tool = registry.get('box');
            expect(tool).toBe(boxTool);
        });

        it('should return undefined for unregistered tools', () => {
            const tool = registry.get('nonexistent');
            expect(tool).toBeUndefined();
        });

        it('should correctly report if a tool exists', () => {
            registry.register(boxTool);
            expect(registry.has('box')).toBe(true);
            expect(registry.has('nonexistent')).toBe(false);
        });

        it('should track the number of registered tools', () => {
            expect(registry.size).toBe(0);
            registry.register(boxTool);
            expect(registry.size).toBe(1);
            registry.register(cylinderTool);
            expect(registry.size).toBe(2);
        });
    });

    describe('querying', () => {
        beforeEach(() => {
            registry.register(boxTool);
            registry.register(cylinderTool);
            registry.register(sphereTool);
            registry.register(lineTool);
            registry.register(circleTool);
            registry.register(rectangleTool);
        });

        it('should filter tools by category', () => {
            const primitives = registry.getByCategory('primitive');
            expect(primitives.length).toBe(3);
            expect(primitives.every(t => t.metadata.category === 'primitive')).toBe(true);
        });

        it('should filter tools by group', () => {
            const shapeTools = registry.getByGroup('Shape');
            expect(shapeTools.length).toBe(2); // circle and rectangle
        });

        it('should return all tool IDs', () => {
            const ids = registry.getAllIds();
            expect(ids).toContain('box');
            expect(ids).toContain('line');
            expect(ids.length).toBe(6);
        });

        it('should return all metadata', () => {
            const metadata = registry.getAllMetadata();
            expect(metadata.length).toBe(6);
            expect(metadata.every(m => m.id && m.label && m.icon)).toBe(true);
        });
    });

    describe('default params', () => {
        beforeEach(() => {
            registry.register(boxTool);
            registry.register(lineTool);
        });

        it('should return default params from UI properties', () => {
            const params = registry.getDefaultParams('box');
            expect(params).toEqual({ width: 10, height: 10, depth: 10 });
        });

        it('should return empty object for tools without UI properties', () => {
            const params = registry.getDefaultParams('line');
            expect(params).toEqual({});
        });

        it('should return empty object for unregistered tools', () => {
            const params = registry.getDefaultParams('nonexistent');
            expect(params).toEqual({});
        });
    });

    describe('UI properties', () => {
        beforeEach(() => {
            registry.register(boxTool);
        });

        it('should return UI properties for a tool', () => {
            const props = registry.getUIProperties('box');
            expect(props.length).toBe(3);
            expect(props.map(p => p.key)).toEqual(['width', 'height', 'depth']);
        });

        it('should return empty array for tools without UI properties', () => {
            registry.register(lineTool);
            const props = registry.getUIProperties('line');
            expect(props).toEqual([]);
        });
    });
});

describe('Tool implementations', () => {
    describe('boxTool', () => {
        it('should have correct metadata', () => {
            expect(boxTool.metadata.id).toBe('box');
            expect(boxTool.metadata.category).toBe('primitive');
            expect(boxTool.metadata.icon).toBe('Box');
        });

        it('should have create method', () => {
            expect(typeof boxTool.create).toBe('function');
        });

        it('should have UI properties with defaults', () => {
            expect(boxTool.uiProperties.length).toBe(3);
            const widthProp = boxTool.uiProperties.find(p => p.key === 'width');
            expect(widthProp?.default).toBe(10);
        });
    });

    describe('lineTool', () => {
        it('should have correct metadata', () => {
            expect(lineTool.metadata.id).toBe('line');
            expect(lineTool.metadata.category).toBe('sketch');
            expect(lineTool.metadata.group).toBe('Line');
        });

        it('should have addToSketch method', () => {
            expect(typeof lineTool.addToSketch).toBe('function');
        });

        it('should have processPoints method', () => {
            expect(typeof lineTool.processPoints).toBe('function');
        });
    });

    describe('circleTool', () => {
        it('should have createShape method for shape wrappers', () => {
            expect(typeof circleTool.createShape).toBe('function');
        });
    });
});

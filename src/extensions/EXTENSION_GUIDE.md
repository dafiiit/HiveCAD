# HiveCAD Extension Development Guide

This guide explains how to create extensions for HiveCAD's plugin architecture.

## Quick Start

1. **Copy the template**: `cp -r src/extensions/_template src/extensions/my-extension`
2. **Edit `extension.json`**: Update metadata (id, name, description, icon)
3. **Implement `index.ts`**: Define your tool's logic and UI properties
4. **Register your extension**: Import in `src/lib/extensions/loader.ts`
5. **Restart dev server**: Your extension appears in the toolbar

---

## Extension Structure

```
src/extensions/my-extension/
├── extension.json    # Manifest with metadata
├── index.ts         # Extension implementation
└── README.md        # Documentation
```

### extension.json

Required manifest with extension metadata:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "What this extension does",
  "author": "Your Name",
  "icon": "Package",
  "category": "primitive"
}
```

**Fields:**
- `id`: Unique identifier (kebab-case, e.g., `gear-generator`)
- `name`: Display name in UI
- `version`: Semantic version
- `description`: Shown in extension store
- `author`: Your name or organization
- `icon`: [Lucide icon name](https://lucide.dev/icons)
- `category`: `primitive`, `sketch`, `operation`, `modifier`, or `utility`

---

## Tool Implementation

### Basic Structure

```typescript
import type { Extension } from '@/lib/extensions';
import type { Tool } from '@/lib/tools/types';

const tool: Tool = {
    metadata: { id, label, icon, category },
    uiProperties: [...],
    create(codeManager, params) { ... }
};

export const extension: Extension = {
    manifest: { ... },
    tool
};
```

### UI Properties

Define parameters shown in the OperationProperties panel:

```typescript
uiProperties: [
    // Number input
    { key: 'width', label: 'Width', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 },
    
    // Boolean checkbox
    { key: 'centered', label: 'Centered', type: 'boolean', default: true },
    
    // Dropdown select
    { key: 'style', label: 'Style', type: 'select', default: 'solid',
      options: [{ value: 'solid', label: 'Solid' }, { value: 'hollow', label: 'Hollow' }] },
    
    // Object picker
    { key: 'targetFace', label: 'Target Face', type: 'selection', default: null,
      allowedTypes: ['face'] }
]
```

### Create Function

Generate CAD geometry using the CodeManager:

```typescript
create(codeManager: CodeManager, params: Record<string, any>): string {
    const { width = 10, height = 10 } = params;
    return codeManager.addFeature('makeBaseBox', null, [width, height, width]);
}
```

---

## Custom Data Storage

Extensions can store data on CADObjects:

```typescript
// When creating an object, store extension data
const obj: CADObject = {
    ...baseObject,
    extensionData: {
        'my-extension': {
            customProperty: 42,
            settings: { mode: 'advanced' }
        }
    }
};

// Later, retrieve the data
const myData = obj.extensionData?.['my-extension'];
```

---

## 3D Preview (Optional)

Provide custom preview geometry while drawing:

```typescript
renderPreview(primitive, to3D, isGhost) {
    const color = isGhost ? "#00ffff" : "#ffff00";
    const points = primitive.points.map(p => to3D(p[0], p[1]));
    
    return React.createElement('line', { key: primitive.id },
        React.createElement('bufferGeometry', ...),
        React.createElement('lineBasicMaterial', { color })
    );
}
```

---

## Registration

Add your extension to `src/lib/extensions/loader.ts`:

```typescript
import myExtension from '../../extensions/my-extension';

export function loadBuiltinExtensions(): void {
    // ... existing registrations
    extensionRegistry.register(myExtension);
}
```

---

## Best Practices

1. **Consistent UI**: Use the `uiProperties` system for all parameters
2. **Meaningful icons**: Choose Lucide icons that represent your tool
3. **Good defaults**: Set sensible default values for all properties
4. **Documentation**: Include a README.md with usage instructions
5. **Namespace data**: Use your extension ID as the key in `extensionData`

---

## Common Patterns

### Primitive Tool (creates a shape)
```typescript
category: 'primitive'
create(codeManager, params) {
    return codeManager.addFeature('makeBaseBox', null, [...]);
}
```

### Sketch Tool (draws on sketch)
```typescript
category: 'sketch'
addToSketch(codeManager, sketchName, primitive) {
    codeManager.addOperation(sketchName, 'lineTo', [...]);
}
processPoints(points) { return { id, type, points }; }
```

### Operation Tool (modifies selection)
```typescript
category: 'operation'
selectionRequirements: { min: 1, allowedTypes: ['sketch'] }
execute(codeManager, selectedIds, params) {
    codeManager.addOperation(selectedIds[0], 'extrude', [params.height]);
}
```

---

## Debugging

- Check browser console for registration logs
- Verify your extension appears in `extensionRegistry.getAll()`
- Use `onRegister()` hook for initialization debugging

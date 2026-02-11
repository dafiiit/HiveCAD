# HiveCAD Extension Development Guide

This guide explains how to create and publish extensions for HiveCAD's plugin architecture.

## Quick Start (Community Extensions)

1. **Create Extension**: Use the "Create New Tool" button in the Extension Store
2. **Automatic Setup**: HiveCAD creates a GitHub folder with template files
3. **Edit on GitHub**: Modify `manifest.json`, `index.ts`, and `README.md`
4. **Test Locally**: Set status to `development` to test privately
5. **Publish**: Toggle status to `published` when ready to share

---

## Extension Structure (GitHub)

When you create an extension, HiveCAD generates this structure in your repository:

```
extensions/
  {extension-id}/
    ├── manifest.json    # Extension metadata (DO NOT rename)
    ├── index.ts         # Your extension code
    ├── README.md        # Documentation for users
    └── thumbnail.png    # (optional) Preview image
```

### manifest.json

Auto-generated file containing your extension's metadata:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "What this extension does",
  "author": "your.email@example.com",
  "icon": "Package"
}
```

**Fields:**
- `id`: Unique identifier (auto-generated from name)
- `name`: Display name in the Extension Store
- `version`: Semantic version (increment when updating)
- `description`: Shown in extension cards
- `author`: Your email (auto-populated)
- `icon`: [Lucide icon name](https://lucide.dev/icons)

**⚠️ Important**: The manifest is the **single source of truth**. Changes here are reflected immediately in the Extension Store.

---

## Development Workflow

### 1. Initial Creation

Use the HiveCAD UI to create a new extension:
- Opens Extension Store → "Create New Tool"
- Fill in name, description, icon
- Click "Create"
- You're redirected to your GitHub repository

### 2. Local Development

Edit `index.ts` to implement your tool:

```typescript
import { Extension } from '@/lib/extensions/Extension';
import { Tool } from '@/lib/tools/types';

const tool: Tool = {
    metadata: {
        id: 'my-extension',
        label: 'My Extension',
        icon: 'Package',
        category: 'modifier'
    },
    uiProperties: [
        { 
            key: 'width', 
            label: 'Width', 
            type: 'number', 
            default: 10, 
            unit: 'mm' 
        }
    ],
    create(codeManager, params) {
        const { width = 10 } = params;
        return codeManager.addFeature('makeBaseBox', null, [width, width, width]);
    }
};

export const extension: Extension = {
    manifest: {
        id: 'my-extension',
        name: 'My Extension',
        version: '1.0.0',
        description: 'Creates custom boxes',
        author: 'you@example.com',
        icon: 'Package',
        category: 'primitive',
    },
    tool,
    onRegister: () => {
        console.log('My extension registered');
    },
};
```

### 3. Status Management

Extensions have two states (managed in HiveCAD UI):

- **`development`** (default): Only visible to you for testing
- **`published`**: Visible to everyone in the community

Toggle status from the Extension Store on your own extensions.

### 4. Version Updates

When you make changes:
1. Update `version` in `manifest.json` (e.g., `1.0.0` → `1.1.0`)
2. Commit and push to GitHub
3. Changes are live immediately for all users

---

## Tool Implementation

### UI Properties

Define parameters shown in the OperationProperties panel:

```typescript
uiProperties: [
    // Number input
    { 
        key: 'teeth', 
        label: 'Number of Teeth', 
        type: 'number', 
        default: 20, 
        min: 6, 
        max: 200, 
        step: 1 
    },
    
    // Boolean checkbox
    { 
        key: 'centered', 
        label: 'Center at Origin', 
        type: 'boolean', 
        default: true 
    },
    
    // Dropdown select
    { 
        key: 'profile', 
        label: 'Tooth Profile', 
        type: 'select', 
        default: 'involute',
        options: [
            { value: 'involute', label: 'Involute' },
            { value: 'cycloidal', label: 'Cycloidal' }
        ]
    },
    
    // Object selection
    { 
        key: 'targetFace', 
        label: 'Target Face', 
        type: 'selection', 
        default: null,
        allowedTypes: ['face']
    }
]
```

### Create Function

Generate CAD geometry using the CodeManager:

```typescript
create(codeManager: CodeManager, params: Record<string, any>): string {
    const { width = 10, height = 10, depth = 10 } = params;
    
    // Create a primitive shape
    return codeManager.addFeature('makeBaseBox', null, [width, height, depth]);
}
```

---

## Custom Data Storage

Extensions can store persistent data on CADObjects:

```typescript
// When creating an object, store extension-specific data
const obj: CADObject = {
    ...baseObject,
    extensionData: {
        'gear-generator': {
            module: 2,
            pressureAngle: 20,
            generatedAt: Date.now()
        }
    }
};

// Later, retrieve the data
const gearData = obj.extensionData?.['gear-generator'];
if (gearData) {
    console.log('Gear module:', gearData.module);
}
```

**Best Practice**: Use your extension ID as the key to avoid conflicts.

---

## Tool Categories

Choose the appropriate category for your extension:

### `primitive` - Creates new shapes
```typescript
category: 'primitive'
create(codeManager, params) {
    return codeManager.addFeature('makeBaseBox', null, [10, 10, 10]);
}
```

### `sketch` - Drawing tools
```typescript
category: 'sketch'
addToSketch(codeManager, sketchName, primitive) {
    codeManager.addOperation(sketchName, 'lineTo', [...]);
}
```

### `operation` - Modifies existing geometry
```typescript
category: 'operation'
selectionRequirements: { min: 1, allowedTypes: ['box', 'cylinder'] }
execute(codeManager, selectedIds, params) {
    codeManager.addOperation(selectedIds[0], 'fillet', [params.radius]);
}
```

### `modifier` - Transforms or adjusts
```typescript
category: 'modifier'
execute(codeManager, selectedIds, params) {
    // Apply transformations
}
```

### `utility` - Helper tools
```typescript
category: 'utility'
// Measurement, analysis, export tools, etc.
```

---

## Publishing Checklist

Before publishing your extension:

- [ ] **Test thoroughly** in development mode
- [ ] **Write clear README.md** with usage instructions
- [ ] **Choose appropriate icon** from [Lucide](https://lucide.dev/icons)
- [ ] **Add meaningful description** (shown in Extension Store)
- [ ] **Version properly** using semantic versioning
- [ ] **Document parameters** in code comments
- [ ] **Handle edge cases** (null values, invalid inputs)

---

## Best Practices

1. **Consistent UI**: Use `uiProperties` for all user parameters
2. **Meaningful icons**: Choose icons that represent your tool's function
3. **Good defaults**: Set sensible default values for all properties
4. **Clear documentation**: Include usage examples in README.md
5. **Namespace data**: Use your extension ID as the key in `extensionData`
6. **Version semantically**: 
   - MAJOR: Breaking changes
   - MINOR: New features (backward compatible)
   - PATCH: Bug fixes
7. **Test before publishing**: Toggle to `development` first

---

## GitHub Folder Location

Your extensions live in:
```
https://github.com/{your-username}/hivecad-data/tree/main/extensions/{extension-id}/
```

All files in this folder are version-controlled, so you have full history.

---

## Debugging

- Check browser console for registration logs
- Verify manifest.json is valid JSON
- Ensure icon name exists in [Lucide icons](https://lucide.dev/icons)
- Use `onRegister()` hook for initialization debugging
- Check network tab for manifest loading errors

---

## Common Issues

**Extension not appearing?**
- Check status is `published`, not `development`
- Verify manifest.json syntax is valid
- Ensure icon name is correct

**Parameters not showing?**
- Check `uiProperties` array syntax
- Verify `type` is one of: `number`, `boolean`, `select`, `selection`

**Code errors?**
- Check browser console for TypeScript errors
- Ensure all imports are correct
- Verify CodeManager methods are called properly

---

## Support

For questions or issues:
- Check examples in the Extension Store
- Review existing extensions in the community
- Report bugs via GitHub Issues

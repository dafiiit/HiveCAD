# My Custom Tool

A template extension for creating custom tools in HiveCAD.

## Installation

Copy this folder to `src/extensions/your-tool-name/` and modify the files.

## Usage

1. Update `extension.json` with your tool's metadata
2. Modify `index.ts` to implement your tool's logic
3. Import and register your extension in `src/lib/extensions/loader.ts`

## Files

- `extension.json` - Extension manifest (metadata)
- `index.ts` - Extension implementation
- `README.md` - Documentation (this file)

## Configuration

Edit `uiProperties` in `index.ts` to define the parameters shown in the UI.

Supported property types:
- `number` - Numeric input with optional min/max/step
- `boolean` - Checkbox toggle
- `select` - Dropdown with options
- `text` - Text input
- `selection` - Object picker from viewport

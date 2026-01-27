# HiveCAD Design System

## Core Design Principles
1. **Unification**: All similar elements must share the same properties (color, radius, spacing).
2. **Premium Feel**: Use subtle interactions, proper spacing, and harmonious colors.
3. **Roundness**:
    - **Buttons & Inputs**: Fully rounded (`rounded-full`) for main actions, search bars, and toggles.
    - **Cards & Panels**: `rounded-xl` or `rounded-2xl` for smooth corners.
4. **Colors (Greyscale)**:
    - **Background**: `hsl(var(--background))` (Dark Slate)
    - **Panels/Cards**: `hsl(var(--card))`
    - **Headlines**: `hsl(var(--foreground))` (White/Off-white)
    - **Subtitles/Icons**: `hsl(var(--muted-foreground))` (Muted Grey)
    - **Borders**: `hsl(var(--border))` (Subtle Grey)
    - **Avoid**: Hardcoded hex values like `#222`, `#1a1a1a`, `#333`. Use CSS variables.

## Component Specifics

### Top Bar / Header
- **Background**: Transparent (blends with body) or same as body background. No distinct "bar" look unless sticky/scrolled.
- **Border**: Minimal or removed.

### Search Bar
- **Shape**: Pill-shaped (`rounded-full`).
- **Height**: Comfortable touch target (h-10 or h-12).

### Switches / Toggles
- **Shape**: Pill-shaped (`rounded-full`).
- **Size**: Slightly larger for better clickability.

### Color Picker
- **Library**: `react-colorful`.
- **Style**: Unified popover or distinct panel section. 

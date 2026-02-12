# HiveCAD Design System

## Design Goals
1. **Clarity First**: Modeling surfaces, constraints, and tool state remain readable at all times.
2. **Consistency**: Shared components use shared tokens (no ad-hoc colors or radii).
3. **Subtle Motion**: Microinteractions communicate state changes without distracting from CAD tasks.
4. **Theme Parity**: Dark and light mode provide equivalent hierarchy and affordances.

## Theme Tokens

All UI colors come from CSS variables in `src/index.css` and are consumed through Tailwind tokens.

### Core Semantic Tokens
- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--border`, `--input`, `--ring`
- `--radius`

### CAD Tokens
- `--toolbar-bg`, `--toolbar-border`
- `--panel-bg`, `--panel-header`
- `--viewport-bg`, `--timeline-bg`
- `--icon-default`, `--icon-hover`
- `--tab-active`, `--selection-blue`
- `--viewcube-bg`, `--viewcube-face`, `--viewcube-edge`
- `--sketch-grid`, `--sketch-origin`

### Sidebar Tokens
- `--sidebar-background`, `--sidebar-foreground`
- `--sidebar-primary`, `--sidebar-primary-foreground`
- `--sidebar-accent`, `--sidebar-accent-foreground`
- `--sidebar-border`, `--sidebar-ring`

## Dark + Light Mode Rules

1. Theme switching is class-based via `body.light` (dark is default baseline).
2. UI chrome (toolbar/panels/sidebar) adapts fully between dark/light.
3. Viewport remains dark in light mode to preserve modeling contrast.
4. Focus rings and active states are theme-safe via semantic tokens (`ring`, `accent`, `primary`).

## Component Guidelines

### Toolbar & Tabs
- Toolbar uses `bg-toolbar` with `border-toolbar-border`.
- Tabs use `cad-toolbar-tab`; active tabs use `cad-toolbar-tab-active`.
- Active tabs rely on token-based fill + border rather than hardcoded colors.

### Tool Buttons
- Use `cad-tool-button` + `cad-tool-button-active`.
- Minimum hit area: `52x56` px equivalent.
- Rounded geometry: `rounded-xl`.
- Keyboard accessibility: `:focus-visible` ring from `--ring`.

### Panels
- Header and body separation via `panel-header` / `panel-bg` tokens.
- Panel actions use subtle hover states (`secondary`), not custom hex values.

### Sketch Palette
- Floating panel uses a soft glass treatment (`background/blur`) with tokenized border.
- Plane indicators are intentionally distinct but still HSL-based and consistent with theme strategy.

## Microinteractions (Current)

### Tool Selection
- Active tool icon plays a short morph animation (`cad-tool-icon-morph`, 260ms).
- Tool container emits a subtle pulse (`cad-tool-active-pulse`) on selection.
- Dropdown chevrons rotate when active for clearer affordance.

### Interaction Constraints
- Motion is subtle, quick, and state-driven (no continuous decorative animation).
- `prefers-reduced-motion` disables non-essential animation.
- All motion should be transform/opacity/filter based for performance.

## Usage Rules

1. Prefer semantic Tailwind token classes over hardcoded values.
2. Reuse CAD utility classes (`cad-*`) before creating new one-off styles.
3. Keep interactions efficient (short durations, no layout-thrashing animations).
4. Maintain parity between mouse, keyboard, and touch affordances.

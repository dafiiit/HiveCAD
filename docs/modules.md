# Modules & Extensions Status

HiveCAD is designed with a modular architecture, allowing features to be added as extensions.

## Core Modules

### Storage Adapters (`src/lib/storage/adapters`)
Managed by the `StorageManager`, these adapters handle file persistence.

| Module | Status | Description |
| :--- | :--- | :--- |
| **GitHubAdapter** | ✅ Active | Primary cloud storage. Syncs with GitHub repositories. |
| **LocalGitAdapter** | ✅ Active | Local file system storage with Git version control. |
| **PublicAdapter** | ✅ Active | Read-only access to public examples. |
| **GoogleDriveAdapter** | 🚧 Experimental | Initial implementation for Google Drive support. Not fully production-ready. |

### Modeling & Sketching
Core CAD functionalities are currently part of the main application logic, with an ongoing refactor to move them into the extension system.

## Extensions System (`src/extensions`)

The extension system allows third-party tools to integrate with HiveCAD.

- **Infrastructure**: Ready. Supports loading extensions, managing state, and rendering UI.
- **Current Extensions**:
    - `_template`: A template for creating new extensions.
    - *No active external extensions are currently bundled.*

### Creating an Extension
See [EXTENSION_GUIDE.md](../src/extensions/EXTENSION_GUIDE.md) for details on how to build a new module.

## Missing / Planned Features

- **Extension Marketplace**: A UI to browse and install extensions is planned but not yet implemented.
- **Sandboxing**: Enhanced security for third-party extensions.

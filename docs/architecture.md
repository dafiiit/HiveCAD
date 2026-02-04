# Architecture & Storage

HiveCAD is a hybrid desktop application built with web technologies and Rust.

## High-Level Structure

- **Frontend**: A React application (built with Vite) that handles the UI, 3D rendering (Three.js), and CAD operations.
- **Backend**: A Tauri (Rust) backend that provides system-level capabilities, file system access, and native window management.
- **CAD Kernel**: Replicad (based on OpenCASCADE) runs via WASM in the browser context to perform geometry operations.

## Data Storage

HiveCAD utilizes an abstraction layer for data storage, allowing it to save and load projects from multiple sources. This is managed by the `StorageManager`.

### Storage Adapters

The application defines several adapters in `src/lib/storage/adapters/`:

1.  **GitHubAdapter**:
    - **Purpose**: Syncs projects directly to a GitHub repository.
    - **State**: Primary storage method for cloud sync. Requires authentication.
2.  **LocalGitAdapter**:
    - **Purpose**: Manages projects in a local git repository on the user's machine.
    - **Usage**: Ideal for offline development with version control.
3.  **GoogleDriveAdapter**:
    - **Purpose**: Stores projects in Google Drive (likely experimental or specific use-case).
4.  **PublicAdapter**:
    - **Purpose**: Read-only access to public projects or templates.

### Data Location

- **Local Projects**: Stored in the file system as defined by the Tauri capabilities and user selection.
- **Cloud Projects**: Stored in the connected GitHub repository or Google Drive folder.
- **App State**: User settings and caching may be stored in `localStorage` or `IndexedDB` within the web view.

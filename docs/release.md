# Release Process

This document describes how to trigger a release for HiveCAD.

## Triggering a Release

The release process is fully automated using GitHub Actions. To trigger a new release, you simply need to push a git tag that starts with `v`.

### Steps:

1.  **Version Bump**: Ensure your `package.json` and `src-tauri/tauri.conf.json` have the correct version number you intend to release (e.g., `1.0.0`).
2.  **Tag the Commit**: Create a git tag for the version.
    ```bash
    git tag v1.0.0
    ```
3.  **Push the Tag**: Push the tag to the repository.
    ```bash
    git push origin v1.0.0
    ```

## What Happens Next

Once the tag is pushed, the `Release App` GitHub Action is triggered. It performs the following steps:

1.  **Create Release**: A new **public** Release is created on GitHub (immediately available).
2.  **Build**: The application is built for macOS (`macos-latest`), Windows (`windows-latest`), and Linux (`ubuntu-22.04`).
3.  **Upload Assets**: The built binaries/installers (dmg, exe, deb, AppImage) are uploaded to the GitHub Release.

Once the action completes, your release is live! No manual approval is required.

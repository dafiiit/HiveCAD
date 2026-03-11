## Feature 1 - Authentication and onboarding

### Test Cases
- [ ] Render the welcome overlay when HiveCAD is not yet authenticated in web mode.
- [ ] Let the user switch from the welcome screen into the email sign-in form.
- [ ] Let the user switch from the welcome screen into the email sign-up form.
- [ ] Offer GitHub OAuth as an alternative authentication entry point.
- [ ] After a successful sign-in without a stored GitHub token, move the user into the PAT onboarding flow.
- [ ] In offline mode, bypass authentication entirely and open the workspace shell immediately.

### Edge Cases
- [ ] Invalid email/password combinations should surface an error without crashing the overlay.
- [ ] Missing Supabase configuration should fail gracefully instead of locking the UI.
- [ ] A user without a PAT should remain gated from the workspace until PAT setup succeeds.
- [ ] Returning users with an existing session should not see the welcome flow again.

## Feature 2 - Workspace dashboard and discovery

### Test Cases
- [ ] Show the dashboard header with the MY WORKSPACE and DISCOVER modes.
- [ ] Provide workspace search, settings access, and manual sync from the dashboard header.
- [ ] Show the root Projects area with a New Project action.
- [ ] Show the 3D Models area with a New 3D Model action.
- [ ] Surface bundled example models in the workspace when they are not already stored locally.
- [ ] Switch into Discover mode and render the community model feed.

### Edge Cases
- [ ] An empty personal repository should still leave the dashboard usable and show creation paths.
- [ ] Shared project deep links using the project query parameter should auto-open the referenced project.
- [ ] Discover mode should remain stable when the public search index is empty or unavailable.
- [ ] Triggering dashboard sync without a configured GitHub token should point the user toward PAT setup.

## Feature 3 - Project organization and metadata

### Test Cases
- [ ] Create top-level projects (folder containers) from the dashboard.
- [ ] Create 3D models inside the root workspace.
- [ ] Create 3D models inside a selected project folder.
- [ ] Rename project folders and persist the change.
- [ ] Rename 3D models from the project card actions.
- [ ] Delete 3D models from the dashboard and update the local listing.
- [ ] Create and remove tags, and attach tags to 3D models.
- [ ] Move 3D models into a project folder from the project card menu.
- [ ] Share a 3D model by generating a public link.

### Edge Cases
- [ ] Deleting a project folder should move contained 3D models back to the root workspace.
- [ ] Removing a tag should also remove it from all previously tagged projects.
- [ ] Share should still produce a useful result when Supabase metadata sync is blocked by RLS.
- [ ] Empty project tabs closed from the editor should trigger the delete-empty-model confirmation flow.

## Feature 4 - CAD editor shell and tab workflow

### Test Cases
- [ ] Opening a 3D model should switch from the dashboard into the CAD editor shell.
- [ ] Show the menu bar, ribbon toolbar, sidebar, viewport, operation properties, and status bar in editor mode.
- [ ] Create a new tab from the editor and switch between open tabs.
- [ ] Rename the active model from the tab title edit affordance.
- [ ] Return from the editor to the dashboard using the HiveCAD button in the menu bar.
- [ ] Open the File Management dialog from the menu bar.
- [ ] Open System Settings from both the dashboard and the editor.

### Edge Cases
- [ ] Pressing Escape in the plain 3D view should deselect tools first and eventually return the user to the dashboard.
- [ ] The active tab should show an unsaved marker when there are local changes.
- [ ] Closing the last remaining project tab should recover back to a dashboard tab instead of leaving the app blank.

## Feature 5 - Editor sidebar, code execution, and model inspection

### Test Cases
- [ ] Switch between Browser, Code, Git, and Comments tabs in the unified sidebar.
- [ ] Show the document tree, origin section, sketches, and bodies in the Browser panel.
- [ ] Show the Monaco code editor with the default project code for a blank 3D model.
- [ ] Run project code from the RUN button in the Code panel.
- [ ] Auto-run geometry updates after code edits settle.
- [ ] Show transient history and persistent history controls in the Git panel.
- [ ] Add and remove comments in the Comments panel.

### Edge Cases
- [ ] Invalid or incomplete code should not crash the whole editor shell.
- [ ] Toggling visibility for empty sections in the Browser panel should remain safe.
- [ ] Editor actions that require cloud sync should prompt for GitHub configuration when no PAT is available.

## Feature 6 - Settings, shortcuts, and system controls

### Test Cases
- [ ] Toggle dark and light theme from System Settings.
- [ ] Show account information and GitHub backend status in Settings.
- [ ] Open PAT configuration from the account settings tab.
- [ ] Log out from Settings in authenticated web mode.
- [ ] Show keyboard shortcut help for command search, save, undo, and redo.
- [ ] Toggle grid snapping from the system tab.
- [ ] Start the destructive repository reset flow behind a confirmation step.

### Edge Cases
- [ ] The update button should explain that in-app updates are desktop-only when running the web build.
- [ ] Reset progress should remain visible while the multi-store cleanup is running.
- [ ] Logging out should also disconnect the remote GitHub store and clear cloud-connected UI state.

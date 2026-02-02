//! Git operations for HiveCAD desktop
//! 
//! Provides local git repository management for project versioning and sync.

use git2::{Repository, Signature, IndexAddOption, PushOptions, RemoteCallbacks, Cred};
use std::path::Path;
use tauri::State;
use crate::AppState;

/// Initialize a git repository in the projects directory
#[tauri::command]
pub fn git_init(state: State<AppState>) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    
    if dir.join(".git").exists() {
        return Ok(()); // Already initialized
    }
    
    Repository::init(&*dir).map_err(|e| e.to_string())?;
    Ok(())
}

/// Set the remote origin URL
#[tauri::command]
pub fn git_set_remote(
    state: State<AppState>,
    url: String,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    // Remove existing origin if present
    if repo.find_remote("origin").is_ok() {
        repo.remote_delete("origin").map_err(|e| e.to_string())?;
    }
    
    repo.remote("origin", &url).map_err(|e| e.to_string())?;
    Ok(())
}

/// Commit all changes with a message
#[tauri::command]
pub fn git_commit(
    state: State<AppState>,
    message: String,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    // Stage all changes
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    
    let sig = Signature::now("HiveCAD", "user@hivecad.local")
        .map_err(|e| e.to_string())?;
    
    // Get parent commit if exists
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    
    repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Get git status
#[tauri::command]
pub fn git_status(state: State<AppState>) -> Result<String, String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    let statuses = repo.statuses(None).map_err(|e| e.to_string())?;
    
    let status_lines: Vec<String> = statuses
        .iter()
        .map(|entry| {
            let status = entry.status();
            let path = entry.path().unwrap_or("?");
            format!("{:?}: {}", status, path)
        })
        .collect();
    
    Ok(status_lines.join("\n"))
}

/// Sync with remote: pull --rebase && push
#[tauri::command]
pub fn git_sync(
    state: State<AppState>,
    token: Option<String>,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    // Set up authentication callbacks
    let mut callbacks = RemoteCallbacks::new();
    
    if let Some(ref pat) = token {
        let pat_clone = pat.clone();
        callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
            Cred::userpass_plaintext("x-access-token", &pat_clone)
        });
    }
    
    let mut remote = repo.find_remote("origin").map_err(|e| e.to_string())?;
    
    // Fetch
    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    
    remote
        .fetch(&["main"], Some(&mut fetch_options), None)
        .map_err(|e| format!("Fetch failed: {}", e))?;
    
    // For simplicity, we'll just do a push here
    // A full rebase implementation would be more complex
    let mut push_callbacks = RemoteCallbacks::new();
    if let Some(ref pat) = token {
        let pat_clone = pat.clone();
        push_callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
            Cred::userpass_plaintext("x-access-token", &pat_clone)
        });
    }
    
    let mut push_options = PushOptions::new();
    push_options.remote_callbacks(push_callbacks);
    
    remote
        .push(&["refs/heads/main:refs/heads/main"], Some(&mut push_options))
        .map_err(|e| format!("Push failed: {}", e))?;
    
    Ok(())
}

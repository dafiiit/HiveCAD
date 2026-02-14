// HiveCAD Desktop Application Entry Point
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::sync::Mutex;
use tauri::{State, Manager};
use git2::{Repository, Signature, IndexAddOption, PushOptions, RemoteCallbacks, Cred};

// ============================================
// Application State
// ============================================

pub struct AppState {
    pub projects_dir: Mutex<PathBuf>,
}

impl Default for AppState {
    fn default() -> Self {
        let projects_dir = dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("HiveCAD");
        
        fs::create_dir_all(&projects_dir).ok();
        
        Self {
            projects_dir: Mutex::new(projects_dir),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectData {
    pub id: String,
    pub name: String,
    pub data: serde_json::Value,
}

// ============================================
// File System Commands
// ============================================

#[tauri::command]
fn get_projects_dir(state: State<AppState>) -> Result<String, String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    dir.to_str()
        .map(String::from)
        .ok_or_else(|| "Invalid path".to_string())
}

#[tauri::command]
fn write_project(
    state: State<AppState>,
    project_id: String,
    data: String,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let project_dir = dir.join("projects").join(&project_id);
    
    fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    
    let file_path = project_dir.join("project.json");
    fs::write(&file_path, &data).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn read_project(
    state: State<AppState>,
    project_id: String,
) -> Result<Option<String>, String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let file_path = dir.join("projects").join(&project_id).join("project.json");
    
    if !file_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[tauri::command]
fn list_projects(state: State<AppState>) -> Result<Vec<String>, String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let projects_dir = dir.join("projects");
    
    if !projects_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut projects = vec![];
    for entry in fs::read_dir(&projects_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                projects.push(name.to_string());
            }
        }
    }
    
    Ok(projects)
}

#[tauri::command]
fn delete_project(
    state: State<AppState>,
    project_id: String,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let project_dir = dir.join("projects").join(&project_id);
    
    if project_dir.exists() {
        fs::remove_dir_all(&project_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// ============================================
// Git Commands
// ============================================

#[tauri::command]
fn git_init(state: State<AppState>) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    
    if dir.join(".git").exists() {
        return Ok(());
    }
    
    Repository::init(&*dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn git_set_remote(
    state: State<AppState>,
    url: String,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    if repo.find_remote("origin").is_ok() {
        repo.remote_delete("origin").map_err(|e| e.to_string())?;
    }
    
    repo.remote("origin", &url).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn git_commit(
    state: State<AppState>,
    message: String,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    
    let sig = Signature::now("HiveCAD", "user@hivecad.local")
        .map_err(|e| e.to_string())?;
    
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    
    repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn git_status(state: State<AppState>) -> Result<String, String> {
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

#[tauri::command]
fn git_sync(
    state: State<AppState>,
    token: Option<String>,
) -> Result<(), String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    let repo = Repository::open(&*dir).map_err(|e| e.to_string())?;
    
    let mut callbacks = RemoteCallbacks::new();
    
    if let Some(ref pat) = token {
        let pat_clone = pat.clone();
        callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
            Cred::userpass_plaintext("x-access-token", &pat_clone)
        });
    }
    
    let mut remote = repo.find_remote("origin").map_err(|e| e.to_string())?;
    
    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    
    remote
        .fetch(&["main"], Some(&mut fetch_options), None)
        .map_err(|e| format!("Fetch failed: {}", e))?;
    
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

// ============================================
// Main Entry Point
// ============================================

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // If a second instance is started (e.g. by deep link),
            // focus the main window of the first instance.
            let _ = app.get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_projects_dir,
            write_project,
            read_project,
            list_projects,
            delete_project,
            git_init,
            git_commit,
            git_sync,
            git_status,
            git_set_remote,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

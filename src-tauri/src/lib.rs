//! HiveCAD Desktop Application
//! 
//! This crate provides desktop-specific functionality including:
//! - Local file system storage for projects
//! - Git operations for version control and sync
//! - Tauri commands exposed to the frontend

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::sync::Mutex;
use tauri::State;

mod git;

/// Application state
pub struct AppState {
    pub projects_dir: Mutex<PathBuf>,
}

impl Default for AppState {
    fn default() -> Self {
        let projects_dir = dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("HiveCAD");
        
        // Ensure directory exists
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

/// Get the projects directory path
#[tauri::command]
pub fn get_projects_dir(state: State<AppState>) -> Result<String, String> {
    let dir = state.projects_dir.lock().map_err(|e| e.to_string())?;
    dir.to_str()
        .map(String::from)
        .ok_or_else(|| "Invalid path".to_string())
}

/// Write a project to disk
#[tauri::command]
pub fn write_project(
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

/// Read a project from disk
#[tauri::command]
pub fn read_project(
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

/// List all projects
#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<String>, String> {
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

/// Delete a project from disk
#[tauri::command]
pub fn delete_project(
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

// Re-export git commands
pub use git::{git_init, git_commit, git_sync, git_status, git_set_remote};

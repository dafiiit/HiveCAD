// HiveCAD Desktop Application Entry Point
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .manage(hive_cad_lib::AppState::default())
        .invoke_handler(tauri::generate_handler![
            hive_cad_lib::get_projects_dir,
            hive_cad_lib::write_project,
            hive_cad_lib::read_project,
            hive_cad_lib::list_projects,
            hive_cad_lib::delete_project,
            hive_cad_lib::git_init,
            hive_cad_lib::git_commit,
            hive_cad_lib::git_sync,
            hive_cad_lib::git_status,
            hive_cad_lib::git_set_remote,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

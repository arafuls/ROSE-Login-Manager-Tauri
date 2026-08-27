//! App entry point: registers Tauri plugins, opens the database and clears
//! stale profile-running statuses left over from a previous session, sets
//! up `AppState`, and registers every `#[tauri::command]` handler.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod crypto;
mod db;
mod error;
mod models;
#[cfg(not(windows))]
mod native_launch;
mod os_credential;
mod rose_update;
mod settings;
mod state;
mod theme;
mod win32_window;
mod wine;

use std::sync::Mutex;

use tauri::Manager;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir)
                .expect("failed to create app data dir");

            let db_path = app_data_dir.join("data.sqlite");
            let conn = db::open(&db_path).expect("failed to open/initialize database");
            db::profiles::clear_all_status(&conn)
                .expect("failed to clear stale profile statuses");

            app.manage(AppState {
                db: Mutex::new(conn),
                vault_key: Mutex::new(None),
                app_data_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::vault_is_initialized,
            commands::vault::vault_setup,
            commands::vault::vault_unlock,
            commands::vault::vault_recover,
            commands::vault::vault_change_passphrase,
            commands::vault::vault_reset,
            commands::vault::vault_is_unlocked,
            commands::vault::vault_lock,
            commands::vault::vault_stay_unlocked_is_enabled,
            commands::vault::vault_stay_unlocked_is_supported,
            commands::vault::vault_enable_stay_unlocked,
            commands::vault::vault_disable_stay_unlocked,
            commands::vault::vault_resume_from_os,
            commands::profiles::profiles_list,
            commands::profiles::profiles_create,
            commands::profiles::profiles_update,
            commands::profiles::profiles_delete,
            commands::profiles::profiles_reorder,
            commands::profiles::profiles_export,
            commands::profiles::profiles_write_export_file,
            commands::profiles::profiles_import,
            commands::profiles::profiles_read_export_file,
            commands::process::profiles_launch,
            commands::process::client_launch_default,
            commands::process::updater_force_recheck,
            commands::settings::settings_get,
            commands::settings::settings_update,
            commands::settings::settings_find_game_folder,
            commands::news::news_fetch,
            commands::theme::theme_list,
            commands::theme::theme_save,
            commands::theme::theme_delete,
            commands::theme::theme_export_to_file,
            commands::theme::theme_import_from_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

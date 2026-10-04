// Thin native layer. All domain logic lives in the TypeScript core; this side only
// provides what a webview cannot do itself (file access, single instance, Explorer).

mod files;

use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Label of the one application window, as configured in tauri.conf.json.
pub const MAIN_WINDOW: &str = "main";

/// Name of the data folder inside Documents. Development builds use their own, so that
/// unfinished code never touches real data.
pub const DATA_FOLDER_NAME: &str = if cfg!(debug_assertions) { "EVE Industry Calculator (dev)" } else { "EVE Industry Calculator" };

/// The data folder's absolute path, resolved once at start-up.
struct DataFolder(PathBuf);

#[tauri::command]
fn data_folder(folder: State<DataFolder>) -> String {
    folder.0.to_string_lossy().into_owned()
}

#[tauri::command]
fn read_text(folder: State<DataFolder>, path: &str) -> Result<Option<String>, String> {
    files::read_text(&folder.0, path)
}

#[tauri::command]
fn write_text(folder: State<DataFolder>, path: &str, text: &str) -> Result<(), String> {
    files::write_text(&folder.0, path, text)
}

#[tauri::command]
fn rename(folder: State<DataFolder>, from: &str, to: &str) -> Result<(), String> {
    files::rename(&folder.0, from, to)
}

#[tauri::command]
fn remove(folder: State<DataFolder>, path: &str) -> Result<(), String> {
    files::remove(&folder.0, path)
}

#[tauri::command]
fn list(folder: State<DataFolder>, path: &str) -> Result<Vec<files::Entry>, String> {
    files::list(&folder.0, path)
}

#[tauri::command]
fn copy(folder: State<DataFolder>, from: &str, to: &str) -> Result<(), String> {
    files::copy(&folder.0, from, to)
}

#[tauri::command]
fn create_dir(folder: State<DataFolder>, path: &str) -> Result<(), String> {
    files::create_dir(&folder.0, path)
}

#[tauri::command]
fn exists(folder: State<DataFolder>, path: &str) -> Result<bool, String> {
    files::exists(&folder.0, path)
}

/// Opens the data folder, or a folder inside it, in Explorer.
#[tauri::command]
fn open_folder(app: tauri::AppHandle, folder: State<DataFolder>, path: &str) -> Result<(), String> {
    let target = files::resolve(&folder.0, path)?;
    app.opener().open_path(target.to_string_lossy(), None::<&str>).map_err(|e| format!("could not open {path:?}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch hands over to the running
        // instance, which brings its window to the front, and then exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Tauri resolves Documents through the Windows known-folder API, so a
            // Documents folder redirected to OneDrive or another drive is followed.
            let documents = app.path().document_dir()?;
            app.manage(DataFolder(documents.join(DATA_FOLDER_NAME)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data_folder,
            read_text,
            write_text,
            rename,
            remove,
            list,
            copy,
            create_dir,
            exists,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_window_label_matches_config() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config["app"]["windows"][0]["label"], MAIN_WINDOW);
    }

    #[test]
    fn test_builds_use_the_development_data_folder() {
        assert_eq!(DATA_FOLDER_NAME, "EVE Industry Calculator (dev)");
    }
}

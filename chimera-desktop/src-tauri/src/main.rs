// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};

struct SidecarHandle(Mutex<Option<std::process::Child>>);

#[tauri::command]
fn start_supervisor(state: State<SidecarHandle>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("supervisor already running".to_string());
    }

    let supervisor_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("no parent dir")?
        .join(if cfg!(windows) { "supervisor.exe" } else { "supervisor" });

    let child = Command::new(&supervisor_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn supervisor: {}", e))?;

    *guard = Some(child);
    Ok("supervisor started".to_string())
}

#[tauri::command]
fn stop_supervisor(state: State<SidecarHandle>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok("supervisor stopped".to_string())
}

#[tauri::command]
fn supervisor_status(state: State<SidecarHandle>) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            start_supervisor,
            stop_supervisor,
            supervisor_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

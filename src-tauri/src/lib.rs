// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) {
    println!("Hello, {}! You've been greeted from Rust!", name);
}

#[tauri::command]
fn refresh_model(scad: &str) {
    println!("Refreshing model from Rust: {}", scad);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, refresh_model])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

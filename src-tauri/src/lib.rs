use std::fs::File;
use std::io::Write;
use tokio::process::Command;
use tokio::task;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) {
    println!("Hello, {}! You've been greeted from Rust!", name);
}

#[tauri::command]
async fn render_scad(scad: &str) -> Result<String, String> {
    // Use tempfile crate to handle temporary files safely
    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join("temp.scad");
    let output_path = temp_dir.join("output.stl");

    // Create and write to temp file
    let mut file = File::create(&temp_file_path).map_err(|e| e.to_string())?;
    file.write_all(scad.as_bytes()).map_err(|e| e.to_string())?;

    // Await the spawned task instead of just spawning it
    let result = task::spawn(async move {
        let output = Command::new("openscad")
            .arg(temp_file_path.to_str().unwrap())
            .arg("-o")
            .arg(output_path.to_str().unwrap())
            .output()
            .await
            .map_err(|e| e.to_string())?;

        // Clean up the temporary SCAD file
        let _ = std::fs::remove_file(temp_file_path);

        if output.status.success() {
            // Read the STL file contents
            let stl_contents = std::fs::read_to_string(&output_path).map_err(|e| e.to_string())?;
            // Clean up the output file after reading
            let _ = std::fs::remove_file(&output_path);
            Ok(stl_contents)
        } else {
            let err_msg =
                String::from_utf8(output.stderr).unwrap_or_else(|_| "OpenSCAD error".to_string());
            // Clean up the output file in case of error
            let _ = std::fs::remove_file(&output_path);
            Err(err_msg)
        }
    })
    .await
    .unwrap()?;

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, render_scad])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

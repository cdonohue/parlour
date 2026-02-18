use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

static SERVER_PORT: OnceLock<u16> = OnceLock::new();

fn spawn_server() -> u16 {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let server_entry = manifest_dir.join("../../packages/server/src/main.ts");
    let tsx = manifest_dir.join("../../node_modules/.bin/tsx");

    let mut child = Command::new(tsx.to_str().unwrap())
        .args([server_entry.to_str().unwrap()])
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to spawn server");

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let mut collected = String::new();

    loop {
        line.clear();
        let n = reader.read_line(&mut line).expect("failed to read stdout");
        if n == 0 {
            break;
        }
        if let Some(port_str) = line.trim().strip_prefix("PORT=") {
            let port: u16 = port_str.parse().expect("invalid port");
            std::thread::spawn(move || {
                let mut sink = [0u8; 4096];
                loop {
                    match reader.read(&mut sink) {
                        Ok(0) | Err(_) => break,
                        _ => {}
                    }
                }
                let _ = child.wait();
            });
            return port;
        }
        collected.push_str(&line);
    }

    panic!("server did not emit PORT=N. Output: {collected}");
}

#[tauri::command]
fn get_server_port() -> u16 {
    *SERVER_PORT.get().expect("server not started")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = spawn_server();
    SERVER_PORT.set(port).expect("port already set");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_server_port])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}

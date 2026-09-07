#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The shell around Claude Voice.
//!
//! The Agent SDK is TypeScript only, so the node server stays and runs here as
//! a child process. Rust adds what a browser tab cannot do: a global shortcut,
//! an icon in the menu bar, and a clean end for every process.

use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

/// The running node server. In a mutex because stopping comes from the window
/// event while starting comes from setup().
struct NodeServer(Mutex<Option<Child>>);

/// Programs started from Finder inherit a bare PATH
/// (/usr/bin:/bin:/usr/sbin:/sbin). For many people node lives elsewhere, here
/// for instance under ~/.vite-plus/bin, and the SDK in turn starts the `claude`
/// CLI. So ask the login shell for its PATH once.
fn login_path() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = Command::new(&shell)
        .args(["-l", "-c", "printf %s \"$PATH\""])
        .output();
    match output {
        Ok(o) if o.status.success() && !o.stdout.is_empty() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into()),
    }
}

fn find_in_path(path: &str, name: &str) -> Option<PathBuf> {
    path.split(':')
        .map(|d| Path::new(d).join(name))
        .find(|p| p.is_file())
}

/// Where is server.mjs? The symlink install.sh creates is the most reliable
/// anchor: it always points at the installed version, even when the repo
/// moves.
fn find_server() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("CLAUDE_VOICE_SERVER") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Ok(p);
        }
        return Err(format!(
            "CLAUDE_VOICE_SERVER zeigt ins Leere: {}",
            p.display()
        ));
    }
    let home = std::env::var("HOME").map_err(|_| "HOME ist nicht gesetzt".to_string())?;
    let candidates = [
        PathBuf::from(&home).join(".claude/voice-ui/server.mjs"),
        PathBuf::from(&home).join("claude-voice/ui/server.mjs"),
    ];
    for k in candidates.iter() {
        if k.is_file() {
            return Ok(k.canonicalize().unwrap_or_else(|_| k.clone()));
        }
    }
    Err(
        "server.mjs nicht gefunden. Einmal ./install.sh im Repo laufen lassen, \
         oder CLAUDE_VOICE_SERVER auf die Datei show_item lassen."
            .into(),
    )
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(7331)
}

fn make_token() -> String {
    // No extra crate for 24 random bytes: the clock plus the address of a
    // freshly allocated block is enough for a token that is local only and
    // dies with the process.
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut s = String::new();
    for i in 0..3u8 {
        let mut h = DefaultHasher::new();
        std::time::SystemTime::now().hash(&mut h);
        i.hash(&mut h);
        Box::into_raw(Box::new(i)).hash(&mut h);
        std::thread::sleep(Duration::from_nanos(7));
        s.push_str(&format!("{:016x}", h.finish()));
    }
    s
}

/// Wait until the server answers. Without this the window loads into nothing
/// and shows the webview's own error page.
fn wait_for_server(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if std::net::TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(200),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    false
}

/// The server in turn starts whisper-server. A grandchild holding half a
/// gigabyte of model in memory must not outlive the app, so send a SIGTERM to
/// let it clean up and then the hard blow. The server additionally watches its
/// own parent, for the cases where we never get to send anything at all.
fn stop_server(app: &tauri::AppHandle) {
    let Some(mut child) = app.state::<NodeServer>().0.lock().unwrap().take() else {
        return;
    };
    #[cfg(unix)]
    unsafe {
        libc::kill(child.id() as i32, libc::SIGTERM);
    }
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    let _ = child.kill();
}

fn error_window(app: &tauri::AppHandle, text: &str) {
    let html = format!(
        r#"<!doctype html><meta charset="utf-8"><style>
        body{{font:14px/1.6 -apple-system,system-ui;margin:0;padding:30px;
              background:#0d0c0f;color:#f2f0ee}}
        h1{{font-size:15px;margin:0 0 12px;color:#fb7185}}
        pre{{white-space:pre-wrap;color:#aaa4b2;font-size:12.5px}}</style>
        <h1>Claude Voice kann nicht starten</h1><pre>{}</pre>"#,
        text.replace('<', "&lt;")
    );
    let data = format!("data:text/html;charset=utf-8,{}", urlencode(&html));
    let _ = WebviewWindowBuilder::new(app, "error", WebviewUrl::External(data.parse().unwrap()))
        .title("Claude Voice")
        .inner_size(640.0, 340.0)
        .build();
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{:02X}", b),
        })
        .collect()
}

fn main() {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _sc, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                        // The page listens for this event and starts
                        // recording. eval rather than IPC, so the page needs no
                        // special rights for a remote origin.
                        let _ =
                            w.eval("window.dispatchEvent(new CustomEvent('claude-voice-hotkey'))");
                    }
                })
                .build(),
        )
        .manage(NodeServer(Mutex::new(None)))
        .setup(move |app| {
            let handle = app.handle().clone();

            let path = login_path();
            let server = match find_server() {
                Ok(p) => p,
                Err(e) => {
                    error_window(&handle, &e);
                    return Ok(());
                }
            };
            let node = match find_in_path(&path, "node") {
                Some(n) => n,
                None => {
                    error_window(
                        &handle,
                        &format!(
                            "node ist nicht auffindbar.\n\nDurchsucht wurde:\n{}\n\n\
                             Node installieren oder CLAUDE_VOICE_NODE setzen.",
                            path.replace(':', "\n")
                        ),
                    );
                    return Ok(());
                }
            };

            let port = free_port();
            let token = make_token();

            let mut child = Command::new(&node)
                .arg(&server)
                .env("PATH", &path)
                .env("VOICE_UI_PORT", port.to_string())
                .env("VOICE_UI_TOKEN", &token)
                .env(
                    "VOICE_UI_CWD",
                    std::env::var("CLAUDE_VOICE_CWD")
                        .unwrap_or_else(|_| std::env::var("HOME").unwrap_or_default()),
                )
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("node ließ sich nicht starten: {e}"))?;

            // Read along with the server's output, or the pipe fills up and
            // the process eventually blocks on a write.
            for strom in [
                child
                    .stdout
                    .take()
                    .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
                child
                    .stderr
                    .take()
                    .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            ]
            .into_iter()
            .flatten()
            {
                std::thread::spawn(move || {
                    for zeile in BufReader::new(strom).lines().map_while(Result::ok) {
                        eprintln!("[server] {zeile}");
                    }
                });
            }
            app.state::<NodeServer>().0.lock().unwrap().replace(child);

            if !wait_for_server(port, Duration::from_secs(25)) {
                error_window(
                    &handle,
                    "Der Server antwortet nicht. Läuft schon eine Instanz?",
                );
                return Ok(());
            }

            let url = format!("http://127.0.0.1:{port}/?token={token}");
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("URL")),
            )
            .title("Claude Voice")
            .inner_size(1180.0, 860.0)
            .min_inner_size(720.0, 520.0)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .build()?;

            // Menu bar: the app stays reachable even with the window closed.
            let show_item =
                MenuItem::with_id(app, "show_item", "Fenster show_item", true, None::<&str>)?;
            let new_item = MenuItem::with_id(app, "new", "Neue Session", true, None::<&str>)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Beenden"))?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &new_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_item,
                ],
            )?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "show_item" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "new_item" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.eval(
                                "window.dispatchEvent(new CustomEvent('claude-voice-new_item'))",
                            );
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            let _ = app.global_shortcut().register(shortcut);
            let _ = window.emit("ready", port);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                stop_server(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("Tauri konnte nicht starten")
        .run(|app, event| {
            // Going through the menu or Cmd-Q has to clean up as well, not
            // just closing the window.
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                stop_server(app);
            }
        });
}

use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn urlencode_leaves_safe_bytes_alone() {
        assert_eq!(urlencode("abcXYZ089-_.~"), "abcXYZ089-_.~");
    }

    #[test]
    fn urlencode_encodes_the_rest_bytewise() {
        assert_eq!(urlencode("a b"), "a%20b");
        assert_eq!(urlencode("<h1>"), "%3Ch1%3E");
        // Umlauts are two bytes in UTF-8 and have to be encoded one at a
        // time, or the error page falls apart exactly where it should explain.
        assert_eq!(urlencode("ä"), "%C3%A4");
    }

    #[test]
    fn find_in_path_returns_files_only() {
        let dir = std::env::temp_dir().join("cv-test-find_in_path");
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("gibtes");
        fs::write(&file, b"#!/bin/sh\n").unwrap();
        let path = format!("/gibt/es/nicht:{}", dir.display());
        assert_eq!(find_in_path(&path, "gibtes"), Some(file));
        assert_eq!(find_in_path(&path, "gibtesnicht"), None);
        // A directory is not an executable file.
        let subdir = dir.join("ordner");
        let _ = fs::create_dir_all(&subdir);
        assert_eq!(find_in_path(&path, "ordner"), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_server_honours_the_env_var() {
        let file = std::env::temp_dir().join("cv-test-server.mjs");
        fs::write(&file, b"// empty\n").unwrap();
        unsafe { std::env::set_var("CLAUDE_VOICE_SERVER", &file) };
        assert_eq!(find_server().unwrap(), file);

        // If it points at nothing that is an error with a hint, not a silent
        // fallback to some other location: otherwise the app starts with a
        // version the user never meant.
        unsafe { std::env::set_var("CLAUDE_VOICE_SERVER", "/gibt/es/nicht.mjs") };
        let error = find_server().unwrap_err();
        assert!(error.contains("zeigt ins Leere"), "{error}");

        unsafe { std::env::remove_var("CLAUDE_VOICE_SERVER") };
        let _ = fs::remove_file(&file);
    }

    #[test]
    fn token_is_long_enough_and_does_not_repeat() {
        let a = make_token();
        let b = make_token();
        assert_eq!(a.len(), 48);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn free_port_is_outside_the_well_known_range() {
        let p = free_port();
        assert!(p > 1024, "Port {p} braucht Rechte, die eine App nicht hat");
    }
}

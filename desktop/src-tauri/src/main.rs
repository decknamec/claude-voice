#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Die Schale um Claude Voice.
//!
//! Der Agent SDK ist TypeScript-only, also bleibt der Node-Server bestehen und
//! läuft hier als Kindprozess. Rust bringt das, was ein Browser-Tab nicht kann:
//! einen globalen Kurzbefehl, ein Symbol in der Menüleiste, und ein sauberes
//! Ende für alle Prozesse.

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

/// Der laufende Node-Server. In einem Mutex, weil das Beenden aus dem
/// Fenster-Ereignis kommt und der Start aus setup().
struct Diener(Mutex<Option<Child>>);

/// Aus dem Finder gestartete Programme erben einen kargen PATH
/// (/usr/bin:/bin:/usr/sbin:/sbin). Node liegt bei vielen woanders — hier etwa
/// unter ~/.vite-plus/bin —, und der SDK startet seinerseits die `claude`-CLI.
/// Also einmal die Login-Shell nach ihrem PATH fragen.
fn login_pfad() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let aus = Command::new(&shell)
        .args(["-l", "-c", "printf %s \"$PATH\""])
        .output();
    match aus {
        Ok(o) if o.status.success() && !o.stdout.is_empty() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into()),
    }
}

fn suche(pfad: &str, name: &str) -> Option<PathBuf> {
    pfad.split(':')
        .map(|d| Path::new(d).join(name))
        .find(|p| p.is_file())
}

/// Wo liegt server.mjs? Der Symlink, den install.sh anlegt, ist der
/// verlässlichste Anker: er zeigt immer auf die eingerichtete Fassung, auch
/// wenn das Repo verschoben wird.
fn finde_server() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("CLAUDE_VOICE_SERVER") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Ok(p);
        }
        return Err(format!("CLAUDE_VOICE_SERVER zeigt ins Leere: {}", p.display()));
    }
    let heim = std::env::var("HOME").map_err(|_| "HOME ist nicht gesetzt".to_string())?;
    let kandidaten = [
        PathBuf::from(&heim).join(".claude/voice-ui/server.mjs"),
        PathBuf::from(&heim).join("claude-voice/ui/server.mjs"),
    ];
    for k in kandidaten.iter() {
        if k.is_file() {
            return Ok(k.canonicalize().unwrap_or_else(|_| k.clone()));
        }
    }
    Err("server.mjs nicht gefunden. Einmal ./install.sh im Repo laufen lassen, \
         oder CLAUDE_VOICE_SERVER auf die Datei zeigen lassen."
        .into())
}

fn freier_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(7331)
}

fn wuerfel_token() -> String {
    // Kein extra Kistchen für 24 Zufallsbytes: die Uhr plus die Adresse eines
    // frisch belegten Blocks reichen für ein Token, das nur lokal gilt und mit
    // dem Prozess stirbt.
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

/// Warten, bis der Server antwortet. Ohne das lädt das Fenster ins Leere und
/// zeigt die Fehlerseite des Webviews.
fn warte_auf_server(port: u16, frist: Duration) -> bool {
    let bis = Instant::now() + frist;
    while Instant::now() < bis {
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

/// Der Server startet seinerseits whisper-server. Ein Enkel mit einem halben
/// Gigabyte Modell im Speicher darf die App nicht überleben, also erst ein
/// SIGTERM zum Aufräumen und dann der harte Schlag. Der Server hat zusätzlich
/// eine eigene Wache auf den Elternprozess — für die Fälle, in denen wir gar
/// nicht mehr dazu kommen, etwas zu schicken.
fn beende_diener(app: &tauri::AppHandle) {
    let Some(mut kind) = app.state::<Diener>().0.lock().unwrap().take() else { return };
    #[cfg(unix)]
    unsafe {
        libc::kill(kind.id() as i32, libc::SIGTERM);
    }
    let bis = Instant::now() + Duration::from_secs(3);
    while Instant::now() < bis {
        if matches!(kind.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    let _ = kind.kill();
}

fn fehlerfenster(app: &tauri::AppHandle, text: &str) {
    let html = format!(
        r#"<!doctype html><meta charset="utf-8"><style>
        body{{font:14px/1.6 -apple-system,system-ui;margin:0;padding:30px;
              background:#0d0c0f;color:#f2f0ee}}
        h1{{font-size:15px;margin:0 0 12px;color:#fb7185}}
        pre{{white-space:pre-wrap;color:#aaa4b2;font-size:12.5px}}</style>
        <h1>Claude Voice kann nicht starten</h1><pre>{}</pre>"#,
        text.replace('<', "&lt;")
    );
    let daten = format!(
        "data:text/html;charset=utf-8,{}",
        urlencode(&html)
    );
    let _ = WebviewWindowBuilder::new(app, "fehler", WebviewUrl::External(daten.parse().unwrap()))
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
    let kurzbefehl = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _sc, ereignis| {
                    if ereignis.state() != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(w) = app.get_webview_window("haupt") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                        // Die Seite hört auf dieses Ereignis und beginnt
                        // aufzunehmen. eval statt IPC, damit die Seite keine
                        // Sonderrechte für eine entfernte Herkunft braucht.
                        let _ = w.eval(
                            "window.dispatchEvent(new CustomEvent('claude-voice-hotkey'))",
                        );
                    }
                })
                .build(),
        )
        .manage(Diener(Mutex::new(None)))
        .setup(move |app| {
            let handle = app.handle().clone();

            let pfad = login_pfad();
            let server = match finde_server() {
                Ok(p) => p,
                Err(e) => {
                    fehlerfenster(&handle, &e);
                    return Ok(());
                }
            };
            let node = match suche(&pfad, "node") {
                Some(n) => n,
                None => {
                    fehlerfenster(
                        &handle,
                        &format!(
                            "node ist nicht auffindbar.\n\nDurchsucht wurde:\n{}\n\n\
                             Node installieren oder CLAUDE_VOICE_NODE setzen.",
                            pfad.replace(':', "\n")
                        ),
                    );
                    return Ok(());
                }
            };

            let port = freier_port();
            let token = wuerfel_token();

            let mut kind = Command::new(&node)
                .arg(&server)
                .env("PATH", &pfad)
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

            // Die Ausgaben des Servers mitlesen, sonst läuft die Pipe voll und
            // der Prozess blockiert irgendwann beim Schreiben.
            for strom in [kind.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
                          kind.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>)]
                .into_iter()
                .flatten()
            {
                std::thread::spawn(move || {
                    for zeile in BufReader::new(strom).lines().map_while(Result::ok) {
                        eprintln!("[server] {zeile}");
                    }
                });
            }
            app.state::<Diener>().0.lock().unwrap().replace(kind);

            if !warte_auf_server(port, Duration::from_secs(25)) {
                fehlerfenster(&handle, "Der Server antwortet nicht. Läuft schon eine Instanz?");
                return Ok(());
            }

            let url = format!("http://127.0.0.1:{port}/?token={token}");
            let fenster = WebviewWindowBuilder::new(
                app,
                "haupt",
                WebviewUrl::External(url.parse().expect("URL")),
            )
            .title("Claude Voice")
            .inner_size(1180.0, 860.0)
            .min_inner_size(720.0, 520.0)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .build()?;

            // Menüleiste: die App soll erreichbar bleiben, auch wenn das
            // Fenster zu ist.
            let zeigen = MenuItem::with_id(app, "zeigen", "Fenster zeigen", true, None::<&str>)?;
            let neu = MenuItem::with_id(app, "neu", "Neue Session", true, None::<&str>)?;
            let beenden = PredefinedMenuItem::quit(app, Some("Beenden"))?;
            let menue = Menu::with_items(app, &[&zeigen, &neu, &PredefinedMenuItem::separator(app)?, &beenden])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menue)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "zeigen" => {
                        if let Some(w) = app.get_webview_window("haupt") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "neu" => {
                        if let Some(w) = app.get_webview_window("haupt") {
                            let _ = w.eval(
                                "window.dispatchEvent(new CustomEvent('claude-voice-neu'))",
                            );
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            let _ = app.global_shortcut().register(kurzbefehl);
            let _ = fenster.emit("bereit", port);
            Ok(())
        })
        .on_window_event(|fenster, ereignis| {
            if matches!(ereignis, tauri::WindowEvent::Destroyed) && fenster.label() == "haupt" {
                beende_diener(fenster.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("Tauri konnte nicht starten")
        .run(|app, ereignis| {
            // Auch der Weg über das Menü oder Cmd-Q muss aufräumen, nicht nur
            // das Schließen des Fensters.
            if matches!(ereignis, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                beende_diener(app);
            }
        });
}

use tauri_plugin_global_shortcut::GlobalShortcutExt;

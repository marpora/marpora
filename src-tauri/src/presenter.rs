use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct Presentation(Mutex<Option<Session>>);
struct Session {
    snapshot: Snapshot,
    monitor: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Deck {
    html: String,
    css: String,
    titles: Vec<String>,
    theme: String,
    aspect_ratio: f64,
    fragments: Vec<u32>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Position {
    slide: usize,
    step: u32,
    revision: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    id: String,
    title: String,
    language: String,
    deck: Deck,
    position: Position,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Action {
    Next,
    Previous,
    First,
    Last,
    Goto { slide: usize },
    End,
}
#[derive(Clone, Serialize)]
struct Command {
    id: String,
    action: Action,
}
#[derive(Clone, Serialize)]
struct PositionEvent {
    id: String,
    position: Position,
}
#[derive(Clone, Serialize)]
struct Closed {
    id: String,
    reason: String,
}
#[derive(Clone, Serialize)]
struct Ready {
    id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    id: String,
    name: String,
    width: u32,
    height: u32,
    scale_factor: f64,
    primary: bool,
    current: bool,
}

fn main_only(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("MAR_PORA:presenterPermission".into())
    }
}
fn label(id: &str) -> String {
    format!("audience-{id}")
}
fn monitor_id(monitor: &tauri::window::Monitor) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        monitor.position().x,
        monitor.position().y,
        monitor.size().width,
        monitor.size().height,
        monitor.scale_factor()
    )
}
fn validate(snapshot: &Snapshot) -> Result<(), String> {
    let count = snapshot.deck.fragments.len();
    if snapshot.id.len() != 36
        || !snapshot
            .id
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
        || snapshot.title.len() > 4096
        || !["en", "zh"].contains(&snapshot.language.as_str())
        || count == 0
        || count > 1000
        || snapshot.deck.titles.len() != count
        || snapshot.deck.html.len() + snapshot.deck.css.len() > 96 * 1024 * 1024
        || !snapshot.deck.aspect_ratio.is_finite()
        || !(0.2..=5.0).contains(&snapshot.deck.aspect_ratio)
        || !valid_position(&snapshot.deck, &snapshot.position)
    {
        return Err("MAR_PORA:invalidPresentation".into());
    }
    Ok(())
}
fn valid_position(deck: &Deck, position: &Position) -> bool {
    position.slide < deck.fragments.len() && position.step <= deck.fragments[position.slide]
}

#[tauri::command]
pub fn presentation_displays(window: WebviewWindow) -> Result<Vec<Display>, String> {
    main_only(window.label())?;
    let current = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .map(|m| monitor_id(&m));
    let primary = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .map(|m| monitor_id(&m));
    Ok(window
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            let id = monitor_id(monitor);
            Display {
                name: monitor
                    .name()
                    .cloned()
                    .unwrap_or_else(|| format!("Display {}", index + 1)),
                width: monitor.size().width,
                height: monitor.size().height,
                scale_factor: monitor.scale_factor(),
                primary: primary.as_ref() == Some(&id),
                current: current.as_ref() == Some(&id),
                id,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn presentation_open(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    snapshot: Snapshot,
    monitor_id: Option<String>,
) -> Result<(), String> {
    main_only(window.label())?;
    validate(&snapshot)?;
    let selected = if let Some(ref id) = monitor_id {
        Some(
            window
                .available_monitors()
                .map_err(|e| e.to_string())?
                .into_iter()
                .find(|monitor| self::monitor_id(monitor) == *id)
                .ok_or("MAR_PORA:displayDisconnected")?,
        )
    } else {
        None
    };
    let id = snapshot.id.clone();
    {
        let mut active = state.0.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("MAR_PORA:presentationActive".into());
        }
        *active = Some(Session {
            snapshot,
            monitor: monitor_id,
        });
    }
    let result = (|| -> Result<(), String> {
        let title = if state
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref()
            .is_some_and(|s| s.snapshot.language == "zh")
        {
            "Marpora — 观众"
        } else {
            "Marpora — Audience"
        };
        let viewer =
            WebviewWindowBuilder::new(&app, label(&id), WebviewUrl::App("index.html".into()))
                .title(title)
                .inner_size(1100.0, 700.0)
                .min_inner_size(480.0, 270.0)
                .visible(false)
                .background_color(tauri::webview::Color(0, 0, 0, 255))
                .initialization_script(format!("window.__MARPORA_AUDIENCE_SESSION__ = '{id}';"))
                .build()
                .map_err(|e| e.to_string())?;
        if let Some(monitor) = selected {
            viewer
                .set_position(*monitor.position())
                .map_err(|e| e.to_string())?;
            viewer
                .set_size(*monitor.size())
                .map_err(|e| e.to_string())?;
            viewer
                .set_fullscreen_on_monitor(tauri::PhysicalPosition::new(
                    monitor.position().x as f64,
                    monitor.position().y as f64,
                ))
                .map_err(|e| e.to_string())?;
        } else {
            viewer.center().map_err(|e| e.to_string())?;
        }
        viewer.show().map_err(|e| e.to_string())?;
        // Keep the controller on the original screen; audience input remains usable.
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_focus();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = state.0.lock().map(|mut active| {
            if active.as_ref().is_some_and(|s| s.snapshot.id == id) {
                active.take();
            }
        });
        if let Some(viewer) = app.get_webview_window(&label(&id)) {
            let _ = viewer.destroy();
        }
    }
    result
}

#[tauri::command]
pub fn presentation_focus(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
) -> Result<(), String> {
    main_only(window.label())?;
    if !state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .is_some_and(|s| s.snapshot.id == id)
    {
        return Err("MAR_PORA:presentationExpired".into());
    }
    app.get_webview_window(&label(&id))
        .ok_or("MAR_PORA:presentationExpired")?
        .set_focus()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn presentation_snapshot(
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
) -> Result<Snapshot, String> {
    if window.label() != label(&id) {
        return Err("MAR_PORA:presenterPermission".into());
    }
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .filter(|s| s.snapshot.id == id)
        .map(|s| s.snapshot.clone())
        .ok_or("MAR_PORA:presentationExpired".into())
}
#[tauri::command]
pub fn presentation_update(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
    position: Position,
) -> Result<(), String> {
    main_only(window.label())?;
    let mut active = state.0.lock().map_err(|e| e.to_string())?;
    let session = active
        .as_mut()
        .filter(|s| s.snapshot.id == id)
        .ok_or("MAR_PORA:presentationExpired")?;
    if !valid_position(&session.snapshot.deck, &position) {
        return Err("MAR_PORA:invalidPresentation".into());
    }
    if position.revision <= session.snapshot.position.revision {
        return Ok(());
    }
    session.snapshot.position = position.clone();
    app.emit_to(
        label(&id),
        "presentation-position",
        PositionEvent { id, position },
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn presentation_action(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
    action: Action,
) -> Result<(), String> {
    if window.label() != label(&id) {
        return Err("MAR_PORA:presenterPermission".into());
    }
    let active = state.0.lock().map_err(|e| e.to_string())?;
    if !active.as_ref().is_some_and(|s| s.snapshot.id == id) {
        return Err("MAR_PORA:presentationExpired".into());
    }
    app.emit_to("main", "presentation-command", Command { id, action })
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn presentation_ready(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
) -> Result<(), String> {
    if window.label() != label(&id)
        || !state
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref()
            .is_some_and(|s| s.snapshot.id == id)
    {
        return Err("MAR_PORA:presentationExpired".into());
    }
    app.emit_to("main", "presentation-ready", Ready { id })
        .map_err(|e| e.to_string())
}
fn end(app: &tauri::AppHandle, state: &Presentation, id: &str, reason: &str) -> Result<(), String> {
    let removed = {
        let mut active = state.0.lock().map_err(|e| e.to_string())?;
        if !active.as_ref().is_some_and(|s| s.snapshot.id == id) {
            return Ok(());
        }
        active.take()
    };
    if removed.is_some() {
        if let Some(viewer) = app.get_webview_window(&label(id)) {
            let _ = viewer.destroy();
        }
        let _ = app.emit_to(
            "main",
            "presentation-closed",
            Closed {
                id: id.into(),
                reason: reason.into(),
            },
        );
    }
    Ok(())
}
#[tauri::command]
pub fn presentation_close(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
) -> Result<(), String> {
    main_only(window.label())?;
    end(&app, &state, &id, "ended")
}
#[tauri::command]
pub fn presentation_health(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, Presentation>,
    id: String,
) -> Result<bool, String> {
    main_only(window.label())?;
    let monitor = {
        let active = state.0.lock().map_err(|e| e.to_string())?;
        let Some(session) = active.as_ref().filter(|s| s.snapshot.id == id) else {
            return Ok(false);
        };
        session.monitor.clone()
    };
    if let Some(id_of_monitor) = monitor {
        if !window
            .available_monitors()
            .map_err(|e| e.to_string())?
            .iter()
            .any(|m| monitor_id(m) == id_of_monitor)
        {
            end(&app, &state, &id, "display-disconnected")?;
            return Ok(false);
        }
    }
    if app.get_webview_window(&label(&id)).is_none() {
        end(&app, &state, &id, "audience-closed")?;
        return Ok(false);
    }
    Ok(true)
}

pub fn window_destroyed(window: &tauri::Window) {
    let app = window.app_handle();
    let state = app.state::<Presentation>();
    let id = if window.label() == "main" {
        state
            .0
            .lock()
            .ok()
            .and_then(|s| s.as_ref().map(|s| s.snapshot.id.clone()))
    } else {
        window.label().strip_prefix("audience-").map(str::to_string)
    };
    if let Some(id) = id {
        let _ = end(app, &state, &id, "audience-closed");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn deck() -> Deck {
        Deck {
            html: "<div></div>".into(),
            css: "".into(),
            titles: vec!["one".into(), "two".into()],
            theme: "default".into(),
            aspect_ratio: 16.0 / 9.0,
            fragments: vec![2, 0],
        }
    }
    #[test]
    fn audience_positions_cannot_escape_slide_or_fragment_bounds() {
        assert!(valid_position(
            &deck(),
            &Position {
                slide: 0,
                step: 2,
                revision: 1
            }
        ));
        assert!(!valid_position(
            &deck(),
            &Position {
                slide: 0,
                step: 3,
                revision: 2
            }
        ));
        assert!(!valid_position(
            &deck(),
            &Position {
                slide: 2,
                step: 0,
                revision: 2
            }
        ));
    }
    #[test]
    fn audience_cannot_publish_decks_or_control_the_editor() {
        assert!(main_only("main").is_ok());
        assert!(main_only("audience-session").is_err());
    }
}

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;
mod export;
mod presenter;
mod workspace;

const MAX_DOCUMENT: u64 = 16 * 1024 * 1024;
const MAX_IMAGE: u64 = 20 * 1024 * 1024;

#[derive(Default, Clone)]
struct Documents(Arc<Mutex<HashSet<PathBuf>>>);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct OpenDocument {
    path: String,
    text: String,
    line_ending: String,
    bom: bool,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err("MAR_PORA:invalidFile".to_string());
    }
    fs::read(path).map_err(|e| e.to_string())
}

fn decode_document(path: &Path) -> Result<OpenDocument, String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if extension == "pdf" {
        let bytes = read_limited(&path, 64 * 1024 * 1024)?;
        if !bytes.starts_with(b"%PDF-") {
            return Err("MAR_PORA:invalidPdf".into());
        }
        return Ok(OpenDocument {
            path: path.to_string_lossy().into_owned(),
            text: String::new(),
            line_ending: "lf".into(),
            bom: false,
            kind: "pdf".into(),
            data: Some(STANDARD.encode(bytes)),
        });
    }
    if !["md", "markdown", "mdown", "txt", "html", "htm"].contains(&extension.as_str()) {
        return Err("MAR_PORA:markdownOnly".into());
    }
    let raw = String::from_utf8(read_limited(&path, MAX_DOCUMENT)?)
        .map_err(|_| "MAR_PORA:badEncoding".to_string())?;
    Ok(OpenDocument {
        path: path.to_string_lossy().into_owned(),
        text: raw.trim_start_matches('\u{feff}').replace("\r\n", "\n"),
        line_ending: if raw.contains("\r\n") { "crlf" } else { "lf" }.into(),
        bom: raw.starts_with('\u{feff}'),
        kind: if ["html", "htm"].contains(&extension.as_str()) {
            "html"
        } else {
            "markdown"
        }
        .into(),
        data: None,
    })
}

fn grant(documents: &Documents, path: PathBuf) -> Result<(), String> {
    documents.0.lock().map_err(|e| e.to_string())?.insert(path);
    Ok(())
}

fn require_grant(documents: &Documents, path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !documents
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&canonical)
    {
        return Err("MAR_PORA:grantRequired".into());
    }
    Ok(canonical)
}

#[tauri::command]
async fn open_document(
    app: tauri::AppHandle,
    documents: tauri::State<'_, Documents>,
) -> Result<Option<OpenDocument>, String> {
    let documents = documents.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .add_filter(
                "Documents",
                &["md", "markdown", "mdown", "txt", "html", "htm", "pdf"],
            )
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        let document = decode_document(&path)?;
        grant(&documents, PathBuf::from(&document.path))?;
        Ok(Some(document))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn write_document(
    path: &Path,
    text: &str,
    expected: Option<&str>,
    line_ending: &str,
    bom: bool,
) -> Result<(), String> {
    if text.len() as u64 > MAX_DOCUMENT {
        return Err("MAR_PORA:documentTooLarge".into());
    }
    if let Some(expected) = expected {
        let disk = decode_document(path)?;
        if disk.text != expected {
            return Err("MAR_PORA:diskConflict".into());
        }
    }
    let parent = path.parent().ok_or("MAR_PORA:badDirectory")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if let Ok(metadata) = fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|e| e.to_string())?;
    }
    let body = if line_ending == "crlf" {
        text.replace('\n', "\r\n")
    } else {
        text.to_string()
    };
    if bom {
        temporary
            .write_all(b"\xef\xbb\xbf")
            .map_err(|e| e.to_string())?;
    }
    temporary
        .write_all(body.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_document(
    app: tauri::AppHandle,
    documents: tauri::State<'_, Documents>,
    path: Option<String>,
    text: String,
    expected: Option<String>,
    line_ending: String,
    bom: bool,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let documents = documents.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (destination, expected) = if let Some(path) = path {
            let destination = require_grant(&documents, Path::new(&path))?;
            if expected.is_none() {
                return Err("MAR_PORA:missingVersion".into());
            }
            (destination, expected)
        } else {
            let Some(selected) = app
                .dialog()
                .file()
                .add_filter("Markdown", &["md"])
                .set_file_name(&suggested_name)
                .blocking_save_file()
            else {
                return Ok(None);
            };
            let mut destination = selected.into_path().map_err(|e| e.to_string())?;
            if destination.extension().is_none() {
                destination.set_extension("md");
            }
            (destination, None)
        };
        write_document(&destination, &text, expected.as_deref(), &line_ending, bom)?;
        let canonical = destination.canonicalize().map_err(|e| e.to_string())?;
        grant(&documents, canonical.clone())?;
        Ok(Some(canonical.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_theme(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .add_filter("Marp theme", &["css"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        let text =
            String::from_utf8(read_limited(&path, 2 * 1024 * 1024)?).map_err(|e| e.to_string())?;
        Ok(Some(text))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn image_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative_path = relative_path.split(['?', '#']).next().unwrap_or("");
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return Err("MAR_PORA:relativeImage".into());
    }
    let canonical = root
        .join(relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("MAR_PORA:imageOutside".into());
    }
    Ok(canonical)
}

#[tauri::command]
async fn read_image(
    documents: tauri::State<'_, Documents>,
    document_path: String,
    relative_path: String,
) -> Result<String, String> {
    let documents = documents.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let document = require_grant(&documents, Path::new(&document_path))?;
        let root = document.parent().ok_or("MAR_PORA:badDirectory")?;
        let image = image_path(root, &relative_path)?;
        let ext = image
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "avif" => "image/avif",
            "svg" => "image/svg+xml",
            _ => return Err("MAR_PORA:unsupportedImage".into()),
        };
        let bytes = read_limited(&image, MAX_IMAGE)?;
        Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn build_menu(app: &tauri::AppHandle, language: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let label = |en: &'static str, zh: &'static str| if language == "zh" { zh } else { en };
    let new = MenuItem::with_id(app, "new", label("New", "新建"), true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(
        app,
        "open",
        label("Open…", "打开…"),
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let save = MenuItem::with_id(
        app,
        "save",
        label("Save", "保存"),
        true,
        Some("CmdOrCtrl+S"),
    )?;
    let save_as = MenuItem::with_id(
        app,
        "save-as",
        label("Save as…", "另存为…"),
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        label("Quit Marpora", "退出 Marpora"),
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    #[cfg(target_os = "macos")]
    let application = Submenu::with_items(
        app,
        "Marpora",
        true,
        &[
            &PredefinedMenuItem::about(app, Some(label("About Marpora", "关于 Marpora")), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(label("Hide Marpora", "隐藏 Marpora")))?,
            &PredefinedMenuItem::hide_others(app, Some(label("Hide Others", "隐藏其他")))?,
            &PredefinedMenuItem::show_all(app, Some(label("Show All", "显示全部")))?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    #[cfg(not(target_os = "macos"))]
    let application = Submenu::with_items(
        app,
        "Marpora",
        true,
        &[
            &PredefinedMenuItem::about(app, Some(label("About Marpora", "关于 Marpora")), None)?,
            &quit,
        ],
    )?;
    let open_folder = MenuItem::with_id(
        app,
        "open-folder",
        label("Open Folder…", "打开文件夹…"),
        true,
        Some("CmdOrCtrl+Shift+O"),
    )?;
    let close_tab = MenuItem::with_id(
        app,
        "close-tab",
        label("Close Tab", "关闭标签页"),
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let export_html = MenuItem::with_id(
        app,
        "export-html",
        label("Export HTML…", "导出 HTML…"),
        true,
        None::<&str>,
    )?;
    let export_pdf = MenuItem::with_id(
        app,
        "export-pdf",
        label("Export PDF…", "导出 PDF…"),
        true,
        None::<&str>,
    )?;
    let file = Submenu::with_items(
        app,
        label("File", "文件"),
        true,
        &[
            &new,
            &open,
            &open_folder,
            &save,
            &save_as,
            &PredefinedMenuItem::separator(app)?,
            &export_html,
            &export_pdf,
            &PredefinedMenuItem::separator(app)?,
            &close_tab,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        label("Edit", "编辑"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(label("Undo", "撤销")))?,
            &PredefinedMenuItem::redo(app, Some(label("Redo", "重做")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(label("Cut", "剪切")))?,
            &PredefinedMenuItem::copy(app, Some(label("Copy", "复制")))?,
            &PredefinedMenuItem::paste(app, Some(label("Paste", "粘贴")))?,
            &PredefinedMenuItem::select_all(app, Some(label("Select All", "全选")))?,
        ],
    )?;
    Menu::with_items(app, &[&application, &file, &edit])
}

#[tauri::command]
fn set_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let menu = build_menu(&app, &language).map_err(|error| error.to_string())?;
    app.set_menu(menu).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(Documents::default())
        .manage(presenter::Presentation::default())
        .manage(workspace::Folders::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_document,
            save_document,
            open_theme,
            read_image,
            set_language,
            workspace::open_folder,
            workspace::list_folder,
            workspace::open_workspace_file,
            workspace::read_document,
            workspace::read_resource,
            export::export_document,
            presenter::presentation_displays,
            presenter::presentation_open,
            presenter::presentation_snapshot,
            presenter::presentation_focus,
            presenter::presentation_update,
            presenter::presentation_action,
            presenter::presentation_ready,
            presenter::presentation_close,
            presenter::presentation_health
        ])
        .menu(|app| build_menu(app, "en"))
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                presenter::window_destroyed(window);
            }
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let paths = paths.clone();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn_blocking(move || {
                    for path in paths {
                        if path.is_dir() {
                            match workspace::register_folder(
                                &app.state::<workspace::Folders>(),
                                &path,
                            ) {
                                Ok(folder) => {
                                    let _ = app.emit("folder-dropped", folder);
                                }
                                Err(error) => {
                                    let _ = app.emit("document-error", error);
                                }
                            }
                            continue;
                        }
                        match decode_document(&path) {
                            Ok(document) => {
                                let _ =
                                    grant(&app.state::<Documents>(), PathBuf::from(&document.path));
                                let _ = app.emit("document-dropped", document);
                            }
                            Err(error) => {
                                let _ = app.emit("document-error", error);
                            }
                        }
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("Unable to start Marpora");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_utf8_bom_crlf_and_rejects_external_edits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("中文.md");
        write_document(&path, "# 你好\n\ntext\n", None, "crlf", true).unwrap();
        assert_eq!(
            fs::read(&path).unwrap(),
            "\u{feff}# 你好\r\n\r\ntext\r\n".as_bytes()
        );
        let doc = decode_document(&path).unwrap();
        assert!(doc.bom);
        assert_eq!(doc.line_ending, "crlf");
        fs::write(&path, "external change").unwrap();
        assert!(write_document(&path, "replacement", Some(&doc.text), "lf", false).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external change");
    }

    #[test]
    fn image_paths_cannot_escape_document_folder() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("slides");
        fs::create_dir(&folder).unwrap();
        fs::write(dir.path().join("private.png"), "private").unwrap();
        assert!(image_path(&folder, "../private.png").is_err());
    }

    #[test]
    fn native_file_access_requires_a_user_grant() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("file.md");
        fs::write(&path, "hi").unwrap();
        let documents = Documents::default();
        assert!(require_grant(&documents, &path).is_err());
        grant(&documents, path.canonicalize().unwrap()).unwrap();
        assert!(require_grant(&documents, &path).is_ok());
    }
}

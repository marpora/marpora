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
}

fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err(format!(
            "文件不是普通文件，或超过 {} MB。",
            limit / 1024 / 1024
        ));
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
    if !["md", "markdown", "mdown", "txt"].contains(&extension.as_str()) {
        return Err("请打开 Markdown 或 UTF-8 文本文件。".into());
    }
    let raw = String::from_utf8(read_limited(&path, MAX_DOCUMENT)?)
        .map_err(|_| "文件不是 UTF-8 编码，请先将其转换为 UTF-8。".to_string())?;
    Ok(OpenDocument {
        path: path.to_string_lossy().into_owned(),
        text: raw.trim_start_matches('\u{feff}').replace("\r\n", "\n"),
        line_ending: if raw.contains("\r\n") { "crlf" } else { "lf" }.into(),
        bom: raw.starts_with('\u{feff}'),
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
        return Err("请先通过打开对话框选择这个文件。".into());
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
            .add_filter("Markdown", &["md", "markdown", "mdown", "txt"])
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
        return Err("文档超过 16 MB，无法保存。".into());
    }
    if let Some(expected) = expected {
        let disk = decode_document(path)?;
        if disk.text != expected {
            return Err("磁盘文件已被其他程序修改。请另存为，或重新打开文件后合并修改。".into());
        }
    }
    let parent = path.parent().ok_or("无法确定保存目录。")?;
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
                return Err("缺少磁盘版本信息，请使用另存为。".into());
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
        return Err("仅支持文档目录内的相对图片。".into());
    }
    let canonical = root
        .join(relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("图片路径超出文档目录。".into());
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
        let root = document.parent().ok_or("无法确定文档目录。")?;
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
            _ => return Err("不支持的图片格式。".into()),
        };
        let bytes = read_limited(&image, MAX_IMAGE)?;
        Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .manage(Documents::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_document,
            save_document,
            open_theme,
            read_image
        ])
        .menu(|app| {
            let new = MenuItem::with_id(app, "new", "新建", true, Some("CmdOrCtrl+N"))?;
            let open = MenuItem::with_id(app, "open", "打开…", true, Some("CmdOrCtrl+O"))?;
            let save = MenuItem::with_id(app, "save", "保存", true, Some("CmdOrCtrl+S"))?;
            let save_as =
                MenuItem::with_id(app, "save-as", "另存为…", true, Some("CmdOrCtrl+Shift+S"))?;
            let quit = MenuItem::with_id(app, "quit", "退出 Marpora", true, Some("CmdOrCtrl+Q"))?;
            #[cfg(target_os = "macos")]
            let application = Submenu::with_items(
                app,
                "Marpora",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("关于 Marpora"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("隐藏 Marpora"))?,
                    &PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?,
                    &PredefinedMenuItem::show_all(app, Some("显示全部"))?,
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
                    &PredefinedMenuItem::about(app, Some("关于 Marpora"), None)?,
                    &quit,
                ],
            )?;
            let file = Submenu::with_items(
                app,
                "文件",
                true,
                &[
                    &new,
                    &open,
                    &save,
                    &save_as,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, Some("关闭窗口"))?,
                ],
            )?;
            let edit = Submenu::with_items(
                app,
                "编辑",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("撤销"))?,
                    &PredefinedMenuItem::redo(app, Some("重做"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("剪切"))?,
                    &PredefinedMenuItem::copy(app, Some("复制"))?,
                    &PredefinedMenuItem::paste(app, Some("粘贴"))?,
                    &PredefinedMenuItem::select_all(app, Some("全选"))?,
                ],
            )?;
            Menu::with_items(app, &[&application, &file, &edit])
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let Some(path) = paths.first().cloned() else {
                    return;
                };
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn_blocking(move || match decode_document(&path) {
                    Ok(document) => {
                        let documents = app.state::<Documents>();
                        let _ = grant(&documents, PathBuf::from(&document.path));
                        let _ = app.emit("document-dropped", document);
                    }
                    Err(error) => {
                        let _ = app.emit("document-error", error);
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

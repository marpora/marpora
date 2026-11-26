use super::{decode_document, grant, read_limited, require_grant, Documents, OpenDocument};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Default)]
pub struct Folders(pub Arc<Mutex<HashSet<PathBuf>>>);

#[derive(Serialize, Clone)]
pub struct Folder {
    path: String,
    name: String,
}
#[derive(Serialize, Debug)]
pub struct Entry {
    name: String,
    path: String,
    directory: bool,
}

fn authorized_folder(folders: &Folders, root: &str) -> Result<PathBuf, String> {
    let path = Path::new(root)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !folders
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .contains(&path)
    {
        return Err("MAR_PORA:folderPermission".into());
    }
    Ok(path)
}

fn contained(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.starts_with(root.canonicalize().map_err(|error| error.to_string())?) {
        return Err("MAR_PORA:folderPermission".into());
    }
    Ok(canonical)
}

fn supported(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    ["md", "markdown", "mdown", "txt", "html", "htm", "pdf"].contains(&extension.as_str())
}

fn entries(root: &Path, folder: &Path) -> Result<Vec<Entry>, String> {
    let folder = contained(root, folder)?;
    let mut result = Vec::new();
    for item in fs::read_dir(folder).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let file_type = item.file_type().map_err(|error| error.to_string())?;
        let name = item.file_name().to_string_lossy().into_owned();
        if file_type.is_symlink()
            || name.starts_with('.')
            || ["node_modules", "target", "dist"].contains(&name.as_str())
        {
            continue;
        }
        if file_type.is_dir() || (file_type.is_file() && supported(&item.path())) {
            result.push(Entry {
                name,
                path: item.path().to_string_lossy().into_owned(),
                directory: file_type.is_dir(),
            });
        }
        if result.len() > 10_000 {
            return Err("MAR_PORA:folderTooLarge".into());
        }
    }
    result.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(result)
}

pub fn register_folder(folders: &Folders, path: &Path) -> Result<Folder, String> {
    let path = path.canonicalize().map_err(|error| error.to_string())?;
    if !path.is_dir() {
        return Err("MAR_PORA:badDirectory".into());
    }
    let name = path
        .file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned();
    folders
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .insert(path.clone());
    Ok(Folder {
        path: path.to_string_lossy().into_owned(),
        name,
    })
}

#[tauri::command]
pub async fn open_folder(
    app: tauri::AppHandle,
    folders: tauri::State<'_, Folders>,
) -> Result<Option<Folder>, String> {
    let folders = folders.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|error| error.to_string())?;
        register_folder(&folders, &path).map(Some)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_folder(
    folders: tauri::State<'_, Folders>,
    root: String,
    path: String,
) -> Result<Vec<Entry>, String> {
    let folders = folders.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = authorized_folder(&folders, &root)?;
        entries(&root, Path::new(&path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn open_workspace_file(
    folders: tauri::State<'_, Folders>,
    documents: tauri::State<'_, Documents>,
    root: String,
    path: String,
) -> Result<OpenDocument, String> {
    let folders = folders.inner().clone();
    let documents = documents.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = authorized_folder(&folders, &root)?;
        let path = contained(&root, Path::new(&path))?;
        let document = decode_document(&path)?;
        grant(&documents, path)?;
        Ok(document)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_document(
    documents: tauri::State<'_, Documents>,
    path: String,
) -> Result<OpenDocument, String> {
    let documents = documents.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = require_grant(&documents, Path::new(&path))?;
        decode_document(&path)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn resource_path(
    folders: &Folders,
    document: &Path,
    relative: &str,
) -> Result<PathBuf, String> {
    let document = document.canonicalize().map_err(|error| error.to_string())?;
    let directory = document.parent().ok_or("MAR_PORA:badDirectory")?;
    let root = folders
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .iter()
        .filter(|root| document.starts_with(root))
        .max_by_key(|root| root.components().count())
        .cloned()
        .unwrap_or_else(|| directory.to_path_buf());
    if Path::new(relative).is_absolute() {
        return Err("MAR_PORA:imageOutside".into());
    }
    contained(&root, &directory.join(relative))
}

#[tauri::command]
pub async fn read_resource(
    folders: tauri::State<'_, Folders>,
    documents: tauri::State<'_, Documents>,
    document_path: String,
    relative_path: String,
) -> Result<String, String> {
    let documents = documents.inner().clone();
    let folders = folders.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let document = require_grant(&documents, Path::new(&document_path))?;
        let relative = relative_path
            .split(['?', '#'])
            .next()
            .unwrap_or(&relative_path);
        let path = resource_path(&folders, &document, relative)?;
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mime = match extension.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "svg" => "image/svg+xml",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "avif" => "image/avif",
            "css" => "text/css",
            "woff2" => "font/woff2",
            "woff" => "font/woff",
            "ttf" => "font/ttf",
            "otf" => "font/otf",
            _ => return Err("MAR_PORA:unsupportedImage".into()),
        };
        Ok(format!(
            "data:{};base64,{}",
            mime,
            STANDARD.encode(read_limited(&path, 20 * 1024 * 1024)?)
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn folder_entries_are_lazy_sorted_and_limited_to_supported_documents() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("folder")).unwrap();
        fs::create_dir(dir.path().join("node_modules")).unwrap();
        for file in ["B.md", "a.pdf", "deck.html", "ignore.exe", ".hidden.md"] {
            fs::write(dir.path().join(file), "").unwrap();
        }
        let found = entries(dir.path(), dir.path()).unwrap();
        assert_eq!(
            found
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["folder", "a.pdf", "B.md", "deck.html"]
        );
    }
    #[test]
    fn workspace_resources_can_use_parent_paths_but_not_escape_the_granted_root() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("slides")).unwrap();
        fs::write(dir.path().join("image.png"), "pixel").unwrap();
        let file = dir.path().join("slides/deck.md");
        fs::write(&file, "deck").unwrap();
        let folders = Folders::default();
        folders
            .0
            .lock()
            .unwrap()
            .insert(dir.path().canonicalize().unwrap());
        assert!(resource_path(&folders, &file, "../image.png").is_ok());
        assert!(resource_path(&folders, &file, "../../private.png").is_err());
    }
}

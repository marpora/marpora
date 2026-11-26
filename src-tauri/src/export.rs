use super::{grant, Documents};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use tauri_plugin_dialog::DialogExt;

fn run(command: &mut Command) -> Result<(), String> {
    let log = tempfile::NamedTempFile::new().map_err(|error| error.to_string())?;
    command
        .stdout(Stdio::null())
        .stderr(log.reopen().map_err(|error| error.to_string())?);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let started = Instant::now();
    loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) if status.success() => return Ok(()),
            Some(_) => {
                let message = fs::read_to_string(log.path()).unwrap_or_default();
                return Err(message.chars().take(1500).collect());
            }
            None if started.elapsed() > Duration::from_secs(65) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("MAR_PORA:pdfTimeout".into());
            }
            None => std::thread::sleep(Duration::from_millis(25)),
        }
    }
}

fn installed_browser() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "macos")]
    candidates.extend(
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
        .iter()
        .map(PathBuf::from),
    );
    #[cfg(target_os = "linux")]
    candidates.extend(
        [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
        ]
        .iter()
        .map(PathBuf::from),
    );
    #[cfg(target_os = "windows")]
    for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Some(root) = std::env::var_os(variable) {
            for browser in [
                "Google/Chrome/Application/chrome.exe",
                "Microsoft/Edge/Application/msedge.exe",
                "BraveSoftware/Brave-Browser/Application/brave.exe",
            ] {
                candidates.push(PathBuf::from(&root).join(browser));
            }
        }
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

pub(crate) fn pdf_from_html(
    html: &str,
    output: &Path,
    pages: u32,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let directory = tempfile::tempdir().map_err(|error| error.to_string())?;
    let input = directory.path().join("document.html");
    fs::write(&input, html).map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    {
        if pages > 0 {
            use std::os::unix::fs::PermissionsExt;
            let helper = directory.path().join("marpora-pdf");
            fs::write(
                &helper,
                include_bytes!(concat!(env!("OUT_DIR"), "/marpora-pdf-helper")),
            )
            .map_err(|error| error.to_string())?;
            fs::set_permissions(&helper, fs::Permissions::from_mode(0o700))
                .map_err(|error| error.to_string())?;
            let result = run(Command::new(helper)
                .arg(&input)
                .arg(output)
                .arg(pages.to_string())
                .arg(width.to_string())
                .arg(height.to_string()));
            if result.is_ok() && output.is_file() {
                return Ok(());
            }
            // Fall back only to a browser already installed by the user.
            if installed_browser().is_none() {
                return result;
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (pages, width, height);
    let browser = installed_browser().ok_or("MAR_PORA:pdfBrowserRequired")?;
    let url = tauri::Url::from_file_path(&input).map_err(|_| "MAR_PORA:badDirectory")?;
    run(Command::new(browser)
        .arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-pdf-header-footer")
        .arg("--print-to-pdf-no-header")
        .arg(format!(
            "--user-data-dir={}",
            directory.path().join("browser-profile").display()
        ))
        .arg(format!("--print-to-pdf={}", output.display()))
        .arg("--virtual-time-budget=1500")
        .arg(url.as_str()))?;
    if !output.is_file() {
        return Err("MAR_PORA:pdfFailed".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn export_document(
    app: tauri::AppHandle,
    documents: tauri::State<'_, Documents>,
    html: String,
    format: String,
    suggested_name: String,
    pages: u32,
    width: f64,
    height: f64,
) -> Result<Option<String>, String> {
    if !["html", "pdf"].contains(&format.as_str())
        || html.len() > 96 * 1024 * 1024
        || pages > 1000
        || !width.is_finite()
        || !height.is_finite()
        || !(120.0..=8192.0).contains(&width)
        || !(120.0..=8192.0).contains(&height)
    {
        return Err("MAR_PORA:invalidExport".into());
    }
    let documents = documents.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .add_filter(format.to_uppercase(), &[format.as_str()])
            .set_file_name(suggested_name)
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let mut destination = selected.into_path().map_err(|error| error.to_string())?;
        if destination.extension().is_none() {
            destination.set_extension(&format);
        }
        if destination
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_lowercase())
            != Some(format.clone())
        {
            return Err("MAR_PORA:exportExtension".into());
        }
        let parent = destination.parent().ok_or("MAR_PORA:badDirectory")?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
        if format == "html" {
            temporary
                .write_all(html.as_bytes())
                .map_err(|error| error.to_string())?;
        } else {
            let generated = tempfile::tempdir()
                .map_err(|error| error.to_string())?
                .keep();
            let output = generated.join("output.pdf");
            let conversion = pdf_from_html(&html, &output, pages, width, height);
            let bytes =
                conversion.and_then(|_| fs::read(&output).map_err(|error| error.to_string()));
            let _ = fs::remove_dir_all(&generated);
            let bytes = bytes?;
            if !bytes.starts_with(b"%PDF-") {
                return Err("MAR_PORA:pdfFailed".into());
            }
            temporary
                .write_all(&bytes)
                .map_err(|error| error.to_string())?;
        }
        temporary
            .as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        temporary
            .persist(&destination)
            .map_err(|error| error.error.to_string())?;
        let canonical = destination
            .canonicalize()
            .map_err(|error| error.to_string())?;
        grant(&documents, canonical.clone())?;
        Ok(Some(canonical.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| error.to_string())?
}

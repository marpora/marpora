fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=native/pdf_export.swift");
        let output =
            std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("marpora-pdf-helper");
        let architecture = if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64") {
            "arm64"
        } else {
            "x86_64"
        };
        let cache =
            std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("swift-module-cache");
        let status = std::process::Command::new("xcrun")
            .args([
                "swiftc",
                "-O",
                "-target",
                &format!("{}-apple-macosx12.0", architecture),
                "-module-cache-path",
            ])
            .arg(cache)
            .arg("native/pdf_export.swift")
            .arg("-o")
            .arg(output)
            .status()
            .expect("Xcode Swift compiler is required to build macOS PDF export");
        assert!(
            status.success(),
            "Cannot compile the system WebKit PDF helper"
        );
    }
    tauri_build::build()
}

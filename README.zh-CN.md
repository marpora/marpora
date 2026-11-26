# Marpora

**本地写作，自由呈现。** 一个轻量的 Markdown 与 Marp 桌面编辑器，macOS 优先，使用 Tauri 2、Svelte 5、TypeScript、CodeMirror 6 和 Marp Core。

[English](README.md) · [品牌文件](brand/README.md) · [实现说明](docs/architecture.md)

![文件夹与多标签](docs/screenshots/marpora-workspace.png)

## 当前功能

- 原位编辑：标题、强调、链接、列表与引用即时排版；表格、代码、图片点击后编辑原始源码。可随时切换源码，保留选区与撤销记录。
- 文件夹侧栏：按需展开目录，查看 Markdown、HTML、PDF 文件，点击打开。多个标签分别保留内容、光标、滚动位置与撤销记录。
- Marp 实时幻灯片：自动识别 `marp: true`，支持分页、导航、演讲者备注、演示模式、fragment、自定义主题和本地 KaTeX 字体。
- 打开已有 HTML / PDF：Marp HTML 按幻灯片显示，普通 HTML 按文档显示；PDF 支持翻页和缩放。二者均为只读预览。
- 导出独立 HTML / PDF：从当前文本（包括尚未保存的修改）生成副本，不改写源文件，也不会将源文档标为已保存。
- 中英文界面，默认英文；浅色、深色、默认跟随系统；强调色支持系统、蓝、青、玫瑰和琥珀色。模板本身保持原配色。
- 原生文件保存、另存为、文件/文件夹拖入、多草稿恢复、关闭确认、UTF-8 BOM 与 LF/CRLF 保留。覆盖前检查外部修改，以临时文件替换完成保存。

原始 Markdown 是唯一真源。front matter、分页、注释、自定义指令不会经过富文本 AST 或 HTML 反向序列化，因此切换标签或显示模式不会重排这些内容。

## 预览与导出

应用使用系统 WebView，**不捆绑 Chromium 或 Node.js**。PDF 阅读组件按需加载，字体、CMap、解码资源保存在本机。macOS 的 Marp 幻灯片 PDF 导出使用小型 Swift 辅助程序，链接系统 WebKit 与 PDFKit，不要求安装浏览器。普通文档的 PDF 导出以及 Windows/Linux 的幻灯片 PDF 导出暂时复用标准路径中已安装的 Chrome、Edge 或 Chromium；没有安装时会明确提示。

HTML 导出嵌入图片、CSS 资源和数学字体，可离线查看，提供应用生成的键盘导航及打印样式。源文档中的脚本会被移除；HTML 预览也始终禁止执行脚本，因此第三方脚本功能不会完整复现。PDF 阅读暂为 canvas 显示，尚无文字选择和搜索。

单独打开文件时，相对资源仅能访问其目录内的文件。涉及 `../images/...` 时，请先打开项目文件夹，以该文件夹作为资源访问边界。缺少导出资源时会报错，避免生成缺图副本。远程图片或字体需要在导出时联网，嵌入成功的导出副本随后可离线使用。

工具栏中已去掉 UIC 专属按钮。通过“打开”选择 [UIC 示例](examples/uic/example.md)，与其他文档采用同样流程。十页测试模板涵盖双栏、代码、逐步显示和 iClicker 等。MIT 许可证与来源保留在 `examples/uic`，原始模板仓库未修改。应用仅执行内置已知扩展，不加载任意外部 JavaScript 引擎。

## 开发与验证

需要 Node.js 24+、Rust stable、[Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)。macOS 构建还需要 Xcode 的 Swift 编译器与 SDK。

```sh
npm ci
npm run desktop
```

浏览器模式：`npm run dev`，访问 `http://127.0.0.1:1420`。打开文件/目录使用上传，保存/HTML 导出使用下载，PDF 导出使用浏览器打印。浏览器文件夹权限只在本次会话有效；草稿恢复仅恢复文本，不恢复文件权限。

```sh
npm run check
npm test
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run desktop:build -- --bundles app,dmg
```

macOS 浏览器测试使用已安装的 Chrome，其他环境可为开发测试运行 `npx playwright install chromium`，该测试浏览器不会打入应用。测试覆盖源码无损、组合输入事件、撤销、BOM/CRLF、模板指令、中英文、系统外观、文件树、多标签状态、HTML 嵌入资源、脚本清理和 PDF 翻页/缩放。

快捷键包括 ⌘ / Ctrl + O 打开、Shift + O 打开目录、S 保存、Shift + S 另存为、N 新建、W 关闭标签、/ 切换源码；Ctrl Tab 切换标签。点击右侧幻灯片或预览区后，方向键即可翻页；点击左侧后恢复光标移动。演示时空格逐步显示，Esc 退出。

## 当前边界

目前在 Apple Silicon macOS 本机验证；[打包工作流](.github/workflows/packages.yml) 在 main 更新、版本标签或手动运行时生成 Apple Silicon 与 Intel Mac DMG；Actions 产物保留 30 天。Windows/Linux 发行包后续启用，跨平台源码继续保留；Intel 运行效果仍需实机验证。macOS 本地包为临时签名，尚未 Developer ID 签名、公证；工作流上传构建产物，不自动发布 Release。

尚无表格单元格富文本操作、文件关联、文件监听、模板商城或任意外部 Marp 插件。大文档性能未做基准测试，Marp 渲染仍在前端主线程。没有遥测、云同步；文档中的远程资源仍可能发起网络请求。草稿是本机恢复辅助，不代替正式保存。

应用代码继续放在 `marpora/marpora`；未来产品网站建议放 `marpora/marpora.github.io`，模板集合放 `marpora/templates`，不需要搬迁已有代码。详见[仓库规划](docs/github/repository-plan.md)。MIT 许可，独立项目，与 Typora 和 Marp 团队无隶属关系。

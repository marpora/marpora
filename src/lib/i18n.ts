export type Language = 'en' | 'zh'

const messages = {
  new: ['New', '新建'], newDocument: ['New document', '新建文档'], open: ['Open', '打开'], save: ['Save', '保存'], saveAs: ['Save as', '另存为'], processing: ['Working…', '处理中…'], unsaved: ['Unsaved', '未保存'],
  uicExample: ['UIC example', 'UIC 示例'], layout: ['Workspace layout', '工作区布局'], editorOnly: ['Editor only', '仅编辑'], splitView: ['Editor and preview', '编辑与预览'], previewOnly: ['Preview only', '仅预览'],
  source: ['Source', '源码'], live: ['Live preview', '原位预览'], editor: ['Markdown editor', 'Markdown 编辑器'], placeholder: ['Write your first thought…', '写下你的第一个想法…'],
  wrap: ['Word wrap', '自动换行'], toggleWrap: ['Toggle word wrap', '切换自动换行'], resize: ['Resize editor', '调整编辑区宽度'], resizeHint: ['Drag to resize; arrow keys to adjust', '拖动调整宽度；方向键微调'],
  preview: ['Preview', '预览'], previewMode: ['Preview mode', '预览模式'], auto: ['Auto', '自动'], document: ['Document', '文档'], slides: ['Slides', '幻灯片'], loadTheme: ['Load slide theme', '加载幻灯片主题'], themeHint: ['Import a Marp CSS theme with @theme metadata', '导入含 @theme 的 Marp CSS'],
  rendering: ['Rendering…', '渲染中…'], realtime: ['Live preview', '实时预览'], present: ['Present', '演示'], previousSlide: ['Previous slide', '上一张幻灯片'], nextSlide: ['Next slide', '下一张幻灯片'], notes: ['Notes', '备注'], speakerNotes: ['Speaker notes', '演讲者备注'], noNotes: ['No notes for this slide.', '这一页没有备注。'], slideNavigation: ['Slide navigation', '幻灯片导航'],
  characters: ['{count} characters', '{count} 字符'], cursor: ['Ln {line}, Col {column}', '行 {line}，列 {column}'], slideCount: ['{count} slides', '{count} 张幻灯片'], localWriting: ['Local words, room to think.', '本地写作，自由呈现'], syncOn: ['Sync on', '同步已开'], syncOff: ['Sync off', '同步已关'], syncSlides: ['Follow the editor cursor', '随编辑光标切换幻灯片'], syncScroll: ['Follow source scrolling', '跟随源码滚动'],
  presentationHint: ['Arrow keys to navigate, Space to reveal, Esc to exit', '方向键翻页，空格逐步显示，Esc 退出'], exitPresentation: ['Exit presentation', '退出演示'],
  restored: ['Unsaved draft restored. Choose a file location when saving.', '已恢复未保存的草稿。保存时请选择文件位置。'], close: ['Close', '关闭'], closeDraft: ['Dismiss draft notice', '关闭草稿提示'], closeError: ['Dismiss error', '关闭错误提示'],
  discardQuestion: ['This document has unsaved changes. Discard them?', '当前文档有未保存的修改。要放弃修改吗？'], discard: ['Discard changes', '放弃修改'], keepEditing: ['Keep editing', '继续编辑'],
  previewFailed: ['Could not update preview: {error}', '预览未能更新：{error}'], openFailed: ['Could not open file: {error}', '打开失败：{error}'], saveFailed: ['Could not save file: {error}', '保存失败：{error}'], themeFailed: ['Could not load theme: {error}', '加载主题失败：{error}'], themeMetadata: ['Theme CSS must contain /* @theme name */.', '主题 CSS 需要包含 /* @theme 主题名 */。'], missingTheme: ['Theme “{name}” was not found. Using the default theme. Import its CSS with Load slide theme.', '未找到主题 “{name}”，已使用默认主题。可点击“加载幻灯片主题”导入 CSS。'],
  emptySlides: ['No visible slides', '没有可显示的幻灯片'], emptySlidesHint: ['Check hidden-slide markers or add some content.', '检查隐藏标记，或添加一些内容。'], slidePreview: ['Marp slide preview', 'Marp 幻灯片预览'], documentPreview: ['Markdown preview', 'Markdown 实时预览'], slideTitle: ['Slide {number}', '幻灯片 {number}'],
  preferences: ['Preferences', '偏好设置'], language: ['Language', '界面语言'], appearance: ['Appearance', '外观'], system: ['System', '跟随系统'], light: ['Light', '浅色'], dark: ['Dark', '深色'], accent: ['Accent color', '强调色'], blue: ['Blue', '蓝色'], teal: ['Teal', '青色'], rose: ['Rose', '玫瑰色'], amber: ['Amber', '琥珀色'], preferencesHint: ['Saved on this device. Slide themes keep their original colors.', '设置保存在本机。幻灯片保持原主题颜色。'],
  editBlock: ['Edit {kind}', '编辑{kind}'], code: ['code', '代码'], table: ['table', '表格'], image: ['image', '图片'], divider: ['Divider', '分隔线'], slideBreak: ['Slide break', '幻灯片分页'], imageFailed: ['Could not load image', '图片未能加载'],
  welcomeName: ['Welcome.md', '开始写作.md'], untitled: ['Untitled.md', '未命名.md'], deckName: ['Presentation.md', '演示文稿.md'], recoveredName: ['Recovered draft.md', '恢复的草稿.md'],
  documentTooLarge: ['Document exceeds 16 MB.', '文档超过 16 MB。'], themeTooLarge: ['Theme exceeds 2 MB.', '主题超过 2 MB。'],
  diskConflict: ['The file was changed by another application. Save as a copy, or reopen it and merge your changes.', '磁盘文件已被其他程序修改。请另存为，或重新打开文件后合并修改。'],
  badEncoding: ['The file is not UTF-8. Convert it to UTF-8 before opening.', '文件不是 UTF-8 编码，请先将其转换为 UTF-8。'],
  markdownOnly: ['Choose a Markdown or UTF-8 text file.', '请打开 Markdown 或 UTF-8 文本文件。'],
  grantRequired: ['Open this file through the file picker first.', '请先通过打开对话框选择这个文件。'],
  missingVersion: ['Missing disk version. Use Save as.', '缺少磁盘版本信息，请使用另存为。'],
  badDirectory: ['Cannot determine the document directory.', '无法确定文档目录。'],
  relativeImage: ['Only relative images inside the document directory are supported.', '仅支持文档目录内的相对图片。'],
  imageOutside: ['Image path is outside the document directory.', '图片路径超出文档目录。'],
  unsupportedImage: ['Unsupported image format.', '不支持的图片格式。'],
  invalidFile: ['Not a regular file, or the file is too large.', '文件不是普通文件，或文件过大。'],
} as const

export type MessageKey = keyof typeof messages
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string
export function translator(language: Language): Translate {
  return (key, values = {}) => messages[key][language === 'zh' ? 1 : 0].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}

export function errorMessage(error: unknown, language: Language): string {
  const value = String(error)
  return value.startsWith('MAR_PORA:') && value.slice(9) in messages ? translator(language)(value.slice(9) as MessageKey) : value
}

export const searchPhrases = {
  'Find': '查找', 'Replace': '替换', 'next': '下一个', 'previous': '上一个', 'all': '全部', 'match case': '区分大小写', 'by word': '全字匹配', 'regexp': '正则表达式', 'replace': '替换', 'replace all': '全部替换', 'close': '关闭', 'Go to line': '跳转到行', 'go': '跳转', 'current match': '当前匹配', 'on line': '所在行', 'replaced $ matches': '已替换 $ 处匹配', 'replaced match on line $': '已替换第 $ 行的匹配',
}

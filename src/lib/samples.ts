import uicExample from '../../examples/uic/example.md?raw'

export const welcome = `# 留一点空间，给思考。

欢迎来到 **Marpora**。一个安静的 Markdown 工作台，也是一张随时可以开始的幻灯片。

在左侧写下文字，右侧即刻呈现。文件保存在你自己的电脑上。

## 从一段文字开始

你可以用它整理想法、写技术笔记，或准备下一次分享。

- **专注写作**：Markdown 源码始终在你手中
- **即时预览**：标题、表格、代码与图片
- **切换演示**：同一个工作台，预览 Marp 幻灯片

> 好的工具，为想法让路。

## 写作，也可以是演示

点击右上角的 **UIC 示例**，试试你的课程幻灯片模板。主题、双栏布局与逐步显示都已接入。

\`\`\`typescript
const idea = 'A little less friction.'
const marpora = { markdown: true, slides: true }
\`\`\`

## 一张小清单

| 操作 | 快捷键 |
| --- | --- |
| 打开文件 | ⌘ / Ctrl + O |
| 保存文件 | ⌘ / Ctrl + S |
| 另存为 | ⌘ / Ctrl + Shift + S |
| 查找 | ⌘ / Ctrl + F |

---

从这里开始，写下你的第一个想法。
`

export const uic = uicExample

export const starterDeck = `---
marp: true
theme: default
paginate: true
---

# 一个想法，一张幻灯片

用 Markdown 写下你的下一次分享。

---

## 从这里开始

- 写下核心观点
- 添加例子与代码
- 用三个短横线分页

---

## 谢谢

保持简单，让内容说话。
`

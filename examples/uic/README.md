# UIC 验证样例

来源：[xjtuwxg/marp-uic-slides-template](https://github.com/xjtuwxg/marp-uic-slides-template)，MIT；保留原始 `LICENSE`。

`example.md` 与 `theme/uic-cs.css` 是用户本地模板的原样副本。`engine/marp-engine.mjs` 在原始引擎基础上做两项调整：

- 删除“所有幻灯片隐藏时放弃过滤”的分支，避免隐藏内容重新出现。Marpora 将全部隐藏的结果显示为空状态。
- 在显式启用 `marporaSourceMap` 环境选项时记录被删除行注释的原始行号，支持编辑器的准确光标同步，不影响 Markdown 文件内容。

Marpora 不加载模板内 presenter HTML 的执行脚本，使用自己的演示视图、备注和导航。PDF 导出与独立 HTML 演示器仍可使用原模板的构建脚本。

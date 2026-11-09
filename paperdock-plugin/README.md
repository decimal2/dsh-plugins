## 2.0.2 arXiv 链接打开

点击文件夹按钮，在打开框粘贴 arXiv 摘要页或 PDF 链接，例如 `https://arxiv.org/abs/1706.03762`，点击“打开”。PDF 会下载到工作区的 `paper_pdfs/arxiv-1706.03762.pdf`，然后自动进入阅读器。支持带版本号和旧式论文编号。

同名本地 PDF 会直接复用，包括未指定版本的链接；不会自动检查 arXiv 的更新版本。需要特定版本时请使用带 `v2` 等版本号的链接。下载上限为 256 MiB，超时为 120 秒；下载失败清理临时文件，保留当前打开的论文。需要本机网络能够访问 arXiv，并且已打开工作区。

## 2.0.1 阅读界面调整

划选 PDF 文本后点击“翻译”或“讲解”，内容会直接发送到该右侧栏所属的 DSH 原生会话，回答显示在左侧聊天区。使用当前会话模型，聊天记录由 DSH 保存。PaperDock 不再显示独立的对话面板或输入框。

默认工具栏仅保留打开文件、文件名、翻页和“更多”。目录、缩略图、缩放、搜索、模式切换、翻译本页和笔记入口按需展开。旧版已保存的译文仍保留，并随阅读笔记导出。

# PaperDock 2 — DSH 原生右侧栏论文阅读器

PaperDock 是独立 DSH bundle，不依赖 Agentero、Agentero CLI、Vault 或 better-sidebar。
适配版本：DSH **0.2.2-rc.1**，Node.js **24.9+**。

## 安装与更新

先停止 `dsh web`，在 Windows PowerShell 执行：

```powershell
& ".\paperdock-plugin\install-to-dsh.ps1"
dsh web
```

脚本构建源码、执行 `npm pack`，然后调用：

```powershell
dsh plugin --profile web add ".\paperdock-plugin\dist\paperdock-dsh-plugin-2.0.2.tgz"
```

由 DSH 管理依赖、锁文件及 `dsh.profile.bundles`。安装前迁移旧的 PaperDock 手工挂载条目，保留其他配置；安装失败会恢复未被并发修改的旧挂载。
不再自行维护 `.dsh/plugins` 运行副本或建立 junction。安装验证通过后，清理能够确认身份且没有额外文件的旧副本/共享链接；有额外文件则保留并打印提示。
更新继续运行同一脚本。源码在 E 盘供开发，标准安装位置是 profile 的 `node_modules`，这是包管理器管理的安装，不是额外自建运行目录。

刷新浏览器，在 **原生右侧栏 → 新标签页 → PaperDock** 打开阅读器。会话顶部不再增加“翻译”页签。

## 功能

- 本地 PDF.js 原版页面：图表、公式、文字选择、缩放、页码跳转、目录、邻近页缩略图、按页搜索、PDF 链接。
- 文字选区翻译、讲解与整页翻译发送到原生会话；高亮、批注和论文笔记在阅读器中保存。
- 译读与笔记面板可展开/收起，避免窄侧栏挤成两列。
- 回答的流式显示、停止和后续追问由 DSH 原生会话管理。
- 持久化阅读位置、缩放、译文、问答、标注和笔记；Markdown 导出；最近阅读列表及确认后删除记录。
- 多标签独立状态；同文档并发写入检测冲突。PDF 文件版本改变时取消旧高亮坐标并保留旧文字记录供核对。

记录保存在 `$DSH_HOME/paperdock/records`（默认 `%USERPROFILE%\.dsh\paperdock\records`）。浏览器 localStorage 保存尚未提交的恢复草稿。记录读取失败时停止自动覆盖；冲突草稿可以导出。删除阅读记录不删除论文原文件。

## 依赖与边界

PDF.js 5.4.624 随包提供，含许可证及 npm 完整性记录，不依赖 CDN。
现有文字抽取使用 Poppler：`pdfinfo`、`pdftotext`；重排视图的图表裁剪使用 `pdftoppm`。抽取命令保持只读沙箱策略。
扫描件没有 OCR；图像没有自动发送给模型。全文问答超出文本上限会明确要求缩小范围。
搜索当前提供匹配页面和摘录，尚未实现词级命中高亮。全文双语排版与自动文献导入不属于本轮功能。

## 开发

`src/` 是业务源码，`lib/` 是构建产物，不手改。`vendor/pdfjs/` 保存经过 SHA-512 核验的第三方资源。

```powershell
node build.mjs
npm test
```

Poppler、版面解析和侧栏回归测试统一位于本包的 `tests/`，通过 `npm test` 运行。

浏览器 smoke test（模拟 Host 响应，使用真实 PDF.js，不代替实际 DSH 验收）：

```powershell
npm install
npx playwright install chromium
npm run test:browser
```

当前开发沙箱拒绝 Chromium 所需的 socket，尚未完成视觉和 Windows 实际安装验收。
验证时应检查：右侧栏入口、开两份文档、选择原文翻译、缩放与搜索、批注导出、重启后恢复，以及删除记录后的其他标签冲突提示。
Agentero 及其资料尚未自动移除；应在 PaperDock 实际验收和资料迁移确认后处理。

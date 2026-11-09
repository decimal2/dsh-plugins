# DSH Plugins

面向 DeepSeek Harness（DSH）的本地插件集合，使用标准 `dsh.bundle` 格式，由 DSH 插件管理器安装到 `web` profile。

当前适配 **DSH 0.2.2-rc.1**，主要运行环境为 **Windows + PowerShell**。其他 DSH 版本需要先检查接口兼容性，尤其不要跳过会话删除插件的版本检查。

## 插件功能

| 目录 | 插件 | 作用 |
| --- | --- | --- |
| `paperdock-plugin` | PaperDock 2.0.2 | 在 DSH 原生右侧栏阅读本地 PDF、下载 arXiv 论文、划词翻译、讲解、高亮、批注与笔记导出 |
| `session-delete-plugin` | Session Delete 2.1.0 | 在会话菜单中提供永久删除，通过 DSH 原生确认弹窗删除聊天记录及独占附件 |

### PaperDock

- 保留 PDF 原始排版、图表和公式，支持翻页、缩放、目录、缩略图、搜索及文本模式。
- 选中文本后点击“翻译”或“讲解”，请求发送到所属的左侧 DSH 原生会话，使用该会话模型，不再增加独立聊天框。
- 默认只显示一行阅读工具栏，其他工具通过“更多”展开。
- 支持高亮、批注、论文笔记、Markdown 导出和阅读位置恢复。
- 打开框接受本地绝对路径、工作区相对路径及 arXiv 摘要页/PDF 链接。
- arXiv PDF 保存到**当前工作区**的 `paper_pdfs/arxiv-<论文编号>.pdf`。同名文件会直接复用；需要指定版本时使用带 `v1`、`v2` 等版本号的链接。

扫描版 PDF 暂不支持 OCR。arXiv 下载需要本机能够访问 arxiv.org；单文件上限 256 MiB，超时 120 秒。阅读记录位于 DSH 用户目录的 `paperdock/records`，删除阅读记录不会删除论文原文件。

### Session Delete

在会话菜单中选择永久删除，核对原生弹窗后确认。插件会处理聊天持久化数据、索引和独占附件，保留其他会话共享的附件，并检查运行状态和并发写入锁。**确认后无法撤销**。它不负责删除 PaperDock 下载的论文或独立阅读笔记。

## 安装准备

确保 PowerShell 可以找到以下命令：

```powershell
node --version
npm --version
pnpm --version
dsh --version
pdftotext -v
pdftoppm -v
```

- Node.js **24.9.0 或以上**。
- npm，以及 DSH 插件管理器调用的 pnpm。若缺少 pnpm，可运行 `npm install -g pnpm`，然后重新打开 PowerShell。
- 已安装并可运行的 DSH **0.2.2-rc.1**。
- PaperDock 需要 Poppler 的 `pdftotext`、`pdftoppm` 命令可被 DSH 进程找到。
- 翻译/讲解使用 DSH 已配置的会话模型，无需在插件代码中填写 API Key。

## 安装两个插件

克隆仓库并进入根目录（本仓库根目录就是本地开发时的 `plugins` 目录）：

```powershell
git clone https://github.com/decimal2/dsh-plugins.git
cd dsh-plugins
```

先停止正在运行的 `dsh web`，再执行：

```powershell
.\install-all.ps1
dsh web
```

刷新浏览器，在**原生右侧栏 → 新标签页 → PaperDock** 打开阅读器。会话删除入口位于会话菜单。

脚本会构建 `lib`、在 `dist` 中生成 `.tgz`，再调用 DSH 插件管理器安装并注册 bundle。无需复制代码到 DSH 的全局安装目录，也无需维护额外运行副本或手工链接。`lib`、`dist` 和 `node_modules` 不包含在 Git 源码中。

若 DSH 安装在非默认位置，先指定其包目录：

```powershell
$env:DSH_INSTALL_DIR = "C:\path\to\node_modules\@deepseek-ai\dsh"
.\install-all.ps1
```

### 单独安装或更新

在仓库根目录执行：

```powershell
.\paperdock-plugin\install-to-dsh.ps1
# 或者
.\session-delete-plugin\install-to-dsh.ps1
```

以后更新源码时，停止 DSH，执行 `git pull --ff-only` 后重新运行安装脚本，再启动 `dsh web` 并刷新页面。

### 卸载

```powershell
dsh plugin --profile web remove paperdock-dsh-plugin
dsh plugin --profile web remove dsh-session-delete-plugin
```

卸载插件不等于删除论文、阅读笔记或聊天记录。

## 开发与验证

```powershell
node .\paperdock-plugin\build.mjs
node .\session-delete-plugin\build.mjs
node --test --test-isolation=none .\paperdock-plugin\tests\arxiv.test.mjs .\paperdock-plugin\tests\records.test.mjs .\paperdock-plugin\tests\drafts.test.mjs .\paperdock-plugin\tests\install.test.mjs .\session-delete-plugin\tests\install.test.mjs
```

完整回归测试还需要对应 DSH 安装及论文测试样本；PaperDock 的 PDF 测试引用仓库上一级的 `paper_pdfs/REINFORCE-Zero.pdf`，不随源码分发。浏览器测试需在 `paperdock-plugin` 下安装开发依赖并运行 `npx playwright install chromium` 后执行 `npm run test:browser`。

## 第三方代码

PaperDock 的 `vendor/pdfjs` 包含 PDF.js 5.4.624，保留 Apache-2.0 许可证与 `PROVENANCE.json` 来源信息。会话删除插件的相关第三方声明见 `session-delete-plugin/THIRD_PARTY_LICENSE`。

# DSH Session Delete 2.1 — 标准 bundle

适配 DSH **0.2.2-rc.1**。通过会话菜单及 DSH 原生确认 UI 永久删除聊天记录，保留现有的忙碌检查、并发锁、子代理清理、共享附件保留与 SQLite 回收逻辑。

## 安装与更新

停止 DSH 后，在 Windows PowerShell 执行：

```powershell
& ".\session-delete-plugin\install-to-dsh.ps1"
dsh web
```

脚本构建、打包，再调用标准安装命令：

```powershell
dsh plugin --profile web add ".\session-delete-plugin\dist\dsh-session-delete-plugin-2.1.0.tgz"
```

`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 注册 `session-delete`。DSH 管理 profile 依赖、锁文件和 bundles 选择；可以在插件界面启用/停用。

迁移脚本移除以前的手工挂载及旧标记中的原生服务禁用项，保留标记内混入的模型/主题配置。不再复制到 `.dsh/plugins`，不创建手工 junction。成功安装并验证后清理能确认身份的旧运行目录；存在额外文件时保留并报告。

`src/v2` 为当前业务源码，`lib` 是构建产物。兼容性指纹仍会阻止在未经适配的 DSH 版本上执行删除。

```powershell
node build.mjs
npm test
```

联合更新两个插件：

```powershell
& ".\install-all.ps1"
```

本次修改不删除真实聊天记录。Windows 上的实际标准包安装还需执行上述脚本验证。

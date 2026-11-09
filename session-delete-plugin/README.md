# DSH Session Delete 2.1 — 标准 bundle

适配 DSH **0.2.2-rc.1**。通过会话菜单及 DSH 原生确认 UI 永久删除聊天记录，保留忙碌检查、并发锁、子代理清理、共享附件保留与 SQLite 回收逻辑。

## 安装与更新

在克隆的仓库根目录执行（先停止 DSH）：

```powershell
dsh plugin --profile web add "$PWD/session-delete-plugin"
dsh web
```

仓库随附可运行的 `lib` 和兼容性指纹，无需预先构建。更新时先执行 `git pull --ff-only`，再重复上述命令。由 DSH 管理注册、依赖与启用状态，不提供自定义安装或旧版迁移脚本。

## 开发

`src/v2` 为当前业务源码，`lib` 为随仓库发布的构建产物。修改源码后，在此插件目录运行：

```powershell
node build.mjs
npm test
```

构建要求本机安装 DSH 0.2.2-rc.1；非默认安装位置可通过 `DSH_INSTALL_DIR` 指定包目录。源码与更新后的 `lib` 应一起提交。兼容性指纹会阻止在未经适配的 DSH 依赖上执行删除。

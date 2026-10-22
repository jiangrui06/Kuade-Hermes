# Windows 安装与运行中任务

[繁體中文](INSTALLER.zh-TW.md) · [English](INSTALLER.en.md)

0.1.8 的安装验收复现了一个问题：安装器会关闭安装目录之外的同名 `Kuade.exe`。首轮 24 小时测试因此在约 73 分钟时中断，按未通过保留。旧安装器不适合在任务运行时使用。

0.1.9 通过 electron-builder 官方 `customCheckAppRunning` 扩展入口，复用随安装器提供的 nsProcess 检测组件。发现任何 Kuade 实例时，安装或卸载返回退出码 2；进程检测出错时返回 3。用户需先保存工作、等待任务完成并退出后台实例，再重试。安装器不再发送关闭或终止请求。不同目录、不同配置的 Kuade 也会阻止操作，这是保护长任务的保守边界。

应用自身的候选版本更新仍使用已有健康检查与交接模块，不经 NSIS 安装器。安装器保护脚本纳入自迭代验证基线，候选模型修改该脚本不会替换本轮可信打包配置。

真实验收脚本为 `scripts/acceptance/installer.ps1`。只在没有已有 Kuade 安装记录、没有运行实例的测试环境使用；传入 `-Installer`、`-Unpacked`、`-BuildDirectory`、`-Version`。脚本创建短路径临时安装目录和独立的同名见证进程，检查拒绝安装、正常安装、已安装版本启动、拒绝卸载、正常卸载及原模型配置哈希。回执保存在 `D:\Kuade-acceptance`；失败现场保留，禁止把脚本启动或单次退出码视为验收完成。它使用静默模式，不覆盖交互安装向导或管理员安装。

参考：[electron-builder NSIS](https://www.electron.build/nsis/)、[nsProcess 返回值](https://nsis.sourceforge.io/NsProcess_plugin)、[NSIS 命令行与卸载完成等待](https://nsis.sourceforge.io/Docs/Chapter3.html)。验收结果见 [安装器记录](acceptance/installer-0.1.9-2026-10-15.json)。

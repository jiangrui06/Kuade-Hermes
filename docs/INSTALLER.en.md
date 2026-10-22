# Windows installation and running tasks

[简体中文](INSTALLER.zh-CN.md) · [繁體中文](INSTALLER.zh-TW.md)

The 0.1.8 installer was confirmed to terminate a same-name `Kuade.exe` outside its installation directory. It interrupted the first 24-hour test after about 73 minutes; that run remains unsuccessful. Do not use the old installer while tasks are running.

Version 0.1.9 uses electron-builder's supported `customCheckAppRunning` hook and its bundled nsProcess component. Installation or uninstallation exits with code 2 when any Kuade instance is running, or code 3 when process inspection fails. Save work, let tasks finish and exit background instances before retrying. Setup no longer asks processes to close or terminate. Independent directories and profiles also block setup, deliberately protecting long tasks.

Candidate self-updates still use the existing health check and handoff modules, independently of NSIS. The installer hook is protected by the self-iteration baseline, so changes in the model's candidate cannot replace the trusted packaging hook for that run.

Run `scripts/acceptance/installer.ps1` only in a test environment with no registered Kuade installation or running instance. Supply `-Installer`, `-Unpacked`, `-BuildDirectory` and `-Version`. It creates a fresh short installation path and an independent same-name witness process. It checks blocked installation, normal installation, installed startup, blocked uninstallation, complete uninstallation and original model configuration hashes. Receipts and failed artifacts remain under `D:\Kuade-acceptance`. Starting the script or receiving one exit code does not establish acceptance. Silent acceptance does not cover the interactive wizard or administrator installation.

References: [electron-builder NSIS](https://www.electron.build/nsis/), [nsProcess](https://nsis.sourceforge.io/NsProcess_plugin), [NSIS command line](https://nsis.sourceforge.io/Docs/Chapter3.html). See the [installer receipt](acceptance/installer-0.1.9-2026-10-15.json).

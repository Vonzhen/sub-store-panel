### 📦 一键部署与卸载 (Installation & Uninstallation)

**系统要求**：一个运行主流 Linux 发行版的 VPS，需具备 root 或 sudo 权限。

**一键安装脚本 (Install):**

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/miozen/sub-store-panel/master/install.sh)"

```

*工程说明：该脚本将自动拉取最新代码，配置 Node.js 运行环境，将服务标准部署至 `/opt/sub-store-panel` 目录下，并注册系统级守护进程。*

**一键卸载脚本 (Uninstall):**

```bash
bash /opt/sub-store-panel/uninstall.sh

```

*工程说明：执行此脚本将安全停止相关守护进程，清理部署目录及环境变量，确保不残留冗余文件，且不影响系统其他运行中的服务。*


#!/bin/bash
# 普通工程注释：Sub-Store 面板一键引导安装脚本 (Bootstrap)
# 适用环境：Ubuntu / Debian / Alpine
set -e

# 定义终端颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. 权限与环境预检
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[Error] 请使用 root 用户执行此脚本 (sudo -i)${NC}"
    exit 1
fi

echo -e "${GREEN}[System] 开始初始化安装环境...${NC}"

# 2. 安装基础依赖 (Git & Curl)
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y git curl sed
elif command -v apk >/dev/null 2>&1; then
    apk update
    apk add git curl sed bash
else
    echo -e "${RED}[Error] 仅支持 Ubuntu/Debian 或 Alpine Linux 系统${NC}"
    exit 1
fi

# 3. 交互式配置参数
# 默认配置
DEFAULT_REPO="Vonzhen/sub-store-panel"
DEFAULT_PORT="18080"
TARGET_DIR="/opt/sub-store-panel"

echo -e "${YELLOW}------------------------------------------------${NC}"
read -p "请输入 GitHub 仓库地址 (用户名/项目名) [默认: ${DEFAULT_REPO}]: " REPO_INPUT
REPO=${REPO_INPUT:-$DEFAULT_REPO}

read -p "请输入面板公网访问端口 [默认: ${DEFAULT_PORT}]: " PORT_INPUT
PORT=${PORT_INPUT:-$DEFAULT_PORT}
echo -e "${YELLOW}------------------------------------------------${NC}"

# 4. 工作区初始化与冲突处理
if [ -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}[Warning] 检测到安装目录已存在: ${TARGET_DIR}${NC}"
    read -p "是否强制清空并覆盖安装？(警告：这将删除现有数据库！) [y/N]: " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}[System] 正在清理旧文件...${NC}"
        rm -rf "$TARGET_DIR"
    else
        echo -e "${GREEN}[Info] 安装已取消${NC}"
        exit 0
    fi
fi

# 5. 拉取工程代码
echo -e "${GREEN}[System] 正在克隆仓库: https://github.com/${REPO}.git ...${NC}"
mkdir -p /opt
git clone "https://github.com/${REPO}.git" "$TARGET_DIR"

if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}[Error] 克隆失败，请检查仓库地址或网络连接${NC}"
    exit 1
fi

cd "$TARGET_DIR"

# 6. 动态配置端口映射
if [ "$PORT" != "18080" ]; then
    echo -e "${GREEN}[System] 修改监听端口为: ${PORT}${NC}"
    # 使用 sed 动态修改 docker-compose.yml 中的宿主机端口
    sed -i "s/\"18080:8080\"/\"${PORT}:8080\"/g" docker-compose.yml
fi

# 7. 移交控制权给部署脚本
echo -e "${GREEN}[System] 环境准备就绪，启动容器编排...${NC}"
chmod +x deploy.sh uninstall.sh
./deploy.sh

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}[Success] 安装完成！${NC}"
echo -e "访问地址: http://<您的IP>:${PORT}/dashboard"
echo -e "卸载命令: bash ${TARGET_DIR}/uninstall.sh"
echo -e "${GREEN}================================================${NC}"

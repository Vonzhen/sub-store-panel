#!/bin/bash
# 普通工程注释：系统卸载与清理脚本 (Teardown)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TARGET_DIR="/opt/sub-store-panel"

# 权限检查
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[Error] 请使用 root 用户执行${NC}"
    exit 1
fi

echo -e "${YELLOW}================================================${NC}"
echo -e "${RED}[Danger] 即将执行卸载操作！${NC}"
echo -e "此操作将执行以下动作："
echo -e "1. 停止并删除 Sub-Store 相关容器"
echo -e "2. 删除相关 Docker 镜像"
echo -e "3. 永久删除 ${TARGET_DIR} 目录 (含所有用户数据与配置)"
echo -e "${YELLOW}================================================${NC}"

read -p "确认要继续卸载吗？ [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "操作已取消"
    exit 0
fi

# 1. 停止容器
if [ -d "$TARGET_DIR" ]; then
    cd "$TARGET_DIR"
    if command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}[System] 停止并移除容器集群...${NC}"
        docker-compose down 2>/dev/null || true
    fi
fi

# 2. 清理镜像 (可选，防止误删其他同名镜像，这里指定名称)
echo -e "${GREEN}[System] 清理 Docker 镜像...${NC}"
docker rmi sub-store-panel_sub-store-gateway xream/sub-store:latest 2>/dev/null || true

# 3. 删除文件
echo -e "${GREEN}[System] 删除项目文件与数据...${NC}"
rm -rf "$TARGET_DIR"

echo -e "${GREEN}[Success] 卸载完成。系统已恢复纯净状态。${NC}"

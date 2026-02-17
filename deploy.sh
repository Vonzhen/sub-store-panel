#!/bin/sh
# 普通工程注释：Ubuntu / Alpine 双环境自适应部署脚本
set -e

echo "[System] 开始部署 Sub-Store 解耦控制面板..."

# 1. 探测操作系统类型并安装 Docker 环境
if ! command -v docker >/dev/null 2>&1; then
    echo "[System] 未检测到 Docker，开始自动安装..."
    if command -v apt >/dev/null 2>&1; then
        echo "[System] 检测到 Ubuntu/Debian 环境"
        apt update -y
        apt install -y curl git docker.io docker-compose
        systemctl enable docker
        systemctl start docker
    elif command -v apk >/dev/null 2>&1; then
        echo "[System] 检测到 Alpine Linux 环境"
        apk update
        apk add curl git docker docker-compose
        rc-update add docker boot
        service docker start
    else
        echo "[Error] 不支持的操作系统，请手动安装 Docker 和 docker-compose。"
        exit 1
    fi
else
    echo "[System] Docker 已安装，跳过环境配置。"
fi

# 2. 准备物理挂载卷目录
mkdir -p ./data/core
mkdir -p ./data/panel

# 3. 清理可能存在的历史故障容器与虚拟网络
echo "[System] 清理历史容器状态..."
docker-compose down 2>/dev/null || true

# 4. 全新构建与拉起集群
echo "[System] 编译中台网关并拉起微服务集群..."
docker-compose up -d --build

echo "======================================================"
echo "[Success] 部署与更新完成！"
echo "请在浏览器访问: http://<您的_VPS_IP>:18080/dashboard"
echo "默认账号: admin / admin (请务必登录后修改密码)"
echo "======================================================"

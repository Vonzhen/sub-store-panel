#!/bin/bash
# 普通工程注释：Ubuntu 环境自动化部署脚本

echo "[System] 开始部署 Sub-Store 解耦控制面板..."

# 检查 Docker 是否存在
if ! command -v docker &> /dev/null; then
    echo "[Error] 未检测到 Docker，请先安装 Docker 引擎。"
    exit 1
fi

# 确保核心数据挂载目录存在，避免容器初始化失败
mkdir -p ./data/core
mkdir -p ./data/panel

echo "[System] 构建网关容器并拉起微服务集群..."
# 执行基于 Compose 的全量构建与后台启动
docker-compose up -d --build

echo "======================================================"
echo "[Success] 部署完成！"
echo "请在浏览器访问: http://<您的_VPS_IP>:18080/dashboard"
echo "默认管理员账号: admin / admin (请务必登录后第一时间修改密码)"
echo "======================================================"

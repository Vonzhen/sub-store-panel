# 基础镜像：使用轻量级的 Alpine Linux 版本 Node.js
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 优先拷贝依赖清单以利用 Docker 构建缓存
COPY package*.json ./

# 安装生产环境依赖 (包含 SQLite 的 C++ 编译绑定)
RUN apk add --no-cache python3 make g++ && \
    npm install --production && \
    apk del python3 make g++

# 拷贝后端业务代码
COPY . .

# 暴露网关端口
EXPOSE 8080

# 启动服务
CMD ["node", "server.js"]

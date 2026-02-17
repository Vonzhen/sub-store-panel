// 普通工程注释：控制面鉴权网关与反向代理服务
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = 8080;

// 从环境变量读取系统配置
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'admin';
const CORE_PATH = process.env.CORE_INTERNAL_PATH || '/internal';

app.use(express.json());
app.use(cookieParser());

// 模块：身份鉴权接口 (Authentication API)
app.post('/api/dashboard/login', (req, res) => {
    const { password } = req.body;
    if (password === PANEL_PASSWORD) {
        // 签发有效期为 7 天的 JWT Token
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('admin_token', token, { httpOnly: true, path: '/' });
        return res.json({ success: true, message: '登录成功' });
    }
    return res.status(401).json({ success: false, message: '密码错误' });
});

// 模块：全局权限校验中间件 (Authorization Middleware)
const requireAuth = (req, res, next) => {
    const token = req.cookies.admin_token;
    if (!token) {
        // API 请求返回 401，页面请求重定向至登录页
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
        return res.redirect('/dashboard/login.html');
    }
    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Invalid Token' });
        return res.redirect('/dashboard/login.html');
    }
};

// 模块：核心引擎物理穿透代理 (Reverse Proxy)
// 保护除登录接口外的所有 /api 路由，并映射至官方底层引擎
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/dashboard/login')) return next();
    requireAuth(req, res, next);
}, createProxyMiddleware({
    target: `http://sub-store-core:28300${CORE_PATH}`,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '' // 将外部的 /api 抹除，还原为官方引擎所需的标准路径
    },
    onError: (err, req, res) => {
        console.error('[Proxy Error]', err.message);
        res.status(502).send('Sub-Store Core Engine Unreachable');
    }
}));

// 模块：静态资源调度 (Static Routing)
// 1. 系统控制台 (仪表盘)：开放目录访问，内部 API 受控
app.use('/dashboard', express.static(path.join(__dirname, '../frontend/dashboard')));

// 2. 官方主控 UI：根目录，强制要求鉴权拦截
app.use('/', requireAuth, express.static(path.join(__dirname, '../frontend/official-ui')));

// 启动服务
app.listen(PORT, () => {
    console.log(`[Gateway] Control Plane Gateway listening on port ${PORT}`);
    console.log(`[Gateway] Routing mapped to Core Engine at Sub-Store Container`);
});

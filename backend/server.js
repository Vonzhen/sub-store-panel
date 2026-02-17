// 功能描述：控制面网关核心逻辑 (鉴权、数据库操作、反向代理)
// 运行环境：Node.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const cron = require('node-cron');
const crypto = require('crypto');

const app = express();
const PORT = 8080;

// 系统核心环境变量 (由 docker-compose 注入)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DB_PATH = path.join(__dirname, '../data/panel.db');
const CORE_URL = 'http://sub-store-core:28300'; // 内部官方引擎地址

app.use(express.json());
app.use(cookieParser());

// ==========================================
// 模块 1：数据库持久化层 (SQLite Initialization)
// ==========================================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('[DB Error] 数据库连接失败:', err.message);
    else console.log('[DB] SQLite 数据库连接成功');
});

// 初始化表结构与默认管理员
db.serialize(() => {
    // 租户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        sub_store_path TEXT UNIQUE,
        role TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 全局设置表
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 检查并创建默认管理员账户 (admin / admin，要求首次登录后修改)
    db.get(`SELECT id FROM users WHERE username = 'admin'`, (err, row) => {
        if (!row) {
            const defaultHash = bcrypt.hashSync('admin', 10);
            const defaultPath = '/' + crypto.randomBytes(16).toString('hex');
            db.run(`INSERT INTO users (username, password_hash, sub_store_path, role) VALUES (?, ?, ?, ?)`,
                ['admin', defaultHash, defaultPath, 'admin']);
            console.log(`[DB] 已创建默认管理员账号: admin / admin`);
        }
    });
});

// ==========================================
// 模块 2：安全校验与鉴权层 (Auth & Security)
// ==========================================
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: '凭证无效' });
        
        if (bcrypt.compareSync(password, user.password_hash)) {
            // 签发 Token，包含用户的专属路径
            const token = jwt.sign({ 
                id: user.id, 
                username: user.username, 
                role: user.role,
                sub_store_path: user.sub_store_path 
            }, JWT_SECRET, { expiresIn: '7d' });
            
            res.cookie('auth_token', token, { httpOnly: true, path: '/' });
            return res.json({ success: true, sub_store_path: user.sub_store_path, role: user.role });
        }
        return res.status(401).json({ success: false, message: '凭证无效' });
    });
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
});

// 全局 JWT 拦截中间件
const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (!token) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
        return res.redirect('/dashboard/index.html');
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.clearCookie('auth_token');
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Token Expired' });
        return res.redirect('/dashboard/index.html');
    }
};

// ==========================================
// 模块 3：业务 API 层 (Admin & User Control Plane)
// ==========================================
// 获取用户列表 (仅管理员)
app.get('/api/users', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    db.all(`SELECT id, username, role, sub_store_path, created_at FROM users`, [], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

// 修改密码 (个人中心)
app.put('/api/users/me/password', requireAuth, (req, res) => {
    const { newPassword } = req.body;
    const hash = bcrypt.hashSync(newPassword, 10);
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: '密码已更新' });
    });
});

// 重置底层节点隔离路径 (安全生命周期管理)
app.post('/api/users/me/reset-path', requireAuth, (req, res) => {
    const newPath = '/' + crypto.randomBytes(16).toString('hex');
    db.run(`UPDATE users SET sub_store_path = ? WHERE id = ?`, [newPath, req.user.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, new_path: newPath });
    });
});

// ==========================================
// 模块 4：底层引擎穿透代理层 (Reverse Proxy)
// ==========================================
// 将带有用户专属路径的请求，安全地投递给 Docker 内部的 Sub-Store 官方容器
app.use('/core-api', requireAuth, (req, res, next) => {
    // 逻辑：前端请求 /core-api/xxx -> 网关校验权限 -> 代理至 http://sub-store-core:28300/[用户专属路径]/xxx
    const userPath = req.user.sub_store_path;
    
    createProxyMiddleware({
        target: CORE_URL,
        changeOrigin: true,
        pathRewrite: (path, req) => {
            // 剥离 /core-api 前缀，并在请求官方引擎时自动拼上该用户的最高权限 Path
            return path.replace('/core-api', userPath);
        },
        onError: (err, req, res) => {
            console.error('[Proxy] 底层引擎连接失败:', err.message);
            res.status(502).json({ error: 'Sub-Store 核心引擎未响应' });
        }
    })(req, res, next);
});

// ==========================================
// 模块 5：静态资源路由分配 (Static File Routing)
// ==========================================
// 挂载纯原生手写的 Dashboard 静态页面
app.use('/dashboard', express.static(path.join(__dirname, '../frontend/dashboard')));

// 根目录直接访问，若已登录则代理拉取官方的前端 UI (由官方容器自带)
app.use('/', requireAuth, createProxyMiddleware({
    target: CORE_URL,
    changeOrigin: true,
    pathRewrite: (path, req) => {
        // 请求官方前端资源时，自动注入当前用户的权限 Path
        return req.user.sub_store_path + path;
    }
}));

// 启动服务
app.listen(PORT, () => {
    console.log(`[Gateway] VPS 定制版解耦中台已启动，端口监听: ${PORT}`);
});

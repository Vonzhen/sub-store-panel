// 普通工程注释：控制面网关核心逻辑 (包含 Vue3 高级特性支持与白屏修复)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 8080;

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DB_PATH = path.join(__dirname, 'data/panel.db'); // 修正了相对路径

app.use(express.json());
app.use(cookieParser());

// ==========================================
// 模块 1：数据库建模 (新增 advanced_config 字段)
// ==========================================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('[DB Error] 数据库连接失败:', err.message);
    else console.log('[DB] SQLite 数据库连接成功');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        sub_store_path TEXT UNIQUE,
        role TEXT,
        advanced_config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.get(`SELECT id FROM users WHERE username = 'admin'`, (err, row) => {
        if (!row) {
            const defaultHash = bcrypt.hashSync('admin', 10);
            const defaultPath = '/' + crypto.randomBytes(16).toString('hex');
            // 预设默认的高级配置 JSON
            const defaultConfig = JSON.stringify({ cronEnabled: true, surgeVer: '5.0.0', surgeBuild: '2000', pushType: 'none' });
            db.run(`INSERT INTO users (username, password_hash, sub_store_path, role, advanced_config) VALUES (?, ?, ?, ?, ?)`,
                ['admin', defaultHash, defaultPath, 'admin', defaultConfig]);
        }
    });
});

// ==========================================
// 模块 2：安全鉴权中间件
// ==========================================
const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.clearCookie('auth_token');
        return res.status(401).json({ error: 'Token Expired' });
    }
};

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ success: false, message: '凭证无效' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sub_store_path: user.sub_store_path }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('auth_token', token, { httpOnly: true, path: '/' });
        
        // 确保 advanced_config 被正确解析返回
        let advancedConfig = {};
        try { advancedConfig = JSON.parse(user.advanced_config); } catch (e) {}
        
        res.json({ success: true, user: { username: user.username, role: user.role, sub_store_path: user.sub_store_path, advanced_config: advancedConfig } });
    });
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
});

// ==========================================
// 模块 3：高保真 UI 业务接口
// ==========================================
app.get('/api/users/me', requireAuth, (req, res) => {
    db.get(`SELECT username, role, sub_store_path, advanced_config FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        let advancedConfig = {};
        try { advancedConfig = JSON.parse(user.advanced_config); } catch (e) {}
        res.json({ success: true, user: { ...user, advanced_config: advancedConfig } });
    });
});

app.get('/api/users', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    db.all(`SELECT id, username, role, sub_store_path, created_at FROM users`, [], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

app.post('/api/users/me/reset-path', requireAuth, (req, res) => {
    const newPath = '/' + crypto.randomBytes(16).toString('hex');
    db.run(`UPDATE users SET sub_store_path = ? WHERE id = ?`, [newPath, req.user.id], (err) => {
        res.json({ success: !err, new_path: newPath });
    });
});

app.put('/api/users/me/advanced-config', requireAuth, (req, res) => {
    const configStr = JSON.stringify(req.body);
    db.run(`UPDATE users SET advanced_config = ? WHERE id = ?`, [configStr, req.user.id], (err) => {
        res.json({ success: !err });
    });
});

// ==========================================
// 模块 4：静态路由与精准穿透 (修复白屏核心逻辑)
// ==========================================
app.use('/dashboard', express.static(path.join(__dirname, 'frontend/dashboard')));

// 核心数据 API 穿透：自动注入用户的专属保密路径
app.use('/core-api', requireAuth, createProxyMiddleware({
    target: 'http://sub-store-core:3000',
    changeOrigin: true,
    pathRewrite: (path, req) => path.replace('/core-api', req.user.sub_store_path)
}));

// 官方前端页面静态穿透 (彻底剥离路径污染，保证 assets 原样访问)
app.use(['/', '/assets', '/_next'], (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/dashboard')) return next();
    
    // 如果直接访问根目录但未登录，重定向到控制台
    if (req.path === '/' && !req.cookies.auth_token) {
        return res.redirect('/dashboard/index.html');
    }
    
    createProxyMiddleware({
        target: 'http://sub-store-core:3001', // 指向容器内部的静态前端端口
        changeOrigin: true
    })(req, res, next);
});

app.listen(PORT, () => console.log(`[Gateway] VPS 定制版解耦中台已启动 (支持 Vue3 高级 UI)`));

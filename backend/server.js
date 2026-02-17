// 普通工程注释：控制面网关核心逻辑 (全量 API 补齐与流阻塞修复)
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
const DB_PATH = path.join(__dirname, 'data/panel.db');

app.use(cookieParser());

// 模块 1：数据库建模 (全量)
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('[DB] 数据库连接失败:', err.message);
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

    // 初始化系统配置表 (对应截图2)
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY, value TEXT
    )`);

    db.get(`SELECT id FROM users WHERE username = 'admin'`, (err, row) => {
        if (!row) {
            const defaultHash = bcrypt.hashSync('admin', 10);
            const defaultPath = '/' + crypto.randomBytes(16).toString('hex');
            const defaultConfig = JSON.stringify({ cronEnabled: true, surgeVer: '5.0.0', surgeBuild: '2000' });
            db.run(`INSERT INTO users (username, password_hash, sub_store_path, role, advanced_config) VALUES (?, ?, ?, ?, ?)`,
                ['admin', defaultHash, defaultPath, 'admin', defaultConfig]);
            
            // 写入默认系统设置
            db.run(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('jwt_expiry', '168'), ('min_pwd_length', '6')`);
        }
    });
});

// 模块 2：安全鉴权中间件
const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); } 
    catch (err) { res.clearCookie('auth_token'); return res.status(401).json({ error: 'Token Expired' }); }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
};

// ==========================================
// 模块 3：面板专属 API 路由 (隔离 JSON 解析)
// ==========================================
const panelApi = express.Router();
panelApi.use(express.json()); // 【关键修复】仅在这里解析 JSON，绝不污染核心引擎代理

// 鉴权接口
panelApi.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ success: false, message: '凭证无效' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sub_store_path: user.sub_store_path }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('auth_token', token, { httpOnly: true, path: '/' });
        let advancedConfig = {}; try { advancedConfig = JSON.parse(user.advanced_config); } catch (e) {}
        res.json({ success: true, user: { username: user.username, role: user.role, sub_store_path: user.sub_store_path, advanced_config: advancedConfig } });
    });
});
panelApi.post('/auth/logout', (req, res) => { res.clearCookie('auth_token'); res.json({ success: true }); });

// 个人中心 API
panelApi.get('/users/me', requireAuth, (req, res) => {
    db.get(`SELECT username, role, sub_store_path, advanced_config FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (!user) return res.status(404).json({ error: 'Not found' });
        let advancedConfig = {}; try { advancedConfig = JSON.parse(user.advanced_config); } catch (e) {}
        res.json({ success: true, user: { ...user, advanced_config: advancedConfig } });
    });
});
panelApi.post('/users/me/reset-path', requireAuth, (req, res) => {
    const newPath = '/' + crypto.randomBytes(16).toString('hex');
    db.run(`UPDATE users SET sub_store_path = ? WHERE id = ?`, [newPath, req.user.id], (err) => res.json({ success: !err, new_path: newPath }));
});
panelApi.put('/users/me/password', requireAuth, (req, res) => {
    const { newPassword } = req.body;
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [bcrypt.hashSync(newPassword, 10), req.user.id], (err) => res.json({ success: !err }));
});
panelApi.put('/users/me/username', requireAuth, (req, res) => {
    const { newUsername } = req.body;
    db.run(`UPDATE users SET username = ? WHERE id = ?`, [newUsername, req.user.id], (err) => res.json({ success: !err, message: err ? '用户名可能已存在' : 'OK' }));
});

// 管理员多用户与系统 API
panelApi.get('/users', requireAuth, requireAdmin, (req, res) => {
    db.all(`SELECT id, username, role, sub_store_path, created_at FROM users`, [], (err, rows) => res.json({ success: true, data: rows }));
});
panelApi.post('/users', requireAuth, requireAdmin, (req, res) => {
    const { username, password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    const path = '/' + crypto.randomBytes(16).toString('hex');
    db.run(`INSERT INTO users (username, password_hash, sub_store_path, role) VALUES (?, ?, ?, 'user')`, [username, hash, path], function(err) {
        res.json({ success: !err, message: err ? '创建失败(可能重名)' : '创建成功' });
    });
});
panelApi.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
    if (parseInt(req.params.id) === req.user.id) return res.json({ success: false, message: '不能删除自己' });
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], (err) => res.json({ success: !err }));
});

// 挂载面板专属 API
app.use('/api', panelApi);

// ==========================================
// 模块 4：底层引擎代理 (维持原始 Stream)
// ==========================================
app.use('/dashboard', express.static(path.join(__dirname, 'frontend/dashboard')));

app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/dashboard') || req.path === '/' || req.path === '/_next' || req.path.startsWith('/assets')) return next();

    const match = req.path.match(/^(\/[a-f0-9]+)(\/.*)?$/);
    if (match) {
        const potentialPath = match[1];
        db.get(`SELECT id FROM users WHERE sub_store_path = ?`, [potentialPath], (err, user) => {
            if (user) {
                return createProxyMiddleware({
                    target: 'http://sub-store-core:3000', changeOrigin: true, ws: true,
                    pathRewrite: (p) => p.replace(potentialPath, '')
                })(req, res, next);
            } else next();
        });
    } else next();
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/dashboard')) return next();
    if (req.path === '/' && !req.cookies.auth_token) return res.redirect('/dashboard/index.html');
    createProxyMiddleware({ target: 'http://sub-store-core:3001', changeOrigin: true })(req, res, next);
});

app.listen(PORT, () => console.log(`[Gateway] VPS 定制版解耦中台已启动 (全量 API 搭载)`));

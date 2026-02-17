// 普通工程注释：控制面网关核心逻辑 (含防爆破中间件与 Cron 守护进程)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');

const app = express();
const PORT = 8080;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DB_PATH = path.join(__dirname, 'data/panel.db');

app.use(cookieParser());

// ==========================================
// 模块 1：数据库建模 (维持不变)
// ==========================================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('[DB] 数据库连接失败:', err.message);
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT,
        sub_store_path TEXT UNIQUE, role TEXT, advanced_config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.get(`SELECT id FROM users WHERE username = 'admin'`, (err, row) => {
        if (!row) {
            const defaultHash = bcrypt.hashSync('admin', 10);
            const defaultPath = '/' + crypto.randomBytes(16).toString('hex');
            const defaultConfig = JSON.stringify({ cronEnabled: true, surgeVer: '5.0.0', surgeBuild: '2000' });
            db.run(`INSERT INTO users (username, password_hash, sub_store_path, role, advanced_config) VALUES (?, ?, ?, ?, ?)`,
                ['admin', defaultHash, defaultPath, 'admin', defaultConfig]);
        }
    });
});

// ==========================================
// 模块 2：IP 防爆破与安全鉴权层 (核心升级)
// ==========================================
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 锁定 15 分钟

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const record = loginAttempts.get(ip) || { attempts: 0, lockedUntil: 0 };
    if (Date.now() < record.lockedUntil) {
        return res.status(429).json({ success: false, message: `请求超限，IP 已被锁定 15 分钟` });
    }
    req.clientIp = ip; req.loginRecord = record;
    next();
};

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
// 模块 3：面板专属 API 路由
// ==========================================
const panelApi = express.Router();
panelApi.use(express.json()); 

panelApi.post('/auth/login', rateLimiter, (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password_hash)) {
            // 记录失败次数
            req.loginRecord.attempts += 1;
            if (req.loginRecord.attempts >= MAX_ATTEMPTS) req.loginRecord.lockedUntil = Date.now() + LOCKOUT_MS;
            loginAttempts.set(req.clientIp, req.loginRecord);
            return res.status(401).json({ success: false, message: `凭证无效 (剩余尝试次数: ${MAX_ATTEMPTS - req.loginRecord.attempts})` });
        }
        // 登录成功，清除失败记录
        loginAttempts.delete(req.clientIp);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sub_store_path: user.sub_store_path }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('auth_token', token, { httpOnly: true, path: '/' });
        let advancedConfig = {}; try { advancedConfig = JSON.parse(user.advanced_config); } catch (e) {}
        res.json({ success: true, user: { username: user.username, role: user.role, sub_store_path: user.sub_store_path, advanced_config: advancedConfig } });
    });
});

panelApi.post('/auth/logout', (req, res) => { res.clearCookie('auth_token'); res.json({ success: true }); });

panelApi.get('/users/me', requireAuth, (req, res) => {
    db.get(`SELECT username, role, sub_store_path, advanced_config FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (!user) return res.status(404).json({ error: 'Not found' });
        let advancedConfig = {}; try { advancedConfig = JSON.parse(user.advanced_config); } catch (e) {}
        res.json({ success: true, user: { ...user, advanced_config: advancedConfig } });
    });
});

panelApi.put('/users/me/advanced-config', requireAuth, (req, res) => {
    const configStr = JSON.stringify(req.body);
    db.run(`UPDATE users SET advanced_config = ? WHERE id = ?`, [configStr, req.user.id], (err) => res.json({ success: !err }));
});

// 其他用户操作 (省略重复部分，保持与上版一致)
panelApi.post('/users/me/reset-path', requireAuth, (req, res) => {
    const newPath = '/' + crypto.randomBytes(16).toString('hex');
    db.run(`UPDATE users SET sub_store_path = ? WHERE id = ?`, [newPath, req.user.id], (err) => res.json({ success: !err, new_path: newPath }));
});
panelApi.put('/users/me/password', requireAuth, (req, res) => {
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [bcrypt.hashSync(req.body.newPassword, 10), req.user.id], (err) => res.json({ success: !err }));
});
panelApi.put('/users/me/username', requireAuth, (req, res) => {
    db.run(`UPDATE users SET username = ? WHERE id = ?`, [req.body.newUsername, req.user.id], (err) => res.json({ success: !err, message: err ? '重名' : 'OK' }));
});

panelApi.get('/users', requireAuth, requireAdmin, (req, res) => {
    db.all(`SELECT id, username, role, sub_store_path, created_at FROM users`, [], (err, rows) => res.json({ success: true, data: rows }));
});
panelApi.post('/users', requireAuth, requireAdmin, (req, res) => {
    const hash = bcrypt.hashSync(req.body.password, 10);
    const path = '/' + crypto.randomBytes(16).toString('hex');
    db.run(`INSERT INTO users (username, password_hash, sub_store_path, role) VALUES (?, ?, ?, 'user')`, [req.body.username, hash, path], (err) => res.json({ success: !err }));
});
panelApi.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
    if (parseInt(req.params.id) === req.user.id) return res.json({ success: false });
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], (err) => res.json({ success: !err }));
});

app.use('/api', panelApi);

// ==========================================
// 模块 4：定时同步守护进程 (Cron Engine)
// ==========================================
// 每小时执行一次，自动调用底层引擎刷新节点
cron.schedule('0 * * * *', () => {
    console.log('[Cron] 执行定时节点同步与保鲜...');
    db.all(`SELECT sub_store_path, advanced_config FROM users`, [], (err, users) => {
        users.forEach(async (u) => {
            try {
                const config = JSON.parse(u.advanced_config);
                if (config.cronEnabled) {
                    // 通过内网代理调用底层 API 触发更新
                    await fetch(`http://localhost:${PORT}/core-api/api/sync`, {
                        headers: { 'Cookie': `auth_token=${jwt.sign({ sub_store_path: u.sub_store_path }, JWT_SECRET)}` }
                    });
                }
            } catch (e) { /* 忽略个别解析错误 */ }
        });
    });
});

// ==========================================
// 模块 5：底层引擎代理层 (严格正则)
// ==========================================
app.use('/dashboard', express.static(path.join(__dirname, 'frontend/dashboard')));

app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/dashboard') || req.path === '/' || req.path === '/_next' || req.path.startsWith('/assets')) return next();

    // 【安全升级】仅匹配严格的 32 位 Hex 保密路径
    const match = req.path.match(/^(\/[a-f0-9]{32})(\/.*)?$/);
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

app.listen(PORT, () => console.log(`[Gateway] VPS 中台已启动 (防爆破中间件加载完毕)`));

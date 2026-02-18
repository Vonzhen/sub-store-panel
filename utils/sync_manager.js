// 文件路径: utils/sync_manager.js
const fs = require('fs');
const path = require('path');

// 数据存储在 data 目录下，与 sub-store 的数据在一起，方便备份
const CONFIG_FILE = path.join(__dirname, '../data/sync_config.json');

// 默认配置：12小时同步一次
const DEFAULT_CONFIG = {
    intervalHours: 12,
    lastRunTime: 0
};

// 初始化配置
function init() {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
}

// 读取当前配置
function readConfig() {
    init();
    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('[SyncManager] 配置文件读取失败，重置为默认值');
        return DEFAULT_CONFIG;
    }
}

// 写入配置
function saveConfig(data) {
    try {
        const current = readConfig();
        const next = { ...current, ...data };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
        return true;
    } catch (e) {
        console.error('[SyncManager] 配置文件写入失败', e);
        return false;
    }
}

module.exports = {
    // API: 获取给前端展示的配置
    getSettings: () => {
        const conf = readConfig();
        return { intervalHours: conf.intervalHours };
    },

    // API: 更新同步间隔
    updateSettings: (hours) => {
        const h = parseInt(hours);
        if (isNaN(h) || h < 1) return false;
        return saveConfig({ intervalHours: h });
    },

    // Logic: 判断是否允许运行
    shouldRun: () => {
        const conf = readConfig();
        const now = Date.now();
        const diff = now - conf.lastRunTime;
        const intervalMs = conf.intervalHours * 60 * 60 * 1000;
        
        // 如果从未运行过，或者距离上次运行超过了设定间隔
        if (conf.lastRunTime === 0 || diff >= intervalMs) {
            return true;
        }
        return false;
    },

    // Logic: 标记运行完成
    markRunComplete: () => {
        saveConfig({ lastRunTime: Date.now() });
        console.log(`[SyncManager] 同步时间已更新，下次同步将在 ${readConfig().intervalHours} 小时后`);
    }
};

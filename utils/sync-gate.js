/**
 * @file utils/sync-gate.js
 * @description 同步任务门控逻辑管理器
 * 用于实现可配置的时间间隔控制，避免硬编码造成的灵活性缺失
 */

const fs = require('fs');
const path = require('path');

// 配置文件持久化路径
const CONFIG_PATH = path.join(__dirname, '../data/sync_config.json');

// 默认配置
const DEFAULT_CONFIG = {
    intervalHours: 1,       // 默认每1小时允许一次
    lastRunTime: 0          // 上次运行时间戳
};

// 确保配置文件存在
function ensureConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        // 确保目录存在
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
}

// 读取配置
function readConfig() {
    ensureConfig();
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (err) {
        console.error('[SyncGate] 读取配置失败，使用默认值:', err.message);
        return DEFAULT_CONFIG;
    }
}

// 写入配置
function writeConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.error('[SyncGate] 写入配置失败:', err.message);
        return false;
    }
}

module.exports = {
    /**
     * 获取当前的同步设置
     */
    getSettings: () => {
        const config = readConfig();
        return { intervalHours: config.intervalHours };
    },

    /**
     * 更新同步设置
     * @param {number} hours - 设定的间隔小时数
     */
    updateSettings: (hours) => {
        const config = readConfig();
        config.intervalHours = parseInt(hours) || 1; // 兜底为1小时
        return writeConfig(config);
    },

    /**
     * 检查是否应该执行同步
     * @returns {boolean} - true 表示应该执行，false 表示跳过
     */
    shouldRun: () => {
        const config = readConfig();
        const now = Date.now();
        const diffHours = (now - config.lastRunTime) / (1000 * 60 * 60);

        if (diffHours >= config.intervalHours) {
            return true;
        }
        
        // 普通工程注释：当前时间未达到设定间隔，返回 false
        return false;
    },

    /**
     * 标记同步已完成
     * 应在实际同步逻辑执行成功后调用
     */
    markRunComplete: () => {
        const config = readConfig();
        config.lastRunTime = Date.now();
        writeConfig(config);
        console.log(`[SyncGate] 同步时间已更新: ${new Date().toLocaleString()}`);
    }
};

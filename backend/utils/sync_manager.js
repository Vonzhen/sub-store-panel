/**
 * Sync Manager Module
 * 负责管理定时同步的频率控制与状态持久化
 * * Design: 使用本地 JSON 文件存储配置，避免硬编码，适配 VPS 环境
 */

const fs = require('fs');
const path = require('path');

// 数据持久化路径，建议放在 data 目录或项目根目录
const CONFIG_PATH = path.join(__dirname, '../data/sync_status.json');

// 默认配置
const DEFAULT_CONFIG = {
  interval_hours: 24,       // 默认每 24 小时同步一次
  last_sync_time: 0         // 上次同步的时间戳
};

/**
 * 初始化配置（如果文件不存在则创建）
 */
function initConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    // 确保目录存在
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

/**
 * 读取当前配置
 * @returns {Object} { interval_hours, last_sync_time }
 */
function getConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) initConfig();
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[SyncManager] 读取配置失败，回退到默认值:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 更新配置
 * @param {Object} newConfig - 部分或全部配置项
 */
function updateConfig(newConfig) {
  const current = getConfig();
  const updated = { ...current, ...newConfig };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * 核心判定逻辑：是否应该执行同步？
 * 建议在 Cron Job 的入口处调用此函数
 * * @returns {boolean} true 表示满足时间间隔，可以执行同步
 */
function shouldExecuteSync() {
  const config = getConfig();
  const now = Date.now();
  const lastRun = config.last_sync_time || 0;
  const intervalMs = config.interval_hours * 60 * 60 * 1000;

  // 时间差检查
  if (now - lastRun >= intervalMs) {
    return true;
  }
  
  // Debug 日志（可选），用于排查为什么不执行
  // console.log(`[SyncManager] 未到时间。剩余等待: ${((intervalMs - (now - lastRun)) / 1000 / 60).toFixed(1)} 分钟`);
  return false;
}

/**
 * 标记同步完成
 * 在实际同步逻辑执行成功后调用
 */
function markSyncComplete() {
  updateConfig({ last_sync_time: Date.now() });
  console.log('[SyncManager] 同步时间已更新');
}

module.exports = {
  getConfig,
  updateConfig,
  shouldExecuteSync,
  markSyncComplete
};

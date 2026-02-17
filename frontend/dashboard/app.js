// 普通工程注释：高保真面板的响应式交互引擎
const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const isLoggedIn = ref(false);
        const activeTab = ref('my');
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');
        const currentUser = ref({});
        const advancedConfig = ref({});
        const users = ref([]);

        // 动态计算用户专属 API 地址 (用于拼接给外部客户端)
        const apiUrl = computed(() => {
            if (!currentUser.value.sub_store_path) return '加载中...';
            // 获取当前浏览器地址栏的 协议+IP+端口
            const base = window.location.origin; 
            return `${base}${currentUser.value.sub_store_path}`;
        });

        // 核心：初始化与状态保持
        const checkAuth = async () => {
            try {
                const res = await fetch('/api/users/me');
                const data = await res.json();
                if (data.success) {
                    currentUser.value = data.user;
                    advancedConfig.value = data.user.advanced_config || {};
                    isLoggedIn.value = true;
                    if (data.user.role === 'admin') loadUsers();
                }
            } catch (e) { console.warn('未登录状态'); }
        };

        const handleLogin = async () => {
            loginError.value = '登录中...';
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(loginForm.value)
                });
                const data = await res.json();
                if (data.success) {
                    currentUser.value = data.user;
                    advancedConfig.value = data.user.advanced_config || {};
                    isLoggedIn.value = true;
                    loginError.value = '';
                    if (data.user.role === 'admin') loadUsers();
                } else {
                    loginError.value = data.message;
                }
            } catch (err) { loginError.value = '网络请求失败'; }
        };

        const handleLogout = async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.reload();
        };

        const loadUsers = async () => {
            const res = await fetch('/api/users');
            const data = await res.json();
            if (data.success) users.value = data.data;
        };

        // 核心：自动拼接 ?api= 代理参数，完美挂载官方核心前端
        const openCoreFrontend = () => {
            const frontendUrl = `/?api=${encodeURIComponent(apiUrl.value)}`;
            window.open(frontendUrl, '_blank');
        };

        const handleResetPath = async () => {
            if (!confirm('警告：此操作将导致旧链接全部失效，确定执行？')) return;
            const res = await fetch('/api/users/me/reset-path', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                currentUser.value.sub_store_path = data.new_path;
                alert('路径已重置！');
                if (currentUser.value.role === 'admin') loadUsers(); // 刷新表格
            }
        };

        const saveSettings = async () => {
            await fetch('/api/users/me/advanced-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(advancedConfig.value)
            });
        };

        const copyApi = () => {
            navigator.clipboard.writeText(apiUrl.value).then(() => alert('API 地址已复制到剪贴板'));
        };

        onMounted(() => { checkAuth(); });

        return {
            isLoggedIn, activeTab, loginForm, loginError, currentUser, advancedConfig, users, apiUrl,
            handleLogin, handleLogout, openCoreFrontend, handleResetPath, saveSettings, copyApi
        };
    }
}).mount('#app');

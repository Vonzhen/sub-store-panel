// 普通工程注释：全量面板响应式交互引擎
const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const isLoggedIn = ref(false);
        const activeTab = ref('my');
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');
        const currentUser = ref({});
        const users = ref([]);
        
        // 模态框与状态
        const menuOpen = ref(false);
        const showModPwd = ref(false);
        const showModUser = ref(false);
        const modForm = ref({ pwd: '', user: '' });
        const newUser = ref({ username: '', password: '' });

        const apiUrl = computed(() => {
            if (!currentUser.value.sub_store_path) return '加载中...';
            return `${window.location.origin}${currentUser.value.sub_store_path}`;
        });

        const checkAuth = async () => {
            try {
                const res = await fetch('/api/users/me');
                const data = await res.json();
                if (data.success) {
                    currentUser.value = data.user;
                    isLoggedIn.value = true;
                    if (data.user.role === 'admin') loadUsers();
                }
            } catch (e) { }
        };

        const handleLogin = async () => {
            loginError.value = '登录中...';
            const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm.value) });
            const data = await res.json();
            if (data.success) {
                currentUser.value = data.user;
                isLoggedIn.value = true;
                loginError.value = '';
                if (data.user.role === 'admin') loadUsers();
            } else { loginError.value = data.message; }
        };

        const handleLogout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.reload(); };

        const loadUsers = async () => {
            const res = await fetch('/api/users');
            const data = await res.json();
            if (data.success) users.value = data.data;
        };

        const createUser = async () => {
            if (!newUser.value.username || !newUser.value.password) return alert('请填写完整');
            const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser.value) });
            const data = await res.json();
            alert(data.message);
            if (data.success) { newUser.value = {username:'', password:''}; loadUsers(); }
        };

        const deleteUser = async (id) => {
            if (!confirm('确认删除该用户及其配置吗？')) return;
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
            if ((await res.json()).success) loadUsers();
        };

        const changePwd = async () => {
            if (modForm.value.pwd.length < 6) return alert('密码太短');
            const res = await fetch('/api/users/me/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: modForm.value.pwd }) });
            if ((await res.json()).success) { alert('密码修改成功，请重新登录'); handleLogout(); }
        };

        const changeUsername = async () => {
            if (!modForm.value.user) return;
            const res = await fetch('/api/users/me/username', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newUsername: modForm.value.user }) });
            const data = await res.json();
            if (data.success) { alert('用户名修改成功'); currentUser.value.username = modForm.value.user; showModUser.value = false; }
            else { alert(data.message); }
        };

        const handleResetPath = async () => {
            if (!confirm('警告：此操作不可撤销！确定执行？')) return;
            const res = await fetch('/api/users/me/reset-path', { method: 'POST' });
            const data = await res.json();
            if (data.success) { currentUser.value.sub_store_path = data.new_path; alert('路径已重置！'); if (currentUser.value.role === 'admin') loadUsers(); }
        };

        const openCoreFrontend = () => window.open(`/?api=${encodeURIComponent(apiUrl.value)}`, '_blank');
        const copyApi = () => navigator.clipboard.writeText(apiUrl.value).then(() => alert('已复制'));

        onMounted(() => { checkAuth(); });

        return {
            isLoggedIn, activeTab, loginForm, loginError, currentUser, users, apiUrl,
            menuOpen, showModPwd, showModUser, modForm, newUser,
            handleLogin, handleLogout, openCoreFrontend, handleResetPath, copyApi,
            createUser, deleteUser, changePwd, changeUsername
        };
    }
}).mount('#app');

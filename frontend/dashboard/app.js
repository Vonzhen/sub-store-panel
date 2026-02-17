// 普通工程注释：控制面板前端交互逻辑
const DOM = {
    loginView: document.getElementById('login-view'),
    dashboardView: document.getElementById('dashboard-view'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    errorText: document.getElementById('login-error'),
    adminPanel: document.getElementById('admin-panel'),
    usersTbody: document.getElementById('users-tbody'),
    userPathSpan: document.getElementById('user-path'),
    currentUsernameSpan: document.getElementById('current-username'),
    openCoreBtn: document.getElementById('open-core-btn'),
    resetPathBtn: document.getElementById('reset-path-btn'),
    changePwdBtn: document.getElementById('change-pwd-btn')
};

let currentUser = null;

// 模块 1：系统初始化与状态核验
async function init() {
    try {
        // 请求一个不存在的 API 触发鉴权，验证当前 Cookie 是否有效
        const res = await fetch('/api/users'); 
        if (res.status === 401) {
            showLogin();
        } else {
            // 在实际工程中，这里应请求 /api/auth/me 获取自身信息，为简化示例，要求重新登录以获取初始状态
            showLogin();
        }
    } catch (e) {
        showLogin();
    }
}

function showLogin() {
    DOM.loginView.classList.remove('hidden');
    DOM.dashboardView.classList.add('hidden');
}

function showDashboard(userData) {
    currentUser = userData;
    DOM.loginView.classList.add('hidden');
    DOM.dashboardView.classList.remove('hidden');
    
    DOM.currentUsernameSpan.textContent = `你好，管理员`;
    DOM.userPathSpan.textContent = userData.sub_store_path;

    if (userData.role === 'admin') {
        DOM.adminPanel.classList.remove('hidden');
        loadUsers();
    }
}

// 模块 2：鉴权操作 (Login & Logout)
DOM.loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    DOM.errorText.textContent = '登录中...';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.success) {
            DOM.errorText.textContent = '';
            showDashboard(data);
        } else {
            DOM.errorText.textContent = data.message || '登录失败';
        }
    } catch (err) {
        DOM.errorText.textContent = '网络请求失败';
    }
});

DOM.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.reload();
});

// 模块 3：核心业务交互
DOM.openCoreBtn.addEventListener('click', () => {
    // 中台反向代理会自动处理根目录的鉴权与路径映射，直接跳转根目录即可访问原版 UI
    window.open('/', '_blank');
});

DOM.resetPathBtn.addEventListener('click', async () => {
    if (!confirm('警告：重置路径将导致所有旧客户端订阅链接立即失效。是否继续？')) return;
    const res = await fetch('/api/users/me/reset-path', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        DOM.userPathSpan.textContent = data.new_path;
        alert('路径重置成功，请前往原版前端更新订阅链接。');
    }
});

DOM.changePwdBtn.addEventListener('click', async () => {
    const newPassword = document.getElementById('new-password').value;
    if (newPassword.length < 6) return alert('密码长度不能小于 6 位');
    
    const res = await fetch('/api/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
    });
    if (res.ok) {
        alert('密码修改成功');
        document.getElementById('new-password').value = '';
    }
});

// 模块 4：数据面渲染 (Admin Only)
async function loadUsers() {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (data.success) {
        DOM.usersTbody.innerHTML = data.data.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td><code>${u.sub_store_path}</code></td>
                <td>${new Date(u.created_at).toLocaleString()}</td>
            </tr>
        `).join('');
    }
}

// 启动入口
init();

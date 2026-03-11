// ── Firebase Config ──
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDpOMSGLIZXm1o0GE13NAe6fctMWC-khRk",
    authDomain: "my-notes-63ce0.firebaseapp.com",
    databaseURL: "https://my-notes-63ce0-default-rtdb.firebaseio.com",
    projectId: "my-notes-63ce0",
    storageBucket: "my-notes-63ce0.firebasestorage.app",
    messagingSenderId: "890920806003",
    appId: "1:890920806003:web:d9bcb77be35a3a9f09ec06"
};

// ── Storage Keys ──
const TASKS_KEY = 'taskapp_tasks';
const CATEGORIES_KEY = 'taskapp_categories';
const SETTINGS_KEY = 'taskapp_settings';

// ── State ──
let tasks = [];
let categories = [];
let settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
let firebaseUser = null;
let cloudSyncTimer = null;
let firebaseConfigured = false;

// ── Default Categories ──
const DEFAULT_CATEGORIES = [
    { id: generateId(), name: 'Work', color: '#4a90d9' },
    { id: generateId(), name: 'Personal', color: '#5cb85c' },
    { id: generateId(), name: 'Urgent', color: '#d9534f' }
];

// ── Utilities ──
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const PRIORITY_LEVELS = [
    { value: 'low', label: 'Low', color: '#5cb85c' },
    { value: 'medium', label: 'Medium', color: '#f0ad4e' },
    { value: 'high', label: 'High', color: '#d9534f' }
];

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Persistence ──
function saveToLocal() {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadFromLocal() {
    try {
        const t = localStorage.getItem(TASKS_KEY);
        const c = localStorage.getItem(CATEGORIES_KEY);
        const s = localStorage.getItem(SETTINGS_KEY);
        tasks = t ? JSON.parse(t) : [];
        categories = c ? JSON.parse(c) : [...DEFAULT_CATEGORIES];
        settings = s ? JSON.parse(s) : { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
        if (settings.view === 'calendar') settings.view = 'week';
    } catch (e) {
        console.warn('Failed to load from localStorage:', e);
        tasks = [];
        categories = [...DEFAULT_CATEGORIES];
        settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
    }
}

function scheduleSave() {
    saveToLocal();
    syncToCloud();
}

// ── Firebase Auth ──
function initFirebase() {
    firebaseConfigured = FIREBASE_CONFIG.apiKey !== 'AIzaSyDummyKeyReplaceMeWithYourKey'
        && FIREBASE_CONFIG.projectId !== 'YOUR_PROJECT';
    if (!firebaseConfigured) {
        onAuthReady(null);
        return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            firebaseUser = user;
            syncFromCloud().then(() => {
                document.getElementById('signInScreen').classList.remove('show');
                onAuthReady(user);
            });
        } else {
            firebaseUser = null;
            showSignInScreen();
        }
    });
}

function showSignInScreen() {
    const screen = document.getElementById('signInScreen');
    const box = document.getElementById('signInBox');
    screen.classList.add('show');
    box.innerHTML = `
        <h2>Task List</h2>
        <p>Sign in to sync tasks across devices</p>
        <input type="email" id="authEmail" placeholder="Email" autofocus>
        <input type="password" id="authPassword" placeholder="Password">
        <div class="auth-error" id="authError"></div>
        <button onclick="firebaseSignIn()">Sign In</button>
        <button onclick="firebaseSignUp()" style="background:#5cb85c;border-color:#5cb85c;">Create Account</button>
        <button class="auth-secondary" onclick="skipSignIn()">Use offline (this device only)</button>
        <button class="auth-secondary" onclick="firebaseForgotPassword()">Forgot password?</button>
    `;
    setTimeout(() => { const el = document.getElementById('authEmail'); if (el) el.focus(); }, 50);
    box.onkeydown = function(e) {
        if (e.key === 'Enter') firebaseSignIn();
    };
}

async function firebaseSignIn() {
    const email = document.getElementById('authEmail').value;
    const pw = document.getElementById('authPassword').value;
    const err = document.getElementById('authError');
    if (!email || !pw) { err.textContent = 'Enter email and password'; return; }
    err.textContent = 'Signing in...';
    try {
        await firebase.auth().signInWithEmailAndPassword(email, pw);
    } catch (e) {
        err.textContent = e.message.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)\.?/, '').trim() || 'Sign-in failed';
    }
}

async function firebaseSignUp() {
    const email = document.getElementById('authEmail').value;
    const pw = document.getElementById('authPassword').value;
    const err = document.getElementById('authError');
    if (!email) { err.textContent = 'Enter an email address'; return; }
    if (!pw || pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }
    err.textContent = 'Creating account...';
    try {
        await firebase.auth().createUserWithEmailAndPassword(email, pw);
    } catch (e) {
        err.textContent = e.message.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)\.?/, '').trim() || 'Sign-up failed';
    }
}

async function firebaseForgotPassword() {
    const email = document.getElementById('authEmail').value;
    const err = document.getElementById('authError');
    if (!email) { err.textContent = 'Enter your email address first'; return; }
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        err.style.color = '#5cb85c';
        err.textContent = 'Password reset email sent — check your inbox';
        setTimeout(() => { err.style.color = ''; }, 5000);
    } catch (e) {
        err.textContent = e.message.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)\.?/, '').trim() || 'Could not send reset email';
    }
}

function skipSignIn() {
    document.getElementById('signInScreen').classList.remove('show');
    onAuthReady(null);
}

function firebaseSignOut() {
    if (!confirm('Sign out? Local data will be cleared.')) return;
    if (firebaseConfigured && firebase.apps.length) {
        firebase.auth().signOut();
    }
    firebaseUser = null;
    localStorage.removeItem(TASKS_KEY);
    localStorage.removeItem(CATEGORIES_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    location.reload();
}

// ── Cloud Sync ──
async function syncFromCloud() {
    if (!firebaseUser) return;
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Syncing...';
    try {
        const snap = await firebase.database().ref('users/' + firebaseUser.uid).once('value');
        const data = snap.val();
        if (!data) {
            await doCloudUpload();
            statusEl.textContent = 'Synced';
            return;
        }
        // Download taskapp-specific keys
        const keys = [TASKS_KEY, CATEGORIES_KEY, SETTINGS_KEY];
        keys.forEach(key => {
            if (data[key] !== undefined && data[key] !== null) {
                localStorage.setItem(key, data[key]);
            }
        });
        loadFromLocal();
        statusEl.textContent = 'Synced';
    } catch (e) {
        console.warn('Cloud sync download failed:', e);
        statusEl.textContent = 'Sync error';
    }
}

function syncToCloud() {
    if (!firebaseUser) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => doCloudUpload(), 2000);
}

async function doCloudUpload() {
    if (!firebaseUser) return;
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Saving...';
    try {
        const updates = {};
        const keys = [TASKS_KEY, CATEGORIES_KEY, SETTINGS_KEY];
        keys.forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) updates[key] = val;
        });
        updates.taskapp_lastModified = Date.now();
        await firebase.database().ref('users/' + firebaseUser.uid).update(updates);
        statusEl.textContent = 'Saved';
        setTimeout(() => { if (statusEl.textContent === 'Saved') statusEl.textContent = ''; }, 3000);
    } catch (e) {
        console.warn('Cloud save failed:', e);
        statusEl.textContent = 'Save error';
    }
}

// ── App Init ──
function onAuthReady(user) {
    loadFromLocal();
    document.getElementById('app').style.display = 'flex';
    updateViewToggle();
    renderView();
}

function initApp() {
    initFirebase();
}

// ── View Switching ──
function switchView(view) {
    settings.view = view;
    updateViewToggle();
    scheduleSave();
    renderView();
}

function updateViewToggle() {
    document.getElementById('btnTableView').classList.toggle('active', settings.view === 'table');
    document.getElementById('btnCardView').classList.toggle('active', settings.view === 'cards');
    document.getElementById('btnWeekView').classList.toggle('active', settings.view === 'week');
    document.getElementById('btnMonthView').classList.toggle('active', settings.view === 'month');
}

// ── Rendering ──
function renderView() {
    if (settings.view === 'cards') {
        renderCardView();
    } else if (settings.view === 'week') {
        renderWeekView();
    } else if (settings.view === 'month') {
        renderMonthView();
    } else {
        renderTableView();
    }
}

// ── Table View ──
function renderTableView() {
    const container = document.getElementById('viewContainer');
    const sorted = getSortedTasks();

    let html = '<div class="task-table-wrapper"><table class="task-table">';
    html += '<thead><tr>';
    html += buildSortHeader('Title', 'title');
    html += buildSortHeader('Category', 'category');
    html += buildSortHeader('Priority', 'priority');
    html += buildSortHeader('Start Date', 'startDate');
    html += buildSortHeader('Due Date', 'dueDate');
    html += '</tr></thead>';
    html += '<tbody>';

    if (sorted.length === 0) {
        html += '<tr class="empty-row"><td colspan="5">No tasks yet. Click "+ Add Task" to get started.</td></tr>';
    } else {
        sorted.forEach(task => {
            const cat = categories.find(c => c.id === task.categoryId);
            const catDot = cat ? `<span class="cat-dot" style="background:${cat.color}"></span>` : '';
            const catName = cat ? cat.name : '';
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            html += `<tr onclick="openTaskModal('${task.id}')">`;
            html += `<td>${escapeHtml(task.title)}</td>`;
            html += `<td>${catDot}<span class="cat-name">${escapeHtml(catName)}</span></td>`;
            html += `<td><span class="priority-badge" style="background:${pri.color}">${pri.label}</span></td>`;
            html += `<td>${formatDate(task.startDate)}</td>`;
            html += `<td>${formatDate(task.dueDate)}</td>`;
            html += '</tr>';
        });
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function buildSortHeader(label, field) {
    const isActive = settings.sortField === field;
    const arrow = isActive ? (settings.sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2';
    const cls = isActive ? 'active' : '';
    return `<th onclick="toggleSort('${field}')">${label} <span class="sort-arrow ${cls}">${arrow}</span></th>`;
}

function toggleSort(field) {
    if (settings.sortField === field) {
        settings.sortDir = settings.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        settings.sortField = field;
        settings.sortDir = 'asc';
    }
    scheduleSave();
    renderView();
}

function getSortedTasks() {
    const sorted = [...tasks];
    const field = settings.sortField;
    const dir = settings.sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
        let va, vb;
        if (field === 'category') {
            const catA = categories.find(c => c.id === a.categoryId);
            const catB = categories.find(c => c.id === b.categoryId);
            va = catA ? catA.name.toLowerCase() : '';
            vb = catB ? catB.name.toLowerCase() : '';
        } else if (field === 'priority') {
            const order = { high: 0, medium: 1, low: 2 };
            va = order[a.priority || 'low'] ?? 2;
            vb = order[b.priority || 'low'] ?? 2;
        } else if (field === 'title') {
            va = (a.title || '').toLowerCase();
            vb = (b.title || '').toLowerCase();
        } else {
            va = a[field] || '';
            vb = b[field] || '';
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
    });
    return sorted;
}

// ── Card View ──
let cardDragCatId = null;

function renderCardView() {
    const container = document.getElementById('viewContainer');
    let html = '<div class="card-view">';

    // Build columns: one per category + uncategorized
    const columns = [...categories.map(c => ({ id: c.id, name: c.name, color: c.color }))];
    columns.push({ id: '', name: 'Uncategorized', color: '#999' });

    columns.forEach(col => {
        const colTasks = tasks.filter(t => (t.categoryId || '') === col.id);
        const draggable = col.id ? 'draggable="true"' : '';
        const dragHandlers = col.id
            ? `ondragstart="cardColDragStart(event, '${col.id}')" ondragend="cardColDragEnd(event)"`
            : '';
        html += `<div class="card-column" data-cat-id="${col.id}" ${draggable} ${dragHandlers}>`;
        html += `<div class="card-column-header" style="cursor:${col.id ? 'grab' : 'default'}">
            <span><span class="col-dot" style="background:${col.color}"></span>${escapeHtml(col.name)}</span>
            <span class="col-count">${colTasks.length}</span>
        </div>`;

        colTasks.forEach(task => {
            html += `<div class="task-card" style="border-top-color:${col.color}" onclick="openTaskModal('${task.id}')" draggable="false">`;
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            html += `<div class="card-title">${escapeHtml(task.title)} <span class="priority-badge small" style="background:${pri.color}">${pri.label}</span></div>`;
            if (task.description) {
                html += `<div class="card-desc">${escapeHtml(task.description)}</div>`;
            }
            const dates = [];
            if (task.startDate) dates.push('Start: ' + formatDate(task.startDate));
            if (task.dueDate) dates.push('Due: ' + formatDate(task.dueDate));
            if (dates.length) {
                html += '<div class="card-dates">' + dates.map(d => `<span>${d}</span>`).join('') + '</div>';
            }
            html += '</div>';
        });

        html += `<button class="card-column-add" onclick="openTaskModal(null, '${col.id}')">+ Add Task</button>`;
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

let cardDropIndicator = null;

function getCardDropSide(col, clientX) {
    const rect = col.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? 'left' : 'right';
}

function showDropIndicator(col, side) {
    removeDropIndicator();
    cardDropIndicator = document.createElement('div');
    cardDropIndicator.className = 'col-drop-indicator';
    const parent = col.parentElement;
    if (side === 'left') {
        parent.insertBefore(cardDropIndicator, col);
    } else {
        parent.insertBefore(cardDropIndicator, col.nextSibling);
    }
}

function removeDropIndicator() {
    if (cardDropIndicator && cardDropIndicator.parentElement) {
        cardDropIndicator.parentElement.removeChild(cardDropIndicator);
    }
    cardDropIndicator = null;
}

function cardColDragStart(e, catId) {
    cardDragCatId = catId;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('col-dragging');

    setTimeout(() => {
        const cardView = document.querySelector('.card-view');
        if (!cardView) return;

        cardView._onDragOver = function(ev) {
            if (!cardDragCatId) return;
            ev.preventDefault();
            const col = ev.target.closest('.card-column');
            if (!col || col.dataset.catId === cardDragCatId) {
                removeDropIndicator();
                return;
            }
            const side = getCardDropSide(col, ev.clientX);
            showDropIndicator(col, side);
        };

        cardView._onDrop = function(ev) {
            ev.preventDefault();
            if (!cardDragCatId) return;

            const col = ev.target.closest('.card-column');
            if (!col || col.dataset.catId === cardDragCatId) { removeDropIndicator(); return; }

            const side = getCardDropSide(col, ev.clientX);
            const targetId = col.dataset.catId;
            const fromIdx = categories.findIndex(c => c.id === cardDragCatId);
            if (fromIdx === -1) { removeDropIndicator(); return; }

            const [moved] = categories.splice(fromIdx, 1);

            if (targetId === '') {
                // Uncategorized column — insert at end
                categories.push(moved);
            } else {
                let toIdx = categories.findIndex(c => c.id === targetId);
                if (side === 'right') toIdx++;
                categories.splice(toIdx, 0, moved);
            }

            cardDragCatId = null;
            removeDropIndicator();
            scheduleSave();
            renderCardView();
        };

        cardView.addEventListener('dragover', cardView._onDragOver);
        cardView.addEventListener('drop', cardView._onDrop);
    }, 0);
}

function cardColDragEnd(e) {
    cardDragCatId = null;
    removeDropIndicator();
    document.querySelectorAll('.card-column').forEach(col => {
        col.classList.remove('col-dragging');
    });
    const cardView = document.querySelector('.card-view');
    if (cardView) {
        if (cardView._onDragOver) cardView.removeEventListener('dragover', cardView._onDragOver);
        if (cardView._onDrop) cardView.removeEventListener('drop', cardView._onDrop);
    }
}

// ── Calendar Shared ──
let calendarWeekStart = null;
let calendarMonth = null; // { year, month } for month view
let calendarDragTaskId = null;

function getMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function calendarDragStart(e, taskId) {
    calendarDragTaskId = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
    setTimeout(() => { if (e.target) e.target.classList.remove('dragging'); }, 0);
}

function calendarDrop(e, dateStr) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!calendarDragTaskId) return;
    const task = tasks.find(t => t.id === calendarDragTaskId);
    if (task) {
        task.startDate = dateStr;
        scheduleSave();
        renderView();
    }
    calendarDragTaskId = null;
}

function openTaskModalWithDate(dateStr) {
    openTaskModal(null);
    setTimeout(() => {
        document.getElementById('taskStartDate').value = dateStr;
    }, 10);
}

function renderCalendarTask(task) {
    const cat = categories.find(c => c.id === task.categoryId);
    const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
    const catColor = cat ? cat.color : '#999';
    let html = `<div class="calendar-task" draggable="true" ondragstart="calendarDragStart(event, '${task.id}')" onclick="openTaskModal('${task.id}')" style="border-left-color:${catColor}">`;
    html += `<span class="calendar-task-title">${escapeHtml(task.title)}</span>`;
    html += `<span class="priority-badge small" style="background:${pri.color}">${pri.label}</span>`;
    html += '</div>';
    return html;
}

function renderUnscheduledSection() {
    const unscheduled = tasks.filter(t => !t.startDate);
    let html = '<div class="calendar-unscheduled">';
    html += '<div class="calendar-unscheduled-header">';
    html += `<span>Unscheduled (${unscheduled.length})</span>`;
    html += `<button class="btn-primary calendar-unscheduled-add" onclick="openTaskModal()">+ Add Task</button>`;
    html += '</div>';
    html += '<div class="calendar-unscheduled-list">';
    unscheduled.forEach(task => {
        const cat = categories.find(c => c.id === task.categoryId);
        const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
        const catColor = cat ? cat.color : '#999';
        html += `<div class="calendar-task" draggable="true" ondragstart="calendarDragStart(event, '${task.id}')" onclick="openTaskModal('${task.id}')" style="border-left-color:${catColor}">`;
        html += `<span class="calendar-task-title">${escapeHtml(task.title)}</span>`;
        html += `<span class="priority-badge small" style="background:${pri.color}">${pri.label}</span>`;
        if (task.dueDate) html += `<span class="calendar-task-due">Due: ${formatDate(task.dueDate)}</span>`;
        html += '</div>';
    });
    if (unscheduled.length === 0) {
        html += '<div class="calendar-empty">All tasks are scheduled!</div>';
    }
    html += '</div></div>';
    return html;
}

// ── Week View ──
function weekNav(offset) {
    calendarWeekStart.setDate(calendarWeekStart.getDate() + offset * 7);
    renderWeekView();
}

function weekToday() {
    calendarWeekStart = getMonday(new Date());
    renderWeekView();
}

function renderWeekView() {
    if (!calendarWeekStart) calendarWeekStart = getMonday(new Date());
    const container = document.getElementById('viewContainer');
    const todayStr = toDateStr(new Date());

    const weekEnd = new Date(calendarWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const monthFmt = { month: 'long', year: 'numeric' };
    const startMonth = calendarWeekStart.toLocaleDateString('en-US', monthFmt);
    const endMonth = weekEnd.toLocaleDateString('en-US', monthFmt);
    const headerLabel = startMonth === endMonth ? startMonth : `${calendarWeekStart.toLocaleDateString('en-US', { month: 'short' })} \u2013 ${weekEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;

    let html = '<div class="calendar-wrapper">';
    html += '<div class="calendar-nav">';
    html += `<button class="btn-secondary" onclick="weekNav(-1)">&larr; Prev</button>`;
    html += `<button class="btn-secondary" onclick="weekToday()">Today</button>`;
    html += `<span class="calendar-title">${headerLabel}</span>`;
    html += `<button class="btn-secondary" onclick="weekNav(1)">Next &rarr;</button>`;
    html += '</div>';
    html += '<div class="calendar-grid calendar-grid-week">';

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
        const day = new Date(calendarWeekStart);
        day.setDate(day.getDate() + i);
        const dateStr = toDateStr(day);
        const isToday = dateStr === todayStr;
        const dayLabel = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const dayTasks = tasks.filter(t => t.startDate === dateStr);

        html += `<div class="calendar-day${isToday ? ' today' : ''}" data-date="${dateStr}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="calendarDrop(event, '${dateStr}')">`;
        html += `<div class="calendar-day-header"><span class="calendar-day-name">${dayNames[i]}</span><span class="calendar-day-date">${dayLabel}</span></div>`;
        html += '<div class="calendar-day-tasks">';
        dayTasks.forEach(task => { html += renderCalendarTask(task); });
        html += '</div>';
        html += `<button class="calendar-day-add" onclick="openTaskModalWithDate('${dateStr}')">+</button>`;
        html += '</div>';
    }

    html += '</div>';
    html += renderUnscheduledSection();
    html += '</div>';
    container.innerHTML = html;
}

// ── Month View ──
function monthNav(offset) {
    calendarMonth.month += offset;
    if (calendarMonth.month > 11) { calendarMonth.month = 0; calendarMonth.year++; }
    if (calendarMonth.month < 0) { calendarMonth.month = 11; calendarMonth.year--; }
    renderMonthView();
}

function monthToday() {
    const now = new Date();
    calendarMonth = { year: now.getFullYear(), month: now.getMonth() };
    renderMonthView();
}

function renderMonthView() {
    if (!calendarMonth) {
        const now = new Date();
        calendarMonth = { year: now.getFullYear(), month: now.getMonth() };
    }
    const container = document.getElementById('viewContainer');
    const todayStr = toDateStr(new Date());
    const year = calendarMonth.year;
    const month = calendarMonth.month;

    const headerLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Find the Monday on or before the 1st of the month
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const gridStart = getMonday(firstOfMonth);

    // Find the Sunday on or after the last of the month
    const gridEnd = new Date(lastOfMonth);
    const endDay = gridEnd.getDay();
    if (endDay !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDay));

    let html = '<div class="calendar-wrapper">';
    html += '<div class="calendar-nav">';
    html += `<button class="btn-secondary" onclick="monthNav(-1)">&larr; Prev</button>`;
    html += `<button class="btn-secondary" onclick="monthToday()">Today</button>`;
    html += `<span class="calendar-title">${headerLabel}</span>`;
    html += `<button class="btn-secondary" onclick="monthNav(1)">Next &rarr;</button>`;
    html += '</div>';

    // Day name headers
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    html += '<div class="month-grid">';
    html += '<div class="month-header-row">';
    dayNames.forEach(name => {
        html += `<div class="month-header-cell">${name}</div>`;
    });
    html += '</div>';

    // Day cells
    html += '<div class="month-body">';
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
        html += '<div class="month-row">';
        for (let i = 0; i < 7; i++) {
            const dateStr = toDateStr(cursor);
            const isToday = dateStr === todayStr;
            const isCurrentMonth = cursor.getMonth() === month;
            const dayTasks = tasks.filter(t => t.startDate === dateStr);

            let cls = 'month-cell';
            if (isToday) cls += ' today';
            if (!isCurrentMonth) cls += ' other-month';

            html += `<div class="${cls}" data-date="${dateStr}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="calendarDrop(event, '${dateStr}')">`;
            html += `<div class="month-cell-header">`;
            html += `<span class="month-cell-date">${cursor.getDate()}</span>`;
            html += `<button class="month-cell-add" onclick="openTaskModalWithDate('${dateStr}')">+</button>`;
            html += `</div>`;
            html += '<div class="month-cell-tasks">';
            dayTasks.forEach(task => { html += renderCalendarTask(task); });
            html += '</div>';
            html += '</div>';

            cursor.setDate(cursor.getDate() + 1);
        }
        html += '</div>';
    }
    html += '</div></div>';

    html += renderUnscheduledSection();
    html += '</div>';
    container.innerHTML = html;
}

// ── Task Modal ──
function openTaskModal(taskId, presetCategoryId) {
    const overlay = document.getElementById('taskModalOverlay');
    const titleEl = document.getElementById('taskModalTitle');
    const idEl = document.getElementById('taskId');
    const titleInput = document.getElementById('taskTitleInput');
    const descInput = document.getElementById('taskDescInput');
    const startInput = document.getElementById('taskStartDate');
    const dueInput = document.getElementById('taskDueDate');
    const catSelect = document.getElementById('taskCategory');
    const priSelect = document.getElementById('taskPriority');
    const deleteBtn = document.getElementById('btnDeleteTask');

    // Populate category dropdown
    catSelect.innerHTML = '<option value="">-- None --</option>';
    categories.forEach(c => {
        catSelect.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });

    if (taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        titleEl.textContent = 'Edit Task';
        idEl.value = task.id;
        titleInput.value = task.title;
        descInput.value = task.description || '';
        startInput.value = task.startDate || '';
        dueInput.value = task.dueDate || '';
        catSelect.value = task.categoryId || '';
        priSelect.value = task.priority || 'low';
        deleteBtn.style.display = '';
    } else {
        titleEl.textContent = 'Add Task';
        idEl.value = '';
        titleInput.value = '';
        descInput.value = '';
        startInput.value = '';
        dueInput.value = '';
        catSelect.value = presetCategoryId || '';
        priSelect.value = 'low';
        deleteBtn.style.display = 'none';
    }

    overlay.classList.add('show');
    setTimeout(() => titleInput.focus(), 50);

    // Enter to save
    overlay.onkeydown = function(e) {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') saveTask();
        if (e.key === 'Escape') closeTaskModal();
    };
}

function closeTaskModal() {
    document.getElementById('taskModalOverlay').classList.remove('show');
}

function saveTask() {
    const id = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const description = document.getElementById('taskDescInput').value.trim();
    const startDate = document.getElementById('taskStartDate').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const categoryId = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;

    if (!title) {
        document.getElementById('taskTitleInput').focus();
        return;
    }

    if (id) {
        // Update existing
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.title = title;
            task.description = description;
            task.startDate = startDate;
            task.dueDate = dueDate;
            task.categoryId = categoryId;
            task.priority = priority;
        }
    } else {
        // Create new
        tasks.push({
            id: generateId(),
            title,
            description,
            startDate,
            dueDate,
            categoryId,
            priority,
            createdAt: Date.now(),
            order: tasks.length
        });
    }

    closeTaskModal();
    scheduleSave();
    renderView();
}

function deleteTask() {
    const id = document.getElementById('taskId').value;
    if (!id) return;
    if (!confirm('Delete this task?')) return;
    tasks = tasks.filter(t => t.id !== id);
    closeTaskModal();
    scheduleSave();
    renderView();
}

// ── Category Modal ──
function openCategoryModal() {
    renderCategoryList();
    document.getElementById('categoryModalOverlay').classList.add('show');
    document.getElementById('newCategoryName').value = '';
    document.getElementById('newCategoryColor').value = '#4a90d9';
}

function closeCategoryModal() {
    document.getElementById('categoryModalOverlay').classList.remove('show');
    renderView(); // refresh in case category colors changed
}

function renderCategoryList() {
    const list = document.getElementById('categoryList');
    if (categories.length === 0) {
        list.innerHTML = '<p style="color:#888;font-size:13px;padding:8px 0;">No categories yet.</p>';
        return;
    }
    list.innerHTML = categories.map(c => `
        <div class="category-item" data-id="${c.id}">
            <input type="color" value="${c.color}" onchange="updateCategory('${c.id}', null, this.value)">
            <input type="text" value="${escapeHtml(c.name)}" onchange="updateCategory('${c.id}', this.value, null)">
            <button class="btn-icon" onclick="deleteCategoryById('${c.id}')" title="Delete">&times;</button>
        </div>
    `).join('');
}

function addCategory() {
    const nameEl = document.getElementById('newCategoryName');
    const colorEl = document.getElementById('newCategoryColor');
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }

    categories.push({ id: generateId(), name, color: colorEl.value });
    nameEl.value = '';
    colorEl.value = '#4a90d9';
    scheduleSave();
    renderCategoryList();
}

function updateCategory(id, name, color) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (name !== null) cat.name = name;
    if (color !== null) cat.color = color;
    scheduleSave();
}

function deleteCategoryById(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (!confirm(`Delete category "${cat.name}"? Tasks in this category will become uncategorized.`)) return;
    categories = categories.filter(c => c.id !== id);
    // Clear categoryId from tasks that used this category
    tasks.forEach(t => { if (t.categoryId === id) t.categoryId = ''; });
    scheduleSave();
    renderCategoryList();
}

// ── Helpers ──
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Start ──
initApp();

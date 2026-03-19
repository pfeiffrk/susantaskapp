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

// ── State ──
let tasks = [];
let categories = [];
let settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
let firebaseUser = null;
let dataListener = null;
let themeSettings = null;

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

// ── Firebase Helpers ──
function userRef() {
    return firebase.database().ref('users/' + firebaseUser.uid);
}

// ── Undo / Redo ──
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;
let skipSnapshot = false;
let lastSavedState = null;

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({ tasks: JSON.stringify(tasks), categories: JSON.stringify(categories) });
    const snap = undoStack.pop();
    tasks = JSON.parse(snap.tasks);
    categories = JSON.parse(snap.categories);
    lastSavedState = { tasks: snap.tasks, categories: snap.categories };
    updateUndoRedoButtons();
    renderView();
    skipSnapshot = true;
    saveToFirebase();
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({ tasks: JSON.stringify(tasks), categories: JSON.stringify(categories) });
    const snap = redoStack.pop();
    tasks = JSON.parse(snap.tasks);
    categories = JSON.parse(snap.categories);
    lastSavedState = { tasks: snap.tasks, categories: snap.categories };
    updateUndoRedoButtons();
    renderView();
    skipSnapshot = true;
    saveToFirebase();
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
});

function saveToFirebase() {
    if (!firebaseUser) return;
    if (!skipSnapshot && lastSavedState) {
        undoStack.push(lastSavedState);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
        updateUndoRedoButtons();
    }
    skipSnapshot = false;
    lastSavedState = { tasks: JSON.stringify(tasks), categories: JSON.stringify(categories) };
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Saving...';
    const updates = {
        taskapp_tasks: JSON.stringify(tasks),
        taskapp_categories: JSON.stringify(categories),
        taskapp_settings: JSON.stringify(settings),
        taskapp_lastModified: Date.now()
    };
    if (themeSettings) updates.taskapp_theme = JSON.stringify(themeSettings);
    userRef().update(updates).then(() => {
        statusEl.textContent = 'Saved';
        setTimeout(() => { if (statusEl.textContent === 'Saved') statusEl.textContent = ''; }, 3000);
    }).catch(e => {
        console.warn('Save failed:', e);
        statusEl.textContent = 'Save error';
    });
}

let themeSaveTimer = null;
function saveThemeDebounced() {
    clearTimeout(themeSaveTimer);
    themeSaveTimer = setTimeout(() => {
        if (!firebaseUser || !themeSettings) return;
        userRef().update({ taskapp_theme: JSON.stringify(themeSettings) });
    }, 500);
}

function startDataListener() {
    if (dataListener) return;
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Loading...';
    dataListener = userRef().on('value', snap => {
        const data = snap.val();
        if (data) {
            try { tasks = JSON.parse(data.taskapp_tasks || '[]'); } catch (e) { tasks = []; }
            try { categories = JSON.parse(data.taskapp_categories || '[]'); } catch (e) { categories = []; }
            try {
                const currentView = settings.view;
                settings = JSON.parse(data.taskapp_settings || '{}');
                if (!settings.view) settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
                if (settings.view === 'calendar') settings.view = 'week';
                if (currentView === 'deleted' || currentView === 'timeline') settings.view = currentView;
            } catch (e) {
                settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
            }
            if (categories.length === 0) categories = [...DEFAULT_CATEGORIES];
            try { themeSettings = JSON.parse(data.taskapp_theme || 'null'); } catch (e) { themeSettings = null; }
            if (!themeSettings) themeSettings = getDefaultTheme();
            applyTheme(themeSettings);
        } else {
            tasks = [];
            categories = [...DEFAULT_CATEGORIES];
            settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
            themeSettings = getDefaultTheme();
            applyTheme(themeSettings);
            saveToFirebase();
        }
        statusEl.textContent = '';
        lastSavedState = { tasks: JSON.stringify(tasks), categories: JSON.stringify(categories) };
        updateViewToggle();
        renderView();
    });
}

function stopDataListener() {
    if (dataListener && firebaseUser) userRef().off('value', dataListener);
    dataListener = null;
}

// ── Firebase Auth ──
function initFirebase() {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            firebaseUser = user;
            document.getElementById('signInScreen').classList.remove('show');
            document.getElementById('app').style.display = 'flex';
            startDataListener();
        } else {
            stopDataListener();
            firebaseUser = null;
            tasks = []; categories = [];
            settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
            document.getElementById('app').style.display = 'none';
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
        <p>Sign in to access your tasks</p>
        <input type="email" id="authEmail" placeholder="Email" autofocus>
        <input type="password" id="authPassword" placeholder="Password">
        <div class="auth-error" id="authError"></div>
        <button onclick="firebaseSignIn()">Sign In</button>
        <button onclick="firebaseSignUp()" style="background:#5cb85c;border-color:#5cb85c;">Create Account</button>
        <button class="auth-secondary" onclick="firebaseForgotPassword()">Forgot password?</button>
    `;
    setTimeout(() => { const el = document.getElementById('authEmail'); if (el) el.focus(); }, 50);
    box.onkeydown = function(e) { if (e.key === 'Enter') firebaseSignIn(); };
}

async function firebaseSignIn() {
    const email = document.getElementById('authEmail').value;
    const pw = document.getElementById('authPassword').value;
    const err = document.getElementById('authError');
    if (!email || !pw) { err.textContent = 'Enter email and password'; return; }
    err.textContent = 'Signing in...';
    try { await firebase.auth().signInWithEmailAndPassword(email, pw); }
    catch (e) { err.textContent = e.message.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)\.?/, '').trim() || 'Sign-in failed'; }
}

async function firebaseSignUp() {
    const email = document.getElementById('authEmail').value;
    const pw = document.getElementById('authPassword').value;
    const err = document.getElementById('authError');
    if (!email) { err.textContent = 'Enter an email address'; return; }
    if (!pw || pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }
    err.textContent = 'Creating account...';
    try { await firebase.auth().createUserWithEmailAndPassword(email, pw); }
    catch (e) { err.textContent = e.message.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)\.?/, '').trim() || 'Sign-up failed'; }
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
    } catch (e) { err.textContent = e.message.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)\.?/, '').trim() || 'Could not send reset email'; }
}

function firebaseSignOut() {
    if (!confirm('Sign out?')) return;
    stopDataListener();
    firebase.auth().signOut();
}

// ── App Init ──
function initApp() { initFirebase(); }

// ── Show/Hide Done ──
let showDone = true;
function toggleShowDone(checked) { showDone = checked; renderView(); }
function getActiveTasks() { return tasks.filter(t => !t.deleted && (showDone || !t.done)); }

// ── View Switching ──
function switchView(view) {
    // Close skins panel if open
    const toolbar = document.getElementById('toolbar');
    if (toolbar.classList.contains('skins-open')) {
        toolbar.classList.remove('skins-open');
    }
    settings.view = view;
    updateViewToggle();
    renderView();
    if (view !== 'deleted' && view !== 'timeline') saveToFirebase();
}

function updateViewToggle() {
    document.getElementById('btnTableView').classList.toggle('active', settings.view === 'table');
    document.getElementById('btnCardView').classList.toggle('active', settings.view === 'cards');
    document.getElementById('btnWeekView').classList.toggle('active', settings.view === 'week');
    document.getElementById('btnMonthView').classList.toggle('active', settings.view === 'month');
    document.getElementById('btnTimelineView').classList.toggle('active', settings.view === 'timeline');
    document.getElementById('btnDeletedView').classList.toggle('active', settings.view === 'deleted');
    document.getElementById('showDoneToggle').style.display = settings.view === 'deleted' ? 'none' : '';
}

// ── Rendering ──
function renderView() {
    if (settings.view === 'deleted') showDeletedTasks();
    else if (settings.view === 'cards') renderCardView();
    else if (settings.view === 'week') renderWeekView();
    else if (settings.view === 'month') renderMonthView();
    else if (settings.view === 'timeline') renderTimelineView();
    else renderTableView();
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
    html += '<th></th><th class="delete-col"></th>';
    html += '</tr></thead><tbody>';
    if (sorted.length === 0) {
        html += '<tr class="empty-row"><td colspan="7">No tasks yet. Click "+ Add Task" to get started.</td></tr>';
    } else {
        sorted.forEach(task => {
            const cat = categories.find(c => c.id === task.categoryId);
            const catDot = cat ? `<span class="cat-dot" style="background:${cat.color}"></span>` : '';
            const catName = cat ? cat.name : '';
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            const cs = catStyle(task);
            const doneClass = task.done ? ' task-done' : '';
            html += `<tr class="${doneClass}" style="${cs}" onclick="openTaskModal('${task.id}')">`;
            html += `<td>${escapeHtml(task.title)}</td>`;
            html += `<td>${catDot}<span class="cat-name">${escapeHtml(catName)}</span></td>`;
            html += `<td><span class="priority-badge" style="background:${pri.color}">${pri.label}</span></td>`;
            html += `<td>${formatDate(task.startDate)}</td>`;
            html += `<td>${formatDate(task.dueDate)}</td>`;
            html += `<td><a class="done-link" href="#" onclick="event.stopPropagation();toggleTaskDone(event, '${task.id}')">${task.done ? 'Open' : 'Done'}</a></td>`;
            html += `<td class="task-delete-cell"><button class="btn-delete-inline" onclick="event.stopPropagation();deleteTaskDirect('${task.id}')" title="Delete">&times;</button></td>`;
            html += '</tr>';
        });
    }
    html += '</tbody></table>';
    html += '<button class="table-add-task" onclick="openTaskModal()">+ Add Task</button>';
    html += '</div>';
    container.innerHTML = html;
}

function buildSortHeader(label, field) {
    const isActive = settings.sortField === field;
    const arrow = isActive ? (settings.sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2';
    const cls = isActive ? 'active' : '';
    return `<th onclick="toggleSort('${field}')">${label} <span class="sort-arrow ${cls}">${arrow}</span></th>`;
}

function toggleSort(field) {
    if (settings.sortField === field) settings.sortDir = settings.sortDir === 'asc' ? 'desc' : 'asc';
    else { settings.sortField = field; settings.sortDir = 'asc'; }
    renderView();
    saveToFirebase();
}

function getSortedTasks() {
    const sorted = [...getActiveTasks()];
    const field = settings.sortField;
    const dir = settings.sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        let va, vb;
        if (field === 'category') {
            const catA = categories.find(c => c.id === a.categoryId);
            const catB = categories.find(c => c.id === b.categoryId);
            va = catA ? catA.name.toLowerCase() : ''; vb = catB ? catB.name.toLowerCase() : '';
        } else if (field === 'priority') {
            const order = { high: 0, medium: 1, low: 2 };
            va = order[a.priority || 'low'] ?? 2; vb = order[b.priority || 'low'] ?? 2;
        } else if (field === 'title') {
            va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase();
        } else { va = a[field] || ''; vb = b[field] || ''; }
        if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0;
    });
    return sorted;
}

// ── Card View ──
let cardDragCatId = null;
let cardDragTaskId = null;

function renderCardView() {
    const container = document.getElementById('viewContainer');
    let html = '<div class="card-view">';
    const columns = [...categories.map(c => ({ id: c.id, name: c.name, color: c.color }))];
    columns.push({ id: '', name: 'Uncategorized', color: '#999' });
    columns.forEach(col => {
        const colTasks = getActiveTasks().filter(t => (t.categoryId || '') === col.id);
        const draggable = col.id ? 'draggable="true"' : '';
        const dragHandlers = col.id ? `ondragstart="cardColDragStart(event, '${col.id}')" ondragend="cardColDragEnd(event)"` : '';
        html += `<div class="card-column" data-cat-id="${col.id}" ${draggable} ${dragHandlers} ondragover="cardColumnDragOver(event)" ondrop="cardColumnDrop(event, '${col.id}')">`;
        html += `<div class="card-column-header" style="cursor:${col.id ? 'grab' : 'default'}">
            <span><span class="col-dot" style="background:${col.color}"></span>${escapeHtml(col.name)}</span>
            <span class="col-count">${colTasks.length}</span></div>`;
        colTasks.forEach(task => {
            const doneClass = task.done ? ' task-done' : '';
            const cs = catStyle(task);
            html += `<div class="task-card${doneClass}" style="${cs || 'border-top-color:' + col.color}" onclick="openTaskModal('${task.id}')" draggable="true" ondragstart="cardTaskDragStart(event, '${task.id}')" ondragend="cardTaskDragEnd(event)">`;
            html += `<button class="btn-delete-card" onclick="event.stopPropagation();deleteTaskDirect('${task.id}')" title="Delete">&times;</button>`;
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            html += `<div class="card-title">${escapeHtml(task.title)} <span class="priority-badge small" style="background:${pri.color}">${pri.label}</span> <a class="done-link" href="#" onclick="event.stopPropagation();toggleTaskDone(event, '${task.id}')">${task.done ? 'Open' : 'Done'}</a></div>`;
            if (task.description) html += `<div class="card-desc">${escapeHtml(task.description)}</div>`;
            const dates = [];
            if (task.startDate) dates.push('Start: ' + formatDate(task.startDate));
            if (task.dueDate) dates.push('Due: ' + formatDate(task.dueDate));
            if (dates.length) html += '<div class="card-dates">' + dates.map(d => `<span>${d}</span>`).join('') + '</div>';
            html += '</div>';
        });
        html += `<button class="card-column-add" onclick="openTaskModal(null, '${col.id}')">+ Add Task</button></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

let cardDropIndicator = null;
function getCardDropSide(col, clientX) { const rect = col.getBoundingClientRect(); return clientX < rect.left + rect.width / 2 ? 'left' : 'right'; }
function showDropIndicator(col, side) {
    removeDropIndicator();
    cardDropIndicator = document.createElement('div');
    cardDropIndicator.className = 'col-drop-indicator';
    const parent = col.parentElement;
    if (side === 'left') parent.insertBefore(cardDropIndicator, col);
    else parent.insertBefore(cardDropIndicator, col.nextSibling);
}
function removeDropIndicator() { if (cardDropIndicator && cardDropIndicator.parentElement) cardDropIndicator.parentElement.removeChild(cardDropIndicator); cardDropIndicator = null; }

function cardColDragStart(e, catId) {
    cardDragCatId = catId; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('col-dragging');
    setTimeout(() => {
        const cardView = document.querySelector('.card-view'); if (!cardView) return;
        cardView._onDragOver = function(ev) {
            if (!cardDragCatId) return; ev.preventDefault();
            const col = ev.target.closest('.card-column');
            if (!col || col.dataset.catId === cardDragCatId) { removeDropIndicator(); return; }
            showDropIndicator(col, getCardDropSide(col, ev.clientX));
        };
        cardView._onDrop = function(ev) {
            ev.preventDefault(); if (!cardDragCatId) return;
            const col = ev.target.closest('.card-column');
            if (!col || col.dataset.catId === cardDragCatId) { removeDropIndicator(); return; }
            const side = getCardDropSide(col, ev.clientX); const targetId = col.dataset.catId;
            const fromIdx = categories.findIndex(c => c.id === cardDragCatId);
            if (fromIdx === -1) { removeDropIndicator(); return; }
            const [moved] = categories.splice(fromIdx, 1);
            if (targetId === '') categories.push(moved);
            else { let toIdx = categories.findIndex(c => c.id === targetId); if (side === 'right') toIdx++; categories.splice(toIdx, 0, moved); }
            cardDragCatId = null; removeDropIndicator(); renderCardView(); saveToFirebase();
        };
        cardView.addEventListener('dragover', cardView._onDragOver);
        cardView.addEventListener('drop', cardView._onDrop);
    }, 0);
}

function cardColDragEnd(e) {
    cardDragCatId = null; removeDropIndicator();
    document.querySelectorAll('.card-column').forEach(col => col.classList.remove('col-dragging'));
    const cardView = document.querySelector('.card-view');
    if (cardView) {
        if (cardView._onDragOver) cardView.removeEventListener('dragover', cardView._onDragOver);
        if (cardView._onDrop) cardView.removeEventListener('drop', cardView._onDrop);
    }
}

// ── Card Task Drag-and-Drop ──
function cardTaskDragStart(e, taskId) {
    cardDragTaskId = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
    e.target.style.opacity = '0.4';
}

function cardTaskDragEnd(e) {
    cardDragTaskId = null;
    e.target.style.opacity = '';
    document.querySelectorAll('.card-column').forEach(col => col.classList.remove('drag-over'));
}

function cardColumnDragOver(e) {
    if (!cardDragTaskId) return;
    e.preventDefault();
    document.querySelectorAll('.card-column.drag-over').forEach(c => c.classList.remove('drag-over'));
    e.currentTarget.classList.add('drag-over');
}

function cardColumnDrop(e, catId) {
    if (!cardDragTaskId) return;
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const task = tasks.find(t => t.id === cardDragTaskId);
    if (task) {
        task.categoryId = catId;
        renderCardView();
        saveToFirebase();
    }
    cardDragTaskId = null;
}

// ── Calendar Shared ──
let calendarWeekStart = null;
let calendarMonth = null;
let calendarDragTaskId = null;

function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day)); dt.setHours(0,0,0,0); return dt; }
function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function calendarDragStart(e, taskId) { calendarDragTaskId = taskId; e.dataTransfer.effectAllowed = 'move'; e.target.classList.add('dragging'); setTimeout(() => { if (e.target) e.target.classList.remove('dragging'); }, 0); }
function calendarDrop(e, dateStr) {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    if (!calendarDragTaskId) return;
    const task = tasks.find(t => t.id === calendarDragTaskId);
    if (task) { task.startDate = dateStr; renderView(); saveToFirebase(); }
    calendarDragTaskId = null;
}
function openTaskModalWithDate(dateStr) { openTaskModal(null); setTimeout(() => { document.getElementById('taskStartDate').value = dateStr; }, 10); }

function toggleTaskDone(e, taskId) {
    e.stopPropagation(); const task = tasks.find(t => t.id === taskId);
    if (!task) return; task.done = !task.done; renderView(); saveToFirebase();
}

function renderCalendarTask(task) {
    const cat = categories.find(c => c.id === task.categoryId);
    const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
    const catColor = cat ? cat.color : '#999';
    const doneClass = task.done ? ' task-done' : '';
    const cs = catStyle(task);
    const calStyle = cs || `border-left-color:${catColor}`;
    let html = `<div class="calendar-task${doneClass}" draggable="true" ondragstart="calendarDragStart(event, '${task.id}')" onclick="openTaskModal('${task.id}')" style="${calStyle}">`;
    html += `<span class="calendar-task-title">${escapeHtml(task.title)}</span>`;
    html += `<span class="priority-badge small" style="background:${pri.color}">${pri.label}</span>`;
    html += `<a class="calendar-task-done-link" href="#" onclick="toggleTaskDone(event, '${task.id}')">${task.done ? 'Open' : 'Done'}</a>`;
    html += '</div>';
    return html;
}

function renderUnscheduledSection() {
    const unscheduled = getActiveTasks().filter(t => !t.startDate);
    let html = '<div class="calendar-unscheduled"><div class="calendar-unscheduled-header">';
    html += `<span>Unscheduled (${unscheduled.length})</span>`;
    html += `<button class="btn-primary calendar-unscheduled-add" onclick="openTaskModal()">+ Add Task</button></div>`;
    html += '<div class="calendar-unscheduled-list">';
    unscheduled.forEach(task => {
        const cat = categories.find(c => c.id === task.categoryId);
        const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
        const catColor = cat ? cat.color : '#999';
        const cs = catStyle(task);
        html += `<div class="calendar-task" draggable="true" ondragstart="calendarDragStart(event, '${task.id}')" onclick="openTaskModal('${task.id}')" style="${cs || 'border-left-color:' + catColor}">`;
        html += `<span class="calendar-task-title">${escapeHtml(task.title)}</span>`;
        html += `<span class="priority-badge small" style="background:${pri.color}">${pri.label}</span>`;
        if (task.dueDate) html += `<span class="calendar-task-due">Due: ${formatDate(task.dueDate)}</span>`;
        html += '</div>';
    });
    if (unscheduled.length === 0) html += '<div class="calendar-empty">All tasks are scheduled!</div>';
    html += '</div></div>';
    return html;
}

// ── Week View ──
function weekNav(offset) { calendarWeekStart.setDate(calendarWeekStart.getDate() + offset * 7); renderWeekView(); }
function weekToday() { calendarWeekStart = getMonday(new Date()); renderWeekView(); }

function renderWeekView() {
    if (!calendarWeekStart) calendarWeekStart = getMonday(new Date());
    const container = document.getElementById('viewContainer');
    const todayStr = toDateStr(new Date());
    const weekEnd = new Date(calendarWeekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const monthFmt = { month: 'long', year: 'numeric' };
    const startMonth = calendarWeekStart.toLocaleDateString('en-US', monthFmt);
    const endMonth = weekEnd.toLocaleDateString('en-US', monthFmt);
    const headerLabel = startMonth === endMonth ? startMonth : `${calendarWeekStart.toLocaleDateString('en-US', { month: 'short' })} \u2013 ${weekEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    let html = '<div class="calendar-wrapper"><div class="calendar-nav">';
    html += `<button class="btn-secondary" onclick="weekNav(-1)">&larr; Prev</button>`;
    html += `<button class="btn-secondary" onclick="weekToday()">Today</button>`;
    html += `<span class="calendar-title">${headerLabel}</span>`;
    html += `<button class="btn-secondary" onclick="weekNav(1)">Next &rarr;</button></div>`;
    html += '<div class="calendar-grid calendar-grid-week">';
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    for (let i = 0; i < 7; i++) {
        const day = new Date(calendarWeekStart); day.setDate(day.getDate() + i);
        const dateStr = toDateStr(day); const isToday = dateStr === todayStr;
        const dayLabel = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const dayTasks = getActiveTasks().filter(t => t.startDate === dateStr);
        html += `<div class="calendar-day${isToday ? ' today' : ''}" data-date="${dateStr}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="calendarDrop(event, '${dateStr}')">`;
        html += `<div class="calendar-day-header"><span class="calendar-day-name">${dayNames[i]}</span><span class="calendar-day-date">${dayLabel}</span></div>`;
        html += '<div class="calendar-day-tasks">';
        dayTasks.forEach(task => { html += renderCalendarTask(task); });
        html += '</div>';
        html += `<button class="calendar-day-add" onclick="openTaskModalWithDate('${dateStr}')">+</button></div>`;
    }
    html += '</div>';
    html += renderUnscheduledSection();
    html += '</div>';
    container.innerHTML = html;
}

// ── Month View ──
function monthNav(offset) { calendarMonth.month += offset; if (calendarMonth.month > 11) { calendarMonth.month = 0; calendarMonth.year++; } if (calendarMonth.month < 0) { calendarMonth.month = 11; calendarMonth.year--; } renderMonthView(); }
function monthToday() { const now = new Date(); calendarMonth = { year: now.getFullYear(), month: now.getMonth() }; renderMonthView(); }

function renderMonthView() {
    if (!calendarMonth) { const now = new Date(); calendarMonth = { year: now.getFullYear(), month: now.getMonth() }; }
    const container = document.getElementById('viewContainer');
    const todayStr = toDateStr(new Date());
    const year = calendarMonth.year, month = calendarMonth.month;
    const headerLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const gridStart = getMonday(firstOfMonth);
    const gridEnd = new Date(lastOfMonth);
    const endDay = gridEnd.getDay();
    if (endDay !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDay));
    let html = '<div class="calendar-wrapper"><div class="calendar-nav">';
    html += `<button class="btn-secondary" onclick="monthNav(-1)">&larr; Prev</button>`;
    html += `<button class="btn-secondary" onclick="monthToday()">Today</button>`;
    html += `<span class="calendar-title">${headerLabel}</span>`;
    html += `<button class="btn-secondary" onclick="monthNav(1)">Next &rarr;</button></div>`;
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    html += '<div class="month-grid"><div class="month-header-row">';
    dayNames.forEach(name => { html += `<div class="month-header-cell">${name}</div>`; });
    html += '</div><div class="month-body">';
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
        html += '<div class="month-row">';
        for (let i = 0; i < 7; i++) {
            const dateStr = toDateStr(cursor); const isToday = dateStr === todayStr;
            const isCurrentMonth = cursor.getMonth() === month;
            const dayTasks = getActiveTasks().filter(t => t.startDate === dateStr);
            let cls = 'month-cell'; if (isToday) cls += ' today'; if (!isCurrentMonth) cls += ' other-month';
            html += `<div class="${cls}" data-date="${dateStr}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="calendarDrop(event, '${dateStr}')">`;
            html += `<div class="month-cell-header"><span class="month-cell-date">${cursor.getDate()}</span>`;
            html += `<button class="month-cell-add" onclick="openTaskModalWithDate('${dateStr}')">+</button></div>`;
            html += '<div class="month-cell-tasks">';
            dayTasks.forEach(task => { html += renderCalendarTask(task); });
            html += '</div></div>';
            cursor.setDate(cursor.getDate() + 1);
        }
        html += '</div>';
    }
    html += '</div></div>';
    html += renderUnscheduledSection();
    html += '</div>';
    container.innerHTML = html;
}

// ── Timeline / Gantt View ──
let timelineStart = null;
let timelineDays = 28;
let tlDragTaskId = null;

function tlDragStart(e, taskId) {
    tlDragTaskId = taskId;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (e.target) e.target.style.opacity = '0.4'; }, 0);
}

function tlDragEnd(e) {
    tlDragTaskId = null;
    e.target.style.opacity = '';
    document.querySelectorAll('.tl-drag-over').forEach(el => el.classList.remove('tl-drag-over'));
}

function tlDragOver(e) {
    if (!tlDragTaskId) return;
    e.preventDefault();
    e.currentTarget.classList.add('tl-drag-over');
}

function tlDragLeave(e) {
    e.currentTarget.classList.remove('tl-drag-over');
}

function tlDrop(e, dateStr) {
    e.preventDefault();
    e.currentTarget.classList.remove('tl-drag-over');
    if (!tlDragTaskId) return;
    const task = tasks.find(t => t.id === tlDragTaskId);
    if (task) {
        // Calculate duration to preserve it
        if (task.startDate && task.dueDate) {
            const oldStart = new Date(task.startDate + 'T00:00:00');
            const oldEnd = new Date(task.dueDate + 'T00:00:00');
            const duration = Math.round((oldEnd - oldStart) / (1000 * 60 * 60 * 24));
            const newStart = new Date(dateStr + 'T00:00:00');
            const newEnd = new Date(newStart);
            newEnd.setDate(newEnd.getDate() + duration);
            task.startDate = dateStr;
            task.dueDate = toDateStr(newEnd);
        } else {
            task.startDate = dateStr;
        }
        renderTimelineView();
        saveToFirebase();
    }
    tlDragTaskId = null;
}

function timelineNav(offset) {
    if (!timelineStart) timelineStart = getMonday(new Date());
    timelineStart.setDate(timelineStart.getDate() + offset * 7);
    renderTimelineView();
}
function timelineToday() { timelineStart = getMonday(new Date()); renderTimelineView(); }

function renderTimelineView() {
    if (!timelineStart) timelineStart = getMonday(new Date());
    const container = document.getElementById('viewContainer');
    const todayStr = toDateStr(new Date());
    const activeTasks = getActiveTasks().filter(t => t.startDate || t.dueDate);

    const endDate = new Date(timelineStart);
    endDate.setDate(endDate.getDate() + timelineDays - 1);
    const startLabel = timelineStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let html = '<div class="timeline-wrapper"><div class="timeline-nav">';
    html += `<button class="btn-secondary" onclick="timelineNav(-1)">&larr; Prev</button>`;
    html += `<button class="btn-secondary" onclick="timelineToday()">Today</button>`;
    html += `<span class="timeline-title">${startLabel} &ndash; ${endLabel}</span>`;
    html += `<button class="btn-secondary" onclick="timelineNav(1)">Next &rarr;</button></div>`;

    if (activeTasks.length === 0) {
        html += '<div class="tl-empty">No tasks with dates. Add start/due dates to see them on the timeline.</div>';
        html += '</div>';
        container.innerHTML = html;
        return;
    }

    // Build date columns
    const dates = [];
    for (let i = 0; i < timelineDays; i++) {
        const d = new Date(timelineStart);
        d.setDate(d.getDate() + i);
        dates.push({ date: d, str: toDateStr(d), day: d.getDay() });
    }

    html += '<div class="timeline-chart"><table class="timeline-table"><thead><tr>';
    html += '<th class="tl-task-header">Task</th>';
    dates.forEach(d => {
        const isToday = d.str === todayStr;
        const label = d.date.getDate() === 1 || d === dates[0]
            ? d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : d.date.getDate();
        html += `<th class="${isToday ? 'tl-today-col' : ''} ${(d.day === 0 || d.day === 6) ? 'tl-weekend' : ''}">${label}</th>`;
    });
    html += '</tr></thead><tbody>';

    activeTasks.forEach(task => {
        const cat = categories.find(c => c.id === task.categoryId);
        const barColor = cat ? cat.color : '#999';
        const cs = catStyle(task);
        const taskStart = task.startDate || task.dueDate;
        const taskEnd = task.dueDate || task.startDate;

        html += '<tr>';
        html += `<td class="tl-task-name" style="${cs}" draggable="true" ondragstart="tlDragStart(event, '${task.id}')" ondragend="tlDragEnd(event)" onclick="openTaskModal('${task.id}')" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</td>`;

        // Find bar start and end column indices
        let barStartCol = -1, barEndCol = -1;
        dates.forEach((d, idx) => {
            if (d.str === taskStart && barStartCol === -1) barStartCol = idx;
            if (d.str >= taskStart && d.str <= taskEnd) barEndCol = idx;
        });
        // Handle tasks that extend before/after visible range
        if (taskStart < dates[0].str && taskEnd >= dates[0].str) barStartCol = 0;
        if (taskEnd > dates[dates.length - 1].str && taskStart <= dates[dates.length - 1].str) barEndCol = dates.length - 1;

        dates.forEach((d, idx) => {
            const isToday = d.str === todayStr;
            const isWeekend = d.day === 0 || d.day === 6;
            let cls = '';
            if (isToday) cls += ' tl-today-col';
            if (isWeekend) cls += ' tl-weekend';

            if (idx === barStartCol && barStartCol >= 0) {
                const span = barEndCol - barStartCol + 1;
                html += `<td class="${cls}" colspan="${span}" style="position:relative;" ondragover="tlDragOver(event)" ondragleave="tlDragLeave(event)" ondrop="tlDrop(event, '${d.str}')">`;
                html += `<div class="tl-bar" style="${cs || 'border-top-color:' + barColor}" draggable="true" ondragstart="tlDragStart(event, '${task.id}')" ondragend="tlDragEnd(event)" onclick="openTaskModal('${task.id}')">`;
                html += `<span class="tl-bar-label">${escapeHtml(task.title)}</span></div></td>`;
            } else if (idx > barStartCol && idx <= barEndCol) {
                // Skip — covered by colspan
            } else {
                html += `<td class="${cls}" ondragover="tlDragOver(event)" ondragleave="tlDragLeave(event)" ondrop="tlDrop(event, '${d.str}')"></td>`;
            }
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';
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
    catSelect.innerHTML = '<option value="">-- None --</option>';
    categories.forEach(c => { catSelect.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`; });
    if (taskId) {
        const task = tasks.find(t => t.id === taskId); if (!task) return;
        titleEl.textContent = 'Edit Task'; idEl.value = task.id; titleInput.value = task.title;
        descInput.value = task.description || ''; startInput.value = task.startDate || '';
        dueInput.value = task.dueDate || ''; catSelect.value = task.categoryId || '';
        priSelect.value = task.priority || 'low'; deleteBtn.style.display = '';
    } else {
        titleEl.textContent = 'Add Task'; idEl.value = ''; titleInput.value = '';
        descInput.value = ''; startInput.value = ''; dueInput.value = '';
        catSelect.value = presetCategoryId || ''; priSelect.value = 'low'; deleteBtn.style.display = 'none';
    }
    overlay.classList.add('show');
    setTimeout(() => titleInput.focus(), 50);
    overlay.onkeydown = function(e) {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') saveTask();
        if (e.key === 'Escape') closeTaskModal();
    };
}

function closeTaskModal() { document.getElementById('taskModalOverlay').classList.remove('show'); }

function saveTask() {
    const id = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const description = document.getElementById('taskDescInput').value.trim();
    const startDate = document.getElementById('taskStartDate').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const categoryId = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;
    if (!title) { document.getElementById('taskTitleInput').focus(); return; }
    if (id) {
        const task = tasks.find(t => t.id === id);
        if (task) { task.title = title; task.description = description; task.startDate = startDate; task.dueDate = dueDate; task.categoryId = categoryId; task.priority = priority; }
    } else {
        tasks.push({ id: generateId(), title, description, startDate, dueDate, categoryId, priority, createdAt: Date.now(), order: tasks.length });
    }
    closeTaskModal(); renderView(); saveToFirebase();
}

function deleteTask() {
    const id = document.getElementById('taskId').value; if (!id) return;
    if (!confirm('Delete this task?')) return;
    const task = tasks.find(t => t.id === id); if (task) task.deleted = true;
    closeTaskModal(); renderView(); saveToFirebase();
}

function deleteTaskDirect(id) {
    if (!confirm('Delete this task?')) return;
    const task = tasks.find(t => t.id === id); if (task) task.deleted = true;
    renderView(); saveToFirebase();
}

function showDeletedTasks() {
    const container = document.getElementById('viewContainer');
    const deleted = tasks.filter(t => t.deleted);
    let html = '<div class="deleted-tasks-view"><div class="deleted-tasks-header">';
    html += '<h3>Deleted Tasks</h3>';
    html += '<button id="btnPermDelete" class="btn-danger" onclick="permanentlyDeleteChecked()" disabled>Delete Permanently</button></div>';
    html += '<div class="task-table-wrapper"><table class="task-table"><thead><tr>';
    html += '<th class="checkbox-col"><input type="checkbox" id="deletedSelectAll" onchange="toggleDeletedSelectAll(this.checked)"></th>';
    html += '<th>Title</th><th>Category</th><th>Priority</th><th>Start Date</th><th>Due Date</th><th class="delete-col"></th></tr></thead><tbody>';
    if (deleted.length === 0) {
        html += '<tr class="empty-row"><td colspan="7">No deleted tasks.</td></tr>';
    } else {
        deleted.forEach(task => {
            const cat = categories.find(c => c.id === task.categoryId);
            const catDot = cat ? `<span class="cat-dot" style="background:${cat.color}"></span>` : '';
            const catName = cat ? cat.name : '';
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            html += '<tr>';
            html += `<td class="checkbox-col"><input type="checkbox" class="deleted-task-cb" data-id="${task.id}" onchange="updatePermDeleteBtn()"></td>`;
            html += `<td>${escapeHtml(task.title)}</td>`;
            html += `<td>${catDot}<span class="cat-name">${escapeHtml(catName)}</span></td>`;
            html += `<td><span class="priority-badge" style="background:${pri.color}">${pri.label}</span></td>`;
            html += `<td>${formatDate(task.startDate)}</td><td>${formatDate(task.dueDate)}</td>`;
            html += `<td class="task-delete-cell"><button class="btn-delete-inline" onclick="restoreTask('${task.id}')" title="Restore">&#8634;</button></td></tr>`;
        });
    }
    html += '</tbody></table></div></div>';
    container.innerHTML = html;
}

function toggleDeletedSelectAll(checked) { document.querySelectorAll('.deleted-task-cb').forEach(cb => { cb.checked = checked; }); updatePermDeleteBtn(); }
function updatePermDeleteBtn() {
    const anyChecked = document.querySelectorAll('.deleted-task-cb:checked').length > 0;
    const btn = document.getElementById('btnPermDelete'); if (btn) btn.disabled = !anyChecked;
    const allCbs = document.querySelectorAll('.deleted-task-cb');
    const selectAll = document.getElementById('deletedSelectAll');
    if (selectAll && allCbs.length > 0) selectAll.checked = document.querySelectorAll('.deleted-task-cb:checked').length === allCbs.length;
}
function permanentlyDeleteChecked() {
    const checkedIds = [...document.querySelectorAll('.deleted-task-cb:checked')].map(cb => cb.dataset.id);
    if (checkedIds.length === 0) return;
    if (!confirm(`Permanently delete ${checkedIds.length} task(s)? This cannot be undone.`)) return;
    tasks = tasks.filter(t => !checkedIds.includes(t.id)); showDeletedTasks(); saveToFirebase();
}
function restoreTask(id) { const task = tasks.find(t => t.id === id); if (task) task.deleted = false; showDeletedTasks(); saveToFirebase(); }

// ── Category Modal ──
function openCategoryModal() { renderCategoryList(); document.getElementById('categoryModalOverlay').classList.add('show'); document.getElementById('newCategoryName').value = ''; document.getElementById('newCategoryColor').value = '#4a90d9'; }
function closeCategoryModal() { document.getElementById('categoryModalOverlay').classList.remove('show'); renderView(); }
function renderCategoryList() {
    const list = document.getElementById('categoryList');
    if (categories.length === 0) { list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px 0;">No categories yet.</p>'; return; }
    list.innerHTML = categories.map(c => `
        <div class="category-item" data-id="${c.id}">
            <input type="color" value="${c.color}" onchange="updateCategory('${c.id}', null, this.value)">
            <input type="text" value="${escapeHtml(c.name)}" onchange="updateCategory('${c.id}', this.value, null)">
            <button class="btn-icon" onclick="deleteCategoryById('${c.id}')" title="Delete">&times;</button>
        </div>`).join('');
}
function addCategory() {
    const nameEl = document.getElementById('newCategoryName'); const colorEl = document.getElementById('newCategoryColor');
    const name = nameEl.value.trim(); if (!name) { nameEl.focus(); return; }
    categories.push({ id: generateId(), name, color: colorEl.value }); nameEl.value = ''; colorEl.value = '#4a90d9';
    renderCategoryList(); saveToFirebase();
}
function updateCategory(id, name, color) { const cat = categories.find(c => c.id === id); if (!cat) return; if (name !== null) cat.name = name; if (color !== null) cat.color = color; saveToFirebase(); }
function deleteCategoryById(id) {
    const cat = categories.find(c => c.id === id); if (!cat) return;
    if (!confirm(`Delete category "${cat.name}"? Tasks in this category will become uncategorized.`)) return;
    categories = categories.filter(c => c.id !== id);
    tasks.forEach(t => { if (t.categoryId === id) t.categoryId = ''; });
    renderCategoryList(); saveToFirebase();
}

// ── Export ──
function exportToExcel() {
    const allTasks = tasks.filter(t => !t.deleted);
    const headers = ['Title', 'Description', 'Category', 'CategoryColor', 'Priority', 'Start Date', 'Due Date', 'Status', 'Created'];
    const rows = [headers];
    allTasks.forEach(task => {
        const cat = categories.find(c => c.id === task.categoryId);
        rows.push([
            task.title || '',
            task.description || '',
            cat ? cat.name : '',
            cat ? cat.color : '',
            task.priority || 'low',
            task.startDate || '',
            task.dueDate || '',
            task.done ? 'Done' : 'Open',
            task.createdAt ? new Date(task.createdAt).toISOString() : ''
        ]);
    });
    let csv = rows.map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'tasks.csv'; a.click(); URL.revokeObjectURL(url);
}

function importFromCSV(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result.replace(/^\uFEFF/, '');
        const rows = parseCSV(text);
        if (rows.length < 2) { alert('No data found in file.'); input.value = ''; return; }
        const headers = rows[0].map(h => h.trim().toLowerCase());
        const colIdx = key => headers.indexOf(key);
        const iTitle = colIdx('title');
        if (iTitle === -1) { alert('CSV must have a "Title" column.'); input.value = ''; return; }
        const iDesc = colIdx('description');
        const iCat = colIdx('category');
        const iCatColor = colIdx('categorycolor');
        const iPri = colIdx('priority');
        const iStart = colIdx('start date');
        const iDue = colIdx('due date');
        const iStatus = colIdx('status');
        const iCreated = colIdx('created');

        let imported = 0;
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            const title = (row[iTitle] || '').trim();
            if (!title) continue;

            // Find or create category
            let categoryId = '';
            const catName = iCat >= 0 ? (row[iCat] || '').trim() : '';
            if (catName) {
                let cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                if (!cat) {
                    const catColor = (iCatColor >= 0 && row[iCatColor]) ? row[iCatColor].trim() : '#4a90d9';
                    cat = { id: generateId(), name: catName, color: catColor };
                    categories.push(cat);
                }
                categoryId = cat.id;
            }

            const priority = iPri >= 0 ? (row[iPri] || 'low').trim().toLowerCase() : 'low';
            const statusVal = iStatus >= 0 ? (row[iStatus] || '').trim().toLowerCase() : '';
            const createdVal = iCreated >= 0 ? (row[iCreated] || '').trim() : '';

            tasks.push({
                id: generateId(),
                title,
                description: iDesc >= 0 ? (row[iDesc] || '').trim() : '',
                categoryId,
                priority: ['low','medium','high'].includes(priority) ? priority : 'low',
                startDate: iStart >= 0 ? (row[iStart] || '').trim() : '',
                dueDate: iDue >= 0 ? (row[iDue] || '').trim() : '',
                done: statusVal === 'done',
                createdAt: createdVal ? new Date(createdVal).getTime() : Date.now(),
                order: tasks.length
            });
            imported++;
        }
        input.value = '';
        if (imported === 0) { alert('No tasks found to import.'); return; }
        renderView();
        saveToFirebase();
        alert(`Imported ${imported} task(s).`);
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const rows = [];
    let i = 0;
    while (i < text.length) {
        const row = [];
        while (i < text.length) {
            let val = '';
            if (text[i] === '"') {
                i++;
                while (i < text.length) {
                    if (text[i] === '"' && text[i + 1] === '"') { val += '"'; i += 2; }
                    else if (text[i] === '"') { i++; break; }
                    else { val += text[i]; i++; }
                }
                if (text[i] === ',') i++;
                else if (text[i] === '\r' || text[i] === '\n') { /* end of row */ }
            } else {
                const next = text.indexOf(',', i);
                const nl = text.indexOf('\n', i);
                const cr = text.indexOf('\r', i);
                let end = text.length;
                if (next >= 0 && (nl < 0 || next < nl) && (cr < 0 || next < cr)) {
                    val = text.substring(i, next);
                    i = next + 1;
                } else {
                    end = nl >= 0 ? nl : text.length;
                    if (cr >= 0 && cr < end) end = cr;
                    val = text.substring(i, end);
                    i = end;
                }
            }
            row.push(val);
            if (i >= text.length || text[i] === '\n' || text[i] === '\r') break;
        }
        rows.push(row);
        if (text[i] === '\r') i++;
        if (text[i] === '\n') i++;
    }
    return rows;
}

// ══════════════════════════════════════════
// ── Theme / Skins Engine ──
// ══════════════════════════════════════════

const THEME_PRESETS = {
    default: {
        name: 'Default', swatch: '#4a90d9',
        colors: { primary:'#4a90d9', danger:'#d9534f', success:'#5cb85c', bg:'#f5f6fa', toolbarBg:'#f3f3f3', surface:'#ffffff', text:'#333333', textLight:'#888888', border:'#d0d0d0' },
        typography: { fontFamily:'Segoe UI', fontSize: 14 },
        layout: { radius: 6 }
    },
    dark: {
        name: 'Dark', swatch: '#1e1e2e',
        colors: { primary:'#5b9bd5', danger:'#e06c75', success:'#98c379', bg:'#1e1e2e', toolbarBg:'#181825', surface:'#2a2a3c', text:'#cdd6f4', textLight:'#6c7086', border:'#45475a' },
        typography: { fontFamily:'Segoe UI', fontSize: 14 },
        layout: { radius: 6 }
    },
    ocean: {
        name: 'Ocean', swatch: '#0ea5e9',
        colors: { primary:'#0ea5e9', danger:'#f43f5e', success:'#10b981', bg:'#ecfeff', toolbarBg:'#e0f2fe', surface:'#ffffff', text:'#164e63', textLight:'#67a8b8', border:'#a5d8e6' },
        typography: { fontFamily:'Segoe UI', fontSize: 14 },
        layout: { radius: 8 }
    },
    forest: {
        name: 'Forest', swatch: '#4a7c59',
        colors: { primary:'#4a7c59', danger:'#c0392b', success:'#27ae60', bg:'#f5f0e8', toolbarBg:'#e8e0d0', surface:'#faf8f4', text:'#2d3e2f', textLight:'#7a8a6e', border:'#c4b99a' },
        typography: { fontFamily:'Georgia', fontSize: 14 },
        layout: { radius: 4 }
    },
    sunset: {
        name: 'Sunset', swatch: '#e67e22',
        colors: { primary:'#e67e22', danger:'#e74c3c', success:'#2ecc71', bg:'#fdf6ee', toolbarBg:'#fce8d0', surface:'#ffffff', text:'#4a2c0a', textLight:'#a07850', border:'#e0c8a8' },
        typography: { fontFamily:'Segoe UI', fontSize: 14 },
        layout: { radius: 8 }
    },
    rose: {
        name: 'Rose', swatch: '#e91e8c',
        colors: { primary:'#e91e8c', danger:'#dc2626', success:'#16a34a', bg:'#fdf2f8', toolbarBg:'#fce7f3', surface:'#ffffff', text:'#4a1942', textLight:'#a855a0', border:'#e8b4d8' },
        typography: { fontFamily:'Segoe UI', fontSize: 14 },
        layout: { radius: 10 }
    },
    midnight: {
        name: 'Midnight', swatch: '#0f0f1a',
        colors: { primary:'#818cf8', danger:'#fb7185', success:'#34d399', bg:'#0f0f1a', toolbarBg:'#1a1a2e', surface:'#1e1e32', text:'#e2e8f0', textLight:'#64748b', border:'#334155' },
        typography: { fontFamily:'Segoe UI', fontSize: 14 },
        layout: { radius: 8 }
    },
    highContrast: {
        name: 'Hi-Contrast', swatch: '#0066cc',
        colors: { primary:'#0066cc', danger:'#cc0000', success:'#008800', bg:'#ffffff', toolbarBg:'#f0f0f0', surface:'#ffffff', text:'#000000', textLight:'#555555', border:'#000000' },
        typography: { fontFamily:'Segoe UI', fontSize: 16 },
        layout: { radius: 4 }
    }
};

function getDefaultTheme() {
    return JSON.parse(JSON.stringify(THEME_PRESETS.default));
}

function hexToHSL(hex) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0,2),16)/255;
    const g = parseInt(hex.substring(2,4),16)/255;
    const b = parseInt(hex.substring(4,6),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d/(2-max-min) : d/(max+min);
        if (max === r) h = ((g-b)/d + (g < b ? 6 : 0))/6;
        else if (max === g) h = ((b-r)/d + 2)/6;
        else h = ((r-g)/d + 4)/6;
    }
    return [h*360, s*100, l*100];
}

function hslToHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q-p)*6*t; if (t < 1/2) return q; if (t < 2/3) return p + (q-p)*(2/3-t)*6; return p; };
        const q = l < 0.5 ? l*(1+s) : l+s-l*s;
        const p = 2*l - q;
        r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
    }
    const toHex = x => { const hex = Math.round(x*255).toString(16); return hex.length === 1 ? '0' + hex : hex; };
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function darkenColor(hex, pct) {
    const [h, s, l] = hexToHSL(hex);
    return hslToHex(h, s, Math.max(0, l - pct));
}

function lightenColor(hex, pct) {
    const [h, s, l] = hexToHSL(hex);
    return hslToHex(h, s, Math.min(100, l + pct));
}

function getFontStack(name) {
    const stacks = {
        'Segoe UI': "'Segoe UI', sans-serif",
        'Inter': "'Inter', sans-serif",
        'Roboto': "'Roboto', sans-serif",
        'Open Sans': "'Open Sans', sans-serif",
        'Lato': "'Lato', sans-serif",
        'Georgia': "Georgia, serif",
        'Monospace': "'Courier New', monospace",
        'System UI': "system-ui, sans-serif"
    };
    return stacks[name] || "'Segoe UI', sans-serif";
}

function loadFontIfNeeded(name) {
    const webFonts = { 'Inter': 'Inter:wght@400;500;600;700', 'Roboto': 'Roboto:wght@400;500;700', 'Open Sans': 'Open+Sans:wght@400;600;700', 'Lato': 'Lato:wght@400;700' };
    const link = document.getElementById('googleFontsLink');
    if (webFonts[name]) link.href = 'https://fonts.googleapis.com/css2?family=' + webFonts[name] + '&display=swap';
    else link.href = '';
}

function applyTheme(theme) {
    if (!theme) return;
    const r = document.documentElement.style;
    r.setProperty('--primary', theme.colors.primary);
    r.setProperty('--primary-hover', darkenColor(theme.colors.primary, 12));
    r.setProperty('--danger', theme.colors.danger);
    r.setProperty('--danger-hover', darkenColor(theme.colors.danger, 12));
    r.setProperty('--success', theme.colors.success);
    r.setProperty('--bg', theme.colors.bg);
    r.setProperty('--toolbar-bg', theme.colors.toolbarBg);
    r.setProperty('--surface', theme.colors.surface);
    r.setProperty('--text', theme.colors.text);
    r.setProperty('--text-light', theme.colors.textLight);
    r.setProperty('--border', theme.colors.border);
    r.setProperty('--surface-alt', darkenColor(theme.colors.surface, 4));
    r.setProperty('--surface-hover', darkenColor(theme.colors.surface, 2));
    r.setProperty('--font-family', getFontStack(theme.typography.fontFamily));
    r.setProperty('--font-size-base', theme.typography.fontSize + 'px');
    r.setProperty('--radius', theme.layout.radius + 'px');
    loadFontIfNeeded(theme.typography.fontFamily);
}

// ── Skins Panel ──
let skinsSections = { presets: true, colors: false, typography: false, layout: false };

function toggleSkinsPanel() {
    const toolbar = document.getElementById('toolbar');
    if (toolbar.classList.contains('skins-open')) {
        toolbar.classList.remove('skins-open');
    } else {
        toolbar.classList.add('skins-open');
        renderSkinsPanel();
    }
}

function renderSkinsPanel() {
    const panel = document.getElementById('skinsPanel');
    if (!themeSettings) themeSettings = getDefaultTheme();
    const ts = themeSettings;
    let html = '';
    html += '<button class="skins-back" onclick="toggleSkinsPanel()">&larr; Back</button>';
    html += '<div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px;">Skins / Format</div>';

    // Presets
    html += buildSkinsSection('presets', 'Presets', () => {
        let h = '<div class="skins-preset-grid">';
        Object.keys(THEME_PRESETS).forEach(key => {
            const p = THEME_PRESETS[key];
            const active = ts.name === p.name ? ' active' : '';
            h += `<div class="skins-preset${active}" style="background:${p.swatch}" onclick="applyPreset('${key}')" title="${p.name}"><div class="skins-preset-name">${p.name}</div></div>`;
        });
        h += '</div>';
        return h;
    });

    // Colors
    html += buildSkinsSection('colors', 'Colors', () => {
        const colorControls = [
            ['Primary', 'primary'], ['Danger', 'danger'], ['Success', 'success'],
            ['Background', 'bg'], ['Sidebar', 'toolbarBg'], ['Surface', 'surface'],
            ['Text', 'text'], ['Muted Text', 'textLight'], ['Border', 'border']
        ];
        return colorControls.map(([label, key]) =>
            `<div class="skins-control"><div class="skins-control-row">
                <input type="color" value="${ts.colors[key]}" oninput="updateThemeColor('${key}', this.value)">
                <span class="skins-control-label">${label}</span>
            </div></div>`
        ).join('');
    });

    // Typography
    html += buildSkinsSection('typography', 'Typography', () => {
        const fonts = ['Segoe UI','Inter','Roboto','Open Sans','Lato','Georgia','Monospace','System UI'];
        let h = '<div class="skins-control"><span class="skins-control-label">Font Family</span>';
        h += '<div class="skins-control-row"><select onchange="updateThemeTypo(\'fontFamily\', this.value)">';
        fonts.forEach(f => { h += `<option value="${f}"${ts.typography.fontFamily === f ? ' selected' : ''}>${f}</option>`; });
        h += '</select></div></div>';
        h += `<div class="skins-control"><span class="skins-control-label">Font Size</span>
            <div class="skins-control-row"><input type="range" min="11" max="18" value="${ts.typography.fontSize}" oninput="updateThemeTypo('fontSize', +this.value);this.nextElementSibling.textContent=this.value+'px'"><span class="range-val">${ts.typography.fontSize}px</span></div></div>`;
        return h;
    });

    // Layout
    html += buildSkinsSection('layout', 'Layout', () => {
        return `<div class="skins-control"><span class="skins-control-label">Border Radius</span>
            <div class="skins-control-row"><input type="range" min="0" max="16" value="${ts.layout.radius}" oninput="updateThemeLayout('radius', +this.value);this.nextElementSibling.textContent=this.value+'px'"><span class="range-val">${ts.layout.radius}px</span></div></div>`;
    });

    html += '<button class="skins-reset" onclick="resetTheme()">Reset to Default</button>';
    panel.innerHTML = html;
}

function buildSkinsSection(key, title, contentFn) {
    const open = skinsSections[key];
    let html = '<div class="skins-section">';
    html += `<div class="skins-section-header${open ? ' open' : ''}" onclick="toggleSkinsSection('${key}')"><span>${title}</span><span class="chevron">&#9654;</span></div>`;
    html += `<div class="skins-section-body${open ? ' open' : ''}">`;
    html += contentFn();
    html += '</div></div>';
    return html;
}

function toggleSkinsSection(key) {
    skinsSections[key] = !skinsSections[key];
    renderSkinsPanel();
}

function applyPreset(key) {
    themeSettings = JSON.parse(JSON.stringify(THEME_PRESETS[key]));
    applyTheme(themeSettings);
    renderSkinsPanel();
    saveThemeDebounced();
}

function updateThemeColor(key, value) {
    themeSettings.colors[key] = value;
    themeSettings.name = null;
    applyTheme(themeSettings);
    saveThemeDebounced();
}

function updateThemeTypo(key, value) {
    themeSettings.typography[key] = value;
    themeSettings.name = null;
    applyTheme(themeSettings);
    saveThemeDebounced();
}

function updateThemeLayout(key, value) {
    themeSettings.layout[key] = value;
    themeSettings.name = null;
    applyTheme(themeSettings);
    saveThemeDebounced();
}

function resetTheme() {
    if (!confirm('Reset to default theme?')) return;
    applyPreset('default');
}

// ── Helpers ──
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isLightColor(hex) {
    if (!hex) return true;
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0,2),16);
    const g = parseInt(hex.substring(2,4),16);
    const b = parseInt(hex.substring(4,6),16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55;
}

function catStyle(task) {
    const cat = categories.find(c => c.id === task.categoryId);
    if (!cat) return '';
    const textColor = isLightColor(cat.color) ? '#000' : '#fff';
    return `background:${cat.color};color:${textColor};`;
}

// ── Start ──
initApp();

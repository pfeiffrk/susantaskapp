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

function takeSnapshot() {
    undoStack.push({
        tasks: JSON.stringify(tasks),
        categories: JSON.stringify(categories)
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
        tasks: JSON.stringify(tasks),
        categories: JSON.stringify(categories)
    });
    const snap = undoStack.pop();
    tasks = JSON.parse(snap.tasks);
    categories = JSON.parse(snap.categories);
    updateUndoRedoButtons();
    renderView();
    skipSnapshot = true;
    saveToFirebase();
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
        tasks: JSON.stringify(tasks),
        categories: JSON.stringify(categories)
    });
    const snap = redoStack.pop();
    tasks = JSON.parse(snap.tasks);
    categories = JSON.parse(snap.categories);
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
    if (!skipSnapshot) takeSnapshot();
    skipSnapshot = false;
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Saving...';
    userRef().update({
        taskapp_tasks: JSON.stringify(tasks),
        taskapp_categories: JSON.stringify(categories),
        taskapp_settings: JSON.stringify(settings),
        taskapp_lastModified: Date.now()
    }).then(() => {
        statusEl.textContent = 'Saved';
        setTimeout(() => { if (statusEl.textContent === 'Saved') statusEl.textContent = ''; }, 3000);
    }).catch(e => {
        console.warn('Save failed:', e);
        statusEl.textContent = 'Save error';
    });
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
                if (currentView === 'deleted') settings.view = 'deleted';
            } catch (e) {
                settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
            }
            if (categories.length === 0) categories = [...DEFAULT_CATEGORIES];
        } else {
            // First time user — initialize with defaults
            tasks = [];
            categories = [...DEFAULT_CATEGORIES];
            settings = { view: 'table', sortField: 'dueDate', sortDir: 'asc' };
            saveToFirebase();
        }
        statusEl.textContent = '';
        updateViewToggle();
        renderView();
    });
}

function stopDataListener() {
    if (dataListener && firebaseUser) {
        userRef().off('value', dataListener);
    }
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
            tasks = [];
            categories = [];
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

function firebaseSignOut() {
    if (!confirm('Sign out?')) return;
    stopDataListener();
    firebase.auth().signOut();
}

// ── App Init ──
function initApp() {
    initFirebase();
}

// ── Show/Hide Done ──
let showDone = true;

function toggleShowDone(checked) {
    showDone = checked;
    renderView();
}

function getActiveTasks() {
    return tasks.filter(t => !t.deleted && (showDone || !t.done));
}

// ── View Switching ──
function switchView(view) {
    settings.view = view;
    updateViewToggle();
    renderView();
    if (view !== 'deleted') saveToFirebase();
}

function updateViewToggle() {
    document.getElementById('btnTableView').classList.toggle('active', settings.view === 'table');
    document.getElementById('btnCardView').classList.toggle('active', settings.view === 'cards');
    document.getElementById('btnWeekView').classList.toggle('active', settings.view === 'week');
    document.getElementById('btnMonthView').classList.toggle('active', settings.view === 'month');
    document.getElementById('btnDeletedView').classList.toggle('active', settings.view === 'deleted');
    document.getElementById('showDoneToggle').style.display = settings.view === 'deleted' ? 'none' : '';
}

// ── Rendering ──
function renderView() {
    if (settings.view === 'deleted') {
        showDeletedTasks();
    } else if (settings.view === 'cards') {
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
    html += '<th></th>';
    html += '<th class="delete-col"></th>';
    html += '</tr></thead>';
    html += '<tbody>';

    if (sorted.length === 0) {
        html += '<tr class="empty-row"><td colspan="7">No tasks yet. Click "+ Add Task" to get started.</td></tr>';
    } else {
        sorted.forEach(task => {
            const cat = categories.find(c => c.id === task.categoryId);
            const catDot = cat ? `<span class="cat-dot" style="background:${cat.color}"></span>` : '';
            const catName = cat ? cat.name : '';
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            const doneClass = task.done ? ' class="task-done"' : '';
            html += `<tr${doneClass} onclick="openTaskModal('${task.id}')">`;
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
    if (settings.sortField === field) {
        settings.sortDir = settings.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        settings.sortField = field;
        settings.sortDir = 'asc';
    }
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
        const colTasks = getActiveTasks().filter(t => (t.categoryId || '') === col.id);
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
            const doneClass = task.done ? ' task-done' : '';
            html += `<div class="task-card${doneClass}" style="border-top-color:${col.color}" onclick="openTaskModal('${task.id}')" draggable="false">`;
            html += `<button class="btn-delete-card" onclick="event.stopPropagation();deleteTaskDirect('${task.id}')" title="Delete">&times;</button>`;
            const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
            html += `<div class="card-title">${escapeHtml(task.title)} <span class="priority-badge small" style="background:${pri.color}">${pri.label}</span> <a class="done-link" href="#" onclick="event.stopPropagation();toggleTaskDone(event, '${task.id}')">${task.done ? 'Open' : 'Done'}</a></div>`;
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
            renderCardView();
            saveToFirebase();
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
        renderView();
        saveToFirebase();
    }
    calendarDragTaskId = null;
}

function openTaskModalWithDate(dateStr) {
    openTaskModal(null);
    setTimeout(() => {
        document.getElementById('taskStartDate').value = dateStr;
    }, 10);
}

function toggleTaskDone(e, taskId) {
    e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    renderView();
    saveToFirebase();
}

function renderCalendarTask(task) {
    const cat = categories.find(c => c.id === task.categoryId);
    const pri = PRIORITY_LEVELS.find(p => p.value === (task.priority || 'low')) || PRIORITY_LEVELS[0];
    const catColor = cat ? cat.color : '#999';
    const doneClass = task.done ? ' task-done' : '';
    let html = `<div class="calendar-task${doneClass}" draggable="true" ondragstart="calendarDragStart(event, '${task.id}')" onclick="openTaskModal('${task.id}')" style="border-left-color:${catColor}">`;
    html += `<span class="calendar-task-title">${escapeHtml(task.title)}</span>`;
    html += `<span class="priority-badge small" style="background:${pri.color}">${pri.label}</span>`;
    html += `<a class="calendar-task-done-link" href="#" onclick="toggleTaskDone(event, '${task.id}')">${task.done ? 'Open' : 'Done'}</a>`;
    html += '</div>';
    return html;
}

function renderUnscheduledSection() {
    const unscheduled = getActiveTasks().filter(t => !t.startDate);
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
        const dayTasks = getActiveTasks().filter(t => t.startDate === dateStr);

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
            const dayTasks = getActiveTasks().filter(t => t.startDate === dateStr);

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
    renderView();
    saveToFirebase();
}

function deleteTask() {
    const id = document.getElementById('taskId').value;
    if (!id) return;
    if (!confirm('Delete this task?')) return;
    const task = tasks.find(t => t.id === id);
    if (task) task.deleted = true;
    closeTaskModal();
    renderView();
    saveToFirebase();
}

function deleteTaskDirect(id) {
    if (!confirm('Delete this task?')) return;
    const task = tasks.find(t => t.id === id);
    if (task) task.deleted = true;
    renderView();
    saveToFirebase();
}

function showDeletedTasks() {
    const container = document.getElementById('viewContainer');
    const deleted = tasks.filter(t => t.deleted);

    let html = '<div class="deleted-tasks-view">';
    html += '<div class="deleted-tasks-header">';
    html += '<h3>Deleted Tasks</h3>';
    html += '<button id="btnPermDelete" class="btn-danger" onclick="permanentlyDeleteChecked()" disabled>Delete Permanently</button>';
    html += '</div>';
    html += '<div class="task-table-wrapper"><table class="task-table">';
    html += '<thead><tr>';
    html += '<th class="checkbox-col"><input type="checkbox" id="deletedSelectAll" onchange="toggleDeletedSelectAll(this.checked)"></th>';
    html += '<th>Title</th><th>Category</th><th>Priority</th><th>Start Date</th><th>Due Date</th><th class="delete-col"></th></tr></thead>';
    html += '<tbody>';

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
            html += `<td>${formatDate(task.startDate)}</td>`;
            html += `<td>${formatDate(task.dueDate)}</td>`;
            html += `<td class="task-delete-cell"><button class="btn-delete-inline" onclick="restoreTask('${task.id}')" title="Restore">&#8634;</button></td>`;
            html += '</tr>';
        });
    }

    html += '</tbody></table></div></div>';
    container.innerHTML = html;
}

function toggleDeletedSelectAll(checked) {
    document.querySelectorAll('.deleted-task-cb').forEach(cb => { cb.checked = checked; });
    updatePermDeleteBtn();
}

function updatePermDeleteBtn() {
    const anyChecked = document.querySelectorAll('.deleted-task-cb:checked').length > 0;
    const btn = document.getElementById('btnPermDelete');
    if (btn) btn.disabled = !anyChecked;
    const allCbs = document.querySelectorAll('.deleted-task-cb');
    const selectAll = document.getElementById('deletedSelectAll');
    if (selectAll && allCbs.length > 0) {
        selectAll.checked = document.querySelectorAll('.deleted-task-cb:checked').length === allCbs.length;
    }
}

function permanentlyDeleteChecked() {
    const checkedIds = [...document.querySelectorAll('.deleted-task-cb:checked')].map(cb => cb.dataset.id);
    if (checkedIds.length === 0) return;
    if (!confirm(`Permanently delete ${checkedIds.length} task(s)? This cannot be undone.`)) return;
    tasks = tasks.filter(t => !checkedIds.includes(t.id));
    showDeletedTasks();
    saveToFirebase();
}

function restoreTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) task.deleted = false;
    showDeletedTasks();
    saveToFirebase();
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
    renderCategoryList();
    saveToFirebase();
}

function updateCategory(id, name, color) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (name !== null) cat.name = name;
    if (color !== null) cat.color = color;
    saveToFirebase();
}

function deleteCategoryById(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (!confirm(`Delete category "${cat.name}"? Tasks in this category will become uncategorized.`)) return;
    categories = categories.filter(c => c.id !== id);
    // Clear categoryId from tasks that used this category
    tasks.forEach(t => { if (t.categoryId === id) t.categoryId = ''; });
    renderCategoryList();
    saveToFirebase();
}

// ── Export ──
function exportToExcel() {
    const activeTasks = tasks.filter(t => !t.deleted);
    const rows = [['Title', 'Description', 'Category', 'Priority', 'Start Date', 'Due Date', 'Status']];

    activeTasks.forEach(task => {
        const cat = categories.find(c => c.id === task.categoryId);
        rows.push([
            task.title || '',
            task.description || '',
            cat ? cat.name : '',
            (task.priority || 'low').charAt(0).toUpperCase() + (task.priority || 'low').slice(1),
            task.startDate || '',
            task.dueDate || '',
            task.done ? 'Done' : 'Open'
        ]);
    });

    let csv = rows.map(row =>
        row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tasks.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Helpers ──
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Start ──
initApp();

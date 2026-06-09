/* ═══════════════════════════════════════════════════════════
   BUDGETO – app.js
   Full Google Sheets–connected Personal Finance Dashboard
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────
const STATE = {
  apiUrl: '',
  currentPage: 'dashboard',
  analyticsMonth: '',
  analyticsPeriod: '6m',
  txSortBy: 'date',
  txSortDir: 'desc',
  txFilter: 'all',
  txSearch: '',
  // Data
  transactions: [],
  goals: [],
  categories: [],
  settings: {},
  dashData: null,
  analyticsData: null,
  // Edit targets
  editTxId: null,
  editGoalId: null,
  detailTxId: null,
  detailGoalId: null,
  newCatType: 'expense',
  selectedGoalIcon: 'savings',
  selectedTxCategory: '',
  selectedTxType: 'expense',
  // Charts
  incomeExpenseChart: null,
  dailyChart: null,
  categoryChart: null,
};

// Currency registry
const CURRENCIES = [
  { code: 'IDR', symbol: 'Rp', name: 'Rupiah Indonesia' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
];

const CAT_ICONS = {
  'Food & Dining': 'restaurant', 'Transport': 'directions_car', 'Shopping': 'shopping_bag',
  'Entertainment': 'movie', 'Healthcare': 'local_hospital', 'Utilities': 'bolt',
  'Coffee': 'coffee', 'Groceries': 'local_grocery_store', 'Salary': 'payments',
  'Freelance': 'work', 'Investment': 'trending_up', 'Gift': 'card_giftcard',
  'default': 'label'
};

const CHART_COLORS = [
  '#4be277', '#ffb4ae', '#bcc7de', '#60a5fa', '#f59e0b', '#c084fc', '#34d399', '#f97316'
];

// ─── UTILITIES ──────────────────────────────────────────────
function fmt(amount, sym) {
  const s = sym || STATE.settings.currencySymbol || 'Rp';
  const n = parseFloat(amount) || 0;
  const abs = Math.abs(n);
  if (['Rp', '₩', '¥'].includes(s)) {
    return s + Math.round(abs).toLocaleString('id-ID');
  }
  return s + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Pastikan nilai selalu string — antisipasi Date object dari Sheets
function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val);
}

function fmtSigned(amount, type) {
  const s = fmt(Math.abs(amount));
  return type === 'income' ? '+' + s : '-' + s;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  // Jika sudah Date object, langsung pakai
  if (dateStr instanceof Date) return dateStr.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
  const s = String(dateStr);
  if (!s || s === 'Invalid Date') return '';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMonth(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function currentMonth() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function daysLeft(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  return Math.ceil(diff / 86400000);
}

function getCatIcon(catName) {
  return CAT_ICONS[catName] || CAT_ICONS['default'];
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function confirm_(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok-btn').onclick = () => { closeModal('confirm-modal'); cb(); };
  openModal('confirm-modal');
}

// ─── API ─────────────────────────────────────────────────────
async function apiGet(params) {
  const url = new URL(STATE.apiUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  let res;
  try {
    res = await fetch(url.toString(), { redirect: 'follow' });
  } catch (e) {
    throw new Error('Tidak dapat terhubung. Periksa URL dan koneksi internet. (' + e.message + ')');
  }
  let data;
  try {
    const text = await res.text();
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Response bukan JSON. Pastikan Web App di-deploy dengan akses "Anyone".');
  }
  if (!data.ok) throw new Error(data.error || 'API error');
  return data.data;
}

async function apiPost(body) {
  let res;
  try {
    res = await fetch(STATE.apiUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Tidak dapat terhubung: ' + e.message);
  }
  let data;
  try {
    const text = await res.text();
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Response bukan JSON. Cek konfigurasi Apps Script.');
  }
  if (!data.ok) throw new Error(data.error || 'API error');
  return data.data;
}

// ─── INIT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Load saved URL
  const savedUrl = localStorage.getItem('budgeto_api_url');
  if (savedUrl) {
    STATE.apiUrl = savedUrl;
    initApp();
  } else {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }

  // Setup modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Connect button
  document.getElementById('connect-btn').addEventListener('click', async () => {
    const url = document.getElementById('apps-script-url').value.trim();
    if (!url) { showToast('Please enter a URL'); return; }
    STATE.apiUrl = url;
    localStorage.setItem('budgeto_api_url', url);
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-msg').textContent = 'Menginisialisasi spreadsheet…';
    // init dulu - kalau gagal tetap lanjut, mungkin sudah pernah di-init
    try { await apiGet({ action: 'init' }); } catch (e) { console.warn('init:', e.message); }
    initApp();
  });

  // Navigation
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // FAB
  document.getElementById('fab').addEventListener('click', () => openTxModal('expense'));

  // Dashboard quick actions
  document.getElementById('quick-income-btn').addEventListener('click', () => openTxModal('income'));
  document.getElementById('quick-expense-btn').addEventListener('click', () => openTxModal('expense'));

  // Transaction search
  let searchTimer;
  document.getElementById('tx-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      STATE.txSearch = e.target.value;
      renderTransactions();
    }, 300);
  });

  // Transaction filter pills
  document.getElementById('tx-filters').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-filter]');
    if (!pill) return;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    STATE.txFilter = pill.dataset.filter;
    renderTransactions();
  });

  // Sort button
  document.getElementById('tx-sort-btn').addEventListener('click', () => {
    STATE.txSortDir = STATE.txSortDir === 'desc' ? 'asc' : 'desc';
    renderTransactions();
    showToast('Sorted ' + (STATE.txSortDir === 'desc' ? 'newest first' : 'oldest first'));
  });

  // Transaction modal type toggle
  document.getElementById('tx-type-expense').addEventListener('click', () => setTxType('expense'));
  document.getElementById('tx-type-income').addEventListener('click', () => setTxType('income'));

  // Transaction save
  document.getElementById('tx-save-btn').addEventListener('click', saveTx);

  // Goal save
  document.getElementById('goal-save-btn').addEventListener('click', saveGoal);

  // Goal icon grid
  document.getElementById('goal-icon-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    document.querySelectorAll('.icon-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.selectedGoalIcon = btn.dataset.icon;
  });

  // Analytics month nav
  STATE.analyticsMonth = currentMonth();
  document.getElementById('analytics-prev-month').addEventListener('click', () => {
    const [y, m] = STATE.analyticsMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    STATE.analyticsMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    loadAnalytics();
  });
  document.getElementById('analytics-next-month').addEventListener('click', () => {
    const [y, m] = STATE.analyticsMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    STATE.analyticsMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    loadAnalytics();
  });

  // Analytics period tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.analyticsPeriod = btn.dataset.period;
      renderIncomeExpenseChart();
    });
  });

  // Settings rows
  document.getElementById('currency-row').addEventListener('click', openCurrencyModal);
  document.getElementById('notif-toggle').addEventListener('change', (e) => {
    apiPost({ action: 'updateSetting', key: 'notifications', value: String(e.target.checked) });
  });
  document.getElementById('theme-toggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    document.getElementById('theme-display').textContent = e.target.checked ? 'Dark' : 'Light';
    apiPost({ action: 'updateSetting', key: 'theme', value: theme });
    showToast('Theme: ' + theme + ' (full support coming soon)');
  });
  document.getElementById('manage-categories-row').addEventListener('click', openCategoriesModal);
  document.getElementById('export-row').addEventListener('click', exportCSV);
  document.getElementById('backup-row').addEventListener('click', () => showToast('Data is automatically synced to Google Sheets ✓'));
  document.getElementById('reset-row').addEventListener('click', () => {
    confirm_('Reset All Data', 'This will permanently delete all transactions and savings goals. This cannot be undone.', async () => {
      try {
        await apiPost({ action: 'resetData' });
        await loadAll();
        showToast('All data has been reset.');
      } catch (e) { showToast('Error: ' + e.message); }
    });
  });
  document.getElementById('edit-profile-btn').addEventListener('click', openProfileModal);

  // Profile save
  document.getElementById('profile-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    if (!name) { showToast('Name is required'); return; }
    try {
      await apiPost({ action: 'updateSetting', key: 'userName', value: name });
      await apiPost({ action: 'updateSetting', key: 'userEmail', value: email });
      STATE.settings.userName = name;
      STATE.settings.userEmail = email;
      updateProfileUI();
      closeModal('profile-modal');
      showToast('Profile updated!');
    } catch (e) { showToast('Error: ' + e.message); }
  });

  // New category type toggle
  document.getElementById('new-cat-expense').addEventListener('click', () => {
    STATE.newCatType = 'expense';
    document.getElementById('new-cat-expense').classList.add('expense-active');
    document.getElementById('new-cat-income').classList.remove('income-active');
  });
  document.getElementById('new-cat-income').addEventListener('click', () => {
    STATE.newCatType = 'income';
    document.getElementById('new-cat-income').classList.add('income-active');
    document.getElementById('new-cat-expense').classList.remove('expense-active');
  });

  // Add category
  document.getElementById('add-cat-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) { showToast('Category name required'); return; }
    try {
      const cat = await apiPost({ action: 'createCategory', data: { categoryName: name, categoryType: STATE.newCatType, icon: getCatIcon(name) } });
      STATE.categories.push(cat);
      document.getElementById('new-cat-name').value = '';
      renderCategoriesModal();
      showToast('Category added!');
    } catch (e) { showToast('Error: ' + e.message); }
  });

  // TX detail buttons
  document.getElementById('tx-detail-edit').addEventListener('click', () => {
    const tx = STATE.transactions.find(t => t.id === STATE.detailTxId);
    if (tx) { closeModal('tx-detail-modal'); openTxModal(tx.type, tx); }
  });
  document.getElementById('tx-detail-delete').addEventListener('click', () => {
    confirm_('Delete Transaction', 'Are you sure you want to delete this transaction?', async () => {
      try {
        await apiPost({ action: 'deleteTransaction', id: STATE.detailTxId });
        STATE.transactions = STATE.transactions.filter(t => t.id !== STATE.detailTxId);
        closeModal('tx-detail-modal');
        renderTransactions();
        showToast('Transaction deleted.');
      } catch (e) { showToast('Error: ' + e.message); }
    });
  });

  // Goal detail buttons
  document.getElementById('goal-detail-edit').addEventListener('click', () => {
    const g = STATE.goals.find(g => g.id === STATE.detailGoalId);
    if (g) { closeModal('goal-detail-modal'); openGoalModal(g); }
  });
  document.getElementById('goal-detail-delete').addEventListener('click', () => {
    confirm_('Delete Goal', 'Are you sure you want to delete this goal?', async () => {
      try {
        await apiPost({ action: 'deleteGoal', id: STATE.detailGoalId });
        STATE.goals = STATE.goals.filter(g => g.id !== STATE.detailGoalId);
        closeModal('goal-detail-modal');
        renderGoals();
        showToast('Goal deleted.');
      } catch (e) { showToast('Error: ' + e.message); }
    });
  });

  // Goals FAB equivalent (add goal button at bottom of goals page)
  // Handled via FAB context in navigateTo
});

async function initApp() {
  document.getElementById('loading-msg').textContent = 'Memuat data kamu…';
  try {
    await loadAll();
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('main-header').classList.remove('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('bottom-nav').classList.remove('hidden');
    document.getElementById('fab').classList.remove('hidden');
    navigateTo('dashboard');
  } catch (e) {
    const msg = e.message || 'Koneksi gagal.';
    document.getElementById('loading-msg').textContent = '❌ ' + msg;
    // Tampilkan tombol retry + reset
    const screen = document.getElementById('loading-screen');
    const existing = screen.querySelector('.retry-btns');
    if (!existing) {
      const div = document.createElement('div');
      div.className = 'retry-btns';
      div.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:16px;';
      div.innerHTML = `
        <button onclick="initApp()" style="padding:12px 24px;background:#4be277;color:#003915;border:none;border-radius:12px;font-weight:700;cursor:pointer;font-size:14px;">
          🔄 Coba Lagi
        </button>
        <button onclick="resetSetup()" style="padding:10px 24px;background:transparent;color:#bccbb9;border:1px solid #2d3449;border-radius:12px;font-weight:600;cursor:pointer;font-size:13px;">
          Ganti URL
        </button>`;
      screen.appendChild(div);
    }
  }
}

function resetSetup() {
  localStorage.removeItem('budgeto_api_url');
  STATE.apiUrl = '';
  document.getElementById('loading-screen').classList.add('hidden');
  const btns = document.getElementById('loading-screen').querySelector('.retry-btns');
  if (btns) btns.remove();
  document.getElementById('apps-script-url').value = '';
  document.getElementById('setup-screen').classList.remove('hidden');
}

async function loadAll() {
  const [dash, cats, settings] = await Promise.all([
    apiGet({ action: 'getDashboardData' }),
    apiGet({ action: 'getCategories' }),
    apiGet({ action: 'getSettings' }),
  ]);
  STATE.dashData = dash;
  STATE.transactions = dash.recentTransactions || [];
  STATE.goals = [];
  STATE.categories = cats;
  STATE.settings = settings;
  updateProfileUI();
  renderDashboard();
}

// ─── NAVIGATION ──────────────────────────────────────────────
function navigateTo(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  // Update FAB behavior
  const fab = document.getElementById('fab');
  if (page === 'goals') {
    fab.title = 'Create Goal';
    fab.onclick = () => openGoalModal(null);
  } else {
    fab.title = 'Add Transaction';
    fab.onclick = () => openTxModal('expense');
  }

  // Lazy load pages
  if (page === 'transactions' && STATE.transactions.length === 0) loadTransactions();
  if (page === 'transactions') renderTransactions();
  if (page === 'analytics') loadAnalytics();
  if (page === 'goals') loadGoals();
  if (page === 'settings') renderSettings();
}

// ─── DASHBOARD ───────────────────────────────────────────────
function renderDashboard() {
  const d = STATE.dashData;
  if (!d) return;
  const sym = STATE.settings.currencySymbol || 'Rp';

  // Balance
  document.getElementById('dash-balance').textContent = parseFloat(d.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('dash-currency-sym').textContent = sym;

  // Trend
  const savingsRate = d.income > 0 ? ((d.savings / d.income) * 100).toFixed(1) : 0;
  const trend = document.getElementById('dash-trend');
  const trendText = document.getElementById('dash-trend-text');
  if (d.savings >= 0) {
    trend.style.background = 'rgba(75,226,119,0.12)';
    trend.style.color = 'var(--primary)';
    trend.querySelector('.material-symbols-outlined').textContent = 'trending_up';
    trendText.textContent = '+' + savingsRate + '% saved this month';
  } else {
    trend.style.background = 'rgba(255,180,171,0.12)';
    trend.style.color = 'var(--error)';
    trend.querySelector('.material-symbols-outlined').textContent = 'trending_down';
    trendText.textContent = savingsRate + '% this month';
  }

  // Insights
  document.getElementById('dash-income').textContent = fmt(d.income);
  document.getElementById('dash-expenses').textContent = fmt(d.expenses);
  document.getElementById('dash-savings').textContent = fmt(d.savings);

  // Top Goal
  renderDashGoal(d.topGoal);

  // Recent Transactions
  renderDashRecent(d.recentTransactions || []);
}

function renderDashGoal(goal) {
  const el = document.getElementById('dash-goal-card');
  if (!goal) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">savings</span>
      <p>No active savings goals yet.</p>
      <button class="btn-primary sm" onclick="navigateTo('goals')">Create Goal</button>
    </div>`;
    return;
  }
  const pct = Math.min(100, Math.round((parseFloat(goal.currentAmount) / parseFloat(goal.targetAmount)) * 100));
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="goal-icon">
          <span class="material-symbols-outlined">${goal.icon || 'savings'}</span>
        </div>
        <div>
          <p style="font-weight:600;font-size:16px;">${goal.goalName}</p>
          <p class="body-sm muted">Target: ${fmt(goal.targetAmount)}</p>
        </div>
      </div>
      <p style="font-size:24px;font-weight:700;color:var(--primary);">${pct}%</p>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;">
      <span class="label-caps muted">${fmt(goal.currentAmount)} saved</span>
      <span class="label-caps muted">${fmt(parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount))} to go</span>
    </div>`;
}

function renderDashRecent(txs) {
  const el = document.getElementById('dash-recent-list');
  if (!txs.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">receipt_long</span>
      <p>No transactions yet. Add your first one!</p>
    </div>`;
    return;
  }
  el.innerHTML = txs.slice(0, 5).map(tx => txItem(tx)).join('');
  el.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', () => openTxDetail(item.dataset.id));
  });
}

// ─── TRANSACTIONS ─────────────────────────────────────────────
async function loadTransactions() {
  try {
    STATE.transactions = await apiGet({ action: 'getTransactions' });
    renderTransactions();
  } catch (e) { showToast('Error loading transactions'); }
}

function renderTransactions() {
  const el = document.getElementById('tx-list-container');
  let txs = [...STATE.transactions];

  // Filter
  if (STATE.txFilter === 'income') txs = txs.filter(t => t.type === 'income');
  else if (STATE.txFilter === 'expense') txs = txs.filter(t => t.type === 'expense');
  else if (STATE.txFilter === 'month') {
    const m = currentMonth();
    txs = txs.filter(t => safeStr(t.date).startsWith(m));
  }

  // Search
  if (STATE.txSearch) {
    const q = STATE.txSearch.toLowerCase();
    txs = txs.filter(t =>
      (t.description || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  }

  // Sort
  txs.sort((a, b) => {
    let va = a[STATE.txSortBy], vb = b[STATE.txSortBy];
    if (STATE.txSortBy === 'amount') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
    if (va < vb) return STATE.txSortDir === 'asc' ? -1 : 1;
    if (va > vb) return STATE.txSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (!txs.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">receipt_long</span>
      <p>No transactions found.</p>
    </div>`;
    return;
  }

  // Group by date
  const groups = {};
  txs.forEach(tx => {
    const key = tx.date || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  el.innerHTML = Object.entries(groups).map(([date, items]) => `
    <div class="tx-group-label">${formatGroupDate(date)}</div>
    ${items.map(tx => txItem(tx)).join('')}
  `).join('');

  el.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', () => openTxDetail(item.dataset.id));
  });
}

function formatGroupDate(dateStr) {
  if (!dateStr || dateStr === 'Unknown') return 'Unknown Date';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today, ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function txItem(tx) {
  const icon = getCatIcon(tx.category);
  const typeClass = tx.type === 'income' ? 'income-type' : 'expense-type';
  const amtColor = tx.type === 'income' ? 'color:var(--primary)' : 'color:var(--error)';
  const amtStr = tx.type === 'income' ? '+' + fmt(tx.amount) : '-' + fmt(tx.amount);
  return `<div class="tx-item" data-id="${tx.id}">
    <div class="tx-item-left">
      <div class="tx-icon ${typeClass}"><span class="material-symbols-outlined">${icon}</span></div>
      <div>
        <p class="tx-title">${escHtml(tx.description || tx.category || 'Transaction')}</p>
        <p class="tx-meta">${escHtml(tx.category || '')}</p>
      </div>
    </div>
    <div class="tx-item-right">
      <p class="tx-amount" style="${amtColor}">${amtStr}</p>
      <p class="tx-time">${fmtDate(tx.date)}</p>
    </div>
  </div>`;
}

function openTxDetail(id) {
  const tx = STATE.transactions.find(t => t.id === id);
  if (!tx) return;
  STATE.detailTxId = id;
  const amtStr = tx.type === 'income' ? '+' + fmt(tx.amount) : '-' + fmt(tx.amount);
  const amtColor = tx.type === 'income' ? 'var(--primary)' : 'var(--error)';
  document.getElementById('tx-detail-content').innerHTML = `
    <div class="detail-amount" style="color:${amtColor}">${amtStr}</div>
    <div class="detail-rows">
      <div class="detail-row"><span class="detail-label">Description</span><span class="detail-val">${escHtml(tx.description || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Category</span><span class="detail-val">${escHtml(tx.category || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-val" style="text-transform:capitalize;">${tx.type}</span></div>
      <div class="detail-row"><span class="detail-label">Date</span><span class="detail-val">${fmtDate(tx.date)}</span></div>
    </div>`;
  openModal('tx-detail-modal');
}

// ─── TRANSACTION MODAL ────────────────────────────────────────
function openTxModal(type, editData) {
  STATE.editTxId = editData ? editData.id : null;
  STATE.selectedTxType = type || 'expense';

  document.getElementById('tx-modal-title').textContent = editData ? 'Edit Transaction' : 'Add Transaction';
  document.getElementById('tx-save-label').textContent = editData ? 'Save Changes' : 'Save Transaction';
  document.getElementById('tx-amount').value = editData ? parseFloat(editData.amount) : '';
  document.getElementById('tx-date').value = editData ? editData.date : todayISO();
  document.getElementById('tx-description').value = editData ? (editData.description || '') : '';
  document.getElementById('tx-edit-id').value = editData ? editData.id : '';
  document.getElementById('tx-currency-sym').textContent = STATE.settings.currencySymbol || 'Rp';

  STATE.selectedTxCategory = editData ? editData.category : '';
  setTxType(STATE.selectedTxType, true);
  buildCategoryGrid(STATE.selectedTxType);
  openModal('tx-modal');
}

function setTxType(type, skipGrid) {
  STATE.selectedTxType = type;
  const expBtn = document.getElementById('tx-type-expense');
  const incBtn = document.getElementById('tx-type-income');
  if (type === 'expense') {
    expBtn.classList.add('expense-active');
    incBtn.classList.remove('income-active');
  } else {
    incBtn.classList.add('income-active');
    expBtn.classList.remove('expense-active');
  }
  if (!skipGrid) buildCategoryGrid(type);
}

function buildCategoryGrid(type) {
  const grid = document.getElementById('tx-category-grid');
  const cats = STATE.categories.filter(c => c.categoryType === type);
  grid.innerHTML = cats.map(c => `
    <button class="cat-option ${STATE.selectedTxCategory === c.categoryName ? 'selected' : ''}"
            data-cat="${escAttr(c.categoryName)}">
      <span class="material-symbols-outlined">${c.icon || getCatIcon(c.categoryName)}</span>
      <span>${escHtml(c.categoryName)}</span>
    </button>`).join('');
  grid.querySelectorAll('.cat-option').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.cat-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      STATE.selectedTxCategory = btn.dataset.cat;
    });
  });
}

async function saveTx() {
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const date = document.getElementById('tx-date').value;
  const desc = document.getElementById('tx-description').value.trim();
  const cat = STATE.selectedTxCategory;

  if (!amount || amount <= 0) { showToast('Please enter a valid amount'); return; }
  if (!date) { showToast('Please select a date'); return; }
  if (!cat) { showToast('Please select a category'); return; }

  const data = { date, type: STATE.selectedTxType, category: cat, description: desc, amount };
  const btn = document.getElementById('tx-save-btn');
  btn.disabled = true;

  try {
    if (STATE.editTxId) {
      data.id = STATE.editTxId;
      const updated = await apiPost({ action: 'updateTransaction', data });
      const idx = STATE.transactions.findIndex(t => t.id === STATE.editTxId);
      if (idx !== -1) STATE.transactions[idx] = updated;
      showToast('Transaction updated!');
    } else {
      const created = await apiPost({ action: 'createTransaction', data });
      STATE.transactions.unshift(created);
      showToast('Transaction saved!');
    }
    closeModal('tx-modal');
    renderTransactions();
    // Refresh dashboard
    const dash = await apiGet({ action: 'getDashboardData' });
    STATE.dashData = dash;
    if (STATE.currentPage === 'dashboard') renderDashboard();
  } catch (e) {
    showToast('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ─── ANALYTICS ───────────────────────────────────────────────
async function loadAnalytics() {
  document.getElementById('analytics-month-label').textContent = fmtMonth(STATE.analyticsMonth);
  try {
    const [analyticsData, txs] = await Promise.all([
      apiGet({ action: 'getAnalyticsData', month: STATE.analyticsMonth }),
      apiGet({ action: 'getTransactions', month: STATE.analyticsMonth })
    ]);
    STATE.analyticsData = analyticsData;
    STATE.transactions = txs;

    // Stats for selected month
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const savings = income - expenses;
    document.getElementById('analytics-balance').textContent = fmt(income - expenses);
    document.getElementById('analytics-income').textContent = fmt(income);
    document.getElementById('analytics-expenses').textContent = fmt(expenses);
    document.getElementById('analytics-savings').textContent = fmt(savings);
    document.getElementById('analytics-tx-count').textContent = txs.length;

    renderIncomeExpenseChart();
    renderDailyChart(analyticsData.dailyActivity);
    renderCategoryChart(analyticsData.categoryData);
    renderCategoryBreakdown(analyticsData.categoryData);
  } catch (e) {
    showToast('Error loading analytics');
  }
}

function renderIncomeExpenseChart() {
  const d = STATE.analyticsData;
  if (!d) return;

  const months = d.monthly;
  let slice = months;
  if (STATE.analyticsPeriod === '3m') slice = months.slice(-3);
  if (STATE.analyticsPeriod === '1m') slice = months.slice(-1);

  const labels = slice.map(m => {
    const [y, mo] = m.month.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  });
  const incomeData = slice.map(m => m.income);
  const expData = slice.map(m => m.expenses);

  const ctx = document.getElementById('income-expense-chart').getContext('2d');
  if (STATE.incomeExpenseChart) STATE.incomeExpenseChart.destroy();
  STATE.incomeExpenseChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#4be277',
          backgroundColor: 'rgba(75,226,119,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#4be277',
          pointRadius: 4,
        },
        {
          label: 'Expenses',
          data: expData,
          borderColor: '#ffb4ae',
          backgroundColor: 'rgba(255,180,174,0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ffb4ae',
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, tooltip: {
          backgroundColor: 'rgba(23,31,51,0.95)',
          titleColor: '#bccbb9', bodyColor: '#dae2fd',
          borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
          callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.raw) }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#bccbb9', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#bccbb9', font: { size: 11 }, callback: v => fmt(v) } }
      }
    }
  });
}

function renderDailyChart(daily) {
  const ctx = document.getElementById('daily-chart').getContext('2d');
  if (STATE.dailyChart) STATE.dailyChart.destroy();
  if (!daily || !daily.length) { return; }

  const labels = daily.map(d => {
    const day = new Date(d.date + 'T00:00:00').getDate();
    return String(day);
  });
  STATE.dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income', data: daily.map(d => d.income), backgroundColor: 'rgba(75,226,119,0.6)', borderRadius: 4 },
        { label: 'Expenses', data: daily.map(d => d.expenses), backgroundColor: 'rgba(255,180,174,0.6)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, tooltip: {
          backgroundColor: 'rgba(23,31,51,0.95)',
          titleColor: '#bccbb9', bodyColor: '#dae2fd',
          callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.raw) }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#bccbb9', font: { size: 10 } } },
        y: { display: false }
      }
    }
  });
}

function renderCategoryChart(catData) {
  const ctx = document.getElementById('category-chart').getContext('2d');
  if (STATE.categoryChart) STATE.categoryChart.destroy();
  if (!catData || !catData.length) return;

  const top = catData.slice(0, 6);
  STATE.categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top.map(c => c.category),
      datasets: [{ data: top.map(c => c.amount), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ctx.label + ': ' + fmt(ctx.raw) }
        }
      }
    }
  });

  // Legend
  const legend = document.getElementById('category-legend');
  legend.innerHTML = top.map((c, i) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${CHART_COLORS[i]}"></span>
      <span style="color:var(--on-surface-var);font-size:12px;">${escHtml(c.category)}</span>
    </div>`).join('');
}

function renderCategoryBreakdown(catData) {
  const el = document.getElementById('category-breakdown-list');
  if (!catData || !catData.length) {
    el.innerHTML = '<p class="body-sm muted" style="text-align:center;padding:16px;">No expense data this month.</p>';
    return;
  }
  const total = catData.reduce((s, c) => s + c.amount, 0);
  el.innerHTML = catData.slice(0, 6).map((c, i) => {
    const pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
    return `<div class="cat-bar-item">
      <div class="cat-bar-row">
        <span class="body-sm">${escHtml(c.category)}</span>
        <span class="body-sm" style="color:var(--primary);font-weight:600;">${fmt(c.amount)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${pct}%;background:${CHART_COLORS[i % CHART_COLORS.length]};"></div>
      </div>
    </div>`;
  }).join('');
}

// ─── GOALS ───────────────────────────────────────────────────
async function loadGoals() {
  try {
    STATE.goals = await apiGet({ action: 'getSavingsGoals' });
    renderGoals();
  } catch (e) { showToast('Error loading goals'); }
}

function renderGoals() {
  const el = document.getElementById('goals-list');
  const active = STATE.goals.filter(g => g.status === 'active');
  const completed = STATE.goals.filter(g => g.status === 'completed');

  const totalTarget = STATE.goals.reduce((s, g) => s + parseFloat(g.targetAmount || 0), 0);
  const totalSaved = STATE.goals.reduce((s, g) => s + parseFloat(g.currentAmount || 0), 0);
  document.getElementById('goals-active-count').textContent = active.length;
  document.getElementById('goals-total-target').textContent = fmt(totalTarget);
  document.getElementById('goals-total-saved').textContent = fmt(totalSaved);

  if (!STATE.goals.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">savings</span>
      <p>No savings goals yet. Create your first goal!</p>
      <button class="btn-primary sm" onclick="openGoalModal(null)">Create Goal</button>
    </div>`;
    return;
  }

  el.innerHTML = '';
  [...active, ...completed].forEach(goal => {
    const card = goalCard(goal);
    const div = document.createElement('div');
    div.innerHTML = card;
    const c = div.firstElementChild;
    c.addEventListener('click', () => openGoalDetail(goal.id));
    el.appendChild(c);
  });
}

function goalCard(goal) {
  const target = parseFloat(goal.targetAmount) || 1;
  const current = parseFloat(goal.currentAmount) || 0;
  const pct = Math.min(100, Math.round((current / target) * 100));
  const completed = goal.status === 'completed' || pct >= 100;
  const days = daysLeft(goal.deadline);
  const daysStr = days !== null ? (days > 0 ? `${days} days left` : (days === 0 ? 'Due today' : 'Overdue')) : '';
  const progressClass = completed ? '' : (current > target ? 'danger' : '');

  return `<div class="goal-card ${completed ? 'goal-completed' : ''}">
    <div class="goal-header">
      <div class="goal-title-row">
        <div class="goal-icon">
          <span class="material-symbols-outlined">${goal.icon || 'savings'}</span>
        </div>
        <div>
          <p class="goal-name">${escHtml(goal.goalName)}</p>
          <p class="goal-target">Target: ${fmt(goal.targetAmount)}</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p class="goal-pct">${pct}%</p>
        ${completed ? `<span class="label-caps" style="color:var(--primary)">Completed!</span>` : ''}
      </div>
    </div>
    <div class="progress-track">
      <div class="progress-fill ${progressClass}" style="width:${pct}%"></div>
    </div>
    <div class="goal-footer">
      <span class="label-caps muted">${fmt(goal.currentAmount)} saved</span>
      ${daysStr ? `<span class="goal-deadline-tag"><span class="material-symbols-outlined" style="font-size:14px;">schedule</span>${daysStr}</span>` : ''}
    </div>
  </div>`;
}

function openGoalModal(goal) {
  STATE.editGoalId = goal ? goal.id : null;
  document.getElementById('goal-modal-title').textContent = goal ? 'Edit Goal' : 'Create Goal';
  document.getElementById('goal-save-label').textContent = goal ? 'Save Changes' : 'Create Goal';
  document.getElementById('goal-name').value = goal ? goal.goalName : '';
  document.getElementById('goal-target').value = goal ? parseFloat(goal.targetAmount) : '';
  document.getElementById('goal-current').value = goal ? parseFloat(goal.currentAmount) : '';
  document.getElementById('goal-deadline').value = goal ? goal.deadline : '';
  document.getElementById('goal-edit-id').value = goal ? goal.id : '';
  document.getElementById('goal-currency-sym').textContent = STATE.settings.currencySymbol || 'Rp';
  document.getElementById('goal-currency-sym2').textContent = STATE.settings.currencySymbol || 'Rp';

  STATE.selectedGoalIcon = goal ? (goal.icon || 'savings') : 'savings';
  document.querySelectorAll('.icon-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icon === STATE.selectedGoalIcon);
  });
  openModal('goal-modal');
}

async function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  const current = parseFloat(document.getElementById('goal-current').value) || 0;
  const deadline = document.getElementById('goal-deadline').value;

  if (!name) { showToast('Please enter a goal name'); return; }
  if (!target || target <= 0) { showToast('Please enter a valid target amount'); return; }

  const data = {
    goalName: name,
    targetAmount: target,
    currentAmount: current,
    deadline,
    status: current >= target ? 'completed' : 'active',
    icon: STATE.selectedGoalIcon,
  };
  const btn = document.getElementById('goal-save-btn');
  btn.disabled = true;

  try {
    if (STATE.editGoalId) {
      data.id = STATE.editGoalId;
      const updated = await apiPost({ action: 'updateGoal', data });
      const idx = STATE.goals.findIndex(g => g.id === STATE.editGoalId);
      if (idx !== -1) STATE.goals[idx] = updated;
      showToast('Goal updated!');
    } else {
      const created = await apiPost({ action: 'createGoal', data });
      STATE.goals.push(created);
      showToast('Goal created!');
    }
    closeModal('goal-modal');
    renderGoals();
    // Refresh dashboard top goal
    const dash = await apiGet({ action: 'getDashboardData' });
    STATE.dashData = dash;
    if (STATE.currentPage === 'dashboard') renderDashboard();
  } catch (e) {
    showToast('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function openGoalDetail(id) {
  const goal = STATE.goals.find(g => g.id === id);
  if (!goal) return;
  STATE.detailGoalId = id;
  const target = parseFloat(goal.targetAmount) || 1;
  const current = parseFloat(goal.currentAmount) || 0;
  const pct = Math.min(100, Math.round((current / target) * 100));
  const days = daysLeft(goal.deadline);

  document.getElementById('goal-detail-content').innerHTML = `
    <div class="goal-detail-hero">
      <div class="goal-detail-icon">
        <span class="material-symbols-outlined">${goal.icon || 'savings'}</span>
      </div>
      <h2 class="headline-sm">${escHtml(goal.goalName)}</h2>
      <p class="body-sm muted">${goal.deadline ? 'Target: ' + fmtDate(goal.deadline) : 'No deadline set'}</p>
    </div>
    <div class="detail-rows">
      <div class="detail-row"><span class="detail-label">Target Amount</span><span class="detail-val">${fmt(goal.targetAmount)}</span></div>
      <div class="detail-row"><span class="detail-label">Saved So Far</span><span class="detail-val income">${fmt(goal.currentAmount)}</span></div>
      <div class="detail-row"><span class="detail-label">Remaining</span><span class="detail-val">${fmt(target - current)}</span></div>
      <div class="detail-row"><span class="detail-label">Progress</span><span class="detail-val income">${pct}%</span></div>
      ${days !== null ? `<div class="detail-row"><span class="detail-label">Days Left</span><span class="detail-val">${days > 0 ? days + ' days' : (days === 0 ? 'Due today' : 'Overdue')}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val" style="text-transform:capitalize;">${goal.status || 'active'}</span></div>
    </div>
    <div style="margin-top:16px;">
      <div class="progress-track" style="height:8px;">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  openModal('goal-detail-modal');
}

// ─── SETTINGS ────────────────────────────────────────────────
function renderSettings() {
  const s = STATE.settings;
  document.getElementById('currency-display').textContent = (s.currency || 'IDR') + ' (' + (s.currencySymbol || 'Rp') + ')';
  document.getElementById('notif-toggle').checked = s.notifications !== 'false';
  document.getElementById('theme-toggle').checked = s.theme !== 'light';
  document.getElementById('theme-display').textContent = s.theme === 'light' ? 'Light' : 'Dark';
  updateProfileUI();
}

function updateProfileUI() {
  const name = STATE.settings.userName || 'User';
  const email = STATE.settings.userEmail || '';
  document.getElementById('settings-username').textContent = name;
  document.getElementById('settings-email').textContent = email;
  document.getElementById('settings-avatar').textContent = name[0].toUpperCase();
  document.getElementById('user-avatar').textContent = name[0].toUpperCase();
}

function openProfileModal() {
  document.getElementById('profile-name').value = STATE.settings.userName || '';
  document.getElementById('profile-email').value = STATE.settings.userEmail || '';
  openModal('profile-modal');
}

function openCurrencyModal() {
  const list = document.getElementById('currency-list');
  list.innerHTML = CURRENCIES.map(c => `
    <div class="currency-item ${STATE.settings.currency === c.code ? 'selected' : ''}" data-code="${c.code}" data-sym="${c.symbol}">
      <div>
        <p style="font-size:15px;font-weight:500;">${c.name}</p>
        <p class="body-sm muted">${c.code}</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:600;color:var(--on-surface-var);">${c.symbol}</span>
        ${STATE.settings.currency === c.code ? '<span class="material-symbols-outlined" style="color:var(--primary);">check_circle</span>' : ''}
      </div>
    </div>`).join('');
  list.querySelectorAll('.currency-item').forEach(item => {
    item.addEventListener('click', async () => {
      const code = item.dataset.code;
      const sym = item.dataset.sym;
      await Promise.all([
        apiPost({ action: 'updateSetting', key: 'currency', value: code }),
        apiPost({ action: 'updateSetting', key: 'currencySymbol', value: sym }),
      ]);
      STATE.settings.currency = code;
      STATE.settings.currencySymbol = sym;
      closeModal('currency-modal');
      renderSettings();
      renderDashboard();
      showToast('Currency changed to ' + code);
    });
  });
  openModal('currency-modal');
}

async function openCategoriesModal() {
  openModal('categories-modal');
  renderCategoriesModal();
}

function renderCategoriesModal() {
  const el = document.getElementById('categories-list');
  el.innerHTML = STATE.categories.map(c => `
    <div class="tx-item" style="cursor:default;">
      <div class="tx-item-left">
        <div class="tx-icon ${c.categoryType === 'income' ? 'income-type' : 'expense-type'}">
          <span class="material-symbols-outlined">${c.icon || getCatIcon(c.categoryName)}</span>
        </div>
        <div>
          <p class="tx-title">${escHtml(c.categoryName)}</p>
          <p class="tx-meta" style="text-transform:capitalize;">${c.categoryType}</p>
        </div>
      </div>
      <button class="icon-btn" data-cat-id="${c.id}" style="color:var(--error);">
        <span class="material-symbols-outlined">delete</span>
      </button>
    </div>`).join('');
  el.querySelectorAll('[data-cat-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.catId;
      confirm_('Delete Category', 'Delete this category?', async () => {
        try {
          await apiPost({ action: 'deleteCategory', id });
          STATE.categories = STATE.categories.filter(c => c.id !== id);
          renderCategoriesModal();
          showToast('Category deleted.');
        } catch (e) { showToast('Error: ' + e.message); }
      });
    });
  });
}

// ─── EXPORT ──────────────────────────────────────────────────
async function exportCSV() {
  try {
    const txs = await apiGet({ action: 'getTransactions' });
    const headers = ['ID', 'Date', 'Type', 'Category', 'Description', 'Amount'];
    const rows = txs.map(t => [t.id, t.date, t.type, t.category, `"${(t.description || '').replace(/"/g, '""')}"`, t.amount]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budgeto-transactions-' + todayISO() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!');
  } catch (e) { showToast('Error exporting: ' + e.message); }
}

// ─── HELPERS ─────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
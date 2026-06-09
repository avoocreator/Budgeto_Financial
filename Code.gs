// ============================================================
// BUDGETO - Google Apps Script Backend
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ============================================================

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// ─── CORS HEADERS ───────────────────────────────────────────
function setCORSHeaders(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse(data) {
  return setCORSHeaders(ContentService.createTextOutput(JSON.stringify(data)));
}

// ─── SHEET HELPERS ──────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function sheetToJson(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function generateId() {
  return Utilities.getUuid();
}

// ─── INITIALIZE SPREADSHEET ─────────────────────────────────
function initializeSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Transactions Sheet
  let txSheet = ss.getSheetByName('Transactions');
  if (!txSheet) {
    txSheet = ss.insertSheet('Transactions');
    txSheet.appendRow(['id','date','type','category','description','amount']);
    txSheet.getRange(1,1,1,6).setFontWeight('bold').setBackground('#0b1326').setFontColor('#4be277');
  }

  // SavingsGoals Sheet
  let sgSheet = ss.getSheetByName('SavingsGoals');
  if (!sgSheet) {
    sgSheet = ss.insertSheet('SavingsGoals');
    sgSheet.appendRow(['id','goalName','targetAmount','currentAmount','deadline','status','icon']);
    sgSheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#0b1326').setFontColor('#4be277');
  }

  // Categories Sheet
  let catSheet = ss.getSheetByName('Categories');
  if (!catSheet) {
    catSheet = ss.insertSheet('Categories');
    catSheet.appendRow(['id','categoryName','categoryType','icon']);
    catSheet.getRange(1,1,1,4).setFontWeight('bold').setBackground('#0b1326').setFontColor('#4be277');
    // Seed default categories
    const defaultCats = [
      [generateId(),'Food & Dining','expense','restaurant'],
      [generateId(),'Transport','expense','directions_car'],
      [generateId(),'Shopping','expense','shopping_bag'],
      [generateId(),'Entertainment','expense','movie'],
      [generateId(),'Healthcare','expense','local_hospital'],
      [generateId(),'Utilities','expense','bolt'],
      [generateId(),'Coffee','expense','coffee'],
      [generateId(),'Groceries','expense','local_grocery_store'],
      [generateId(),'Salary','income','payments'],
      [generateId(),'Freelance','income','work'],
      [generateId(),'Investment','income','trending_up'],
      [generateId(),'Gift','income','card_giftcard'],
    ];
    defaultCats.forEach(r => catSheet.appendRow(r));
  }

  // Settings Sheet
  let setSheet = ss.getSheetByName('Settings');
  if (!setSheet) {
    setSheet = ss.insertSheet('Settings');
    setSheet.appendRow(['settingKey','settingValue']);
    setSheet.getRange(1,1,1,2).setFontWeight('bold');
    const defaults = [
      ['currency','IDR'],
      ['currencySymbol','Rp'],
      ['theme','dark'],
      ['notifications','true'],
      ['userName','User'],
      ['userEmail','user@example.com'],
    ];
    defaults.forEach(r => setSheet.appendRow(r));
  }

  // UserPreferences Sheet
  let upSheet = ss.getSheetByName('UserPreferences');
  if (!upSheet) {
    upSheet = ss.insertSheet('UserPreferences');
    upSheet.appendRow(['preferenceKey','preferenceValue']);
    upSheet.getRange(1,1,1,2).setFontWeight('bold');
    upSheet.appendRow(['defaultView','dashboard']);
    upSheet.appendRow(['dateFormat','MM/DD/YYYY']);
  }
}

// ─── doGet ──────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || '';
  try {
    switch(action) {
      case 'getTransactions':    return jsonResponse({ ok:true, data: getTransactions(e.parameter) });
      case 'getSavingsGoals':    return jsonResponse({ ok:true, data: getSavingsGoals() });
      case 'getCategories':      return jsonResponse({ ok:true, data: getCategories() });
      case 'getSettings':        return jsonResponse({ ok:true, data: getSettings() });
      case 'getDashboardData':   return jsonResponse({ ok:true, data: getDashboardData() });
      case 'getAnalyticsData':   return jsonResponse({ ok:true, data: getAnalyticsData(e.parameter) });
      case 'init':               initializeSpreadsheet(); return jsonResponse({ ok:true, message:'Initialized' });
      default:                   return jsonResponse({ ok:false, error:'Unknown action: '+action });
    }
  } catch(err) {
    return jsonResponse({ ok:false, error: err.toString() });
  }
}

// ─── doPost ─────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';
    switch(action) {
      // Transactions CRUD
      case 'createTransaction':  return jsonResponse({ ok:true, data: createTransaction(body.data) });
      case 'updateTransaction':  return jsonResponse({ ok:true, data: updateTransaction(body.data) });
      case 'deleteTransaction':  return jsonResponse({ ok:true, data: deleteTransaction(body.id) });
      // Savings Goals CRUD
      case 'createGoal':         return jsonResponse({ ok:true, data: createGoal(body.data) });
      case 'updateGoal':         return jsonResponse({ ok:true, data: updateGoal(body.data) });
      case 'deleteGoal':         return jsonResponse({ ok:true, data: deleteGoal(body.id) });
      // Categories CRUD
      case 'createCategory':     return jsonResponse({ ok:true, data: createCategory(body.data) });
      case 'deleteCategory':     return jsonResponse({ ok:true, data: deleteCategory(body.id) });
      // Settings
      case 'updateSetting':      return jsonResponse({ ok:true, data: updateSetting(body.key, body.value) });
      case 'resetData':          return jsonResponse({ ok:true, data: resetData() });
      default:                   return jsonResponse({ ok:false, error:'Unknown action: '+action });
    }
  } catch(err) {
    return jsonResponse({ ok:false, error: err.toString() });
  }
}

// ─── TRANSACTIONS ────────────────────────────────────────────
function getTransactions(params) {
  const sheet = getSheet('Transactions');
  let rows = sheetToJson(sheet);

  // Search
  if (params && params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter(r =>
      (r.description||'').toLowerCase().includes(q) ||
      (r.category||'').toLowerCase().includes(q)
    );
  }
  // Filter by type
  if (params && params.type && params.type !== 'all') {
    rows = rows.filter(r => r.type === params.type);
  }
  // Filter by category
  if (params && params.category) {
    rows = rows.filter(r => r.category === params.category);
  }
  // Filter by month (YYYY-MM)
  if (params && params.month) {
    rows = rows.filter(r => (r.date||'').startsWith(params.month));
  }
  // Sort
  const sortBy = (params && params.sortBy) || 'date';
  const sortDir = (params && params.sortDir) || 'desc';
  rows.sort((a,b) => {
    let va = a[sortBy], vb = b[sortBy];
    if (sortBy === 'amount') { va = parseFloat(va)||0; vb = parseFloat(vb)||0; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function createTransaction(data) {
  const sheet = getSheet('Transactions');
  const id = generateId();
  const row = [id, data.date, data.type, data.category, data.description, parseFloat(data.amount)||0];
  sheet.appendRow(row);
  return { id, ...data };
}

function updateTransaction(data) {
  const sheet = getSheet('Transactions');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet.getRange(i+1, 1, 1, 6).setValues([[
        data.id, data.date, data.type, data.category, data.description, parseFloat(data.amount)||0
      ]]);
      return data;
    }
  }
  throw new Error('Transaction not found');
}

function deleteTransaction(id) {
  const sheet = getSheet('Transactions');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i+1);
      return { deleted: id };
    }
  }
  throw new Error('Transaction not found');
}

// ─── SAVINGS GOALS ───────────────────────────────────────────
function getSavingsGoals() {
  return sheetToJson(getSheet('SavingsGoals'));
}

function createGoal(data) {
  const sheet = getSheet('SavingsGoals');
  const id = generateId();
  const row = [id, data.goalName, parseFloat(data.targetAmount)||0, parseFloat(data.currentAmount)||0, data.deadline, data.status||'active', data.icon||'savings'];
  sheet.appendRow(row);
  return { id, ...data };
}

function updateGoal(data) {
  const sheet = getSheet('SavingsGoals');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet.getRange(i+1, 1, 1, 7).setValues([[
        data.id, data.goalName, parseFloat(data.targetAmount)||0, parseFloat(data.currentAmount)||0,
        data.deadline, data.status||'active', data.icon||'savings'
      ]]);
      return data;
    }
  }
  throw new Error('Goal not found');
}

function deleteGoal(id) {
  const sheet = getSheet('SavingsGoals');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i+1);
      return { deleted: id };
    }
  }
  throw new Error('Goal not found');
}

// ─── CATEGORIES ──────────────────────────────────────────────
function getCategories() {
  return sheetToJson(getSheet('Categories'));
}

function createCategory(data) {
  const sheet = getSheet('Categories');
  const id = generateId();
  sheet.appendRow([id, data.categoryName, data.categoryType, data.icon||'label']);
  return { id, ...data };
}

function deleteCategory(id) {
  const sheet = getSheet('Categories');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i+1);
      return { deleted: id };
    }
  }
  throw new Error('Category not found');
}

// ─── SETTINGS ────────────────────────────────────────────────
function getSettings() {
  const rows = sheetToJson(getSheet('Settings'));
  const settings = {};
  rows.forEach(r => settings[r.settingKey] = r.settingValue);
  return settings;
}

function updateSetting(key, value) {
  const sheet = getSheet('Settings');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      sheet.getRange(i+1, 2).setValue(value);
      return { key, value };
    }
  }
  sheet.appendRow([key, value]);
  return { key, value };
}

// ─── DASHBOARD DATA ──────────────────────────────────────────
function getDashboardData() {
  const now = new Date();
  const currentMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');

  const allTx = sheetToJson(getSheet('Transactions'));
  const monthTx = allTx.filter(tx => (tx.date||'').startsWith(currentMonth));

  const income   = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+parseFloat(t.amount||0),0);
  const expenses = monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+parseFloat(t.amount||0),0);
  const allIncome   = allTx.filter(t=>t.type==='income').reduce((s,t)=>s+parseFloat(t.amount||0),0);
  const allExpenses = allTx.filter(t=>t.type==='expense').reduce((s,t)=>s+parseFloat(t.amount||0),0);
  const balance = allIncome - allExpenses;
  const savings = income - expenses;

  // Recent 5 transactions
  const recent = [...allTx].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);

  // Category breakdown for current month
  const catMap = {};
  monthTx.forEach(tx => {
    if (tx.type === 'expense') {
      catMap[tx.category] = (catMap[tx.category]||0) + parseFloat(tx.amount||0);
    }
  });
  const categoryBreakdown = Object.entries(catMap).map(([cat,amt])=>({category:cat,amount:amt}))
    .sort((a,b)=>b.amount-a.amount);

  // Top savings goal
  const goals = sheetToJson(getSheet('SavingsGoals'));
  const topGoal = goals.filter(g=>g.status==='active')[0]||null;

  return {
    balance, income, expenses, savings,
    recentTransactions: recent,
    categoryBreakdown,
    topGoal,
    currentMonth
  };
}

// ─── ANALYTICS DATA ──────────────────────────────────────────
function getAnalyticsData(params) {
  const allTx = sheetToJson(getSheet('Transactions'));

  // Monthly summary for last 6 months
  const monthly = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
    monthly[key] = { month: key, income: 0, expenses: 0 };
  }
  allTx.forEach(tx => {
    const m = (tx.date||'').substring(0,7);
    if (monthly[m]) {
      if (tx.type==='income') monthly[m].income += parseFloat(tx.amount||0);
      if (tx.type==='expense') monthly[m].expenses += parseFloat(tx.amount||0);
    }
  });

  // Category breakdown (all time or current month)
  const month = params && params.month ? params.month : '';
  const filtered = month ? allTx.filter(tx=>(tx.date||'').startsWith(month)) : allTx;
  const catMap = {};
  filtered.filter(t=>t.type==='expense').forEach(tx=>{
    catMap[tx.category]=(catMap[tx.category]||0)+parseFloat(tx.amount||0);
  });
  const categoryData = Object.entries(catMap).map(([cat,amt])=>({category:cat,amount:amt}))
    .sort((a,b)=>b.amount-a.amount);

  // Daily activity for current month
  const currentMonth = params && params.month ? params.month : Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const dailyMap = {};
  allTx.filter(tx=>(tx.date||'').startsWith(currentMonth)).forEach(tx=>{
    const day = tx.date;
    if(!dailyMap[day]) dailyMap[day]={income:0,expenses:0};
    if(tx.type==='income') dailyMap[day].income+=parseFloat(tx.amount||0);
    if(tx.type==='expense') dailyMap[day].expenses+=parseFloat(tx.amount||0);
  });

  return {
    monthly: Object.values(monthly),
    categoryData,
    dailyActivity: Object.entries(dailyMap).map(([d,v])=>({date:d,...v})).sort((a,b)=>a.date.localeCompare(b.date))
  };
}

// ─── RESET DATA ──────────────────────────────────────────────
function resetData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ['Transactions','SavingsGoals'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
  });
  return { reset: true };
}

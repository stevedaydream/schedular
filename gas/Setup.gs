/**
 * Setup.gs — Sheets 初始化腳本
 *
 * 使用方式：在 GAS 編輯器中執行 runSetup()
 */

/**
 * 主要初始化函式
 */
function runSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 建立 Users 分頁與範例資料
  setupUsers(ss);

  // 2. 建立 Settings 分頁
  setupSettings(ss);

  // 3. 建立 RotationPools 分頁
  setupRotationPools(ss);

  // 4. 建立 Notifications 分頁
  setupNotifications(ss);

  // 5. 設定 JWT Secret
  setupScriptProperties();

  // 6. 建立範例班表月份（當月）
  setupCurrentMonthSheets(ss);

  SpreadsheetApp.getUi().alert('初始化完成！請確認各分頁資料，並修改 Script Properties 中的 JWT_SECRET。');
}

// ─── Users ─────────────────────────────────────────────────────────────────

function setupUsers(ss) {
  const sheet = getOrCreateSheet(ss, 'Users', [
    'userId', 'name', 'role', 'email', 'passwordHash', 'isActive', 'isSupport', 'sortOrder','code'
  ]);

  // Check if already has data
  if (sheet.getLastRow() > 1) {
    Logger.log('Users 分頁已有資料，跳過範例資料建立');
    return;
  }

  // Default SHA-256 hash of "password123"
  const defaultHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';

  const sampleUsers = [
    [generateUUID(), '王大明', 'superadmin', 'admin@example.com', defaultHash, true, false, 1, 'A'],
    [generateUUID(), '李小華', 'scheduler', 'scheduler@example.com', defaultHash, true, false, 2, 'B'],
    [generateUUID(), '張阿美', 'member', 'member1@example.com', defaultHash, true, false, 3, 'C'],
    [generateUUID(), '陳文雄', 'member', 'member2@example.com', defaultHash, true, false, 4, 'D'],
    [generateUUID(), '林美麗', 'member', 'member3@example.com', defaultHash, true, false, 5, 'E'],
    [generateUUID(), '黃志豪', 'member', 'member4@example.com', defaultHash, true, false, 6, 'F'],
    [generateUUID(), '劉淑芬', 'member', 'member5@example.com', defaultHash, true, false, 7, 'G'],
    [generateUUID(), '周大偉', 'member', 'member6@example.com', defaultHash, true, false, 8, 'H'],
  ];

  sheet.getRange(2, 1, sampleUsers.length, sampleUsers[0].length).setValues(sampleUsers);
  Logger.log('Users 分頁建立完成，共 ' + sampleUsers.length + ' 位人員');
}

// ─── Settings ──────────────────────────────────────────────────────────────

function setupSettings(ss) {
  const sheet = getOrCreateSheet(ss, 'Settings', ['key', 'value']);

  if (sheet.getLastRow() > 1) {
    Logger.log('Settings 分頁已有資料，跳過');
    return;
  }

  const defaultSettings = [
    ['wdAM', 3],
    ['wdD', 1],
    ['wdN', 1],
    ['satAM', 3],
    ['holD', 1],
    ['holN', 1],
    ['sunD', 1],
    ['sunN', 1]
  ];

  sheet.getRange(2, 1, defaultSettings.length, 2).setValues(defaultSettings);
  Logger.log('Settings 分頁建立完成');
}

// ─── RotationPools ──────────────────────────────────────────────────────────

function setupRotationPools(ss) {
  const sheet = getOrCreateSheet(ss, 'RotationPools', ['poolName', 'data']);

  if (sheet.getLastRow() > 1) {
    Logger.log('RotationPools 分頁已有資料，跳過');
    return;
  }

  // Get user order from Users sheet
  const usersSheet = ss.getSheetByName('Users');
  const userIds = usersSheet
    ? sheetToObjects(usersSheet)
        .filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 'TRUE')
        .sort((a, b) => (parseInt(a.sortOrder) || 0) - (parseInt(b.sortOrder) || 0))
        .map(u => u.userId)
    : [];

  const poolNames = [
    'satOff', 'satD', 'satN', 'satAM',
    'sunOff', 'sunD', 'sunN',
    'holOff', 'holD', 'holN',
    'wdOff', 'wdD', 'wdN', 'wdAM'
  ];

  const rows = poolNames.map(poolName => [
    poolName,
    JSON.stringify({
      poolName,
      order: [...userIds],
      lastIndex: -1,
      skipQueue: []
    })
  ]);

  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  Logger.log('RotationPools 分頁建立完成，共 ' + poolNames.length + ' 個輪序池');
}

// ─── Notifications ──────────────────────────────────────────────────────────

function setupNotifications(ss) {
  getOrCreateSheet(ss, 'Notifications', [
    'notificationId', 'type', 'fromUserId', 'toUserId',
    'yyyyMM', 'day', 'fromShift', 'toShift',
    'status', 'createdAt', 'readAt'
  ]);
  Logger.log('Notifications 分頁建立完成');
}

// ─── Script Properties ──────────────────────────────────────────────────────

function setupScriptProperties() {
  const props = PropertiesService.getScriptProperties();

  // Only set default if not already configured
  if (!props.getProperty('JWT_SECRET')) {
    // Generate a random secret
    const secret = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
        new Date().toISOString() + Math.random().toString())
    );
    props.setProperty('JWT_SECRET', secret);
    Logger.log('JWT_SECRET 已設定（自動產生）');
  } else {
    Logger.log('JWT_SECRET 已存在，跳過');
  }
}

// ─── Month sheets ──────────────────────────────────────────────────────────

function setupCurrentMonthSheets(ss) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const yyyyMM = String(year) + month;

  // Create Schedule sheet for current month
  const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
  const schedHeaders = ['userId'];
  for (let d = 1; d <= daysInMonth; d++) schedHeaders.push('day_' + d);
  schedHeaders.push('lockedAt');
  getOrCreateSheet(ss, 'Schedule_' + yyyyMM, schedHeaders);

  // Create ScheduleMeta sheet
  const metaSheet = getOrCreateSheet(ss, 'ScheduleMeta_' + yyyyMM, ['key', 'value']);
  if (metaSheet.getLastRow() <= 1) {
    metaSheet.appendRow(['isLocked', 'false']);
    metaSheet.appendRow(['lockedBy', '']);
    metaSheet.appendRow(['lockedAt', '']);
    metaSheet.appendRow(['cellNotes', '{}']);
    metaSheet.appendRow(['offQuota', '{}']);
  }

  // Create Requests sheet for current month
  const reqHeaders = ['userId'];
  for (let d = 1; d <= daysInMonth; d++) reqHeaders.push('day_' + d);
  reqHeaders.push('overBooked');
  getOrCreateSheet(ss, 'Requests_' + yyyyMM, reqHeaders);

  // Create Holidays sheet for current year
  const holidaySheet = getOrCreateSheet(ss, 'Holidays_' + year, ['date', 'name', 'isHoliday']);
  if (holidaySheet.getLastRow() <= 1) {
    // Add some default holidays for demo
    addDefaultHolidays(holidaySheet, year);
  }

  Logger.log('當月分頁 (' + yyyyMM + ') 建立完成');
}

function addDefaultHolidays(sheet, year) {
  const holidays = [
    [year + '-01-01', '中華民國開國紀念日', true],
    [year + '-02-28', '和平紀念日', true],
    [year + '-04-04', '兒童節', true],
    [year + '-04-05', '清明節', true],
    [year + '-05-01', '勞動節', true],
    [year + '-06-07', '端午節', true], // Approximate
    [year + '-09-28', '教師節', false],
    [year + '-10-10', '國慶日', true],
  ];
  sheet.getRange(2, 1, holidays.length, 3).setValues(holidays);
}

// ─── Utility: format date helper ───────────────────────────────────────────

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/**
 * Helper to reset test data (use with caution in development)
 */
function resetAllData() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    '確認重置',
    '這將刪除所有班表和通知資料（保留人員和設定）。確定嗎？',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToKeep = ['Users', 'Settings', 'RotationPools'];

  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();
    if (!sheetsToKeep.includes(name)) {
      ss.deleteSheet(sheet);
    }
  });

  setupCurrentMonthSheets(ss);
  ui.alert('重置完成');
}

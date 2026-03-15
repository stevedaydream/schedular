/**
 * Setup.gs — 系統初始化與結構管理
 */

var Setup = (function () {

  /**
   * 主要執行入口
   */
  function run() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 建立基礎分頁
    initializeUsersSheet(ss);
    initializeSettingsSheet(ss);
    initializeRotationPoolsSheet(ss);
    initializeNotificationsSheet(ss);
    
    // 2. 建立當月與假日分頁
    initializeCurrentMonthSheets(ss);

    // 3. 設定系統屬性
    initializeScriptProperties();

    SpreadsheetApp.getUi().alert('系統結構初始化完成！\n\n請注意：\n1. 人員清單已保留（若原本為空，請手動新增人員）。\n2. 請至 Script Properties 確認 JWT_SECRET 設定。');
  }

  // ─── 內部初始化函式 ────────────────────────────────────────────────────────

  function initializeUsersSheet(ss) {
    const headers = [
      'userId', 'name', 'role', 'email', 'passwordHash', 
      'isActive', 'isSupport', 'noSchedule', 'sortOrder', 'code'
    ];
    const sheet = getOrCreateSheet(ss, 'Users', headers);
    
    // 如果表格為空（僅有標頭），建立預設管理者
    if (sheet.getLastRow() <= 1) {
      const defaultAdmin = [
        generateUUID(),         // userId
        'admin',                // name
        'superadmin',           // role
        'admin@example.com.tw', // email
        '96cae35ce8a9b0244178bf28e4966c2ce1b8385723a96a6b838858cdd6ca0a1e', // password: "000000"
        true,                   // isActive
        false,                  // isSupport
        true,                   // noSchedule (不加入排班)
        0,                      // sortOrder
        'AD'                    // code
      ];
      sheet.appendRow(defaultAdmin);
      Logger.log('預設管理者帳號已建立 (admin@example.com.tw)');
    }
    Logger.log('Users 分頁已就緒');
  }

  function initializeSettingsSheet(ss) {
    const sheet = getOrCreateSheet(ss, 'Settings', ['key', 'value']);
    if (sheet.getLastRow() <= 1) {
      const defaultSettings = [
        ['wdD', 1],
        ['wdN', 1],
        ['satD', 1],
        ['satN', 1],
        ['sunD', 1],
        ['sunN', 1],
        ['holD', 1],
        ['holN', 1]
      ];
      sheet.getRange(2, 1, defaultSettings.length, 2).setValues(defaultSettings);
    }
    Logger.log('Settings 分頁已就緒');
  }

  function initializeRotationPoolsSheet(ss) {
    const sheet = getOrCreateSheet(ss, 'RotationPools', ['poolName', 'data']);
    
    // 僅在完全沒有資料時進行預設初始化
    if (sheet.getLastRow() <= 1) {
      const usersSheet = ss.getSheetByName('Users');
      const activeUserIds = usersSheet 
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

      const rows = poolNames.map(name => [
        name,
        JSON.stringify({
          poolName: name,
          order: activeUserIds,
          lastIndex: -1,
          skipQueue: []
        })
      ]);

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, 2).setValues(rows);
      }
    }
    Logger.log('RotationPools 分頁已就緒');
  }

  function initializeNotificationsSheet(ss) {
    getOrCreateSheet(ss, 'Notifications', [
      'notificationId', 'type', 'fromUserId', 'toUserId',
      'yyyyMM', 'day', 'fromShift', 'toShift',
      'status', 'createdAt', 'readAt'
    ]);
    Logger.log('Notifications 分頁已就緒');
  }

  function initializeCurrentMonthSheets(ss) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yyyyMM = String(year) + month;

    // 建立班表分頁 (Schedule_{yyyyMM})
    const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const schedHeaders = ['userId'];
    for (let d = 1; d <= daysInMonth; d++) schedHeaders.push('day_' + d);
    schedHeaders.push('lockedAt');
    getOrCreateSheet(ss, 'Schedule_' + yyyyMM, schedHeaders);

    // 建立元資料分頁 (ScheduleMeta_{yyyyMM})
    const metaSheet = getOrCreateSheet(ss, 'ScheduleMeta_' + yyyyMM, ['key', 'value']);
    if (metaSheet.getLastRow() <= 1) {
      const defaultMeta = [
        ['isLocked', 'false'],
        ['lockedBy', ''],
        ['lockedAt', ''],
        ['cellNotes', '{}'],
        ['offQuota', '{}']
      ];
      metaSheet.getRange(2, 1, defaultMeta.length, 2).setValues(defaultMeta);
    }

    // 建立預約分頁 (Requests_{yyyyMM})
    const reqHeaders = ['userId'];
    for (let d = 1; d <= daysInMonth; d++) reqHeaders.push('day_' + d);
    reqHeaders.push('overBooked');
    getOrCreateSheet(ss, 'Requests_' + yyyyMM, reqHeaders);

    // 建立假日分頁 (Holidays_{year})
    getOrCreateSheet(ss, 'Holidays_' + year, ['date', 'name', 'isHoliday']);
    
    Logger.log('當月分頁 (' + yyyyMM + ') 初始化完成');
  }

  function initializeScriptProperties() {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('JWT_SECRET')) {
      const secret = Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 
          new Date().toISOString() + Math.random().toString())
      );
      props.setProperty('JWT_SECRET', secret);
      Logger.log('JWT_SECRET 已自動產生並設定');
    }
  }

  // ─── 對外公開介面 ──────────────────────────────────────────────────────────

  return {
    run: run,
    initializeCurrentMonthSheets: initializeCurrentMonthSheets
  };

})();

/**
 * GAS 編輯器介面直接呼叫的進入點
 */
function runSetup() {
  Setup.run();
}

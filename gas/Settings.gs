/**
 * Settings.gs — 系統設定 CRUD
 * GAS 中 Settings 不是保留字，但使用 Settings_ 以保持一致性
 */

var Settings_ = (function () {

  var SETTINGS_SHEET = 'Settings';

  var DEFAULT_SETTINGS = {
    wdAM: '3',
    wdD: '1',
    wdN: '1',
    satAM: '3',
    satD: '1',
    satN: '1',
    holD: '1',
    holN: '1',
    sunD: '1',
    sunN: '1'
  };

  function getSettings() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SETTINGS_SHEET);

    if (!sheet) return { success: true, data: DEFAULT_SETTINGS };

    const rows = sheetToObjects(sheet);
    const settings = { ...DEFAULT_SETTINGS };
    rows.forEach(row => {
      if (row.key) settings[row.key] = row.value;
    });

    return { success: true, data: settings };
  }

  function updateSettings(body) {
    if (body._user?.role !== 'superadmin') {
      return { success: false, error: '僅管理員可修改設定' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateSheet(ss, SETTINGS_SHEET, ['key', 'value']);

      // Update each setting key
      const allowed = Object.keys(DEFAULT_SETTINGS);
      Object.entries(body).forEach(([key, value]) => {
        if (!allowed.includes(key)) return;
        const rowIdx = findRowIndex(sheet, 'key', key);
        if (rowIdx !== -1) {
          sheet.getRange(rowIdx, 2).setValue(value);
        } else {
          sheet.appendRow([key, value]);
        }
      });

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function getShiftTypes() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SETTINGS_SHEET);
    if (!sheet) return { success: true, data: [] };

    const rows = sheetToObjects(sheet);
    const row = rows.find(function(r) { return r.key === 'shiftTypes'; });
    if (!row || !row.value) return { success: true, data: [] };

    try {
      return { success: true, data: JSON.parse(row.value) };
    } catch (e) {
      return { success: true, data: [] };
    }
  }

  function saveShiftTypes(body) {
    if (body._user?.role !== 'superadmin') {
      return { success: false, error: '僅管理員可修改班別設定' };
    }

    const { shiftTypes } = body;
    if (!Array.isArray(shiftTypes)) {
      return { success: false, error: '無效的班別資料' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateSheet(ss, SETTINGS_SHEET, ['key', 'value']);
      const rowIdx = findRowIndex(sheet, 'key', 'shiftTypes');
      const value = JSON.stringify(shiftTypes);
      if (rowIdx !== -1) {
        sheet.getRange(rowIdx, 2).setValue(value);
      } else {
        sheet.appendRow(['shiftTypes', value]);
      }
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  return { getSettings, updateSettings, getShiftTypes, saveShiftTypes };

})();

/**
 * Schedule.gs — 班表 CRUD
 */

var Schedule = (function () {

  function getSheetName(yyyyMM) {
    return 'Schedule_' + yyyyMM;
  }

  function getMetaSheetName(yyyyMM) {
    return 'ScheduleMeta_' + yyyyMM;
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  function getSchedule(params) {
    const yyyyMM = params.yyyyMM;
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM 參數' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const scheduleSheet = ss.getSheetByName(getSheetName(yyyyMM));
    const metaSheet = ss.getSheetByName(getMetaSheetName(yyyyMM));

    const schedule = {};
    if (scheduleSheet) {
      const rows = sheetToObjects(scheduleSheet);
      rows.forEach(row => {
        const userId = row.userId;
        if (!userId) return;
        const userShifts = {};
        Object.entries(row).forEach(([key, val]) => {
          if (key.startsWith('day_')) {
            userShifts[key] = val || null;
          }
        });
        schedule[userId] = userShifts;
      });
    }

    let meta = {};
    if (metaSheet) {
      const metaRows = sheetToObjects(metaSheet);
      metaRows.forEach(row => {
        meta[row.key] = row.value;
      });
      // Parse JSON fields
      ['cellNotes', 'dQuota', 'nQuota', 'offQuota', 'w6offQuota', 'rotationRecord'].forEach(function(key) {
        if (meta[key] && typeof meta[key] === 'string') {
          try { meta[key] = JSON.parse(meta[key]); } catch (e) { meta[key] = {}; }
        }
      });
      meta.isLocked = meta.isLocked === 'true' || meta.isLocked === true;
    }

    return { success: true, data: { schedule, meta } };
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  function saveShift(body) {
    const { yyyyMM, userId, day, shift } = body;
    if (!yyyyMM || !userId || !day) return { success: false, error: '缺少必要參數' };

    // Require scheduler or superadmin
    const userRole = body._user?.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可修改班表' };
    }

    // Check not locked
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const metaSheet = ss.getSheetByName(getMetaSheetName(yyyyMM));
    if (metaSheet) {
      const metaRows = sheetToObjects(metaSheet);
      const lockedRow = metaRows.find(r => r.key === 'isLocked');
      if (lockedRow && (lockedRow.value === 'true' || lockedRow.value === true)) {
        return { success: false, error: '班表已鎖定，請先解鎖' };
      }
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateScheduleSheet(ss, yyyyMM);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const dayCol = headers.indexOf(`day_${day}`) + 1;

      if (dayCol === 0) {
        return { success: false, error: `找不到 day_${day} 欄位` };
      }

      let rowIdx = findRowIndex(sheet, 'userId', userId);
      if (rowIdx === -1) {
        // Create new row for this user
        const newRow = new Array(headers.length).fill('');
        newRow[0] = userId; // userId is first column
        sheet.appendRow(newRow);
        rowIdx = sheet.getLastRow();
      }

      sheet.getRange(rowIdx, dayCol).setValue(shift || '');
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function batchSaveShifts(body) {
    const { yyyyMM, shifts, cellNotes, updatedPools } = body;
    if (!yyyyMM || !shifts) return { success: false, error: '缺少必要參數' };

    const userRole = body._user?.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可執行批次排班' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const sheet = getOrCreateScheduleSheet(ss, yyyyMM);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      // Group shifts by userId
      const byUser = {};
      shifts.forEach(({ userId, day, shift }) => {
        if (!byUser[userId]) byUser[userId] = {};
        byUser[userId][`day_${day}`] = shift || '';
      });

      Object.entries(byUser).forEach(([userId, userShifts]) => {
        let rowIdx = findRowIndex(sheet, 'userId', userId);
        if (rowIdx === -1) {
          const newRow = new Array(headers.length).fill('');
          newRow[0] = userId;
          sheet.appendRow(newRow);
          rowIdx = sheet.getLastRow();
        }

        const currentRow = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
        headers.forEach((h, i) => {
          if (userShifts[h] !== undefined) {
            currentRow[i] = userShifts[h];
          }
        });
        sheet.getRange(rowIdx, 1, 1, headers.length).setValues([currentRow]);
      });

      // Save meta (cellNotes, offQuota)
      if (cellNotes) {
        setMeta(ss, yyyyMM, 'cellNotes', JSON.stringify(cellNotes));
      }

      // Save proposed pool state to ScheduleMeta (NOT to RotationPools yet).
      // RotationPools only advance when the schedule is locked.
      if (updatedPools) {
        setMeta(ss, yyyyMM, 'proposedPools', JSON.stringify(updatedPools));
      }

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function clearSchedule(body) {
    const { yyyyMM } = body;
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM' };

    const userRole = body._user?.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可清除班表' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(getSheetName(yyyyMM));
    if (!sheet) return { success: true }; // already empty

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow < 2 || lastCol < 2) return { success: true };

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const firstDayCol = headers.indexOf('day_1') + 1;
      const lastDayCol = headers.reduce((max, h, i) =>
        h.startsWith('day_') ? i + 1 : max, firstDayCol);

      if (firstDayCol === 0) return { success: true };

      // Clear all day columns (keep userId column)
      const numRows = lastRow - 1;
      const numCols = lastDayCol - firstDayCol + 1;
      sheet.getRange(2, firstDayCol, numRows, numCols).clearContent();

      // Reset meta
      setMeta(ss, yyyyMM, 'cellNotes', '{}');
      setMeta(ss, yyyyMM, 'offQuota', '{}');

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function lockSchedule(body) {
    const { yyyyMM } = body;
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM' };

    const userRole = body._user?.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可鎖定班表' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    setMeta(ss, yyyyMM, 'isLocked', 'true');
    setMeta(ss, yyyyMM, 'lockedBy', body._user.userId);
    setMeta(ss, yyyyMM, 'lockedAt', new Date().toISOString());

    // Commit proposedPools → RotationPools (rotation advances only on lock)
    const metaSheet = ss.getSheetByName(getMetaSheetName(yyyyMM));
    if (metaSheet) {
      const metaRows = sheetToObjects(metaSheet);
      const proposedRow = metaRows.find(function(r) { return r.key === 'proposedPools'; });
      if (proposedRow && proposedRow.value) {
        try {
          const proposedPools = JSON.parse(proposedRow.value);
          const poolsSheet = getOrCreateSheet(ss, 'RotationPools', ['poolName', 'data']);
          Object.entries(proposedPools).forEach(function([poolName, poolData]) {
            const rowIdx = findRowIndex(poolsSheet, 'poolName', poolName);
            if (rowIdx !== -1) {
              poolsSheet.getRange(rowIdx, 2).setValue(JSON.stringify(poolData));
            } else {
              poolsSheet.appendRow([poolName, JSON.stringify(poolData)]);
            }
          });
        } catch (e) {
          // proposedPools parse error — skip pool commit, don't block lock
        }
      }
    }

    return { success: true };
  }

  function unlockSchedule(body) {
    const { yyyyMM } = body;
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM' };

    const userRole = body._user?.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可解鎖班表' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    setMeta(ss, yyyyMM, 'isLocked', 'false');
    return { success: true };
  }

  // ─── Holidays ──────────────────────────────────────────────────────────────

  function getHolidays(params) {
    const year = params.year;
    if (!year) return { success: false, error: '缺少 year 參數' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = 'Holidays_' + year;
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: true, data: [] };
    }

    const tz = Session.getScriptTimeZone();
    const holidays = sheetToObjects(sheet).map(row => ({
      date: row.date instanceof Date
        ? Utilities.formatDate(row.date, tz, 'yyyy-MM-dd')
        : String(row.date),
      name: row.name,
      isHoliday: row.isHoliday === true || row.isHoliday === 'true' || row.isHoliday === 'TRUE'
    }));

    return { success: true, data: holidays };
  }

  function saveHolidays(body) {
    const { year, holidays } = body;
    if (!year || !Array.isArray(holidays)) {
      return { success: false, error: '缺少 year 或 holidays 參數' };
    }

    const userRole = body._user?.role;
    if (userRole !== 'superadmin') {
      return { success: false, error: '僅管理員可修改假日設定' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = 'Holidays_' + year;
    let sheet = ss.getSheetByName(sheetName);

    if (sheet) {
      // Clear existing data (keep header)
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
      }
    } else {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, 3).setValues([['date', 'name', 'isHoliday']]);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }

    if (holidays.length > 0) {
      const rows = holidays.map(h => [h.date, h.name || '', h.isHoliday ? 'true' : 'false']);
      // 日期欄設為純文字，防止 Sheets 自動轉換成 Date 物件導致時區偏移
      sheet.getRange(2, 1, rows.length, 1).setNumberFormat('@');
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }

    return { success: true, data: { saved: holidays.length } };
  }

  function saveHolidayDuty(body) {
    const { yyyyMM, day, dUserId, nUserId } = body;
    if (!yyyyMM || !day) return { success: false, error: '缺少必要參數' };

    const userRole = body._user?.role;
    if (userRole !== 'superadmin' && userRole !== 'scheduler') {
      return { success: false, error: '權限不足' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateScheduleSheet(ss, yyyyMM);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const dayCol = headers.indexOf(`day_${day}`) + 1;
      if (dayCol === 0) return { success: false, error: `找不到 day_${day}` };

      if (dUserId) {
        let rowIdx = findRowIndex(sheet, 'userId', dUserId);
        if (rowIdx === -1) {
          const newRow = new Array(headers.length).fill('');
          newRow[0] = dUserId;
          sheet.appendRow(newRow);
          rowIdx = sheet.getLastRow();
        }
        sheet.getRange(rowIdx, dayCol).setValue('D');
      }

      if (nUserId) {
        let rowIdx = findRowIndex(sheet, 'userId', nUserId);
        if (rowIdx === -1) {
          const newRow = new Array(headers.length).fill('');
          newRow[0] = nUserId;
          sheet.appendRow(newRow);
          rowIdx = sheet.getLastRow();
        }
        sheet.getRange(rowIdx, dayCol).setValue('N');
      }

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  // ─── Gov Holiday Proxy ─────────────────────────────────────────────────────

  function getGovHolidays(params) {
    const year = params.year;
    if (!year) return { success: false, error: '缺少 year 參數' };

    const resourceId = 'a0c62533-a6e7-4d2a-b42e-ef640c42e3e9';
    const filters = encodeURIComponent(JSON.stringify({ '西元日期': { 'gte': String(year) + '0101', 'lte': String(year) + '1231' } }));
    const url = 'https://data.gov.tw/api/v2/rest/datastore/search?resource_id=' + resourceId + '&limit=400&filters=' + filters;

    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const json = JSON.parse(resp.getContentText());
      const records = (json && json.result && json.result.records) ? json.result.records : [];

      const data = records
        .filter(function(r) {
          const d = String(r['西元日期'] || r.date || '');
          return d.startsWith(String(year));
        })
        .map(function(r) {
          const raw = String(r['西元日期'] || r.date || '');
          const date = raw.length === 8
            ? raw.slice(0,4) + '-' + raw.slice(4,6) + '-' + raw.slice(6,8)
            : raw;
          const isHolidayRaw = r['是否放假'] !== undefined ? r['是否放假'] : (r.isHoliday || '0');
          return {
            date: date,
            name: r['備註'] || r.name || '',
            isHoliday: isHolidayRaw === '2' || isHolidayRaw === 2 ||
                       isHolidayRaw === 'Y' || isHolidayRaw === true
          };
        })
        .sort(function(a, b) { return a.date.localeCompare(b.date); });

      return { success: true, data: data };
    } catch (err) {
      return { success: false, error: 'data.gov.tw 請求失敗：' + err.message };
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getOrCreateScheduleSheet(ss, yyyyMM) {
    const daysInMonth = getDaysInMonth(yyyyMM);
    const headers = ['userId'];
    for (let d = 1; d <= daysInMonth; d++) {
      headers.push('day_' + d);
    }
    headers.push('lockedAt');
    return getOrCreateSheet(ss, getSheetName(yyyyMM), headers);
  }

  function getDaysInMonth(yyyyMM) {
    const year = parseInt(yyyyMM.slice(0, 4));
    const month = parseInt(yyyyMM.slice(4, 6));
    return new Date(year, month, 0).getDate();
  }

  function setMeta(ss, yyyyMM, key, value) {
    const sheet = getOrCreateSheet(ss, getMetaSheetName(yyyyMM), ['key', 'value']);
    const rowIdx = findRowIndex(sheet, 'key', key);
    if (rowIdx !== -1) {
      sheet.getRange(rowIdx, 2).setValue(value);
    } else {
      sheet.appendRow([key, value]);
    }
  }

  // ─── Rotation Record Lookup ────────────────────────────────────────────────

  function getRecentRotationRecord(params) {
    var targetYYYYMM = params.yyyyMM;
    if (!targetYYYYMM) return { success: false, error: '缺少 yyyyMM 參數' };
    var maxBack = parseInt(params.maxBack) || 24;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    function readRecord(yyyyMM) {
      var metaSheet = ss.getSheetByName('ScheduleMeta_' + yyyyMM);
      if (!metaSheet) return null;
      var metaRows = sheetToObjects(metaSheet);
      var row = metaRows.find(function(r) { return r.key === 'rotationRecord'; });
      if (!row || !row.value) return null;
      try { return JSON.parse(row.value); } catch (e) { return null; }
    }

    function prevMonthStr(yyyyMM) {
      var y = parseInt(yyyyMM.slice(0, 4));
      var m = parseInt(yyyyMM.slice(4, 6));
      return m === 1
        ? String(y - 1) + '12'
        : String(y) + String(m - 1).padStart(2, '0');
    }

    function nextMonthStr(yyyyMM) {
      var y = parseInt(yyyyMM.slice(0, 4));
      var m = parseInt(yyyyMM.slice(4, 6));
      return m === 12
        ? String(y + 1) + '01'
        : String(y) + String(m + 1).padStart(2, '0');
    }

    // Step 1: Search backwards for most recent rotationRecord before targetYYYYMM
    var foundMonth = null;
    var foundRecord = null;
    var cur = prevMonthStr(targetYYYYMM);
    for (var i = 0; i < maxBack; i++) {
      var rec = readRecord(cur);
      if (rec) { foundMonth = cur; foundRecord = rec; break; }
      cur = prevMonthStr(cur);
    }

    if (!foundRecord) {
      return { success: true, data: { foundMonth: null, projectedMonth: null, record: null } };
    }

    // Step 2: Scan forward from foundMonth+1 to targetYYYYMM-1, picking up any newer records
    var scanMonth = nextMonthStr(foundMonth);
    while (scanMonth < targetYYYYMM) {
      var intermediateRec = readRecord(scanMonth);
      if (intermediateRec) { foundMonth = scanMonth; foundRecord = intermediateRec; }
      scanMonth = nextMonthStr(scanMonth);
    }

    // Step 3: Advance the order by foundRecord's extras — next month starts after endUserId
    var SHIFT_TYPES = ['D', 'N', 'Off', 'W6Off'];
    var projected = {};
    SHIFT_TYPES.forEach(function(st) {
      var entry = foundRecord[st];
      if (!entry || !Array.isArray(entry.order) || entry.order.length === 0) return;
      var order = entry.order;
      var extras = entry.extras || 0;
      // Rotate: next cycle's start is the person at position `extras`
      var rotated = order.slice(extras).concat(order.slice(0, extras));
      projected[st] = { order: rotated, extras: 0 };
    });

    return { success: true, data: { foundMonth: foundMonth, projectedMonth: targetYYYYMM, record: projected } };
  }

  return {
    getSchedule,
    saveShift,
    batchSaveShifts,
    clearSchedule,
    lockSchedule,
    unlockSchedule,
    getHolidays,
    saveHolidays,
    saveHolidayDuty,
    getGovHolidays,
    getRecentRotationRecord
  };

})();

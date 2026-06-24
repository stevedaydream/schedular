/**
 * Request.gs — 預約 CRUD
 */

var Request = (function () {

  function getRequestSheetName(yyyyMM) {
    return 'Requests_' + yyyyMM;
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  function getRequests(params) {
    const yyyyMM = params.yyyyMM;
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM 參數' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(getRequestSheetName(yyyyMM));

    if (!sheet) return { success: true, data: {} };

    const rows = sheetToObjects(sheet);
    const result = {};

    rows.forEach(row => {
      const userId = row.userId;
      if (!userId) return;
      const userRequests = {};
      Object.entries(row).forEach(([key, val]) => {
        if (key.startsWith('day_')) {
          userRequests[key] = val || null;
        }
      });

      // Parse overBooked
      try {
        userRequests.overBooked = row.overBooked
          ? JSON.parse(row.overBooked)
          : [];
      } catch {
        userRequests.overBooked = [];
      }

      result[userId] = userRequests;
    });

    return { success: true, data: result };
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  function saveRequest(body) {
    const { yyyyMM, userId, day, shift } = body;
    if (!yyyyMM || !userId || !day) return { success: false, error: '缺少必要參數' };

    // Only the user themselves can save their own requests
    if (body._user && body._user.userId !== userId && body._user.role === 'member') {
      return { success: false, error: '無法修改他人的預約' };
    }

    // Check if schedule is locked for this month
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const metaSheet = ss.getSheetByName('ScheduleMeta_' + yyyyMM);
    if (metaSheet) {
      const metaRows = sheetToObjects(metaSheet);
      const lockedRow = metaRows.find(r => r.key === 'isLocked');
      if (lockedRow && (lockedRow.value === 'true' || lockedRow.value === true)) {
        return { success: false, error: '本月班表已鎖定，無法提交預約' };
      }
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const daysInMonth = getDaysInMonth(yyyyMM);
      const headers = ['userId'];
      for (let d = 1; d <= daysInMonth; d++) headers.push('day_' + d);
      headers.push('overBooked');

      const sheet = getOrCreateSheet(ss, getRequestSheetName(yyyyMM), headers);

      // Check overbook condition
      const allRows = sheetToObjects(sheet);
      const dayKey = `day_${day}`;

      // 勿值類型不進行 overBook 計算
      const CONSTRAINT_SHIFTS = ['NO_DN', 'NO_D', 'NO_N'];
      const isConstraint = CONSTRAINT_SHIFTS.includes(shift);

      // Count how many people have requested this shift for this day
      let requestCount = 0;
      if (!isConstraint) {
        allRows.forEach(row => {
          if (row.userId !== userId && row[dayKey] === shift) requestCount++;
        });
      }

      // Get required count from settings
      const required = isConstraint ? 999 : getRequiredCountForDay(ss, yyyyMM, day, shift);
      const isOverBooked = !isConstraint && requestCount >= required;

      // Get or create user row
      let rowIdx = findRowIndex(sheet, 'userId', userId);
      if (rowIdx === -1) {
        const newRow = new Array(headers.length).fill('');
        newRow[0] = userId;
        sheet.appendRow(newRow);
        rowIdx = sheet.getLastRow();
      }

      const currentRow = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
      const dayColIdx = headers.indexOf(dayKey);
      if (dayColIdx !== -1) currentRow[dayColIdx] = shift || '';

      // Update overBooked list
      let overBookedList = [];
      try {
        overBookedList = currentRow[headers.indexOf('overBooked')]
          ? JSON.parse(currentRow[headers.indexOf('overBooked')])
          : [];
      } catch { overBookedList = []; }

      if (isOverBooked && shift && !overBookedList.includes(String(day))) {
        overBookedList.push(String(day));
      } else if (!isOverBooked) {
        overBookedList = overBookedList.filter(d => d !== String(day));
      }

      currentRow[headers.indexOf('overBooked')] = JSON.stringify(overBookedList);
      sheet.getRange(rowIdx, 1, 1, headers.length).setValues([currentRow]);

      return { success: true, data: { overBooked: isOverBooked, overBookedList } };
    } finally {
      lock.releaseLock();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getDaysInMonth(yyyyMM) {
    const year = parseInt(yyyyMM.slice(0, 4));
    const month = parseInt(yyyyMM.slice(4, 6));
    return new Date(year, month, 0).getDate();
  }

  function getRequiredCountForDay(ss, yyyyMM, day, shift) {
    const year = parseInt(yyyyMM.slice(0, 4));
    const month = parseInt(yyyyMM.slice(4, 6));
    const dayNum = parseInt(day);
    const date = new Date(year, month - 1, dayNum);
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

    // Check if holiday
    const holidaySheet = ss.getSheetByName('Holidays_' + year);
    let isHoliday = false;
    if (holidaySheet) {
      const dateStr = year + '-' +
        String(month).padStart(2, '0') + '-' +
        String(dayNum).padStart(2, '0');
      const holidays = sheetToObjects(holidaySheet);
      const h = holidays.find(r => r.date === dateStr &&
        (r.isHoliday === true || r.isHoliday === 'true' || r.isHoliday === 'TRUE'));
      if (h) isHoliday = true;
    }

    const settings = getSettingsObj(ss);

    if (isHoliday) {
      if (shift === 'D') return parseInt(settings.holD) || 1;
      if (shift === 'N') return parseInt(settings.holN) || 1;
    } else if (dayOfWeek === 0) { // Sunday
      if (shift === 'D') return parseInt(settings.sunD) || 1;
      if (shift === 'N') return parseInt(settings.sunN) || 1;
    } else if (dayOfWeek === 6) { // Saturday
      if (shift === 'D') return 1;
      if (shift === 'N') return 1;
      if (shift === 'AM') return parseInt(settings.satAM) || 3;
    } else { // Weekday
      if (shift === 'D') return parseInt(settings.wdD) || 1;
      if (shift === 'N') return parseInt(settings.wdN) || 1;
      if (shift === 'AM') return parseInt(settings.wdAM) || 3;
    }
    return 999; // No limit for Off
  }

  function getSettingsObj(ss) {
    const sheet = ss.getSheetByName('Settings');
    if (!sheet) return {};
    const rows = sheetToObjects(sheet);
    const obj = {};
    rows.forEach(row => { obj[row.key] = row.value; });
    return obj;
  }

  return { getRequests, saveRequest };

})();

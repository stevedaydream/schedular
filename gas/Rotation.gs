/**
 * Rotation.gs — 輪序池狀態管理
 */

var Rotation = (function () {

  var ROTATION_POOLS_SHEET = 'RotationPools';

  var POOL_NAMES = [
    'satOff', 'satD', 'satN', 'satAM',
    'sunOff', 'sunD', 'sunN',
    'holOff', 'holD', 'holN',
    'wdOff', 'wdD', 'wdN', 'wdAM'
  ];

  function getRotationState() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(ROTATION_POOLS_SHEET);

    if (!sheet) return { success: true, data: [] };

    const rows = sheetToObjects(sheet);
    const pools = rows.map(row => {
      try {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return { poolName: row.poolName, ...data };
      } catch {
        return { poolName: row.poolName, order: [], lastIndex: -1, skipQueue: [] };
      }
    });

    return { success: true, data: pools };
  }

  function initializePools(userIds) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      const sheet = getOrCreateSheet(ss, ROTATION_POOLS_SHEET, ['poolName', 'data']);

      POOL_NAMES.forEach(poolName => {
        const poolData = {
          poolName,
          order: [...userIds],
          lastIndex: -1,
          skipQueue: []
        };

        const rowIdx = findRowIndex(sheet, 'poolName', poolName);
        if (rowIdx !== -1) {
          // Only update order if pool doesn't have existing order
          const existingRow = sheet.getRange(rowIdx, 1, 1, 2).getValues()[0];
          const existing = JSON.parse(existingRow[1] || '{}');
          if (!existing.order || existing.order.length === 0) {
            sheet.getRange(rowIdx, 2).setValue(JSON.stringify(poolData));
          }
        } else {
          sheet.appendRow([poolName, JSON.stringify(poolData)]);
        }
      });

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function updatePool(poolName, poolData) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateSheet(ss, ROTATION_POOLS_SHEET, ['poolName', 'data']);
      const rowIdx = findRowIndex(sheet, 'poolName', poolName);

      if (rowIdx !== -1) {
        sheet.getRange(rowIdx, 2).setValue(JSON.stringify(poolData));
      } else {
        sheet.appendRow([poolName, JSON.stringify(poolData)]);
      }

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function resetPools() {
    // Called by superadmin to reset all pools to default order
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    if (!usersSheet) return { success: false, error: '找不到 Users 分頁' };

    const users = sheetToObjects(usersSheet).filter(u =>
      u.isActive === true || u.isActive === 'true' || u.isActive === 'TRUE'
    );
    const userIds = users
      .sort((a, b) => (parseInt(a.sortOrder) || 0) - (parseInt(b.sortOrder) || 0))
      .map(u => u.userId);

    return initializePools(userIds);
  }

  function saveRotationPool(body) {
    if (body._user?.role !== 'superadmin' && body._user?.role !== 'scheduler') {
      return { success: false, error: '權限不足' };
    }
    const { poolName, poolData } = body;
    if (!poolName || !poolData) return { success: false, error: '缺少 poolName 或 poolData' };
    return updatePool(poolName, poolData);
  }

  function saveAllRotationPools(body) {
    if (body._user?.role !== 'superadmin' && body._user?.role !== 'scheduler') {
      return { success: false, error: '權限不足' };
    }
    const { pools } = body;
    if (!Array.isArray(pools)) return { success: false, error: '缺少 pools 陣列' };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = getOrCreateSheet(ss, ROTATION_POOLS_SHEET, ['poolName', 'data']);
      pools.forEach(function(pool) {
        const { poolName, ...poolData } = pool;
        const rowIdx = findRowIndex(sheet, 'poolName', poolName);
        if (rowIdx !== -1) {
          sheet.getRange(rowIdx, 2).setValue(JSON.stringify(poolData));
        } else {
          sheet.appendRow([poolName, JSON.stringify(poolData)]);
        }
      });
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  // ─── 班別配額輪序 (D / N / Off) ────────────────────────────────────────────

  var BALANCE_FIELDS = ['D', 'N', 'Off', 'W6Off'];

  function getShiftBalance() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('ShiftBalanceState');
    if (!sheet) return { success: true, data: [] };
    const rows = sheetToObjects(sheet);
    return {
      success: true,
      data: rows.map(function(r) {
        return {
          userId: String(r.userId),
          D: parseFloat(r.D) || 0,
          N: parseFloat(r.N) || 0,
          Off: parseFloat(r.Off) || 0,
          W6Off: parseFloat(r.W6Off) || 0
        };
      })
    };
  }

  // body: { yyyyMM, totals: {D, N, Off, W6Off}, userIds: [] }
  // Distributes floor/ceil for D, N, Off, W6Off based on balance
  // Saves dQuota, nQuota, offQuota, w6offQuota to ScheduleMeta_{yyyyMM}
  // Returns preview array: [{ userId, D:{quota,balanceBefore,balanceAfter}, N:{...}, Off:{...}, W6Off:{...} }]
  function applyMonthlyShiftQuota(body) {
    if (body._user?.role !== 'superadmin' && body._user?.role !== 'scheduler') {
      return { success: false, error: '權限不足' };
    }
    const { yyyyMM, totals, userIds } = body;
    if (!yyyyMM || !totals || !Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, error: '缺少必要參數' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      // Check for locked rotationRecord (already committed this month)
      const metaSheet = getOrCreateSheet(ss, 'ScheduleMeta_' + yyyyMM, ['key', 'value']);
      var lockedRecord = null;
      var lockedRecordRowIdx = findRowIndex(metaSheet, 'key', 'rotationRecord');
      if (lockedRecordRowIdx !== -1) {
        try {
          lockedRecord = JSON.parse(metaSheet.getRange(lockedRecordRowIdx, 2).getValue());
        } catch(e) { lockedRecord = null; }
      }

      // Read balances (always needed for balanceBefore/After in preview)
      const balSheet = ss.getSheetByName('ShiftBalanceState');
      const balMap = {};
      if (balSheet) {
        sheetToObjects(balSheet).forEach(function(r) {
          balMap[String(r.userId)] = {
            D: parseFloat(r.D) || 0,
            N: parseFloat(r.N) || 0,
            Off: parseFloat(r.Off) || 0,
            W6Off: parseFloat(r.W6Off) || 0
          };
        });
      }

      const n = userIds.length;
      const quotasByShift = {};

      BALANCE_FIELDS.forEach(function(shift) {
        const total = totals[shift] || 0;
        const base = Math.floor(total / n);
        const extras = total - base * n;
        const expected = total / n;

        var orderedUserIds;
        if (lockedRecord && lockedRecord[shift] && Array.isArray(lockedRecord[shift].order)) {
          // Locked: use the committed rotation order, don't re-sort by balance
          orderedUserIds = lockedRecord[shift].order.filter(function(uid) {
            return userIds.indexOf(uid) !== -1;
          });
          // Append any users not in the locked order (e.g. newly added users)
          userIds.forEach(function(uid) {
            if (orderedUserIds.indexOf(uid) === -1) orderedUserIds.push(uid);
          });
        } else {
          // Normal: sort by balance ascending
          orderedUserIds = userIds
            .map(function(uid) { return { userId: uid, balance: (balMap[uid] || {})[shift] || 0 }; })
            .sort(function(a, b) { return a.balance - b.balance; })
            .map(function(item) { return item.userId; });
        }

        const shiftQuota = {};
        orderedUserIds.forEach(function(uid, i) {
          shiftQuota[uid] = i < extras ? base + 1 : base;
        });
        quotasByShift[shift] = { quota: shiftQuota, orderedUserIds: orderedUserIds, base: base, extras: extras, expected: parseFloat(expected.toFixed(4)) };
      });

      // Save quota keys to ScheduleMeta
      [
        ['dQuota',     quotasByShift.D.quota],
        ['nQuota',     quotasByShift.N.quota],
        ['offQuota',   quotasByShift.Off.quota],
        ['w6offQuota', quotasByShift.W6Off.quota]
      ].forEach(function(pair) {
        const rowIdx = findRowIndex(metaSheet, 'key', pair[0]);
        const value = JSON.stringify(pair[1]);
        if (rowIdx !== -1) {
          metaSheet.getRange(rowIdx, 2).setValue(value);
        } else {
          metaSheet.appendRow([pair[0], value]);
        }
      });

      // Build preview in the distribution order (not original userIds order)
      // Use D's ordered list as the display order; each row contains all shifts
      const previewMap = {};
      userIds.forEach(function(uid) {
        const bal = balMap[uid] || { D: 0, N: 0, Off: 0, W6Off: 0 };
        const row = { userId: uid };
        BALANCE_FIELDS.forEach(function(shift) {
          const info = quotasByShift[shift];
          const q = info.quota[uid];
          const before = bal[shift] || 0;
          const after = parseFloat((before + q - info.expected).toFixed(4));
          row[shift] = { quota: q, balanceBefore: before, balanceAfter: after, base: info.base, extras: info.extras };
        });
        previewMap[uid] = row;
      });
      // Return rows in D's distribution order for consistent display
      const preview = quotasByShift.D.orderedUserIds.map(function(uid) { return previewMap[uid]; });

      return { success: true, data: { preview, totals, locked: lockedRecord !== null } };
    } finally {
      lock.releaseLock();
    }
  }

  // body: { assignments: {userId: {D,N,Off,W6Off}}, expected: {D,N,Off,W6Off} }  — settle mode
  //   OR: { resetBalances: {userId: {D?,N?,Off?,W6Off?}} }  — partial reset mode (only update provided fields)
  function commitShiftBalance(body) {
    if (body._user?.role !== 'superadmin' && body._user?.role !== 'scheduler') {
      return { success: false, error: '權限不足' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateSheet(ss, 'ShiftBalanceState', ['userId', 'D', 'N', 'Off', 'W6Off']);

      // Ensure W6Off column exists (migration for sheets created before W6Off was added)
      var hdrsCheck = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (hdrsCheck.indexOf('W6Off') === -1) {
        sheet.getRange(1, hdrsCheck.length + 1).setValue('W6Off');
      }

      // Read current headers (after migration)
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var ncols = headers.length;

      function readRow(userId) {
        var rowIdx = findRowIndex(sheet, 'userId', userId);
        var cur = { D: 0, N: 0, Off: 0, W6Off: 0 };
        if (rowIdx !== -1) {
          var vals = sheet.getRange(rowIdx, 1, 1, ncols).getValues()[0];
          headers.forEach(function(h, i) {
            if (h !== 'userId') cur[h] = parseFloat(vals[i]) || 0;
          });
        }
        return { rowIdx: rowIdx, cur: cur };
      }

      function writeRow(rowIdx, userId, data) {
        var row = headers.map(function(h) {
          return h === 'userId' ? userId : (data[h] !== undefined ? data[h] : 0);
        });
        if (rowIdx !== -1) {
          sheet.getRange(rowIdx, 1, 1, ncols).setValues([row]);
        } else {
          sheet.appendRow(row);
        }
      }

      if (body.resetBalances) {
        Object.entries(body.resetBalances).forEach(function([userId, updates]) {
          var ref = readRow(userId);
          // Partial update: only override fields that are explicitly provided
          Object.keys(updates).forEach(function(f) {
            if (updates[f] !== undefined && updates[f] !== null) ref.cur[f] = updates[f];
          });
          writeRow(ref.rowIdx, userId, ref.cur);
        });

        // If yyyyMM provided, delete rotationRecord from ScheduleMeta to unlock rotation
        if (body.yyyyMM) {
          var unlockMeta = ss.getSheetByName('ScheduleMeta_' + body.yyyyMM);
          if (unlockMeta) {
            var recRow = findRowIndex(unlockMeta, 'key', 'rotationRecord');
            if (recRow !== -1) unlockMeta.deleteRow(recRow);
          }
        }

        return { success: true };
      }

      var assignments = body.assignments;
      var expected = body.expected;
      if (!assignments || !expected) return { success: false, error: '缺少 assignments 或 expected' };

      Object.entries(assignments).forEach(function([userId, actual]) {
        var ref = readRow(userId);
        BALANCE_FIELDS.forEach(function(f) {
          ref.cur[f] = parseFloat((ref.cur[f] + (actual[f] || 0) - (expected[f] || 0)).toFixed(4));
        });
        writeRow(ref.rowIdx, userId, ref.cur);
      });

      // Save rotationRecord to ScheduleMeta for reference
      if (body.yyyyMM && body.rotationRecord) {
        var metaSheet = getOrCreateSheet(ss, 'ScheduleMeta_' + body.yyyyMM, ['key', 'value']);
        var recIdx = findRowIndex(metaSheet, 'key', 'rotationRecord');
        var recValue = JSON.stringify(body.rotationRecord);
        if (recIdx !== -1) {
          metaSheet.getRange(recIdx, 2).setValue(recValue);
        } else {
          metaSheet.appendRow(['rotationRecord', recValue]);
        }
      }

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  return {
    getRotationState, initializePools, updatePool, saveRotationPool, saveAllRotationPools, resetPools,
    getShiftBalance, applyMonthlyShiftQuota, commitShiftBalance
  };

})();

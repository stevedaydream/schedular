/**
 * AutoSchedule.gs — 自動排班引擎
 */
var AutoSchedule = (function () {

  var WORK_SHIFTS = ['D', 'N', 'S1', 'H3', 'AM'];
  function mkWarn(type, msg, userId, day) { return { type: type, message: msg, userId: userId || null, day: day || null }; }

  // 勿值: stored as NO_DN / NO_D / NO_N in Requests sheet
  function isWuZhi(req) { return req === 'NO_DN' || req === 'NO_D' || req === 'NO_N'; }
  // 勿值 that blocks D specifically
  function isWuZhiD(req) { return req === 'NO_DN' || req === 'NO_D'; }
  // 勿值 that blocks N specifically
  function isWuZhiN(req) { return req === 'NO_DN' || req === 'NO_N'; }

  /**
   * 讀取 shiftTypes quota，以班別管理設定覆蓋 settings 的每日人力 key。
   * 前端以 shiftTypes quota 為主，這裡確保 GAS 側邏輯一致。
   * 覆蓋後所有下游函式仍透過 settings.wdD 等 key 讀取，不需改簽名。
   */
  function applyShiftTypeNeeds(settings, stList) {
    var PAIRS = [
      { id: 'D',  dayType: 'weekday',  key: 'wdD'  },
      { id: 'N',  dayType: 'weekday',  key: 'wdN'  },
      { id: 'S1', dayType: 'weekday',  key: 'wdS1' },
      { id: 'D',  dayType: 'holiday',  key: 'holD' },
      { id: 'N',  dayType: 'holiday',  key: 'holN' },
      { id: 'D',  dayType: 'sunday',   key: 'sunD' },
      { id: 'N',  dayType: 'sunday',   key: 'sunN' },
      { id: 'H3', dayType: 'saturday', key: 'satH3' }
    ];
    PAIRS.forEach(function(p) {
      var st = stList && stList.filter(function(t) { return t.id === p.id; })[0];
      if (st && st.quota) {
        var v = st.quota[p.dayType];
        if (v !== undefined && v !== null && v !== '') {
          settings[p.key] = String(parseInt(v) || 0);
          return;
        }
      }
      // keep existing settings value as fallback
    });
  }

  function isWork(s) { return !!s && WORK_SHIFTS.indexOf(s) !== -1; }
  function isRest(s) { return !s || s === 'Off' || s === 'W6Off'; }

  // ─── Main ─────────────────────────────────────────────────────────────────

  function autoFillSchedule(body) {
    var userRole = body._user && body._user.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可執行自動排班' };
    }
    var yyyyMM = body.yyyyMM;
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var settingsResult = Settings_.getSettings();
    var settings = settingsResult.success ? settingsResult.data : {};
    var rules = parseRules(settings);

    var usersResult = Auth.getUsers();
    if (!usersResult.success) return { success: false, error: '無法取得使用者' };
    var users = usersResult.data.filter(function (u) {
      return u.isActive === true && !u.noSchedule;
    });

    var schedResult = Schedule.getSchedule({ yyyyMM: yyyyMM });
    if (!schedResult.success) return { success: false, error: '無法取得班表' };
    var currentSchedule = schedResult.data.schedule || {};
    var meta = schedResult.data.meta || {};
    var quotaOverrides = meta.quotaOverrides || {};

    var reqResult = Request.getRequests({ yyyyMM: yyyyMM });
    var requestData = reqResult.success ? (reqResult.data || {}) : {};

    var year = parseInt(yyyyMM.slice(0, 4));
    var holResult = Schedule.getHolidays({ year: year });
    var holidays = holResult.success ? holResult.data : [];
    var holidayDates = {};
    holidays.forEach(function (h) { if (h.isHoliday) holidayDates[h.date] = true; });

    var cal = buildCal(yyyyMM, holidayDates);
    var daysInMonth = cal.length;
    var quotas = buildQuotas(users, meta, quotaOverrides);
    var prevTail = loadPrevTail(ss, yyyyMM, users);

    var sched = {};
    var locked = {};
    users.forEach(function (u) {
      var uid = u.userId;
      sched[uid] = {};
      locked[uid] = {};
      for (var d = 1; d <= daysInMonth; d++) {
        var v = currentSchedule[uid] && currentSchedule[uid]['day_' + d];
        if (v) {
          // Normalize: Saturday "Off" → "W6Off" (request form uses "Off" for Saturday)
          if (v === 'Off' && cal[d - 1].isSat) v = 'W6Off';
          sched[uid][d] = v;
          locked[uid][d] = true;
        }
      }
    });

    // Apply scheduler adjustments as additional soft-locks (from previous manual overrides)
    var adjData = meta.schedulerAdjustments || {};
    users.forEach(function (u) {
      var uid = u.userId;
      var adj = adjData[uid] || {};
      for (var d = 1; d <= daysInMonth; d++) {
        var adjShift = adj['day_' + d];
        if (adjShift && !locked[uid][d]) {
          sched[uid][d] = adjShift;
          locked[uid][d] = true;
        }
      }
    });

    var rem = {};
    users.forEach(function (u) {
      var uid = u.userId;
      var q = quotas[uid];
      var cnt = { D: 0, N: 0, Off: 0, W6Off: 0 };
      for (var d = 1; d <= daysInMonth; d++) {
        var s = sched[uid][d];
        if (cnt[s] !== undefined) cnt[s]++;
      }
      rem[uid] = {
        D: Math.max(0, q.D - cnt.D),
        N: Math.max(0, q.N - cnt.N),
        // W6Off is a sub-type of Off — both consume the same Off budget
        Off: Math.max(0, q.Off - cnt.Off - cnt.W6Off),
        W6Off: Math.max(0, q.W6Off - cnt.W6Off)
      };
    });

    // Build uid → display label (code if set, else name)
    var uidLabel = {};
    users.forEach(function (u) { uidLabel[u.userId] = (u.code || u.name || u.userId); });

    var warnings = [];
    // New execution order: pre-mark 勿值 first, then N (most constrained), then weekends, then D, then Off/S1
    stepPreMarkWuZhi(sched, locked, rem, users, requestData, daysInMonth);
    stepN(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings, uidLabel);
    stepW6(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings, uidLabel);
    stepD(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings);
    stepOffS1(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings);
    stepS1(sched, locked, users, cal);
    fixDailyBalance(sched, locked, users, cal, daysInMonth, settings, warnings, uidLabel);
    stepEnforceWeeklyOff(sched, locked, users, cal, prevTail, daysInMonth, warnings, uidLabel);
    stepPostCheck(sched, locked, users, daysInMonth, warnings, uidLabel);
    stepFinalValidate(sched, locked, users, requestData, daysInMonth, warnings, uidLabel);
    scanFragmentShifts(sched, locked, users, daysInMonth, prevTail, rules, warnings, uidLabel);

    var preview = {};
    users.forEach(function (u) {
      var uid = u.userId;
      preview[uid] = {};
      for (var d = 1; d <= daysInMonth; d++) {
        if (!locked[uid][d] && sched[uid][d]) {
          preview[uid]['day_' + d] = sched[uid][d];
        }
      }
    });

    return { success: true, data: { preview: preview, warnings: warnings } };
  }

  // ─── Calendar ─────────────────────────────────────────────────────────────

  function buildCal(yyyyMM, holidayDates) {
    var y = parseInt(yyyyMM.slice(0, 4));
    var m = parseInt(yyyyMM.slice(4, 6)) - 1;
    var days = new Date(y, m + 1, 0).getDate();
    var result = [];
    for (var d = 1; d <= days; d++) {
      var dow = new Date(y, m, d).getDay();
      var ds = yyyyMM.slice(0, 4) + '-' + yyyyMM.slice(4, 6) + '-' + String(d).padStart(2, '0');
      var isHol = !!holidayDates[ds];
      result.push({
        day: d, dow: dow, dateStr: ds,
        isWeekend: dow === 0 || dow === 6,
        isSat: dow === 6, isSun: dow === 0,
        isHol: isHol,
        isWeekday: dow >= 1 && dow <= 5 && !isHol
      });
    }
    return result;
  }

  // ─── Quotas ───────────────────────────────────────────────────────────────

  function buildQuotas(users, meta, overrides) {
    var q = {};
    users.forEach(function (u) {
      var uid = u.userId;
      var ov = overrides[uid] || {};
      q[uid] = {
        D: ov.D ? (ov.D.target || 0) : (meta.dQuota && meta.dQuota[uid] != null ? Number(meta.dQuota[uid]) : 0),
        N: ov.N ? (ov.N.target || 0) : (meta.nQuota && meta.nQuota[uid] != null ? Number(meta.nQuota[uid]) : 0),
        Off: ov.Off ? (ov.Off.target || 0) : (meta.offQuota && meta.offQuota[uid] != null ? Number(meta.offQuota[uid]) : 0),
        W6Off: ov.W6Off ? (ov.W6Off.target || 0) : (meta.w6offQuota && meta.w6offQuota[uid] != null ? Number(meta.w6offQuota[uid]) : 0)
      };
    });
    return q;
  }

  // ─── Rules ────────────────────────────────────────────────────────────────

  function parseRules(settings) {
    var defaults = {
      maxConsecutiveWork: 6, maxConsecutiveN: 4, preferNGroup: 3,
      maxDPerWeek: 3, nMustEndOff: true, avoidNOffD: true,
      // 碎班檢查（休-班-休，單日工作夾在兩個休假之間）
      // forbidFragmentShift: 總開關；false 則完全略過碎班掃描
      // fragmentShiftTypes: 視為「碎班」的班別值，預設只看全日臨床班 D / N
      forbidFragmentShift: true, fragmentShiftTypes: ['D', 'N']
    };
    if (!settings.autoScheduleRules) return defaults;
    try {
      var p = typeof settings.autoScheduleRules === 'string'
        ? JSON.parse(settings.autoScheduleRules) : settings.autoScheduleRules;
      return Object.assign({}, defaults, p);
    } catch (e) { return defaults; }
  }

  // ─── Prev Month Tail ──────────────────────────────────────────────────────

  function loadPrevTail(ss, yyyyMM, users) {
    var y = parseInt(yyyyMM.slice(0, 4));
    var m = parseInt(yyyyMM.slice(4, 6));
    var py = m === 1 ? y - 1 : y;
    var pm = m === 1 ? 12 : m - 1;
    var prevMM = String(py) + String(pm).padStart(2, '0');
    var tail = {};
    users.forEach(function (u) { tail[u.userId] = []; });

    var sheet = ss.getSheetByName('Schedule_' + prevMM);
    if (!sheet) {
      var archiveId = getConfig(ss, 'archiveSpreadsheetId');
      if (archiveId) {
        try {
          var archiveSS = SpreadsheetApp.openById(archiveId);
          sheet = archiveSS.getSheetByName('Schedule_' + prevMM);
        } catch (e) {}
      }
    }
    if (!sheet) return tail;

    try {
      var dInPrev = new Date(py, pm, 0).getDate();
      var lookback = Math.min(14, dInPrev);
      var startD = dInPrev - lookback + 1;
      var rows = sheetToObjects(sheet);
      rows.forEach(function (row) {
        var uid = row.userId;
        if (!uid || tail[uid] === undefined) return;
        var arr = [];
        for (var d = startD; d <= dInPrev; d++) arr.push(row['day_' + d] || null);
        tail[uid] = arr;
      });
    } catch (e) {}
    return tail;
  }

  function getConfig(ss, key) {
    var sheet = ss.getSheetByName('Config');
    if (!sheet) return null;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === key) return data[i][1] ? String(data[i][1]) : null;
    }
    return null;
  }

  // ─── Constraint Helpers ───────────────────────────────────────────────────

  function getAt(uid, day, sched, prevTail) {
    if (day >= 1) return sched[uid][day] || null;
    var tail = prevTail[uid] || [];
    var tidx = tail.length - 1 + day;
    return tidx >= 0 ? tail[tidx] : null;
  }

  function consWorkBefore(uid, day, sched, prevTail) {
    var count = 0;
    for (var d = day - 1; d >= 1; d--) {
      if (isWork(sched[uid][d])) count++;
      else return count;
    }
    var tail = prevTail[uid] || [];
    for (var i = tail.length - 1; i >= 0; i--) {
      if (isWork(tail[i])) count++;
      else break;
    }
    return count;
  }

  function consNBefore(uid, day, sched, prevTail) {
    var count = 0;
    for (var d = day - 1; d >= 1; d--) {
      if (sched[uid][d] === 'N') count++;
      else return count;
    }
    var tail = prevTail[uid] || [];
    for (var i = tail.length - 1; i >= 0; i--) {
      if (tail[i] === 'N') count++;
      else break;
    }
    return count;
  }

  // ─── Step 0: Pre-mark 勿值 days as Off ────────────────────────────────────
  // Must run before stepN so D/N placement naturally skips these slots.
  // Also decrements rem.Off so downstream quota tracking stays accurate.

  function stepPreMarkWuZhi(sched, locked, rem, users, requestData, daysInMonth) {
    // No-op: NO_DN allows S1 on weekdays and H3/W6Off on Saturdays.
    // Constraints are enforced per-step via isWuZhiD / isWuZhiN checks.
  }

  // ─── Step 1: N groups (runs FIRST — most constrained board) ───────────────
  // Sort users by fewest available contiguous weekday slots (most constrained first).
  // If placement fails, try shifting another user's non-locked N group by 1 day.

  function stepN(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings, uidLabel) {
    var weekdayCal = cal.filter(function (c) { return !c.isWeekend; });
    var weekdays = weekdayCal.map(function (c) { return c.day; });

    var dailyN = {};
    for (var d = 1; d <= daysInMonth; d++) {
      dailyN[d] = 0;
      users.forEach(function (u) { if (sched[u.userId][d] === 'N') dailyN[d]++; });
    }

    function getNeed(day) {
      var c = cal[day - 1];
      if (c.isHol) return parseInt(settings.holN) || 1;
      if (c.isSat) return parseInt(settings.satN) || 1;
      if (c.isSun) return parseInt(settings.sunN) || 1;
      return parseInt(settings.wdN) || 1;
    }

    // Count max contiguous available weekday slots for a user
    function maxContiguous(uid) {
      var max = 0, cur = 0;
      weekdays.forEach(function (d) {
        if (!locked[uid][d] && !sched[uid][d]) { cur++; if (cur > max) max = cur; }
        else cur = 0;
      });
      return max;
    }

    // Count existing N shifts already in sched (locked or previously placed)
    function existingNCount(uid) {
      var cnt = 0;
      for (var d = 1; d <= daysInMonth; d++) {
        if (sched[uid][d] === 'N') cnt++;
      }
      return cnt;
    }

    // Sort priority:
    // 1. Most existing N first — these have cluster anchors; extend before space fills up
    // 2. Least remaining N quota — nearly-done users placed before high-demand ones
    // 3. Most constrained available space — fewest contiguous slots last resort
    var sorted = users.slice().sort(function (a, b) {
      var aExist = existingNCount(a.userId);
      var bExist = existingNCount(b.userId);
      if (aExist !== bExist) return bExist - aExist;
      var aRem = rem[a.userId].N;
      var bRem = rem[b.userId].N;
      if (aRem !== bRem) return aRem - bRem;
      return maxContiguous(a.userId) - maxContiguous(b.userId);
    });

    // Return all contiguous N clusters for uid: [{start, end, size}]
    function getNGroups(uid) {
      var clusters = [];
      var d = 1;
      while (d <= daysInMonth) {
        if (sched[uid][d] === 'N') {
          var s = d;
          while (d <= daysInMonth && sched[uid][d] === 'N') d++;
          clusters.push({ start: s, end: d - 1, size: d - 1 - s + 1 });
        } else { d++; }
      }
      return clusters;
    }

    // Phase 1: extend each existing N cluster leftward into adjacent weekdays
    function extendNGroupsLeft(uid) {
      var clusters = getNGroups(uid);
      for (var ci = 0; ci < clusters.length; ci++) {
        var cl = clusters[ci];
        while (rem[uid].N > 0) {
          var candidate = cl.start - 1;
          if (candidate < 1) break;
          if (locked[uid][candidate] || sched[uid][candidate]) break;
          if (cal[candidate - 1].isWeekend) break; // only extend into weekdays
          if (dailyN[candidate] >= getNeed(candidate)) break;
          // Consecutive N: nBefore + 1(new) + clusterSize <= maxConsecutiveN
          var nBefore = consNBefore(uid, candidate, sched, prevTail);
          if (nBefore + 1 + cl.size > rules.maxConsecutiveN) break;
          // Consecutive work
          var wBefore = consWorkBefore(uid, candidate, sched, prevTail);
          if (wBefore + 1 + cl.size > rules.maxConsecutiveWork) break;
          // Day before cannot be D
          if (getAt(uid, candidate - 1, sched, prevTail) === 'D') break;

          sched[uid][candidate] = 'N';
          dailyN[candidate]++;
          rem[uid].N--;
          cl.start = candidate;
          cl.size++;
        }
      }
    }

    // Find valid candidate positions for uid's N group of gSize
    function findCandidates(uid, gSize) {
      var avail = weekdays.filter(function (d) {
        return !locked[uid][d] && !sched[uid][d];
      });
      var candidates = [];
      for (var ai = 0; ai <= avail.length - gSize; ai++) {
        var startDay = avail[ai];
        var ok = true;
        for (var k = 1; k < gSize; k++) {
          if (avail[ai + k] !== startDay + k) { ok = false; break; }
        }
        if (!ok) continue;
        var endDay = startDay + gSize - 1;
        var nBefore = consNBefore(uid, startDay, sched, prevTail);
        if (nBefore + gSize > rules.maxConsecutiveN) continue;
        // Day before N group cannot be D (D N…N Off pattern forbidden)
        if (getAt(uid, startDay - 1, sched, prevTail) === 'D') continue;
        var afterDay = endDay + 1;
        if (afterDay <= daysInMonth && locked[uid][afterDay]) {
          var afterS = sched[uid][afterDay];
          if (afterS === 'D' || afterS === 'S1') continue;
        }
        // Day after trailing Off cannot be D (N…N Off D pattern forbidden)
        var afterOff = endDay + 2;
        if (afterOff <= daysInMonth && locked[uid][afterOff] && sched[uid][afterOff] === 'D') continue;
        var wBefore = consWorkBefore(uid, startDay, sched, prevTail);
        if (wBefore + gSize > rules.maxConsecutiveWork) continue;
        var nOk = true;
        for (var kn = 0; kn < gSize; kn++) {
          if (dailyN[startDay + kn] >= getNeed(startDay + kn)) { nOk = false; break; }
          // Skip if user has NO_N or NO_DN request on this N day
          var nDayReq = (requestData[uid] || {})['day_' + (startDay + kn)];
          if (isWuZhiN(nDayReq)) { nOk = false; break; }
        }
        if (!nOk) continue;
        var score = 0;
        for (var k2 = 0; k2 < gSize; k2++) {
          score += Math.max(0, getNeed(startDay + k2) - dailyN[startDay + k2]);
        }
        // Bonus: trailing Off day falls on a 勿值 request day
        var trailingOffDay = startDay + gSize;
        if (trailingOffDay <= daysInMonth && isWuZhi((requestData[uid] || {})['day_' + trailingOffDay])) {
          score += 10;
        }
        candidates.push({ start: startDay, score: score });
      }
      return candidates;
    }

    // Place an N group for uid starting at startDay
    function placeNGroup(uid, startDay, gSize) {
      for (var k = 0; k < gSize; k++) {
        var nd = startDay + k;
        sched[uid][nd] = 'N'; dailyN[nd]++; rem[uid].N--;
      }
      assignTrailingOff(uid, startDay + gSize);
    }

    // Assign trailing Off after N, normalizing Saturday to W6Off
    function assignTrailingOff(uid, offDay) {
      if (offDay > daysInMonth || locked[uid][offDay] || sched[uid][offDay]) return;
      if (cal[offDay - 1].isSat) {
        sched[uid][offDay] = 'W6Off';
        rem[uid].W6Off = Math.max(0, (rem[uid].W6Off || 0) - 1);
        rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
      } else {
        sched[uid][offDay] = 'Off';
        rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
      }
    }

    // Swap-with-null: try shifting another user's non-locked N group by +1 day
    // to free up space for uid's group of gSize
    function tryNGroupShift(uid, gSize) {
      for (var yi = 0; yi < users.length; yi++) {
        var yid = users[yi].userId;
        if (yid === uid) continue;

        // Find Y's non-locked N group of exactly gSize at position [start, start+gSize-1]
        for (var start = 1; start + gSize - 1 <= daysInMonth; start++) {
          var isNGroup = true;
          for (var k = 0; k < gSize; k++) {
            if (sched[yid][start + k] !== 'N' || locked[yid][start + k]) { isNGroup = false; break; }
          }
          if (!isNGroup) continue;

          // Try shift by +1: Y moves to [start+1, start+gSize]
          var newStart = start + 1;
          var newEnd = newStart + gSize - 1;
          if (newEnd > daysInMonth) continue;
          if (locked[yid][newEnd]) continue;
          if (sched[yid][newEnd] && sched[yid][newEnd] !== null) continue;

          // Check Y constraints at shifted position
          // Temporarily remove Y's old dailyN counts
          for (var k2 = 0; k2 < gSize; k2++) dailyN[start + k2]--;
          var nBefore = consNBefore(yid, newStart, sched, prevTail);
          var wBefore = consWorkBefore(yid, newStart, sched, prevTail);
          var nOk = true;
          for (var kn = 0; kn < gSize; kn++) {
            if (dailyN[newStart + kn] >= getNeed(newStart + kn)) { nOk = false; break; }
          }
          for (var k3 = 0; k3 < gSize; k3++) dailyN[start + k3]++; // restore

          if (nBefore + gSize > rules.maxConsecutiveN) continue;
          if (wBefore + gSize > rules.maxConsecutiveWork) continue;
          if (!nOk) continue;

          // Tentatively clear Y's old group and trailing Off
          for (var k4 = 0; k4 < gSize; k4++) { sched[yid][start + k4] = null; dailyN[start + k4]--; }
          var yOldOff = start + gSize;
          var hadOldOff = false;
          if (yOldOff <= daysInMonth && (sched[yid][yOldOff] === 'Off' || sched[yid][yOldOff] === 'W6Off') && !locked[yid][yOldOff]) {
            var wasW6Off = sched[yid][yOldOff] === 'W6Off';
            sched[yid][yOldOff] = null; hadOldOff = true; rem[yid].Off++;
            if (wasW6Off) rem[yid].W6Off++;
          }

          // Check if uid can now place their group
          var cands = findCandidates(uid, gSize);
          if (cands.length > 0) {
            // Commit Y's shift to new position
            for (var k5 = 0; k5 < gSize; k5++) { sched[yid][newStart + k5] = 'N'; dailyN[newStart + k5]++; }
            assignTrailingOff(yid, newEnd + 1);
            // Place uid's group
            cands.sort(function (a, b) { return b.score - a.score; });
            placeNGroup(uid, cands[0].start, gSize);
            warnings.push(mkWarn('NGroupShift', (uidLabel[uid]||uid) + ': N 群(' + gSize + '天) 透過平移 ' + (uidLabel[yid]||yid) + ' N 群+1天解決', uid, null));
            return true;
          } else {
            // Revert Y's old group
            for (var k6 = 0; k6 < gSize; k6++) { sched[yid][start + k6] = 'N'; dailyN[start + k6]++; }
            if (hadOldOff) {
              sched[yid][yOldOff] = wasW6Off ? 'W6Off' : 'Off';
              rem[yid].Off = Math.max(0, rem[yid].Off - 1);
              if (wasW6Off) rem[yid].W6Off = Math.max(0, rem[yid].W6Off - 1);
            }
          }
        }
      }
      return false;
    }

    sorted.forEach(function (u) {
      var uid = u.userId;
      if (rem[uid].N <= 0) return;

      // Phase 1: extend existing N clusters leftward
      extendNGroupsLeft(uid);
      if (rem[uid].N <= 0) return;

      // Phase 2: place remaining N as max-size groups (greedy, no pre-splitting)
      var safety = rem[uid].N + 1;
      while (rem[uid].N > 0 && safety-- > 0) {
        var placed = false;
        for (var size = rem[uid].N; size >= 1; size--) {
          var cands = findCandidates(uid, size);
          if (cands.length > 0) {
            cands.sort(function (a, b) { return b.score - a.score; });
            placeNGroup(uid, cands[0].start, size);
            placed = true;
            break;
          }
        }
        if (!placed) {
          var gSize = Math.min(rem[uid].N, rules.preferNGroup || 3);
          if (!tryNGroupShift(uid, gSize)) {
            warnings.push(mkWarn('NPlaceFail', (uidLabel[uid]||uid) + ': 剩餘 N 班(' + rem[uid].N + '天) 無法放置，將以單天補填', uid, null));
          }
          break;
        }
      }
    });

    // ── Fallback: fill remaining daily N shortfalls one day at a time ──────
    // Ensures every weekday has the required N count even if group placement failed.
    weekdays.forEach(function (day) {
      var need = getNeed(day);
      while (dailyN[day] < need) {
        // Prefer users with rem.N > 0, then fall back to any eligible user
        var candidate = null;
        var bestScore = -1;

        for (var pass = 0; pass < 2 && !candidate; pass++) {
          for (var ui = 0; ui < users.length; ui++) {
            var uid = users[ui].userId;
            if (locked[uid][day] || sched[uid][day]) continue;
            if (pass === 0 && rem[uid].N <= 0) continue; // first pass: quota only
            var nBefore = consNBefore(uid, day, sched, prevTail);
            if (nBefore >= rules.maxConsecutiveN) continue;
            var wBefore = consWorkBefore(uid, day, sched, prevTail);
            if (wBefore + 1 > rules.maxConsecutiveWork) continue;
            var score = rem[uid].N;
            if (score > bestScore) { bestScore = score; candidate = uid; }
          }
        }

        if (!candidate) {
          warnings.push(mkWarn('NShortage', '第' + day + '天 N 班仍不足，所有人均不符合排班條件', null, day));
          break;
        }

        sched[candidate][day] = 'N';
        dailyN[day]++;
        if (rem[candidate].N > 0) rem[candidate].N--;
        // Trailing Off after single N if next day is free (Saturday → W6Off)
        assignTrailingOff(candidate, day + 1);
        warnings.push(mkWarn('NBackfill', '第' + day + '天 N 單天補填：' + (uidLabel[candidate]||candidate), candidate, day));
      }
    });
  }

  // ─── Step 2: W6Off + H3 ───────────────────────────────────────────────────
  // Priority: guarantee satH3 H3 per Saturday. W6Off quota is secondary —
  // if someone must work H3 despite needing W6Off, assign H3 and warn.
  // Holiday weekdays and Sundays: honor D/N pre-requests first, then Off.

  function stepW6(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings, uidLabel) {

    function honorDRequest(uid, day) {
      if (locked[uid][day] || sched[uid][day]) return false;
      var req = (requestData[uid] || {})['day_' + day];
      if (req !== 'D') return false;
      if (rem[uid].D <= 0) return false;
      var prev = getAt(uid, day - 1, sched, prevTail);
      if (prev === 'N' || prev === 'D') return false;
      if (isRest(prev) && getAt(uid, day - 2, sched, prevTail) === 'N') return false;
      if (consWorkBefore(uid, day, sched, prevTail) + 1 > rules.maxConsecutiveWork) return false;
      sched[uid][day] = 'D';
      rem[uid].D = Math.max(0, rem[uid].D - 1);
      return true;
    }

    function honorNRequest(uid, day) {
      if (locked[uid][day] || sched[uid][day]) return false;
      var req = (requestData[uid] || {})['day_' + day];
      if (req !== 'N') return false;
      if (rem[uid].N <= 0) return false;
      var prev = getAt(uid, day - 1, sched, prevTail);
      if (prev === 'N' || prev === 'D') return false;
      if (consWorkBefore(uid, day, sched, prevTail) + 1 > rules.maxConsecutiveWork) return false;
      sched[uid][day] = 'N';
      rem[uid].N = Math.max(0, rem[uid].N - 1);
      return true;
    }

    // Holiday weekdays (Mon–Fri holidays): honor D/N requests first, then Off
    cal.filter(function (c) { return !c.isWeekend && c.isHol; }).forEach(function (c) {
      var day = c.day;
      var holD = parseInt(settings.holD) || 1;
      var holN = parseInt(settings.holN) || 1;
      var dCount = 0, nCount = 0;
      users.forEach(function (u) {
        if (sched[u.userId][day] === 'D') dCount++;
        if (sched[u.userId][day] === 'N') nCount++;
      });

      // Honor D requests up to holD quota
      users.forEach(function (u) {
        if (dCount >= holD) return;
        if (honorDRequest(u.userId, day)) dCount++;
      });

      // Honor N requests up to holN quota
      users.forEach(function (u) {
        if (nCount >= holN) return;
        if (honorNRequest(u.userId, day)) nCount++;
      });

      // Off for remaining unassigned
      users.forEach(function (u) {
        var uid = u.userId;
        if (!locked[uid][day] && !sched[uid][day]) {
          sched[uid][day] = 'Off';
          rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
        }
      });
    });

    // Sundays: honor D/N requests first, then Off
    cal.filter(function (c) { return c.isSun; }).forEach(function (c) {
      var day = c.day;
      var sunD = parseInt(settings.sunD) || 1;
      var sunN = parseInt(settings.sunN) || 1;
      var dCount = 0, nCount = 0;
      users.forEach(function (u) {
        if (sched[u.userId][day] === 'D') dCount++;
        if (sched[u.userId][day] === 'N') nCount++;
      });

      // Honor D requests up to sunD quota
      users.forEach(function (u) {
        if (dCount >= sunD) return;
        if (honorDRequest(u.userId, day)) dCount++;
      });

      // Honor N requests up to sunN quota
      users.forEach(function (u) {
        if (nCount >= sunN) return;
        if (honorNRequest(u.userId, day)) nCount++;
      });

      // Off for remaining unassigned
      users.forEach(function (u) {
        var uid = u.userId;
        if (!locked[uid][day] && !sched[uid][day]) {
          sched[uid][day] = 'Off';
          rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
        }
      });
    });

    // H3 count tracking — include already-locked H3 shifts for fairness
    var h3Count = {};
    users.forEach(function (u) { h3Count[u.userId] = 0; });

    var satList = cal.filter(function (c) { return c.isSat; });

    // Seed h3Count from locked H3 shifts
    satList.forEach(function (c) {
      users.forEach(function (u) {
        if (sched[u.userId][c.day] === 'H3') h3Count[u.userId]++;
      });
    });

    // Pre-compute remaining unlocked Saturdays per user (for W6Off quota warn check)
    var satRemaining = {};
    users.forEach(function (u) {
      satRemaining[u.userId] = satList.filter(function (c) {
        return !locked[u.userId][c.day] && !sched[u.userId][c.day];
      }).length;
    });

    satList.forEach(function (c) {
      var day = c.day;
      var unassigned = users.filter(function (u) {
        return !locked[u.userId][day] && !sched[u.userId][day];
      });

      function assignW6Off(u) {
        var uid = u.userId;
        sched[uid][day] = 'W6Off';
        rem[uid].W6Off = Math.max(0, (rem[uid].W6Off || 0) - 1);
        rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
        satRemaining[uid]--;
      }

      if (c.isHol) {
        // Holiday Saturday: W6Off for all, no H3
        unassigned.forEach(function (u) { assignW6Off(u); });
        return;
      }

      // Count H3 already on this day (from locked shifts)
      var existingH3 = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'H3') existingH3++; });
      var satH3 = parseInt(settings.satH3) || 2;
      var h3Needed = Math.max(0, satH3 - existingH3);

      // Sort all unassigned by h3Count ascending (fairness), then rem.W6Off desc
      // (prefer those with more W6Off quota left for H3 first)
      unassigned.sort(function (a, b) {
        if (h3Count[a.userId] !== h3Count[b.userId]) return h3Count[a.userId] - h3Count[b.userId];
        return (rem[b.userId].W6Off || 0) - (rem[a.userId].W6Off || 0);
      });

      var h3Assigned = 0;
      unassigned.forEach(function (u) {
        var uid = u.userId;
        if (h3Assigned < h3Needed) {
          // Warn if this forces someone who needs W6Off to work H3
          if (satRemaining[uid] > 0 && satRemaining[uid] <= (rem[uid].W6Off || 0)) {
            warnings.push(mkWarn('H3Force', (uidLabel[uid]||uid) + ': 第' + day + '天(六) 強制排H3，W6Off配額可能不足', uid, day));
          }
          sched[uid][day] = 'H3';
          h3Count[uid]++;
          satRemaining[uid]--;
          h3Assigned++;
        } else {
          assignW6Off(u);
        }
      });

      if (existingH3 + h3Assigned < satH3) {
        warnings.push(mkWarn('H3Shortage', '第' + day + '天(六) H3 人力不足（' + (existingH3 + h3Assigned) + '/' + satH3 + '）', null, day));
      }
    });
  }

  // ─── Step 3: D — fill daily D need (non-holiday weekdays) ─────────────────
  // Processes day by day. Picks non-mustRest, non-勿值 users with lowest offPressure
  // (work-hungry first) to meet wdD per day.

  function stepD(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings) {
    var weekdayCal = cal.filter(function (c) { return !c.isWeekend && !c.isHol; });
    var wdD = parseInt(settings.wdD) || 1;

    function weekDCount(uid, day) {
      var dow = cal[day - 1].dow;
      var fromMon = dow === 0 ? 6 : dow - 1;
      var ws = day - fromMon;
      var cnt = 0;
      for (var d = Math.max(1, ws); d < ws + 7 && d <= daysInMonth; d++) {
        if (sched[uid][d] === 'D') cnt++;
      }
      return cnt;
    }

    function canAssignD(uid, day) {
      if (rem[uid].D <= 0) return false;
      var prev = getAt(uid, day - 1, sched, prevTail);
      if (prev === 'N' || prev === 'D') return false;
      // N→rest→D forbidden: if day-1 is rest and day-2 is N, block D
      if (isRest(prev) && getAt(uid, day - 2, sched, prevTail) === 'N') return false;
      if (day < daysInMonth && locked[uid][day + 1] && sched[uid][day + 1] === 'D') return false;
      if (weekDCount(uid, day) >= rules.maxDPerWeek) return false;
      if (consWorkBefore(uid, day, sched, prevTail) + 1 > rules.maxConsecutiveWork) return false;
      return true;
    }

    weekdayCal.forEach(function (c) {
      var day = c.day;
      var unassigned = users.filter(function (u) {
        return !locked[u.userId][day] && !sched[u.userId][day];
      });
      if (unassigned.length === 0) return;

      var dCount = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'D') dCount++; });
      var dNeeded = Math.max(0, wdD - dCount);
      if (dNeeded <= 0) return;

      var remainingWD = weekdayCal.filter(function (cc) { return cc.day >= day; }).length;

      var dCands = unassigned
        .filter(function (u) {
          var uid = u.userId;
          var req = (requestData[uid] || {})['day_' + day];
          var prevShift = getAt(uid, day - 1, sched, prevTail);
          var wuZhi = isWuZhiD(req);
          var mustRest = consWorkBefore(uid, day, sched, prevTail) >= rules.maxConsecutiveWork || prevShift === 'N';
          return !mustRest && !wuZhi && canAssignD(uid, day);
        })
        .map(function (u) {
          var uid = u.userId;
          return { uid: uid, offPressure: remainingWD > 0 ? (rem[uid].Off || 0) / remainingWD : 0 };
        })
        .sort(function (a, b) { return a.offPressure - b.offPressure; }); // work-hungry first

      dCands.slice(0, dNeeded).forEach(function (a) {
        sched[a.uid][day] = 'D';
        rem[a.uid].D--;
      });

      var finalD = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'D') finalD++; });
      if (finalD < wdD) warnings.push(mkWarn('DShortage', '第' + day + '天 D 班人力不足（' + finalD + '/' + wdD + '）', null, day));
    });
  }

  // ─── Step 4: Off / S1 pressure (non-holiday weekdays) ────────────────────
  // For each remaining unassigned slot: mustRest→Off, offPressure≥1→Off,
  // Off quota gone→S1, S1 need→S1, else→Off.
  // 勿值: cannot do D/N but can do S1 or Off.

  function stepOffS1(sched, locked, rem, users, cal, settings, rules, prevTail, daysInMonth, requestData, warnings) {
    var weekdayCal = cal.filter(function (c) { return !c.isWeekend && !c.isHol; });
    var wdS1 = parseInt(settings.wdS1) || 2;

    weekdayCal.forEach(function (c) {
      var day = c.day;
      var remainingWD = weekdayCal.filter(function (cc) { return cc.day >= day; }).length;

      var unassigned = users.filter(function (u) {
        return !locked[u.userId][day] && !sched[u.userId][day];
      });
      if (unassigned.length === 0) return;

      var currS1 = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'S1') currS1++; });
      var s1Needed = Math.max(0, wdS1 - currS1);
      var s1Filled = 0;

      var uInfo = unassigned.map(function (u) {
        var uid = u.userId;
        var req = (requestData[uid] || {})['day_' + day];
        var prevShift = getAt(uid, day - 1, sched, prevTail);
        return {
          uid: uid,
          mustRest: consWorkBefore(uid, day, sched, prevTail) >= rules.maxConsecutiveWork || prevShift === 'N',
          offPressure: remainingWD > 0 ? (rem[uid].Off || 0) / remainingWD : 0
        };
      });

      // Sort low→high offPressure: work-hungry first for S1, rest-hungry last (→ Off)
      uInfo.sort(function (a, b) { return a.offPressure - b.offPressure; });

      uInfo.forEach(function (a) {
        if (sched[a.uid][day]) return;
        var uid = a.uid;
        if (a.mustRest || a.offPressure >= 1.0) {
          sched[uid][day] = 'Off';
          rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
        } else if (rem[uid].Off <= 0) {
          sched[uid][day] = 'S1';
        } else if (s1Filled < s1Needed) {
          sched[uid][day] = 'S1';
          s1Filled++;
        } else {
          sched[uid][day] = 'Off';
          rem[uid].Off = Math.max(0, (rem[uid].Off || 0) - 1);
        }
      });

      var finalS1 = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'S1') finalS1++; });
      if (finalS1 < wdS1) warnings.push(mkWarn('S1Shortage', '第' + day + '天 S1 班人力不足（' + finalS1 + '/' + wdS1 + '）', null, day));
      if (finalS1 > wdS1) warnings.push(mkWarn('S1Excess',   '第' + day + '天 S1 過多（' + finalS1 + '/' + wdS1 + '），建議改為 Off', null, day));
    });
  }

  // ─── Step 5: S1 catch-all ─────────────────────────────────────────────────
  // Fill any remaining empty weekday slots with S1.

  function stepS1(sched, locked, users, cal) {
    var weekdayCal = cal.filter(function (c) { return !c.isWeekend; });
    users.forEach(function (u) {
      var uid = u.userId;
      weekdayCal.forEach(function (c) {
        if (!locked[uid][c.day] && !sched[uid][c.day]) sched[uid][c.day] = 'S1';
      });
    });
  }

  // ─── Step 5.5: Enforce at least 1 rest per 7 consecutive days ────────────

  function stepEnforceWeeklyOff(sched, locked, users, cal, prevTail, daysInMonth, warnings, uidLabel) {
    users.forEach(function (u) {
      var uid = u.userId;
      var tail = prevTail[uid] || [];

      for (var d = 1; d <= daysInMonth; d++) {
        var hasRest = false;
        for (var k = 0; k < 7; k++) {
          var checkDay = d - k;
          var s;
          if (checkDay >= 1) {
            s = sched[uid][checkDay];
          } else {
            var ti = tail.length - 1 + checkDay;
            s = ti >= 0 ? tail[ti] : null;
          }
          if (isRest(s)) { hasRest = true; break; }
        }
        if (!hasRest) {
          var inserted = false;
          for (var k2 = 0; k2 < 7 && !inserted; k2++) {
            var target = d - k2;
            if (target < 1) break;
            if (!locked[uid][target] && sched[uid][target] === 'S1') {
              sched[uid][target] = 'Off';
              inserted = true;
              warnings.push(mkWarn('ForceOff', (uidLabel[uid]||uid) + ': 第' + target + '天 強制插入 Off（7天無休）', uid, target));
            }
          }
          if (!inserted) {
            warnings.push(mkWarn('WeeklyOffFail', (uidLabel[uid]||uid) + ': 第' + d + '天結束的7天窗口無法插入休息（均為鎖定班別）', uid, d));
          }
        }
      }
    });
  }

  // ─── Step 5.8: Fix daily D/N balance ─────────────────────────────────────

  function fixDailyBalance(sched, locked, users, cal, daysInMonth, settings, warnings, uidLabel) {
    var weekdayCal = cal.filter(function (c) { return !c.isWeekend && !c.isHol; });
    var wdD = parseInt(settings.wdD) || 1;
    var wdN = parseInt(settings.wdN) || 1;

    weekdayCal.forEach(function (c) {
      var day = c.day;
      var dCount = 0, nCount = 0;
      users.forEach(function (u) {
        var s = sched[u.userId][day];
        if (s === 'D') dCount++;
        if (s === 'N') nCount++;
      });

      if (dCount < wdD) {
        var fixed = false;
        for (var ui = 0; ui < users.length && !fixed; ui++) {
          var uid = users[ui].userId;
          if (sched[uid][day] !== 'S1' || locked[uid][day]) continue;
          var prev = day > 1 ? sched[uid][day - 1] : null;
          if (prev === 'N' || prev === 'D') continue;
          if (isRest(prev) && (day > 2 ? sched[uid][day - 2] : null) === 'N') continue;
          var next = day < daysInMonth ? sched[uid][day + 1] : null;
          if (next === 'D') continue;

          for (var d2 = 1; d2 <= daysInMonth && !fixed; d2++) {
            if (d2 === day) continue;
            if (sched[uid][d2] !== 'D' || locked[uid][d2]) continue;
            var d2DCount = 0;
            users.forEach(function (u2) { if (sched[u2.userId][d2] === 'D') d2DCount++; });
            if (d2DCount <= wdD) continue;

            sched[uid][day] = 'D';
            sched[uid][d2] = 'S1';
            dCount++;
            warnings.push(mkWarn('DFix', '第' + day + '天 0D 修正：' + (uidLabel[uid]||uid) + ' 從第' + d2 + '天移入 D', uid, day));
            fixed = true;
          }
        }
        // Fallback: directly promote any eligible S1 → D (no equivalent swap needed)
        if (!fixed) {
          for (var ui2 = 0; ui2 < users.length && !fixed; ui2++) {
            var uid2 = users[ui2].userId;
            if (sched[uid2][day] !== 'S1' || locked[uid2][day]) continue;
            var prev2 = day > 1 ? sched[uid2][day - 1] : null;
            if (prev2 === 'N' || prev2 === 'D') continue;
            if (isRest(prev2) && (day > 2 ? sched[uid2][day - 2] : null) === 'N') continue;
            var next2 = day < daysInMonth ? sched[uid2][day + 1] : null;
            if (next2 === 'D') continue;
            sched[uid2][day] = 'D';
            dCount++;
            warnings.push(mkWarn('DForce', '第' + day + '天 D 強制補填：' + (uidLabel[uid2]||uid2) + ' S1→D', uid2, day));
            fixed = true;
          }
        }
        if (!fixed) warnings.push(mkWarn('DShortage', '第' + day + '天 D 班仍不足，所有人均不符合條件', null, day));
      }

      if (nCount > wdN) {
        warnings.push(mkWarn('NExcess', '第' + day + '天 N 班超出需求（' + nCount + '/' + wdN + '）', null, day));
      }
    });
  }

  // ─── Step 6: Post Check N→Off→D — 等價交換（最多4人鏈式）────────────────────

  function stepPostCheck(sched, locked, users, daysInMonth, warnings, uidLabel) {

    // Can person xid take D at day dx? (currently has S1[dx], full constraint check)
    function canTakeD(xid, dx) {
      if (sched[xid][dx] !== 'S1' || locked[xid][dx]) return false;
      var prev = dx > 1 ? sched[xid][dx - 1] : null;
      if (prev === 'N' || prev === 'D') return false;
      if (isRest(prev) && (dx > 2 ? sched[xid][dx - 2] : null) === 'N') return false;
      if (dx < daysInMonth && sched[xid][dx + 1] === 'D') return false;
      return true;
    }

    // Can person xid give up D at day dx? (currently has D[dx], not locked)
    function canGiveD(xid, dx) {
      return sched[xid][dx] === 'D' && !locked[xid][dx];
    }

    users.forEach(function (u) {
      var uid = u.userId;
      for (var d = 1; d <= daysInMonth - 2; d++) {
        if (!(sched[uid][d] === 'N' && isRest(sched[uid][d + 1]) && sched[uid][d + 2] === 'D')) continue;
        var d3 = d + 2;
        if (locked[uid][d3]) continue;

        var swapped = false;

        // ── Attempt 1: 2-person equivalent swap ─────────────────────────────
        for (var yi = 0; yi < users.length && !swapped; yi++) {
          var yid = users[yi].userId;
          if (yid === uid) continue;
          if (sched[yid][d3] !== 'S1' || locked[yid][d3]) continue;
          if (d3 > 1 && sched[yid][d3 - 1] === 'N') continue;

          for (var d4 = 1; d4 <= daysInMonth && !swapped; d4++) {
            if (d4 === d3) continue;
            if (!canGiveD(yid, d4)) continue;
            if (!canTakeD(uid, d4)) continue;

            sched[uid][d3] = 'S1';  sched[yid][d3] = 'D';
            sched[uid][d4] = 'D';   sched[yid][d4] = 'S1';
            warnings.push(mkWarn('NOffD', (uidLabel[uid]||uid) + ': 第' + d3 + '天 N→Off→D，與 ' + (uidLabel[yid]||yid) + ' 第' + d4 + '天 等價交換', uid, d));
            swapped = true;
          }
        }

        // ── Attempt 2: 3-person chain (A→B→C→A, all D-counts preserved) ────
        if (!swapped) {
          for (var bi = 0; bi < users.length && !swapped; bi++) {
            var bid = users[bi].userId;
            if (bid === uid) continue;
            // B covers uid's D at d3
            if (sched[bid][d3] !== 'S1' || locked[bid][d3]) continue;
            if (d3 > 1 && sched[bid][d3 - 1] === 'N') continue;

            for (var dB = 1; dB <= daysInMonth && !swapped; dB++) {
              if (!canGiveD(bid, dB)) continue; // B gives up D[dB]

              for (var ci = 0; ci < users.length && !swapped; ci++) {
                var cid = users[ci].userId;
                if (cid === uid || cid === bid) continue;
                if (!canTakeD(cid, dB)) continue; // C takes B's D at dB

                for (var dC = 1; dC <= daysInMonth && !swapped; dC++) {
                  if (!canGiveD(cid, dC)) continue; // C gives up D[dC]
                  if (!canTakeD(uid, dC)) continue;  // uid takes C's D at dC

                  sched[uid][d3] = 'S1';
                  sched[bid][d3] = 'D';
                  sched[bid][dB]  = 'S1';
                  sched[cid][dB]  = 'D';
                  sched[cid][dC]  = 'S1';
                  sched[uid][dC]  = 'D';
                  warnings.push(mkWarn('NOffD', (uidLabel[uid]||uid) + ': 第' + d3 + '天 N→Off→D，3人鏈式等價交換（' +
                    (uidLabel[uid]||uid) + '/' + (uidLabel[bid]||bid) + ':第' + d3 + '/' + dB + '天，' +
                    (uidLabel[bid]||bid) + '/' + (uidLabel[cid]||cid) + ':第' + dB + '/' + dC + '天）', uid, d));
                  swapped = true;
                }
              }
            }
          }
        }

        // ── Attempt 3: 4-person chain (A→B→C→E→A, all D-counts preserved) ──
        if (!swapped) {
          for (var bi2 = 0; bi2 < users.length && !swapped; bi2++) {
            var bid2 = users[bi2].userId;
            if (bid2 === uid) continue;
            if (sched[bid2][d3] !== 'S1' || locked[bid2][d3]) continue;
            if (d3 > 1 && sched[bid2][d3 - 1] === 'N') continue;

            for (var dB2 = 1; dB2 <= daysInMonth && !swapped; dB2++) {
              if (!canGiveD(bid2, dB2)) continue;

              for (var ci2 = 0; ci2 < users.length && !swapped; ci2++) {
                var cid2 = users[ci2].userId;
                if (cid2 === uid || cid2 === bid2) continue;
                if (!canTakeD(cid2, dB2)) continue;

                for (var dC2 = 1; dC2 <= daysInMonth && !swapped; dC2++) {
                  if (!canGiveD(cid2, dC2)) continue;

                  for (var ei = 0; ei < users.length && !swapped; ei++) {
                    var eid = users[ei].userId;
                    if (eid === uid || eid === bid2 || eid === cid2) continue;
                    if (!canTakeD(eid, dC2)) continue;

                    for (var dE = 1; dE <= daysInMonth && !swapped; dE++) {
                      if (!canGiveD(eid, dE)) continue;
                      if (!canTakeD(uid, dE)) continue;

                      sched[uid][d3]  = 'S1';
                      sched[bid2][d3] = 'D';
                      sched[bid2][dB2] = 'S1';
                      sched[cid2][dB2] = 'D';
                      sched[cid2][dC2] = 'S1';
                      sched[eid][dC2]  = 'D';
                      sched[eid][dE]   = 'S1';
                      sched[uid][dE]   = 'D';
                      warnings.push(mkWarn('NOffD', (uidLabel[uid]||uid) + ': 第' + d3 + '天 N→Off→D，4人鏈式等價交換（' +
                        (uidLabel[uid]||uid) + '/' + (uidLabel[bid2]||bid2) + ':第' + d3 + '/' + dB2 + '天，' +
                        (uidLabel[bid2]||bid2) + '/' + (uidLabel[cid2]||cid2) + ':第' + dB2 + '/' + dC2 + '天，' +
                        (uidLabel[cid2]||cid2) + '/' + (uidLabel[eid]||eid) + ':第' + dC2 + '/' + dE + '天）', uid, d));
                      swapped = true;
                    }
                  }
                }
              }
            }
          }
        }

        // ── Attempt 4 (fallback): single-day swap (D-count ±1) ──────────────
        if (!swapped) {
          for (var yi2 = 0; yi2 < users.length && !swapped; yi2++) {
            var yid2 = users[yi2].userId;
            if (yid2 === uid) continue;
            if (sched[yid2][d3] !== 'S1' || locked[yid2][d3]) continue;
            if (d3 > 1 && sched[yid2][d3 - 1] === 'N') continue;

            sched[uid][d3] = 'S1';
            sched[yid2][d3] = 'D';
            warnings.push(mkWarn('NOffDSingle', (uidLabel[uid]||uid) + ': 第' + d3 + '天 N→Off→D，與 ' + (uidLabel[yid2]||yid2) + ' 單次交換（個人D數微調±1）', uid, d));
            swapped = true;
          }
        }

        if (!swapped) {
          warnings.push(mkWarn('NOffDFail', (uidLabel[uid]||uid) + ': 第' + d3 + '天 N→Off→D，找不到交換對象，保持現狀', uid, d));
        }
      }
    });
  }

  // ─── Step 7: Final validation scan ────────────────────────────────────────
  // Detects anomalies that slip through (勿値 violations) after all steps.

  function stepFinalValidate(sched, locked, users, requestData, daysInMonth, warnings, uidLabel) {
    users.forEach(function (u) {
      var uid = u.userId;
      for (var d = 1; d <= daysInMonth; d++) {
        var req = (requestData[uid] || {})['day_' + d];
        if (!isWuZhi(req)) continue;
        var s = sched[uid][d];
        var violated = (s === 'D' && isWuZhiD(req)) || (s === 'N' && isWuZhiN(req));
        if (violated) {
          warnings.push(mkWarn('WuZhiViolation',
            (uidLabel[uid]||uid) + ': 第' + d + '天 勿值日被排' + s + '班', uid, d));
        }
      }
    });
  }

  // ─── Step 8: Fragment-shift scan（碎班檢查，參數化開關）────────────────────
  // 偵測「休-班-休」碎班：單日工作日，其前一天與後一天皆為休假（Off/W6Off）。
  // 由 rules.forbidFragmentShift 控制是否啟用；rules.fragmentShiftTypes 控制
  // 哪些班別值視為碎班（預設只看 D / N，可加入 'S1' / 'H3'）。
  // 僅產生資訊性 FragmentShift 警告，不自動修正（避免動到每日人力與配額平衡）。

  function isRestShift(s) { return s === 'Off' || s === 'W6Off'; }

  function scanFragmentShifts(sched, locked, users, daysInMonth, prevTail, rules, warnings, uidLabel) {
    if (!rules || !rules.forbidFragmentShift) return;
    var fragTypes = (rules.fragmentShiftTypes && rules.fragmentShiftTypes.length)
      ? rules.fragmentShiftTypes : ['D', 'N'];
    function isFragType(s) { return fragTypes.indexOf(s) !== -1; }

    users.forEach(function (u) {
      var uid = u.userId;
      for (var d = 1; d <= daysInMonth; d++) {
        if (!isFragType(sched[uid][d])) continue;
        // 末日無法確認下一天（跨月），略過避免誤報
        if (d >= daysInMonth) continue;
        if (!isRestShift(sched[uid][d + 1])) continue;
        // 前一天：第1天回看上月尾段（prevTail）；無資料則略過
        var prev = getAt(uid, d - 1, sched, prevTail);
        if (!isRestShift(prev)) continue;
        warnings.push(mkWarn('FragmentShift',
          (uidLabel[uid] || uid) + ': 第' + d + '天 ' + sched[uid][d] + ' 為碎班（前後皆休）', uid, d));
      }
    });
  }

  // ─── Fix Warning (on-demand targeted swap) ────────────────────────────────

  function fixWarning(body) {
    var userRole = body._user && body._user.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可執行' };
    }
    var yyyyMM = body.yyyyMM;
    var warning = body.warning;
    var preview = body.preview || {};
    if (!yyyyMM || !warning) return { success: false, error: '缺少參數' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var usersResult = Auth.getUsers();
    if (!usersResult.success) return { success: false, error: '無法取得使用者' };
    var users = usersResult.data.filter(function (u) { return u.isActive === true && !u.noSchedule; });

    var year = parseInt(yyyyMM.slice(0, 4));
    var holResult = Schedule.getHolidays({ year: year });
    var holidays = holResult.success ? holResult.data : [];
    var holidayDates = {};
    holidays.forEach(function (h) { if (h.isHoliday) holidayDates[h.date] = true; });
    var cal = buildCal(yyyyMM, holidayDates);
    var daysInMonth = cal.length;

    var settingsResult = Settings_.getSettings();
    var settings = settingsResult.success ? settingsResult.data : {};

    var prevTail = loadPrevTail(ss, yyyyMM, users);
    var reqResult = Request.getRequests({ yyyyMM: yyyyMM });
    var requestData = reqResult.success ? (reqResult.data || {}) : {};

    // Load existing Sheets schedule (these are locked)
    var schedResult = Schedule.getSchedule({ yyyyMM: yyyyMM });
    var sheetSchedule = schedResult.success ? (schedResult.data.schedule || {}) : {};

    // Build merged sched: locked Sheets shifts + preview delta on top
    var sched = {};
    var locked = {};
    users.forEach(function (u) {
      var uid = u.userId;
      sched[uid] = {};
      locked[uid] = {};
      for (var d = 1; d <= daysInMonth; d++) {
        var sv = sheetSchedule[uid] && sheetSchedule[uid]['day_' + d];
        if (sv) {
          if (sv === 'Off' && cal[d - 1].isSat) sv = 'W6Off';
          sched[uid][d] = sv;
          locked[uid][d] = true;
        }
      }
      var pv = preview[uid] || {};
      for (var d2 = 1; d2 <= daysInMonth; d2++) {
        var ps = pv['day_' + d2];
        if (ps && !locked[uid][d2]) sched[uid][d2] = ps;
      }
    });

    var uidLabel = {};
    users.forEach(function (u) { uidLabel[u.userId] = u.code || u.name || u.userId; });

    var changes = {};
    function recordChange(uid, day, newShift) {
      if (!changes[uid]) changes[uid] = {};
      changes[uid]['day_' + day] = newShift;
    }

    var fixed = false;
    var type = warning.type;

    if (type === 'NOffDFail') {
      fixed = fwNOffD(sched, locked, users, daysInMonth, warning.userId, warning.day, recordChange);
    } else if (type === 'DShortage') {
      fixed = fwDShortage(sched, locked, users, daysInMonth, warning.day, settings, recordChange);
    } else if (type === 'H3Shortage') {
      fixed = fwH3Shortage(sched, locked, users, warning.day, recordChange);
    } else if (type === 'S1Shortage') {
      fixed = fwS1Shortage(sched, locked, users, warning.day, recordChange);
    } else if (type === 'S1Excess') {
      fixed = fwS1Excess(sched, locked, users, warning.day, recordChange);
    } else if (type === 'WuZhiViolation') {
      fixed = fwWuZhiViolation(sched, locked, users, daysInMonth, cal, warning.userId, warning.day, settings, recordChange);
    } else if (type === 'NShortage') {
      fixed = fwNShortage(sched, locked, users, daysInMonth, warning.day, cal, prevTail, recordChange);
    } else if (type === 'QuotaDRebalance') {
      fixed = fwQuotaDRebalance(sched, locked, users, daysInMonth, prevTail, warning.userId, warning.targetUserId, warning.day, recordChange);
    } else if (type === 'QuotaOffToS1') {
      fixed = fwS1Shortage(sched, locked, users, warning.day, recordChange);
    } else {
      return { success: false, error: '此警告類型不支援自動修正' };
    }

    if (!fixed) return { success: false, error: '掃描完畢，找不到符合條件的等價交換' };
    return { success: true, data: { changes: changes } };
  }

  function fwNOffD(sched, locked, users, daysInMonth, uid, d, recordChange) {
    var d3 = d + 2;
    if (!uid || d3 > daysInMonth) return false;
    if (locked[uid][d3]) return false;
    if (!(sched[uid][d] === 'N' && isRest(sched[uid][d + 1]) && sched[uid][d3] === 'D')) return false;

    function canTakeD(xid, dx) {
      if (sched[xid][dx] !== 'S1' || locked[xid][dx]) return false;
      var prev = dx > 1 ? sched[xid][dx - 1] : null;
      if (prev === 'N' || prev === 'D') return false;
      if (isRest(prev) && (dx > 2 ? sched[xid][dx - 2] : null) === 'N') return false;
      if (dx < daysInMonth && sched[xid][dx + 1] === 'D') return false;
      return true;
    }
    function canGiveD(xid, dx) { return sched[xid][dx] === 'D' && !locked[xid][dx]; }

    // Attempt 1: 2-person equivalent swap
    for (var yi = 0; yi < users.length; yi++) {
      var yid = users[yi].userId;
      if (yid === uid) continue;
      if (sched[yid][d3] !== 'S1' || locked[yid][d3]) continue;
      if (d3 > 1 && sched[yid][d3 - 1] === 'N') continue;
      for (var d4 = 1; d4 <= daysInMonth; d4++) {
        if (d4 === d3) continue;
        if (!canGiveD(yid, d4) || !canTakeD(uid, d4)) continue;
        sched[uid][d3] = 'S1'; sched[yid][d3] = 'D';
        sched[uid][d4] = 'D';  sched[yid][d4] = 'S1';
        recordChange(uid, d3, 'S1'); recordChange(yid, d3, 'D');
        recordChange(uid, d4, 'D');  recordChange(yid, d4, 'S1');
        return true;
      }
    }
    // Attempt 2: 3-person chain
    for (var bi = 0; bi < users.length; bi++) {
      var bid = users[bi].userId;
      if (bid === uid) continue;
      if (sched[bid][d3] !== 'S1' || locked[bid][d3]) continue;
      if (d3 > 1 && sched[bid][d3 - 1] === 'N') continue;
      for (var dB = 1; dB <= daysInMonth; dB++) {
        if (!canGiveD(bid, dB)) continue;
        for (var ci = 0; ci < users.length; ci++) {
          var cid = users[ci].userId;
          if (cid === uid || cid === bid) continue;
          if (!canTakeD(cid, dB)) continue;
          for (var dC = 1; dC <= daysInMonth; dC++) {
            if (!canGiveD(cid, dC) || !canTakeD(uid, dC)) continue;
            sched[uid][d3] = 'S1'; sched[bid][d3] = 'D';
            sched[bid][dB] = 'S1'; sched[cid][dB] = 'D';
            sched[cid][dC] = 'S1'; sched[uid][dC] = 'D';
            recordChange(uid, d3, 'S1'); recordChange(bid, d3, 'D');
            recordChange(bid, dB, 'S1'); recordChange(cid, dB, 'D');
            recordChange(cid, dC, 'S1'); recordChange(uid, dC, 'D');
            return true;
          }
        }
      }
    }
    // Attempt 3: single-day swap (daily count preserved)
    for (var yi2 = 0; yi2 < users.length; yi2++) {
      var yid2 = users[yi2].userId;
      if (yid2 === uid) continue;
      if (sched[yid2][d3] !== 'S1' || locked[yid2][d3]) continue;
      if (d3 > 1 && sched[yid2][d3 - 1] === 'N') continue;
      sched[uid][d3] = 'S1'; sched[yid2][d3] = 'D';
      recordChange(uid, d3, 'S1'); recordChange(yid2, d3, 'D');
      return true;
    }
    return false;
  }

  function fwDShortage(sched, locked, users, daysInMonth, day, settings, recordChange) {
    var wdD = parseInt(settings.wdD) || 1;
    // Try equivalent swap: uid has S1[day] + D[d2] where d2 has excess D
    for (var ui = 0; ui < users.length; ui++) {
      var uid = users[ui].userId;
      if (sched[uid][day] !== 'S1' || locked[uid][day]) continue;
      var prev = day > 1 ? sched[uid][day - 1] : null;
      if (prev === 'N' || prev === 'D') continue;
      if (isRest(prev) && (day > 2 ? sched[uid][day - 2] : null) === 'N') continue;
      if (day < daysInMonth && sched[uid][day + 1] === 'D') continue;
      for (var d2 = 1; d2 <= daysInMonth; d2++) {
        if (d2 === day || sched[uid][d2] !== 'D' || locked[uid][d2]) continue;
        var d2DCount = 0;
        users.forEach(function (u2) { if (sched[u2.userId][d2] === 'D') d2DCount++; });
        if (d2DCount <= wdD) continue;
        sched[uid][day] = 'D'; sched[uid][d2] = 'S1';
        recordChange(uid, day, 'D'); recordChange(uid, d2, 'S1');
        return true;
      }
    }
    // Fallback: S1→D (maintains daily total since D count was 0)
    for (var ui2 = 0; ui2 < users.length; ui2++) {
      var uid2 = users[ui2].userId;
      if (sched[uid2][day] !== 'S1' || locked[uid2][day]) continue;
      var p2 = day > 1 ? sched[uid2][day - 1] : null;
      if (p2 === 'N' || p2 === 'D') continue;
      if (isRest(p2) && (day > 2 ? sched[uid2][day - 2] : null) === 'N') continue;
      if (day < daysInMonth && sched[uid2][day + 1] === 'D') continue;
      sched[uid2][day] = 'D';
      recordChange(uid2, day, 'D');
      return true;
    }
    return false;
  }

  function fwH3Shortage(sched, locked, users, day, recordChange) {
    var existingH3 = 0;
    users.forEach(function (u) { if (sched[u.userId][day] === 'H3') existingH3++; });
    if (existingH3 >= 2) return false;
    var needed = 2 - existingH3;
    var assigned = 0;
    for (var ui = 0; ui < users.length && assigned < needed; ui++) {
      var uid = users[ui].userId;
      if (sched[uid][day] !== 'W6Off' || locked[uid][day]) continue;
      sched[uid][day] = 'H3';
      recordChange(uid, day, 'H3');
      assigned++;
    }
    return assigned > 0;
  }

  // Off→S1: increase S1 count on that day
  function fwS1Shortage(sched, locked, users, day, recordChange) {
    for (var ui = 0; ui < users.length; ui++) {
      var uid = users[ui].userId;
      var s = sched[uid][day];
      if ((s !== 'Off' && s !== 'W6Off') || locked[uid][day]) continue;
      sched[uid][day] = 'S1';
      recordChange(uid, day, 'S1');
      return true;
    }
    return false;
  }

  // S1→Off: decrease S1 count on that day
  function fwS1Excess(sched, locked, users, day, recordChange) {
    for (var ui = 0; ui < users.length; ui++) {
      var uid = users[ui].userId;
      if (sched[uid][day] !== 'S1' || locked[uid][day]) continue;
      sched[uid][day] = 'Off';
      recordChange(uid, day, 'Off');
      return true;
    }
    return false;
  }

  // 勿値 violation: change D/N → Off + find cover to maintain daily count
  function fwWuZhiViolation(sched, locked, users, daysInMonth, cal, uid, day, settings, recordChange) {
    if (!uid || !day || locked[uid][day]) return false;
    var original = sched[uid][day];
    if (original !== 'D' && original !== 'N') return false;

    sched[uid][day] = 'Off';
    recordChange(uid, day, 'Off');

    var wdD = parseInt(settings.wdD) || 1;
    var wdN = parseInt(settings.wdN) || 1;

    if (original === 'D') {
      var dCount = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'D') dCount++; });
      if (dCount < wdD) {
        for (var ui = 0; ui < users.length; ui++) {
          var yid = users[ui].userId;
          if (yid === uid || sched[yid][day] !== 'S1' || locked[yid][day]) continue;
          var prev = day > 1 ? sched[yid][day - 1] : null;
          if (prev === 'N' || prev === 'D') continue;
          if (isRest(prev) && (day > 2 ? sched[yid][day - 2] : null) === 'N') continue;
          if (day < daysInMonth && sched[yid][day + 1] === 'D') continue;
          sched[yid][day] = 'D';
          recordChange(yid, day, 'D');
          break;
        }
      }
    } else {
      var nCount = 0;
      users.forEach(function (u) { if (sched[u.userId][day] === 'N') nCount++; });
      if (nCount < wdN) {
        for (var ui2 = 0; ui2 < users.length; ui2++) {
          var yid2 = users[ui2].userId;
          if (yid2 === uid || locked[yid2][day]) continue;
          var s = sched[yid2][day];
          if (s !== 'S1' && s !== 'Off') continue;
          var prev2 = day > 1 ? sched[yid2][day - 1] : null;
          if (prev2 === 'N' || prev2 === 'D') continue;
          if (day < daysInMonth && sched[yid2][day + 1] === 'D') continue;
          sched[yid2][day] = 'N';
          recordChange(yid2, day, 'N');
          // Trailing Off after N (cal is 0-indexed, day+1 entry = cal[day])
          if (day + 1 <= daysInMonth && !locked[yid2][day + 1]) {
            var ts = sched[yid2][day + 1];
            if (!ts || ts === 'S1' || ts === 'Off') {
              var offType = cal[day].isSat ? 'W6Off' : 'Off';
              sched[yid2][day + 1] = offType;
              recordChange(yid2, day + 1, offType);
            }
          }
          break;
        }
      }
    }
    return true; // uid's shift is fixed regardless of cover success
  }

  // Find someone to take N on a shortage day
  function fwNShortage(sched, locked, users, daysInMonth, day, cal, prevTail, recordChange) {
    for (var ui = 0; ui < users.length; ui++) {
      var uid = users[ui].userId;
      if (locked[uid][day]) continue;
      var s = sched[uid][day];
      if (s !== 'S1' && s !== 'Off') continue;
      var tail = prevTail[uid] || [];
      var prev = day > 1 ? sched[uid][day - 1] : (tail.length ? tail[tail.length - 1] : null);
      if (prev === 'N' || prev === 'D') continue;
      if (day < daysInMonth && sched[uid][day + 1] === 'D') continue;
      sched[uid][day] = 'N';
      recordChange(uid, day, 'N');
      // Trailing Off (cal[day] = day+1 calendar entry, 0-indexed)
      if (day + 1 <= daysInMonth && !locked[uid][day + 1]) {
        var ts = sched[uid][day + 1];
        if (!ts || ts === 'S1' || ts === 'Off') {
          var offType = cal[day].isSat ? 'W6Off' : 'Off';
          sched[uid][day + 1] = offType;
          recordChange(uid, day + 1, offType);
        }
      }
      return true;
    }
    return false;
  }

  // ─── Fix All Warnings (single-call batch fix) ─────────────────────────────

  function fixAllWarnings(body) {
    var userRole = body._user && body._user.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可執行' };
    }
    var yyyyMM = body.yyyyMM;
    var warnings = body.warnings || [];
    var preview = body.preview || {};
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var usersResult = Auth.getUsers();
    if (!usersResult.success) return { success: false, error: '無法取得使用者' };
    var users = usersResult.data.filter(function (u) { return u.isActive === true && !u.noSchedule; });

    var year = parseInt(yyyyMM.slice(0, 4));
    var holResult = Schedule.getHolidays({ year: year });
    var holidays = holResult.success ? holResult.data : [];
    var holidayDates = {};
    holidays.forEach(function (h) { if (h.isHoliday) holidayDates[h.date] = true; });
    var cal = buildCal(yyyyMM, holidayDates);
    var daysInMonth = cal.length;

    var settingsResult = Settings_.getSettings();
    var settings = settingsResult.success ? settingsResult.data : {};
    var prevTail = loadPrevTail(ss, yyyyMM, users);

    var schedResult = Schedule.getSchedule({ yyyyMM: yyyyMM });
    var sheetSchedule = schedResult.success ? (schedResult.data.schedule || {}) : {};

    var sched = {};
    var locked = {};
    users.forEach(function (u) {
      var uid = u.userId;
      sched[uid] = {};
      locked[uid] = {};
      for (var d = 1; d <= daysInMonth; d++) {
        var sv = sheetSchedule[uid] && sheetSchedule[uid]['day_' + d];
        if (sv) {
          if (sv === 'Off' && cal[d - 1].isSat) sv = 'W6Off';
          sched[uid][d] = sv;
          locked[uid][d] = true;
        }
      }
      var pv = preview[uid] || {};
      for (var d2 = 1; d2 <= daysInMonth; d2++) {
        var ps = pv['day_' + d2];
        if (ps && !locked[uid][d2]) sched[uid][d2] = ps;
      }
    });

    var uidLabel = {};
    users.forEach(function (u) { uidLabel[u.userId] = u.code || u.name || u.userId; });

    var changes = {};
    function recordChange(uid, day, newShift) {
      if (!changes[uid]) changes[uid] = {};
      changes[uid]['day_' + day] = newShift;
      sched[uid][day] = newShift;
    }

    // Priority: structural fixes first, quota fixes last
    var PRIORITY = ['WuZhiViolation', 'NOffDFail', 'NShortage', 'DShortage', 'H3Shortage', 'S1Shortage', 'S1Excess', 'QuotaDRebalance', 'QuotaOffToS1'];
    var sorted = warnings.slice().sort(function (a, b) {
      var ai = PRIORITY.indexOf(a.type); var bi = PRIORITY.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    var remainingWarnings = [];
    sorted.forEach(function (warning) {
      var type = warning.type;
      var fixed = false;
      if (type === 'NOffDFail') {
        fixed = fwNOffD(sched, locked, users, daysInMonth, warning.userId, warning.day, recordChange);
      } else if (type === 'DShortage') {
        fixed = fwDShortage(sched, locked, users, daysInMonth, warning.day, settings, recordChange);
      } else if (type === 'H3Shortage') {
        fixed = fwH3Shortage(sched, locked, users, warning.day, recordChange);
      } else if (type === 'S1Shortage') {
        fixed = fwS1Shortage(sched, locked, users, warning.day, recordChange);
      } else if (type === 'S1Excess') {
        fixed = fwS1Excess(sched, locked, users, warning.day, recordChange);
      } else if (type === 'WuZhiViolation') {
        fixed = fwWuZhiViolation(sched, locked, users, daysInMonth, cal, warning.userId, warning.day, settings, recordChange);
      } else if (type === 'NShortage') {
        fixed = fwNShortage(sched, locked, users, daysInMonth, warning.day, cal, prevTail, recordChange);
      } else if (type === 'QuotaDRebalance') {
        fixed = fwQuotaDRebalance(sched, locked, users, daysInMonth, prevTail, warning.userId, warning.targetUserId, warning.day, recordChange);
      } else if (type === 'QuotaOffToS1') {
        fixed = fwS1Shortage(sched, locked, users, warning.day, recordChange);
      }
      if (!fixed) remainingWarnings.push(warning);
    });

    return { success: true, data: { changes: changes, remainingWarnings: remainingWarnings } };
  }

  // ─── Rescan Schedule (quota-based re-scan) ────────────────────────────────

  function rescanSchedule(body) {
    var userRole = body._user && body._user.role;
    if (userRole !== 'scheduler' && userRole !== 'superadmin') {
      return { success: false, error: '僅排班者可執行' };
    }
    var yyyyMM = body.yyyyMM;
    var preview = body.preview || {};
    var manualOverrides = body.manualOverrides || {};
    if (!yyyyMM) return { success: false, error: '缺少 yyyyMM' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var usersResult = Auth.getUsers();
    if (!usersResult.success) return { success: false, error: '無法取得使用者' };
    var users = usersResult.data.filter(function (u) { return u.isActive === true && !u.noSchedule; });

    var year = parseInt(yyyyMM.slice(0, 4));
    var holResult = Schedule.getHolidays({ year: year });
    var holidays = holResult.success ? holResult.data : [];
    var holidayDates = {};
    holidays.forEach(function (h) { if (h.isHoliday) holidayDates[h.date] = true; });
    var cal = buildCal(yyyyMM, holidayDates);
    var daysInMonth = cal.length;

    var settingsResult = Settings_.getSettings();
    var settings = settingsResult.success ? settingsResult.data : {};
    var rules = parseRules(settings);
    var wdD  = parseInt(settings.wdD)  || 1;
    var wdN  = parseInt(settings.wdN)  || 1;
    var wdS1 = parseInt(settings.wdS1) || 2;
    var holD = parseInt(settings.holD) || 1;
    var holN = parseInt(settings.holN) || 1;
    var sunD = parseInt(settings.sunD) || 1;
    var sunN = parseInt(settings.sunN) || 1;
    var satH3 = parseInt(settings.satH3) || 2;
    var maxWork = 6;

    var schedResult = Schedule.getSchedule({ yyyyMM: yyyyMM });
    var sheetSchedule = schedResult.success ? (schedResult.data.schedule || {}) : {};
    var meta = schedResult.success ? (schedResult.data.meta || {}) : {};
    var quotaOverrides = meta.quotaOverrides || {};

    var prevTail = loadPrevTail(ss, yyyyMM, users);

    // Build merged sched: locked → preview → manualOverrides
    var sched = {};
    var locked = {};
    users.forEach(function (u) {
      var uid = u.userId;
      sched[uid] = {};
      locked[uid] = {};
      for (var d = 1; d <= daysInMonth; d++) {
        var sv = sheetSchedule[uid] && sheetSchedule[uid]['day_' + d];
        if (sv) {
          if (sv === 'Off' && cal[d - 1].isSat) sv = 'W6Off';
          sched[uid][d] = sv;
          locked[uid][d] = true;
        }
      }
      var pv = preview[uid] || {};
      for (var d2 = 1; d2 <= daysInMonth; d2++) {
        var ps = pv['day_' + d2];
        if (ps && !locked[uid][d2]) sched[uid][d2] = ps;
      }
      var mo = manualOverrides[uid] || {};
      for (var d3 = 1; d3 <= daysInMonth; d3++) {
        var ms = mo['day_' + d3];
        if (ms && !locked[uid][d3]) sched[uid][d3] = ms;
      }
    });

    var uidLabel = {};
    users.forEach(function (u) { uidLabel[u.userId] = u.code || u.name || u.userId; });

    // Load quotas
    var quotas = buildQuotas(users, meta, quotaOverrides);

    // Compute actuals per user
    var actuals = {};
    users.forEach(function (u) {
      var uid = u.userId;
      var cnt = { D: 0, N: 0, S1: 0, H3: 0, Off: 0, W6Off: 0 };
      for (var d = 1; d <= daysInMonth; d++) {
        var s = sched[uid][d];
        if (s && cnt[s] !== undefined) cnt[s]++;
      }
      cnt.OffTotal = cnt.Off + cnt.W6Off;
      actuals[uid] = cnt;
    });

    var warnings = [];

    // ── QuotaDRebalance: A has too many D, B has too few D but too many Off ──
    users.forEach(function (uA) {
      var uidA = uA.userId;
      var qA = quotas[uidA];
      if (!qA || actuals[uidA].D <= qA.D) return;
      var excessD = actuals[uidA].D - qA.D;

      users.forEach(function (uB) {
        var uidB = uB.userId;
        if (uidB === uidA) return;
        var qB = quotas[uidB];
        if (!qB || actuals[uidB].D >= qB.D) return;
        if (actuals[uidB].OffTotal <= qB.Off) return;
        var deficitD = qB.D - actuals[uidB].D;

        for (var d = 1; d <= daysInMonth; d++) {
          if (sched[uidA][d] !== 'D' || locked[uidA][d]) continue;
          var bShift = sched[uidB][d];
          if (bShift !== 'Off' && bShift !== 'W6Off' && bShift !== 'S1') continue;
          if (locked[uidB][d]) continue;
          var prevB = d > 1 ? sched[uidB][d - 1] : null;
          if (prevB === 'N' || prevB === 'D') continue;
          if (isRest(prevB) && (d > 2 ? sched[uidB][d - 2] : null) === 'N') continue;
          if (d < daysInMonth && sched[uidB][d + 1] === 'D') continue;
          if (consWorkBefore(uidB, d, sched, prevTail) + 1 > maxWork) continue;

          var w = mkWarn('QuotaDRebalance',
            (uidLabel[uidA]||uidA) + ' D超額+' + excessD + '，' +
            (uidLabel[uidB]||uidB) + ' D不足-' + deficitD + '，建議第' + d + '天 ' +
            (uidLabel[uidA]||uidA) + '[D]↔' + (uidLabel[uidB]||uidB) + '[' + bShift + ']',
            uidA, d);
          w.targetUserId = uidB;
          warnings.push(w);
          return; // one warning per A-B pair
        }
      });
    });

    // ── 每日人力需求掃描 ─────────────────────────────────────────────────────
    cal.forEach(function (c) {
      var day = c.day;
      var dCount = 0, nCount = 0, h3Count = 0;
      users.forEach(function (u) {
        var s = sched[u.userId][day];
        if (s === 'D')  dCount++;
        if (s === 'N')  nCount++;
        if (s === 'H3') h3Count++;
      });

      if (c.isWeekday) {
        // 平日 D 不足
        if (dCount < wdD) {
          var dCands = users.filter(function (u) {
            var uid = u.userId;
            var s = sched[uid][day];
            if (s !== 'S1' && s !== 'Off') return false;
            if (locked[uid][day]) return false;
            var prev = day > 1 ? sched[uid][day - 1] : null;
            if (prev === 'N' || prev === 'D') return false;
            if (isRest(prev) && (day > 2 ? sched[uid][day - 2] : null) === 'N') return false;
            return true;
          });
          warnings.push(mkWarn('DShortage',
            '第' + day + '天 D=' + dCount + '/' + wdD +
            (dCands.length ? '，可補：' + dCands.map(function(u){return uidLabel[u.userId]||u.userId;}).join('、') : '，無可用人選'),
            null, day));
        }
        // 平日 N 不足
        if (nCount < wdN) {
          warnings.push(mkWarn('NShortage', '第' + day + '天 N=' + nCount + '/' + wdN, null, day));
        }
        // 平日 S1 不足
        var s1Count = 0;
        users.forEach(function (u) { if (sched[u.userId][day] === 'S1') s1Count++; });
        if (s1Count < wdS1) {
          warnings.push(mkWarn('S1Shortage', '第' + day + '天 S1=' + s1Count + '/' + wdS1, null, day));
        }
      } else if (c.isHol && !c.isWeekend) {
        // 假日平日 D/N 不足
        if (dCount < holD)
          warnings.push(mkWarn('DShortage', '第' + day + '天(假) D=' + dCount + '/' + holD, null, day));
        if (nCount < holN)
          warnings.push(mkWarn('NShortage', '第' + day + '天(假) N=' + nCount + '/' + holN, null, day));
      } else if (c.isSun) {
        // 週日 D/N 不足
        if (dCount < sunD)
          warnings.push(mkWarn('DShortage', '第' + day + '天(日) D=' + dCount + '/' + sunD, null, day));
        if (nCount < sunN)
          warnings.push(mkWarn('NShortage', '第' + day + '天(日) N=' + nCount + '/' + sunN, null, day));
      } else if (c.isSat && !c.isHol) {
        // 非假日週六 H3 不足
        if (h3Count < satH3)
          warnings.push(mkWarn('H3Shortage',
            '第' + day + '天(六) H3=' + h3Count + '/' + satH3, null, day));
      }
    });

    // ── 碎班掃描（休-班-休，參數化開關）──────────────────────────────────────
    scanFragmentShifts(sched, locked, users, daysInMonth, prevTail, rules, warnings, uidLabel);

    return { success: true, data: { warnings: warnings } };
  }

  // ─── Fix helper: D quota rebalance swap ───────────────────────────────────

  function fwQuotaDRebalance(sched, locked, users, daysInMonth, prevTail, uidA, uidB, day, recordChange) {
    if (!uidA || !uidB || !day) return false;
    if (sched[uidA][day] !== 'D' || locked[uidA][day]) return false;
    var bShift = sched[uidB][day];
    if (bShift !== 'Off' && bShift !== 'W6Off' && bShift !== 'S1') return false;
    if (locked[uidB][day]) return false;
    var prevB = day > 1 ? sched[uidB][day - 1] : null;
    if (prevB === 'N' || prevB === 'D') return false;
    if (isRest(prevB) && (day > 2 ? sched[uidB][day - 2] : null) === 'N') return false;
    if (day < daysInMonth && sched[uidB][day + 1] === 'D') return false;
    if (consWorkBefore(uidB, day, sched, prevTail) + 1 > 6) return false;
    sched[uidA][day] = bShift;
    sched[uidB][day] = 'D';
    recordChange(uidA, day, bShift);
    recordChange(uidB, day, 'D');
    return true;
  }

  return { autoFillSchedule: autoFillSchedule, fixWarning: fixWarning, fixAllWarnings: fixAllWarnings, rescanSchedule: rescanSchedule };

})();

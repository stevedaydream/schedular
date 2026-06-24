/**
 * Auth.gs — 登入驗證、JWT、人員管理
 */

var Auth = (function () {

  var JWT_SECRET_KEY = 'JWT_SECRET';
  var USERS_SHEET = 'Users';

  // 既有 Users 分頁可能無 noNight 欄（功能新增前建立），動態補上欄位避免欄位錯位
  function ensureNoNightColumn(sheet) {
    if (!sheet || sheet.getLastColumn() === 0) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('noNight') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('noNight');
    }
  }

  // ─── JWT ───────────────────────────────────────────────────────────────────

  function base64UrlEncode(str) {
    return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
  }

  function base64UrlDecode(str) {
    // Pad to multiple of 4
    while (str.length % 4 !== 0) str += '=';
    return Utilities.base64DecodeWebSafe(str);
  }

  function createJWT(payload) {
    const secret = PropertiesService.getScriptProperties().getProperty(JWT_SECRET_KEY)
      || 'default_dev_secret_change_me';

    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const exp = Math.floor(Date.now() / 1000) + 24 * 3600; // 24 hours
    const payloadStr = base64UrlEncode(JSON.stringify({ ...payload, exp }));
    const signingInput = header + '.' + payloadStr;

    const signature = base64UrlEncode(
      String.fromCharCode.apply(
        null,
        Utilities.computeHmacSha256Signature(signingInput, secret)
      )
    );

    return signingInput + '.' + signature;
  }

  function verifyJWT(token) {
    if (!token || typeof token !== 'string') {
      return { valid: false, payload: null };
    }

    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, payload: null };

    try {
      const secret = PropertiesService.getScriptProperties().getProperty(JWT_SECRET_KEY)
        || 'default_dev_secret_change_me';

      const signingInput = parts[0] + '.' + parts[1];
      const expectedSig = base64UrlEncode(
        String.fromCharCode.apply(
          null,
          Utilities.computeHmacSha256Signature(signingInput, secret)
        )
      );

      if (expectedSig !== parts[2]) {
        return { valid: false, payload: null };
      }

      const payloadBytes = base64UrlDecode(parts[1]);
      const payload = JSON.parse(
        payloadBytes.map(b => String.fromCharCode(b)).join('')
      );

      // Check expiry
      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        return { valid: false, payload: null };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, payload: null };
    }
  }

  // ─── Auth Actions ──────────────────────────────────────────────────────────

  function login(body) {
  const { email, passwordHash } = body;
  if (!email || !passwordHash) {
    return { success: false, error: '請提供 email 和密碼' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return { success: false, error: '系統未初始化，請執行 Setup' };

  const users = sheetToObjects(sheet);
  const user = users.find(u =>
    u.email === email &&
    String(u.passwordHash).toLowerCase() === String(passwordHash).toLowerCase()
  );

  if (!user) {
    return { success: false, error: 'Email 或密碼不正確' };
  }

  const isActive = user.isActive === true || user.isActive === 'true' || user.isActive === 'TRUE';
  if (!isActive) {
    return { success: false, error: '此帳號已停用，請聯絡管理員' };
  }

  const token = createJWT({
    userId: user.userId,
    email: user.email,
    role: user.role,
    name: user.name
  });

  return { success: true, data: { token, user: { userId: user.userId, email: user.email, role: user.role, name: user.name } } };
}

function googleLogin(body) {
  const { idToken } = body;
  if (!idToken) return { success: false, error: '缺少 Google id_token' };

  // Verify Google id_token by calling tokeninfo endpoint
  try {
    const response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken
    );
    const tokenInfo = JSON.parse(response.getContentText());

    if (tokenInfo.error) {
      return { success: false, error: 'Google token 驗證失敗：' + tokenInfo.error };
    }

    const email = tokenInfo.email;
    if (!email) return { success: false, error: '無法取得 email' };

    // Find user in Users sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(USERS_SHEET);
    if (!sheet) return { success: false, error: '系統未初始化' };

    const users = sheetToObjects(sheet);
    const user = users.find(u => u.email === email);

    if (!user) {
      return { success: false, error: '此 Google 帳號未在系統中，請聯絡管理員' };
    }

    const isActive = user.isActive === true || user.isActive === 'true' || user.isActive === 'TRUE';
    if (!isActive) {
      return { success: false, error: '此帳號已停用，請聯絡管理員' };
    }

    const token = createJWT({
      userId: user.userId,
      email: user.email,
      role: user.role,
      name: user.name
    });

    return { success: true, data: { token, user: { userId: user.userId, email: user.email, role: user.role, name: user.name } } };

  } catch (err) {
    return { success: false, error: 'Google 登入失敗：' + err.message };
  }
}

  // ─── User CRUD ─────────────────────────────────────────────────────────────

  function getUsers() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(USERS_SHEET);
    if (!sheet) return { success: false, error: '找不到 Users 分頁' };
    ensureNoNightColumn(sheet);

    const users = sheetToObjects(sheet).map(u => ({
      userId: u.userId,
      name: u.name,
      role: u.role,
      email: u.email,
      isActive: u.isActive === true || u.isActive === 'true' || u.isActive === 'TRUE',
      isSupport: u.isSupport === true || u.isSupport === 'true' || u.isSupport === 'TRUE',
      sortOrder: parseInt(u.sortOrder) || 0,
      code: u.code || '',
      noSchedule: u.noSchedule === true || u.noSchedule === 'true' || u.noSchedule === 'TRUE',
      noNight: u.noNight === true || u.noNight === 'true' || u.noNight === 'TRUE'
      // Note: passwordHash is NOT returned
    }));

    return { success: true, data: users };
  }

  function addUser(body) {
    const { name, email, passwordHash, role, isActive, isSupport, sortOrder, code, noSchedule, noNight } = body;
    if (!name || !email) return { success: false, error: '姓名和 Email 為必填' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateSheet(ss, USERS_SHEET,
        ['userId', 'name', 'role', 'email', 'passwordHash', 'isActive', 'isSupport', 'sortOrder', 'code', 'noSchedule', 'noNight']);
      ensureNoNightColumn(sheet);

      // Check duplicate email
      const users = sheetToObjects(sheet);
      if (users.find(u => u.email === email)) {
        return { success: false, error: '此 Email 已存在' };
      }

      const userId = generateUUID();
      const userCode = code || '';
      sheet.appendRow([
        userId,
        name,
        role || 'member',
        email,
        passwordHash || '',
        isActive !== undefined ? isActive : true,
        isSupport === true || isSupport === 'true' ? true : false,
        sortOrder || 0,
        userCode,
        noSchedule || false,
        noNight === true || noNight === 'true' ? true : false
      ]);

      return { success: true, data: { userId, name, role: role || 'member', email, isActive: isActive !== undefined ? isActive : true, isSupport: !!isSupport, sortOrder: sortOrder || 0, code: userCode, noSchedule: !!noSchedule, noNight: !!noNight } };
    } finally {
      lock.releaseLock();
    }
  }

  function updateUser(body) {
    const { userId } = body;
    if (!userId) return { success: false, error: '缺少 userId' };

    // Authorization: superadmin only (or self for limited fields)
    if (body._user && body._user.role !== 'superadmin' && body._user.userId !== userId) {
      return { success: false, error: '權限不足' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = ss.getSheetByName(USERS_SHEET);
      if (!sheet) return { success: false, error: '找不到 Users 分頁' };
      ensureNoNightColumn(sheet);

      const rowIdx = findRowIndex(sheet, 'userId', userId);
      if (rowIdx === -1) return { success: false, error: '找不到此人員' };

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const row = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

      const { name, role, isActive, isSupport, sortOrder, passwordHash, code, noSchedule, noNight } = body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (isActive !== undefined) updates.isActive = isActive;
      if (isSupport !== undefined) updates.isSupport = isSupport === true || isSupport === 'true' ? true : false;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (passwordHash !== undefined) updates.passwordHash = passwordHash;
      if (code !== undefined) updates.code = code;
      if (noSchedule !== undefined) updates.noSchedule = noSchedule === true || noSchedule === 'true' ? true : false;
      if (noNight !== undefined) updates.noNight = noNight === true || noNight === 'true' ? true : false;

      headers.forEach((h, i) => {
        if (updates[h] !== undefined) row[i] = updates[h];
      });

      sheet.getRange(rowIdx, 1, 1, headers.length).setValues([row]);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function removeUser(body) {
    const { userId } = body;
    if (!userId) return { success: false, error: '缺少 userId' };

    if (body._user?.role !== 'superadmin') {
      return { success: false, error: '僅管理員可移除人員' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = ss.getSheetByName(USERS_SHEET);
      if (!sheet) return { success: false, error: '找不到 Users 分頁' };

      const rowIdx = findRowIndex(sheet, 'userId', userId);
      if (rowIdx === -1) return { success: false, error: '找不到此人員' };

      sheet.deleteRow(rowIdx);
      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function batchRemoveUsers(body) {
    if (body._user?.role !== 'superadmin') {
      return { success: false, error: '僅管理員可移除人員' };
    }
    const { userIds } = body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, error: '缺少 userIds 陣列' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      const sheet = ss.getSheetByName(USERS_SHEET);
      if (!sheet) return { success: false, error: '找不到 Users 分頁' };

      const idSet = new Set(userIds);
      // Collect row indices descending so deleting doesn't shift remaining rows
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const uidCol = headers.indexOf('userId');
      const toDelete = [];
      for (let i = data.length - 1; i >= 1; i--) {
        if (idSet.has(data[i][uidCol])) toDelete.push(i + 1); // 1-based
      }
      toDelete.forEach(function(r) { sheet.deleteRow(r); });

      return { success: true, data: { removed: toDelete.length } };
    } finally {
      lock.releaseLock();
    }
  }

  function transferScheduler(body) {
    const { targetUserId } = body;
    if (!targetUserId) return { success: false, error: '缺少 targetUserId' };

    if (!body._user || body._user.role !== 'scheduler') {
      return { success: false, error: '僅排班者可移交角色' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      const sheet = ss.getSheetByName(USERS_SHEET);
      if (!sheet) return { success: false, error: '找不到 Users 分頁' };

      // Demote current scheduler to member
      const currentRowIdx = findRowIndex(sheet, 'userId', body._user.userId);
      if (currentRowIdx !== -1) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const roleCol = headers.indexOf('role') + 1;
        if (roleCol > 0) sheet.getRange(currentRowIdx, roleCol).setValue('member');
      }

      // Promote target to scheduler
      const targetRowIdx = findRowIndex(sheet, 'userId', targetUserId);
      if (targetRowIdx === -1) return { success: false, error: '找不到目標人員' };

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const roleCol = headers.indexOf('role') + 1;
      if (roleCol > 0) sheet.getRange(targetRowIdx, roleCol).setValue('scheduler');

      return { success: true };
    } finally {
      lock.releaseLock();
    }
  }

  function batchAddUsers(body) {
    if (body._user?.role !== 'superadmin' && body._user?.role !== 'scheduler') {
      return { success: false, error: '權限不足' };
    }
    const { users } = body;
    if (!Array.isArray(users) || users.length === 0) {
      return { success: false, error: '缺少 users 陣列' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      const sheet = getOrCreateSheet(ss, USERS_SHEET,
        ['userId', 'name', 'role', 'email', 'passwordHash', 'isActive', 'isSupport', 'sortOrder', 'code', 'noSchedule', 'noNight']);
      ensureNoNightColumn(sheet);

      const existingUsers = sheetToObjects(sheet);
      const existingEmails = new Set(existingUsers.map(function(u) { return u.email; }));

      const added = [];
      const errors = [];

      users.forEach(function(u, i) {
        if (!u.name || !u.email) {
          errors.push({ row: i + 1, email: u.email || '', error: '姓名和 Email 為必填' });
          return;
        }
        if (existingEmails.has(u.email)) {
          errors.push({ row: i + 1, email: u.email, error: 'Email 已存在，略過' });
          return;
        }
        const userId = generateUUID();
        const userCode = u.code || '';
        const isActive = u.isActive !== false && u.isActive !== 'false' && u.isActive !== 'FALSE';
        const isSupport = u.isSupport === true || u.isSupport === 'true' || u.isSupport === 'TRUE';
        const noSchedule = u.noSchedule === true || u.noSchedule === 'true' ? true : false;
        const noNight = u.noNight === true || u.noNight === 'true' ? true : false;
        sheet.appendRow([
          userId, u.name, u.role || 'member', u.email, u.passwordHash || '',
          isActive, isSupport, u.sortOrder || 0, userCode, noSchedule, noNight
        ]);
        existingEmails.add(u.email);
        added.push({ userId, name: u.name, email: u.email, role: u.role || 'member',
          isActive, isSupport, sortOrder: u.sortOrder || 0, code: userCode, noSchedule, noNight });
      });

      return { success: true, data: { added, errors } };
    } finally {
      lock.releaseLock();
    }
  }

  return { login, googleLogin, verifyJWT, createJWT, getUsers, addUser, updateUser, removeUser, batchRemoveUsers, transferScheduler, batchAddUsers };

})();

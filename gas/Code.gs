/**
 * Code.gs — GAS 主程式
 * 路由分發器：doGet / doPost
 */

function doGet(e) {
  const action = e.parameter.action;
  const params = e.parameter;

  // Allow CORS
  try {
    switch (action) {
      case 'getSchedule':    return respond(Schedule.getSchedule(params));
      case 'getRequests':    return respond(Request.getRequests(params));
      case 'getNotifications': return respond(Notification_.getNotifications(params));
      case 'getHolidays':    return respond(Schedule.getHolidays(params));
      case 'getGovHolidays': return respond(Schedule.getGovHolidays(params));
      case 'getSettings':    return respond(Settings_.getSettings());
      case 'getShiftTypes':  return respond(Settings_.getShiftTypes());
      case 'getUsers':       return respond(Auth.getUsers());
      case 'getRotationState':        return respond(Rotation.getRotationState());
      case 'getShiftBalance':         return respond(Rotation.getShiftBalance());
      case 'getRecentRotationRecord': return respond(Schedule.getRecentRotationRecord(params));
      default:               return respond({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ success: false, error: 'Invalid JSON body' });
  }

  const action = body.action;

  // Skip auth for login actions
  if (action !== 'login' && action !== 'googleLogin') {
    const token = body.token || getTokenFromHeader(e);
    const authResult = Auth.verifyJWT(token);
    if (!authResult.valid) {
      return respond({ success: false, error: 'Unauthorized' });
    }
    body._user = authResult.payload;
  }

  try {
    switch (action) {
      case 'login':             return respond(Auth.login(body));
      case 'googleLogin':       return respond(Auth.googleLogin(body));
      case 'saveShift':         return respond(Schedule.saveShift(body));
      case 'batchSaveShifts':   return respond(Schedule.batchSaveShifts(body));
      case 'saveRequest':       return respond(Request.saveRequest(body));
      case 'lockSchedule':      return respond(Schedule.lockSchedule(body));
      case 'unlockSchedule':    return respond(Schedule.unlockSchedule(body));
      case 'clearSchedule':     return respond(Schedule.clearSchedule(body));
      case 'transferScheduler': return respond(Auth.transferScheduler(body));
      case 'submitSwap':        return respond(Swap.submitSwap(body));
      case 'respondSwap':       return respond(Swap.respondSwap(body));
      case 'updateSettings':    return respond(Settings_.updateSettings(body));
      case 'saveShiftTypes':         return respond(Settings_.saveShiftTypes(body));
      case 'saveRotationPool':       return respond(Rotation.saveRotationPool(body));
      case 'saveAllRotationPools':   return respond(Rotation.saveAllRotationPools(body));
      case 'applyMonthlyShiftQuota': return respond(Rotation.applyMonthlyShiftQuota(body));
      case 'commitShiftBalance':     return respond(Rotation.commitShiftBalance(body));
      case 'updateUser':        return respond(Auth.updateUser(body));
      case 'addUser':           return respond(Auth.addUser(body));
      case 'batchAddUsers':     return respond(Auth.batchAddUsers(body));
      case 'removeUser':        return respond(Auth.removeUser(body));
      case 'batchRemoveUsers':  return respond(Auth.batchRemoveUsers(body));
      case 'saveHolidayDuty':   return respond(Schedule.saveHolidayDuty(body));
      case 'saveHolidays':      return respond(Schedule.saveHolidays(body));
      default:                  return respond({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function respond(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function getTokenFromHeader(e) {
  // GAS doesn't directly expose Authorization header
  // Token is expected in request body
  return null;
}

/**
 * Get or create a sheet by name
 */
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }
  return sheet;
}

/**
 * Convert sheet rows to objects using header row
 */
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * Find row index by field value (1-based, including header)
 */
function findRowIndex(sheet, field, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(field);
  if (colIdx === -1) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(value)) return i + 1; // 1-based
  }
  return -1;
}

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return Utilities.getUuid();
}

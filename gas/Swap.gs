/**
 * Swap.gs — 換班邏輯
 */

var Swap = (function () {

  var NOTIFICATIONS_SHEET = 'Notifications';

  function submitSwap(body) {
    const { yyyyMM, day, fromShift, toUserId, toShift } = body;
    if (!yyyyMM || !day || !fromShift || !toUserId || !toShift) {
      return { success: false, error: '缺少必要參數' };
    }

    if (!body._user) return { success: false, error: '未登入' };

    const fromUserId = body._user.userId;
    if (fromUserId === toUserId) {
      return { success: false, error: '不能與自己換班' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getOrCreateSheet(ss, NOTIFICATIONS_SHEET, [
        'notificationId', 'type', 'fromUserId', 'toUserId',
        'yyyyMM', 'day', 'fromShift', 'toShift',
        'status', 'createdAt', 'readAt'
      ]);

      const notificationId = generateUUID();
      sheet.appendRow([
        notificationId,
        'swap_request',
        fromUserId,
        toUserId,
        yyyyMM,
        day,
        fromShift,
        toShift,
        'pending',
        new Date().toISOString(),
        ''
      ]);

      // Send email notification
      sendSwapRequestEmail(ss, fromUserId, toUserId, yyyyMM, day, fromShift, toShift);

      return { success: true, data: { notificationId } };
    } finally {
      lock.releaseLock();
    }
  }

  function respondSwap(body) {
    const { notificationId, accept } = body;
    if (!notificationId) return { success: false, error: '缺少 notificationId' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = ss.getSheetByName(NOTIFICATIONS_SHEET);
      if (!sheet) return { success: false, error: '找不到通知分頁' };

      const rowIdx = findRowIndex(sheet, 'notificationId', notificationId);
      if (rowIdx === -1) return { success: false, error: '找不到此通知' };

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const row = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
      const notif = {};
      headers.forEach((h, i) => { notif[h] = row[i]; });

      // Verify responder is the target
      if (body._user && body._user.userId !== notif.toUserId) {
        return { success: false, error: '您不是此換班申請的對象' };
      }

      // Check status
      if (notif.status !== 'pending') {
        return { success: false, error: '此申請已被處理' };
      }

      const newStatus = accept ? 'accepted' : 'rejected';
      const statusColIdx = headers.indexOf('status') + 1;
      const readAtColIdx = headers.indexOf('readAt') + 1;

      sheet.getRange(rowIdx, statusColIdx).setValue(newStatus);
      sheet.getRange(rowIdx, readAtColIdx).setValue(new Date().toISOString());

      if (accept) {
        // Execute the swap on the schedule
        executeSwap(ss, notif);

        // Create reminder notification for both parties
        sheet.appendRow([
          generateUUID(),
          'swap_reminder',
          body._user.userId,
          notif.fromUserId,
          notif.yyyyMM,
          notif.day,
          notif.fromShift,
          notif.toShift,
          'pending',
          new Date().toISOString(),
          ''
        ]);

        // Send email to applicant
        sendSwapResultEmail(ss, notif, true);
      } else {
        sendSwapResultEmail(ss, notif, false);
      }

      return { success: true, data: { status: newStatus } };
    } finally {
      lock.releaseLock();
    }
  }

  function executeSwap(ss, notif) {
    const { yyyyMM, day, fromUserId, toUserId, fromShift, toShift } = notif;
    const sheetName = 'Schedule_' + yyyyMM;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return; // Schedule may not exist yet

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const dayKey = 'day_' + day;
    const dayCol = headers.indexOf(dayKey) + 1;
    if (dayCol === 0) return;

    const fromRowIdx = findRowIndex(sheet, 'userId', fromUserId);
    const toRowIdx = findRowIndex(sheet, 'userId', toUserId);

    if (fromRowIdx !== -1) {
      sheet.getRange(fromRowIdx, dayCol).setValue(toShift);
    }
    if (toRowIdx !== -1) {
      sheet.getRange(toRowIdx, dayCol).setValue(fromShift);
    }
  }

  function sendSwapRequestEmail(ss, fromUserId, toUserId, yyyyMM, day, fromShift, toShift) {
    try {
      const usersSheet = ss.getSheetByName('Users');
      if (!usersSheet) return;
      const users = sheetToObjects(usersSheet);
      const fromUser = users.find(u => u.userId === fromUserId);
      const toUser = users.find(u => u.userId === toUserId);
      if (!toUser || !toUser.email) return;

      const year = yyyyMM.slice(0, 4);
      const month = yyyyMM.slice(4, 6);
      const subject = `[排班系統] 換班申請通知`;
      const body = `${toUser.name} 您好，

${fromUser?.name || fromUserId} 申請與您換班：

月份：${year}年${month}月
日期：第 ${day} 天
申請方班別：${fromShift}
您的班別：${toShift}

請登入排班系統回覆此申請。

排班系統`;

      GmailApp.sendEmail(toUser.email, subject, body);
    } catch (err) {
      // Email sending failure should not block swap
      console.error('Email send error:', err.message);
    }
  }

  function sendSwapResultEmail(ss, notif, accepted) {
    try {
      const usersSheet = ss.getSheetByName('Users');
      if (!usersSheet) return;
      const users = sheetToObjects(usersSheet);
      const fromUser = users.find(u => u.userId === notif.fromUserId);
      const toUser = users.find(u => u.userId === notif.toUserId);
      if (!fromUser || !fromUser.email) return;

      const year = notif.yyyyMM?.slice(0, 4);
      const month = notif.yyyyMM?.slice(4, 6);
      const result = accepted ? '已接受' : '已拒絕';
      const subject = `[排班系統] 換班申請${result}`;
      const bodyText = `${fromUser.name} 您好，

${toUser?.name || notif.toUserId} 已${result}您的換班申請：

月份：${year}年${month}月
日期：第 ${notif.day} 天
${accepted ? '換班已生效，請記得填寫紙本換班單並通知副主任。' : ''}

排班系統`;

      GmailApp.sendEmail(fromUser.email, subject, bodyText);
    } catch (err) {
      console.error('Email send error:', err.message);
    }
  }

  return { submitSwap, respondSwap };

})();

/**
 * Notification.gs — 通知管理
 * GAS 中 Notification 是保留字，故使用 Notification_ 命名
 */

var Notification_ = (function () {

  var NOTIFICATIONS_SHEET = 'Notifications';

  function getNotifications(params) {
    const userId = params.userId;
    if (!userId) return { success: false, error: '缺少 userId 參數' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOTIFICATIONS_SHEET);

    if (!sheet) return { success: true, data: [] };

    const allRows = sheetToObjects(sheet);

    // Return notifications where user is the recipient (toUserId)
    // Also return notifications initiated by user (fromUserId) for status tracking
    const userNotifications = allRows.filter(row =>
      row.toUserId === userId || row.fromUserId === userId
    ).map(row => ({
      notificationId: row.notificationId,
      type: row.type,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      yyyyMM: row.yyyyMM,
      day: row.day,
      fromShift: row.fromShift,
      toShift: row.toShift,
      status: row.status,
      createdAt: row.createdAt,
      readAt: row.readAt || null
    }));

    // Sort by createdAt descending
    userNotifications.sort((a, b) => {
      const da = new Date(a.createdAt || 0);
      const db = new Date(b.createdAt || 0);
      return db - da;
    });

    return { success: true, data: userNotifications };
  }

  function markRead(notificationId, userId) {
    if (!notificationId) return { success: false, error: '缺少 notificationId' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOTIFICATIONS_SHEET);
    if (!sheet) return { success: false, error: '找不到通知分頁' };

    const rowIdx = findRowIndex(sheet, 'notificationId', notificationId);
    if (rowIdx === -1) return { success: false, error: '找不到此通知' };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const readAtCol = headers.indexOf('readAt') + 1;
    if (readAtCol > 0) {
      sheet.getRange(rowIdx, readAtCol).setValue(new Date().toISOString());
    }

    return { success: true };
  }

  /**
   * Send a batch email digest (can be triggered by time-driven trigger)
   */
  function sendDailyDigest() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOTIFICATIONS_SHEET);
    if (!sheet) return;

    const allRows = sheetToObjects(sheet);
    const pending = allRows.filter(r => r.status === 'pending' && !r.readAt);

    if (pending.length === 0) return;

    // Group by toUserId
    const byUser = {};
    pending.forEach(n => {
      if (!byUser[n.toUserId]) byUser[n.toUserId] = [];
      byUser[n.toUserId].push(n);
    });

    const usersSheet = ss.getSheetByName('Users');
    if (!usersSheet) return;
    const users = sheetToObjects(usersSheet);

    Object.entries(byUser).forEach(([userId, notifications]) => {
      const user = users.find(u => u.userId === userId);
      if (!user || !user.email) return;

      const subject = `[排班系統] 您有 ${notifications.length} 則待處理通知`;
      const body = `${user.name} 您好，

您有以下待處理的通知：

${notifications.map(n => `- ${n.type === 'swap_request' ? '換班申請' : n.type}（${n.yyyyMM} 第${n.day}天）`).join('\n')}

請登入排班系統查看詳情。

排班系統`;

      try {
        GmailApp.sendEmail(user.email, subject, body);
      } catch (err) {
        console.error('Digest email error:', err.message);
      }
    });
  }

  return { getNotifications, markRead, sendDailyDigest };

})();

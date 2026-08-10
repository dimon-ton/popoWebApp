// User feedback: bug reports and feature requests sent directly to Telegram.

function setTelegramFeedbackConfig(botToken, chatId) {
  if (!botToken || !chatId) throw new Error('Provide both a Telegram bot token and chat ID.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('TELEGRAM_FEEDBACK_BOT_TOKEN', String(botToken).trim());
  props.setProperty('TELEGRAM_FEEDBACK_CHAT_ID', String(chatId).trim());
}

function submitFeedback(token, feedbackType, subject, details, pageUrl, imageAttachments) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบก่อนส่งข้อเสนอแนะ');

  var type = String(feedbackType || '').trim();
  var title = String(subject || '').trim();
  var message = String(details || '').trim();
  if (['bug', 'feature'].indexOf(type) === -1) {
    throw new Error('ประเภทข้อเสนอแนะไม่ถูกต้อง');
  }
  if (!title || !message) {
    throw new Error('กรุณากรอกหัวข้อและรายละเอียด');
  }
  if (title.length > 160 || message.length > 5000) {
    throw new Error('หัวข้อหรือรายละเอียดมีความยาวเกินกำหนด');
  }

  var props = PropertiesService.getScriptProperties();
  var botToken = props.getProperty('TELEGRAM_FEEDBACK_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_FEEDBACK_CHAT_ID');
  if (!botToken || !chatId) {
    throw new Error('ยังไม่ได้ตั้งค่าปลายทาง Telegram สำหรับรับข้อเสนอแนะ');
  }

  var typeLabel = type === 'bug' ? 'รายงานปัญหา' : 'เสนอฟีเจอร์ใหม่';
  var text = '📬 ' + typeLabel + '\n\n'
    + 'หัวข้อ: ' + title + '\n\n'
    + 'รายละเอียด:\n' + message + '\n\n'
    + 'ผู้ส่ง: ' + (session.full_name || session.username || session.user_id) + '\n'
    + 'หน้า: ' + String(pageUrl || '').substring(0, 1000) + '\n'
    + 'เวลา: ' + new Date().toISOString();
  var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true
  });
  var result;
  try { result = JSON.parse(response.getContentText()); } catch (err) { result = null; }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result || !result.ok) {
    throw new Error('ไม่สามารถส่งข้อความไปยัง Telegram ได้');
  }

  var attachments = imageAttachments || [];
  if (Object.prototype.toString.call(attachments) !== '[object Array]' || attachments.length > 5) {
    throw new Error('สามารถแนบภาพได้ไม่เกิน 5 ภาพ');
  }
  attachments.forEach(function(attachment) {
    var mimeType = String((attachment || {}).type || '');
    var imageBase64 = String((attachment || {}).base64 || '');
    var allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!imageBase64 || allowedTypes.indexOf(mimeType) === -1 || imageBase64.length > 4200000) {
      throw new Error('ไฟล์ภาพต้องเป็น JPG, PNG หรือ WebP และมีขนาดไม่เกิน 3 MB');
    }
    var photoResponse = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendPhoto', {
      method: 'post',
      payload: {
        chat_id: chatId,
        caption: 'ภาพประกอบ: ' + title,
        photo: Utilities.newBlob(Utilities.base64Decode(imageBase64), mimeType, String(attachment.name || 'screenshot'))
      },
      muteHttpExceptions: true
    });
    var photoResult;
    try { photoResult = JSON.parse(photoResponse.getContentText()); } catch (err2) { photoResult = null; }
    if (photoResponse.getResponseCode() < 200 || photoResponse.getResponseCode() >= 300 || !photoResult || !photoResult.ok) {
      throw new Error('ส่งข้อความแล้ว แต่ไม่สามารถส่งภาพไปยัง Telegram ได้');
    }
  });
  return { success: true };
}

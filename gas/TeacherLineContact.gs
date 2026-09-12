/**
 * LINE講師連絡システム（既存の講師授業報告忘れLINE通知プロジェクトへ追加）
 * 既存doPostから teacherLineContactHandle_(data) を呼び出す。
 */
const TLC_SPREADSHEET_ID = '1Cv3JgP7kXuFvch5PuHKVkdmjcFQ957qmaWuY9R-6lBA';
const TLC_LINK_SHEET = '講師LINE連携';
const TLC_HISTORY_SHEET = '講師LINE連絡履歴';
const TLC_AUTH_URL = 'https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec';
const TLC_MASTER_SPREADSHEET_ID = '1L5aFDXAmfUDkBg8d7X3WqJgMhdMq5tM5sfUZ2G-M58E';
const TLC_MASTER_SHEET = '講師マスター';
const TLC_IMAGE_FOLDER_PROPERTY = 'TLC_IMAGE_FOLDER_ID';
const TLC_IMAGE_FOLDER_NAME = 'LINE講師連絡画像（7日後自動削除）';
const TLC_IMAGE_RETENTION_DAYS = 7;

function teacherLineContactHandles_(action) {
  return ['teacherLineAdminRecipients','teacherLineAdminHistory','teacherLineAdminSend'].indexOf(String(action || '')) >= 0;
}

function teacherLineContactHandle_(data) {
  const admin = teacherLineContactVerifyAdmin_(data.systemPortalSessionToken);
  if (data.action === 'teacherLineAdminRecipients') return { ok:true, teachers:teacherLineContactRecipients_() };
  if (data.action === 'teacherLineAdminHistory') return { ok:true, history:teacherLineContactHistory_() };
  if (data.action === 'teacherLineAdminSend') return teacherLineContactSend_(data, admin);
  throw new Error('不明なLINE講師連絡アクションです。');
}

function teacherLineContactVerifyAdmin_(token) {
  if (!token) throw new Error('スタッフ確認が必要です。');
  const response = UrlFetchApp.fetch(TLC_AUTH_URL, {method:'post',contentType:'text/plain;charset=utf-8',payload:JSON.stringify({action:'verifySystemPortal',systemPortalSessionToken:String(token)}),muteHttpExceptions:true});
  if (response.getResponseCode() !== 200) throw new Error('スタッフ確認サーバーに接続できませんでした。');
  const result = JSON.parse(response.getContentText() || '{}');
  if (!result.success || ['2','3','4'].indexOf(String(result.permissionLevel)) < 0) throw new Error('スタッフ確認の有効期限が切れています。');
  return {code:String(result.loginId || result.code || ''),name:String(result.name || ''),permissionLevel:String(result.permissionLevel)};
}

function teacherLineContactRecipients_() {
  const sheet = SpreadsheetApp.openById(TLC_SPREADSHEET_ID).getSheetByName(TLC_LINK_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues(), headers = values[0];
  const col = teacherLineContactColumns_(headers,['講師コード','講師名','LINE利用者ID','有効']);
  const profiles = teacherLineContactProfiles_();
  return values.slice(1).filter(row => row[col.code] && row[col.userId] && teacherLineContactEnabled_(row[col.enabled])).map(row => {
    const code = String(row[col.code]);
    const profile = profiles[code] || {};
    return {code:code,name:String(row[col.name] || ''),kana:profile.kana || '',school:profile.school || ''};
  });
}

function teacherLineContactProfiles_() {
  const sheet = SpreadsheetApp.openById(TLC_MASTER_SPREADSHEET_ID).getSheetByName(TLC_MASTER_SHEET);
  if (!sheet || sheet.getLastRow() < 5) return {};
  const values = sheet.getRange(5,1,sheet.getLastRow()-4,18).getDisplayValues(), profiles = {};
  values.forEach(row => {
    const code = String(row[0] || '').trim();
    if (code) profiles[code] = {kana:String(row[2] || '').trim(),school:String(row[17] || '').trim()};
  });
  return profiles;
}

function teacherLineContactHistory_() {
  const sheet = SpreadsheetApp.openById(TLC_SPREADSHEET_ID).getSheetByName(TLC_HISTORY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const start = Math.max(2, sheet.getLastRow() - 49), values = sheet.getRange(start,1,sheet.getLastRow()-start+1,10).getDisplayValues().reverse();
  return values.map(row => ({sentAt:row[0],sender:row[2] || row[1],message:row[3],targets:row[4],count:row[5],result:row[6],imageUrl:row[8],imageExpiresAt:row[9]}));
}

function teacherLineContactSend_(data, admin) {
  const codes = Array.from(new Set((data.teacherCodes || []).map(String))).filter(code => /^7\d{3}$/.test(code));
  const message = String(data.message || '').trim();
  const imageDataUrl = String(data.imageDataUrl || '');
  if (!codes.length) throw new Error('送信する講師を選んでください。');
  if (!message && !imageDataUrl) throw new Error('連絡内容または画像を入力してください。');
  if (message.length > 2000) throw new Error('連絡内容は2000文字以内にしてください。');
  if (codes.length > 100) throw new Error('一度に送信できる人数は100人までです。');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('別の送信処理中です。少し待ってからもう一度お試しください。');
  try {
    const sheet = SpreadsheetApp.openById(TLC_SPREADSHEET_ID).getSheetByName(TLC_LINK_SHEET), values = sheet.getDataRange().getDisplayValues(), headers = values[0];
    const col = teacherLineContactColumns_(headers,['講師コード','講師名','LINE利用者ID','有効']);
    const targets = values.slice(1).filter(row => codes.indexOf(String(row[col.code])) >= 0 && row[col.userId] && teacherLineContactEnabled_(row[col.enabled]));
    if (targets.length !== codes.length) throw new Error('LINE未登録または無効な講師が含まれています。画面を再読み込みしてください。');
    const image = imageDataUrl ? teacherLineContactStoreImage_(imageDataUrl, data.imageName, admin) : null;
    const messages = [];
    if (message) messages.push({type:'text',text:message});
    if (image) messages.push({type:'image',originalContentUrl:image.url,previewImageUrl:image.url});
    const token = teacherLineContactAccessToken_(), errors = [], names = [];
    targets.forEach(row => {
      const name = String(row[col.name] || row[col.code]); names.push(name);
      const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token},payload:JSON.stringify({to:String(row[col.userId]),messages:messages}),muteHttpExceptions:true});
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) errors.push(name+'：LINE送信エラー '+response.getResponseCode());
    });
    teacherLineContactWriteHistory_(admin,names,message,targets.length-errors.length,errors,image);
    return {ok:true,sentCount:targets.length-errors.length,failedCount:errors.length,imageSent:!!image};
  } finally { lock.releaseLock(); }
}

function teacherLineContactStoreImage_(dataUrl, originalName, admin) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('画像データを確認できませんでした。JPEGまたはPNGを選び直してください。');
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > 900 * 1024) throw new Error('送信画像は900KB以下にしてください。');
  teacherLineContactEnsureImageCleanupTrigger_();
  teacherLineContactCleanupImages_();
  const folder = teacherLineContactImageFolder_();
  const safeName = String(originalName || 'image').replace(/[^0-9A-Za-zぁ-んァ-ヶ一-龠._-]/g,'_').slice(0,80);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  const file = folder.createFile(Utilities.newBlob(bytes, match[1], stamp+'-'+String(admin.code || 'staff')+'-'+safeName+'.jpg'));
  try { file.setSecurityUpdateEnabled(false); } catch (e) {}
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const expiresAt = new Date(Date.now() + TLC_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  file.setDescription(JSON.stringify({purpose:'teacher-line-contact',createdAt:new Date().toISOString(),expiresAt:expiresAt.toISOString()}));
  return {fileId:file.getId(),url:'https://drive.google.com/uc?export=view&id='+encodeURIComponent(file.getId()),expiresAt:expiresAt};
}

function teacherLineContactImageFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty(TLC_IMAGE_FOLDER_PROPERTY);
  if (folderId) { try { return DriveApp.getFolderById(folderId); } catch (e) {} }
  const folder = DriveApp.createFolder(TLC_IMAGE_FOLDER_NAME);
  properties.setProperty(TLC_IMAGE_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function teacherLineContactEnsureImageCleanupTrigger_() {
  const handler = 'teacherLineContactCleanupImages';
  if (ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === handler)) return;
  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(3).create();
}

function teacherLineContactCleanupImages() { return teacherLineContactCleanupImages_(); }
function teacherLineContactCleanupImages_() {
  const properties = PropertiesService.getScriptProperties(), folderId = properties.getProperty(TLC_IMAGE_FOLDER_PROPERTY);
  if (!folderId) return 0;
  let folder;
  try { folder = DriveApp.getFolderById(folderId); } catch (e) { return 0; }
  const cutoff = Date.now() - TLC_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000, files = folder.getFiles();
  let removed = 0;
  while (files.hasNext()) { const file = files.next(); if (file.getDateCreated().getTime() < cutoff) { file.setTrashed(true); removed++; } }
  return removed;
}

function teacherLineContactSetupImageStorage() {
  const folder = teacherLineContactImageFolder_();
  teacherLineContactEnsureImageCleanupTrigger_();
  return {folderId:folder.getId(),cleanup:teacherLineContactCleanupImages_()};
}

function teacherLineContactColumns_(headers, required) {
  const index = name => headers.indexOf(name);
  required.forEach(name => { if (index(name) < 0) throw new Error('「'+name+'」列がありません。'); });
  return {code:index('講師コード'),name:index('講師名'),userId:index('LINE利用者ID'),enabled:index('有効')};
}
function teacherLineContactEnabled_(value) { const v=String(value||'').trim().toLowerCase(); return !value || ['true','1','有効','yes'].indexOf(v)>=0; }
function teacherLineContactAccessToken_() { const p=PropertiesService.getScriptProperties(); const token=p.getProperty('LINE_CHANNEL_ACCESS_TOKEN')||p.getProperty('LINE_ACCESS_TOKEN')||p.getProperty('CHANNEL_ACCESS_TOKEN')||(typeof LINE_TOKEN!=='undefined'?LINE_TOKEN:''); if(!token)throw new Error('LINE送信用設定がありません。'); return token; }
function teacherLineContactWriteHistory_(admin,names,message,sentCount,errors,image) { const ss=SpreadsheetApp.openById(TLC_SPREADSHEET_ID); let sheet=ss.getSheetByName(TLC_HISTORY_SHEET); if(!sheet){sheet=ss.insertSheet(TLC_HISTORY_SHEET);sheet.appendRow(['送信日時','送信者コード','送信者名','本文','対象講師','送信成功件数','結果','エラー','画像URL','画像保管期限']);sheet.setFrozenRows(1)}else{if(!sheet.getRange(1,9).getValue())sheet.getRange(1,9,1,2).setValues([['画像URL','画像保管期限']])} sheet.appendRow([new Date(),admin.code,admin.name,message,names.join('、'),sentCount,errors.length?'一部失敗':'成功',errors.join('\n'),image?image.url:'',image?image.expiresAt:'']); }

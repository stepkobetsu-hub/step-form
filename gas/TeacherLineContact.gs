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
  const readings = teacherLineContactReadings_();
  return values.slice(1).filter(row => row[col.code] && row[col.userId] && teacherLineContactEnabled_(row[col.enabled])).map(row => {
    const code = String(row[col.code]);
    return {code:code,name:String(row[col.name] || ''),kana:readings[code] || '',school:''};
  });
}

function teacherLineContactReadings_() {
  const sheet = SpreadsheetApp.openById(TLC_MASTER_SPREADSHEET_ID).getSheetByName(TLC_MASTER_SHEET);
  if (!sheet || sheet.getLastRow() < 5) return {};
  const values = sheet.getRange(5,1,sheet.getLastRow()-4,3).getDisplayValues(), readings = {};
  values.forEach(row => {
    const code = String(row[0] || '').trim(), reading = String(row[2] || '').trim();
    if (code && reading) readings[code] = reading;
  });
  return readings;
}

function teacherLineContactHistory_() {
  const sheet = SpreadsheetApp.openById(TLC_SPREADSHEET_ID).getSheetByName(TLC_HISTORY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const start = Math.max(2, sheet.getLastRow() - 49), values = sheet.getRange(start,1,sheet.getLastRow()-start+1,8).getDisplayValues().reverse();
  return values.map(row => ({sentAt:row[0],sender:row[2] || row[1],targets:row[4],count:row[5],result:row[6]}));
}

function teacherLineContactSend_(data, admin) {
  const codes = Array.from(new Set((data.teacherCodes || []).map(String))).filter(code => /^7\d{3}$/.test(code));
  const message = String(data.message || '').trim();
  if (!codes.length) throw new Error('送信する講師を選んでください。');
  if (!message) throw new Error('連絡内容を入力してください。');
  if (message.length > 2000) throw new Error('連絡内容は2000文字以内にしてください。');
  if (codes.length > 100) throw new Error('一度に送信できる人数は100人までです。');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('別の送信処理中です。少し待ってからもう一度お試しください。');
  try {
    const sheet = SpreadsheetApp.openById(TLC_SPREADSHEET_ID).getSheetByName(TLC_LINK_SHEET), values = sheet.getDataRange().getDisplayValues(), headers = values[0];
    const col = teacherLineContactColumns_(headers,['講師コード','講師名','LINE利用者ID','有効']);
    const targets = values.slice(1).filter(row => codes.indexOf(String(row[col.code])) >= 0 && row[col.userId] && teacherLineContactEnabled_(row[col.enabled]));
    if (targets.length !== codes.length) throw new Error('LINE未登録または無効な講師が含まれています。画面を再読み込みしてください。');
    const token = teacherLineContactAccessToken_(), errors = [], names = [];
    targets.forEach(row => {
      const name = String(row[col.name] || row[col.code]); names.push(name);
      const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token},payload:JSON.stringify({to:String(row[col.userId]),messages:[{type:'text',text:message}]}),muteHttpExceptions:true});
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) errors.push(name+'：LINE送信エラー '+response.getResponseCode());
    });
    teacherLineContactWriteHistory_(admin,names,message,targets.length-errors.length,errors);
    return {ok:true,sentCount:targets.length-errors.length,failedCount:errors.length};
  } finally { lock.releaseLock(); }
}

function teacherLineContactColumns_(headers, required) {
  const index = name => headers.indexOf(name);
  required.forEach(name => { if (index(name) < 0) throw new Error('「'+name+'」列がありません。'); });
  return {code:index('講師コード'),name:index('講師名'),userId:index('LINE利用者ID'),enabled:index('有効')};
}
function teacherLineContactEnabled_(value) { const v=String(value||'').trim().toLowerCase(); return !value || ['true','1','有効','yes'].indexOf(v)>=0; }
function teacherLineContactAccessToken_() { const p=PropertiesService.getScriptProperties(); const token=p.getProperty('LINE_CHANNEL_ACCESS_TOKEN')||p.getProperty('LINE_ACCESS_TOKEN')||p.getProperty('CHANNEL_ACCESS_TOKEN')||(typeof LINE_TOKEN!=='undefined'?LINE_TOKEN:''); if(!token)throw new Error('LINE送信用設定がありません。'); return token; }
function teacherLineContactWriteHistory_(admin,names,message,sentCount,errors) { const ss=SpreadsheetApp.openById(TLC_SPREADSHEET_ID); let sheet=ss.getSheetByName(TLC_HISTORY_SHEET); if(!sheet){sheet=ss.insertSheet(TLC_HISTORY_SHEET);sheet.appendRow(['送信日時','送信者コード','送信者名','本文','対象講師','送信成功件数','結果','エラー']);sheet.setFrozenRows(1)} sheet.appendRow([new Date(),admin.code,admin.name,message,names.join('、'),sentCount,errors.length?'一部失敗':'成功',errors.join('\n')]); }

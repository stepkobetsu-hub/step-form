'use strict';
(() => {
  const SEND_PROXY='https://jbiolkvegexkqjcwtyye.supabase.co/functions/v1/line-teacher-send';

  async function sendThroughProxy(payload){
    const response=await fetch(SEND_PROXY,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      cache:'no-store'
    });
    let result={};
    try{result=await response.json()}catch(_){result={}}
    if(!response.ok||result.ok===false){
      const error=new Error(String(result.error||result.message||'LINE送信サーバーに接続できませんでした。'));
      error.status=response.status;
      throw error;
    }
    return result;
  }

  function isAuthError(error){
    return /スタッフ確認|有効期限|ログイン|認証|パスワード/.test(String(error?.message||error||''));
  }

  function persistRefreshedSession(result){
    const token=String(result?.sessionToken||'').trim();
    if(!token)return;
    sessionToken=token;
    try{
      const current=storedAuth()||{};
      current.systemPortalSessionToken=token;
      if(result.permissionLevel!=null)current.permissionLevel=String(result.permissionLevel);
      localStorage.setItem(AUTH_KEY,JSON.stringify(current));
    }catch(_){}
  }

  function saveCredentials(code,password){
    try{
      if(code)localStorage.setItem(CODE_KEY,String(code));
      if(password)localStorage.setItem(PASSWORD_KEY,String(password));
    }catch(_){}
  }

  function ensureReauthDialog(){
    let overlay=document.getElementById('teacherSendReauth');
    if(overlay)return overlay;
    const style=document.createElement('style');
    style.textContent=`
      .teacher-reauth{position:fixed;inset:0;z-index:30;background:rgba(10,34,27,.58);display:grid;place-items:center;padding:18px}
      .teacher-reauth.hidden{display:none!important}
      .teacher-reauth-card{width:min(100%,430px);background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.25)}
      .teacher-reauth-card h2{margin:0 0 8px;color:#18352e;font-size:20px}
      .teacher-reauth-card p{margin:0 0 14px;color:#5d726b;font-size:13px;line-height:1.6}
      .teacher-reauth-card label{display:block;font-weight:800;margin:10px 0 5px}
      .teacher-reauth-card input{width:100%;font:inherit;border:2px solid #d8e5df;border-radius:12px;padding:12px;background:#fff}
      .teacher-reauth-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:16px}
      .teacher-reauth-error{margin-top:10px;padding:9px 11px;border-radius:9px;background:#fff0f0;color:#a32828;font-size:13px}
    `;
    document.head.appendChild(style);
    overlay=document.createElement('div');
    overlay.id='teacherSendReauth';
    overlay.className='teacher-reauth hidden';
    overlay.innerHTML=`<div class="teacher-reauth-card" role="dialog" aria-modal="true" aria-labelledby="teacherReauthTitle">
      <h2 id="teacherReauthTitle">スタッフ確認</h2>
      <p>ログインの有効期限が切れました。送信内容はそのまま保持しています。確認後、自動で送信を続けます。</p>
      <label for="teacherReauthCode">講師番号</label>
      <input id="teacherReauthCode" inputmode="numeric" autocomplete="username">
      <label for="teacherReauthPassword">パスワード</label>
      <input id="teacherReauthPassword" type="password" autocomplete="current-password">
      <div id="teacherReauthError" class="teacher-reauth-error hidden"></div>
      <div class="teacher-reauth-actions"><button id="teacherReauthCancel" class="secondary" type="button">キャンセル</button><button id="teacherReauthSubmit" class="primary" type="button">確認して送信を続ける</button></div>
    </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function requestCredentials(codeHint){
    const overlay=ensureReauthDialog();
    const codeInput=overlay.querySelector('#teacherReauthCode');
    const passwordInput=overlay.querySelector('#teacherReauthPassword');
    const errorBox=overlay.querySelector('#teacherReauthError');
    const submit=overlay.querySelector('#teacherReauthSubmit');
    const cancel=overlay.querySelector('#teacherReauthCancel');
    codeInput.value=String(codeHint||'');
    passwordInput.value='';
    errorBox.classList.add('hidden');
    overlay.classList.remove('hidden');
    setTimeout(()=>passwordInput.focus(),0);
    return new Promise(resolve=>{
      const cleanup=()=>{
        submit.onclick=null;cancel.onclick=null;passwordInput.onkeydown=null;codeInput.onkeydown=null;
        overlay.classList.add('hidden');
      };
      const finish=()=>{
        const code=String(codeInput.value||'').trim();
        const password=String(passwordInput.value||'');
        if(!code||!password){
          errorBox.textContent='講師番号とパスワードを入力してください。';
          errorBox.classList.remove('hidden');
          return;
        }
        cleanup();resolve({code,password});
      };
      submit.onclick=finish;
      cancel.onclick=()=>{cleanup();resolve(null)};
      passwordInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish()}};
      codeInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();passwordInput.focus()}};
    });
  }

  function buildPayload(code,password){
    const auth=storedAuth()||{};
    const text=document.getElementById('body').value.trim();
    const targetCodes=[...selected];
    return {
      systemPortalSessionToken:String(sessionToken||auth.systemPortalSessionToken||''),
      code:String(code||localStorage.getItem(CODE_KEY)||auth.code||'').trim(),
      password:String(password||localStorage.getItem(PASSWORD_KEY)||''),
      teacherCodes:targetCodes,
      message:text,
      imageDataUrl:imagePayload?.dataUrl||'',
      imageName:imagePayload?.name||''
    };
  }

  async function sendWithAutomaticReauth(){
    let payload=buildPayload();
    try{
      return await sendThroughProxy(payload);
    }catch(error){
      if(!isAuthError(error))throw error;
      const auth=storedAuth()||{};
      const codeHint=payload.code||String(auth.code||'');
      const credentials=await requestCredentials(codeHint);
      if(!credentials)throw new Error('送信をキャンセルしました。');
      saveCredentials(credentials.code,credentials.password);
      payload=buildPayload(credentials.code,credentials.password);
      payload.systemPortalSessionToken='';
      return await sendThroughProxy(payload);
    }
  }

  const oldSend=document.getElementById('send');
  if(!oldSend)return;
  const send=oldSend.cloneNode(true);
  oldSend.replaceWith(send);

  send.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;
    send.disabled=true;
    send.textContent='送信しています…';
    try{
      const text=document.getElementById('body').value.trim();
      const hadImage=!!imagePayload;
      const targetCodes=[...selected];
      if(!targetCodes.length)throw new Error('送信する講師を選んでください。');
      if(!text&&!hadImage)throw new Error('連絡内容または画像を入力してください。');

      const result=await sendWithAutomaticReauth();
      persistRefreshedSession(result);

      const sentCount=Number(result?.sentCount||0);
      const failedCount=Number(result?.failedCount||0);
      if(sentCount<1)throw new Error(String(result?.message||result?.error||'LINE送信を確認できませんでした。'));

      document.getElementById('confirm').classList.add('hidden');
      const sentType=hadImage?(text?'文章・画像':'画像'):'文章';
      notice(sentCount+'人へ'+sentType+'を送信しました。'+(failedCount?' '+failedCount+'人は送信できませんでした。':''),failedCount?'error':'ok');
      selected.clear();
      clearImage();
      renderTeachers();
    }catch(err){
      document.getElementById('confirm').classList.add('hidden');
      notice(String(err?.message||err||'送信できませんでした。'),'error');
    }finally{
      busy=false;
      send.disabled=false;
      send.textContent='確認して送信する';
    }
  });
})();
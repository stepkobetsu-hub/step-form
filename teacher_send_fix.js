'use strict';
(() => {
  const AUTH_PROXY='https://jbiolkvegexkqjcwtyye.supabase.co/functions/v1/line-teacher-auth';
  const CONTACT_API='https://script.google.com/macros/s/AKfycbz6_kf6oXCUycashVMMQ9-hrA73CtopL7xwPsm0DYkE5MxXJyxJrhkdnghIS70_KC641w/exec';
  let autoLoginAttempted=false;

  async function fetchJson(url,payload){
    const response=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      cache:'no-store'
    });
    let result={};
    try{result=await response.json()}catch(_){result={}}
    if(!response.ok||result.success===false||result.ok===false||result.error){
      throw new Error(String(result.error||result.message||'認証サーバーに接続できませんでした。'));
    }
    return result;
  }

  async function proxyAuthenticate(code,password){
    const result=await fetchJson(AUTH_PROXY,{action:'studentQrLogin',code,password});
    if(!result.sessionToken||!['2','3','4'].includes(String(result.permissionLevel))){
      throw new Error('利用権限を確認できませんでした。');
    }
    sessionToken=String(result.sessionToken);
    try{
      localStorage.setItem(CODE_KEY,String(code));
      localStorage.setItem(PASSWORD_KEY,String(password));
      localStorage.setItem(AUTH_KEY,JSON.stringify({
        code:String(result.loginId||result.code||code),
        name:result.name||'',
        permissionLevel:String(result.permissionLevel||''),
        systemPortalSessionToken:sessionToken,
        systemPortalExpiresAt:result.expiresAt||''
      }));
    }catch(_){}
    return result;
  }

  function installLoginProxy(){
    const oldForm=document.getElementById('loginForm');
    if(!oldForm||oldForm.dataset.proxyReady==='1')return;
    const codeValue=document.getElementById('staffCode')?.value||'';
    const passwordValue=document.getElementById('staffPassword')?.value||'';
    const form=oldForm.cloneNode(true);
    form.dataset.proxyReady='1';
    oldForm.replaceWith(form);
    const codeInput=document.getElementById('staffCode');
    const passwordInput=document.getElementById('staffPassword');
    const message=document.getElementById('loginMessage');
    if(codeInput&&!codeInput.value)codeInput.value=codeValue;
    if(passwordInput&&!passwordInput.value)passwordInput.value=passwordValue;
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      if(button){button.disabled=true;button.textContent='確認しています…'}
      if(message)message.classList.add('hidden');
      try{
        await proxyAuthenticate(String(codeInput?.value||'').trim(),String(passwordInput?.value||''));
        await loadApp();
      }catch(err){
        if(message){message.textContent=String(err?.message||err||'ログインできませんでした。');message.classList.remove('hidden')}
      }finally{
        if(button){button.disabled=false;button.textContent='開く'}
      }
    });
  }

  async function tryAutoLoginWhenVisible(){
    const login=document.getElementById('login');
    if(!login||login.classList.contains('hidden')||autoLoginAttempted)return;
    const auth=storedAuth()||{};
    const code=String(localStorage.getItem(CODE_KEY)||auth.code||document.getElementById('staffCode')?.value||'').trim();
    const password=String(localStorage.getItem(PASSWORD_KEY)||document.getElementById('staffPassword')?.value||'');
    if(!code||!password)return;
    autoLoginAttempted=true;
    try{await proxyAuthenticate(code,password);await loadApp()}catch(_){}
  }

  installLoginProxy();
  const loginNode=document.getElementById('login');
  if(loginNode){
    const observer=new MutationObserver(()=>{installLoginProxy();tryAutoLoginWhenVisible()});
    observer.observe(loginNode,{attributes:true,attributeFilter:['class']});
  }
  setTimeout(()=>{installLoginProxy();tryAutoLoginWhenVisible()},400);

  function ensureReauthDialog(){
    let overlay=document.getElementById('teacherSendReauth');
    if(overlay)return overlay;
    const style=document.createElement('style');
    style.textContent=`.teacher-reauth{position:fixed;inset:0;z-index:30;background:rgba(10,34,27,.58);display:grid;place-items:center;padding:18px}.teacher-reauth.hidden{display:none!important}.teacher-reauth-card{width:min(100%,430px);background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.25)}.teacher-reauth-card h2{margin:0 0 8px;color:#18352e;font-size:20px}.teacher-reauth-card p{margin:0 0 14px;color:#5d726b;font-size:13px;line-height:1.6}.teacher-reauth-card label{display:block;font-weight:800;margin:10px 0 5px}.teacher-reauth-card input{width:100%;font:inherit;border:2px solid #d8e5df;border-radius:12px;padding:12px;background:#fff}.teacher-reauth-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:16px}.teacher-reauth-error{margin-top:10px;padding:9px 11px;border-radius:9px;background:#fff0f0;color:#a32828;font-size:13px}`;
    document.head.appendChild(style);
    overlay=document.createElement('div');
    overlay.id='teacherSendReauth';overlay.className='teacher-reauth hidden';
    overlay.innerHTML=`<div class="teacher-reauth-card" role="dialog" aria-modal="true"><h2>スタッフ確認</h2><p>送信前にスタッフ確認を更新します。送信内容・画像・選択中の講師はそのまま保持します。</p><label for="teacherReauthCode">講師番号</label><input id="teacherReauthCode" inputmode="numeric" autocomplete="username"><label for="teacherReauthPassword">パスワード</label><input id="teacherReauthPassword" type="password" autocomplete="current-password"><div id="teacherReauthError" class="teacher-reauth-error hidden"></div><div class="teacher-reauth-actions"><button id="teacherReauthCancel" class="secondary" type="button">キャンセル</button><button id="teacherReauthSubmit" class="primary" type="button">確認して送信を続ける</button></div></div>`;
    document.body.appendChild(overlay);return overlay;
  }

  function requestCredentials(codeHint){
    const overlay=ensureReauthDialog();
    const codeInput=overlay.querySelector('#teacherReauthCode');
    const passwordInput=overlay.querySelector('#teacherReauthPassword');
    const errorBox=overlay.querySelector('#teacherReauthError');
    const submit=overlay.querySelector('#teacherReauthSubmit');
    const cancel=overlay.querySelector('#teacherReauthCancel');
    codeInput.value=String(codeHint||'');passwordInput.value='';errorBox.classList.add('hidden');overlay.classList.remove('hidden');
    setTimeout(()=>passwordInput.focus(),0);
    return new Promise(resolve=>{
      const cleanup=()=>{submit.onclick=null;cancel.onclick=null;passwordInput.onkeydown=null;overlay.classList.add('hidden')};
      const finish=()=>{const code=String(codeInput.value||'').trim(),password=String(passwordInput.value||'');if(!code||!password){errorBox.textContent='講師番号とパスワードを入力してください。';errorBox.classList.remove('hidden');return}cleanup();resolve({code,password})};
      submit.onclick=finish;cancel.onclick=()=>{cleanup();resolve(null)};passwordInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish()}};
    });
  }

  async function ensureFreshSession(){
    const auth=storedAuth()||{};
    let code=String(localStorage.getItem(CODE_KEY)||auth.code||'').trim();
    let password=String(localStorage.getItem(PASSWORD_KEY)||'');
    if(!code||!password){
      const credentials=await requestCredentials(code);
      if(!credentials)throw new Error('送信をキャンセルしました。');
      code=credentials.code;password=credentials.password;
    }
    try{
      return await proxyAuthenticate(code,password);
    }catch(error){
      const credentials=await requestCredentials(code);
      if(!credentials)throw error;
      return await proxyAuthenticate(credentials.code,credentials.password);
    }
  }

  async function directSend(payload){
    await fetch(CONTACT_API,{
      method:'POST',
      mode:'no-cors',
      credentials:'include',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),
      redirect:'follow',
      cache:'no-store'
    });
  }

  const oldSend=document.getElementById('send');
  if(!oldSend)return;
  const send=oldSend.cloneNode(true);oldSend.replaceWith(send);
  send.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;send.disabled=true;send.textContent='認証を確認しています…';
    try{
      const text=document.getElementById('body').value.trim();
      const targetCodes=[...selected];
      const hadImage=!!imagePayload;
      if(!targetCodes.length)throw new Error('送信する講師を選んでください。');
      if(!text&&!hadImage)throw new Error('連絡内容または画像を入力してください。');
      await ensureFreshSession();
      send.textContent='LINEへ送信しています…';
      await directSend({action:'teacherLineAdminSend',systemPortalSessionToken:sessionToken,teacherCodes:targetCodes,message:text,imageDataUrl:imagePayload?.dataUrl||'',imageName:imagePayload?.name||''});
      document.getElementById('confirm').classList.add('hidden');
      notice('LINE送信処理を実行しました。通常は数秒以内に届きます。','ok');
      selected.clear();clearImage();renderTeachers();
    }catch(err){
      document.getElementById('confirm').classList.add('hidden');
      notice(String(err?.message||err||'送信できませんでした。'),'error');
    }finally{
      busy=false;send.disabled=false;send.textContent='確認して送信する';
    }
  });
})();

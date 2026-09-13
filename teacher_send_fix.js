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
      throw new Error(String(result.error||result.message||'LINE送信サーバーに接続できませんでした。'));
    }
    return result;
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

      const auth=storedAuth()||{};
      const code=String(localStorage.getItem(CODE_KEY)||auth.code||'').trim();
      const password=String(localStorage.getItem(PASSWORD_KEY)||'');

      const result=await sendThroughProxy({
        systemPortalSessionToken:String(sessionToken||auth.systemPortalSessionToken||''),
        code,
        password,
        teacherCodes:targetCodes,
        message:text,
        imageDataUrl:imagePayload?.dataUrl||'',
        imageName:imagePayload?.name||''
      });

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

'use strict';
(() => {
  async function refreshStaffSession(){
    const auth=storedAuth();
    const code=String(localStorage.getItem(CODE_KEY)||auth?.code||'').trim();
    const password=String(localStorage.getItem(PASSWORD_KEY)||'');
    if(!code||!password) throw new Error('スタッフ認証情報がありません。いったんログアウトしてログインし直してください。');
    await authenticate(code,password);
    return sessionToken;
  }

  // 起動速度には影響させず、画面表示後に裏でセッションだけ更新する。
  setTimeout(()=>{refreshStaffSession().catch(()=>{})},300);

  const oldSend=document.getElementById('send');
  if(!oldSend)return;
  const send=oldSend.cloneNode(true);
  oldSend.replaceWith(send);

  send.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;
    send.disabled=true;
    send.textContent='認証を確認しています…';
    try{
      const text=document.getElementById('body').value.trim();
      const hadImage=!!imagePayload;
      const targetCodes=[...selected];
      if(!targetCodes.length)throw new Error('送信する講師を選んでください。');
      if(!text&&!hadImage)throw new Error('連絡内容または画像を入力してください。');

      await refreshStaffSession();
      send.textContent='送信しています…';

      const result=await api('teacherLineAdminSend',{
        teacherCodes:targetCodes,
        message:text,
        imageDataUrl:imagePayload?.dataUrl||'',
        imageName:imagePayload?.name||''
      });

      document.getElementById('confirm').classList.add('hidden');
      const sentType=hadImage?(text?'文章・画像':'画像'):'文章';
      const sentCount=Number(result?.sentCount||0);
      const failedCount=Number(result?.failedCount||0);
      if(sentCount<1)throw new Error(result?.message||'LINE送信を確認できませんでした。');

      notice(sentCount+'人へ'+sentType+'を送信しました。'+(failedCount?' '+failedCount+'人は送信できませんでした。':''),failedCount?'error':'ok');
      selected.clear();
      clearImage();
      renderTeachers();

      try{
        const history=await api('teacherLineAdminHistory');
        renderHistory(history.history||[]);
      }catch(_){}
    }catch(err){
      document.getElementById('confirm').classList.add('hidden');
      const message=String(err?.message||err||'送信できませんでした。');
      notice(message,'error');
      if(/スタッフ確認|有効期限|認証情報/.test(message)){
        try{localStorage.removeItem(AUTH_KEY)}catch(_){}
      }
    }finally{
      busy=false;
      send.disabled=false;
      send.textContent='確認して送信する';
    }
  });
})();

'use strict';
(() => {
  const MASTER_ID='1L5aFDXAmfUDkBg8d7X3WqJgMhdMq5tM5sfUZ2G-M58E';
  const LINK_ID='1Cv3JgP7kXuFvch5PuHKVkdmjcFQ957qmaWuY9R-6lBA';
  let activeCodes=null;
  let refreshSeq=0;

  function gviz(spreadsheetId,sheet,query,timeoutMs=7000){
    return new Promise((resolve,reject)=>{
      const seq=++refreshSeq;
      const callback='__stepGviz_'+Date.now()+'_'+seq;
      const script=document.createElement('script');
      let settled=false;
      const cleanup=()=>{
        try{delete window[callback]}catch(e){window[callback]=undefined}
        script.remove();
      };
      const timer=setTimeout(()=>{
        if(settled)return;
        settled=true;cleanup();reject(new Error('Google Sheetsの直接取得がタイムアウトしました。'));
      },timeoutMs);
      window[callback]=(response)=>{
        if(settled)return;
        settled=true;clearTimeout(timer);cleanup();
        if(!response||response.status==='error'||!response.table){
          reject(new Error('Google Sheetsの直接取得に失敗しました。'));
          return;
        }
        const rows=(response.table.rows||[]).map(r=>(r.c||[]).map(c=>c&&c.v!=null?String(c.v):''));
        resolve(rows);
      };
      const params=new URLSearchParams({sheet,tq:query,tqx:'out:json;responseHandler:'+callback});
      script.src='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(spreadsheetId)+'/gviz/tq?'+params.toString();
      script.async=true;
      script.onerror=()=>{
        if(settled)return;
        settled=true;clearTimeout(timer);cleanup();reject(new Error('Google Sheetsへ接続できませんでした。'));
      };
      document.head.appendChild(script);
    });
  }

  async function loadDirectRoster(showStatus=false){
    if(showStatus) notice('講師マスターとLINE登録済み講師を直接確認しています…');
    const [masterRows,linkRows]=await Promise.all([
      gviz(MASTER_ID,'講師マスター','select A,B,C,D,R where D = 1'),
      gviz(LINK_ID,'講師LINE連携','select A,B where A is not null')
    ]);
    const registered=new Set(linkRows.map(r=>String(r[0]||'').trim()).filter(Boolean));
    const latest=masterRows.map(r=>({
      code:String(r[0]||'').trim(),
      name:String(r[1]||'').trim(),
      kana:String(r[2]||'').trim(),
      school:String(r[4]||'').trim()
    })).filter(t=>t.code&&registered.has(t.code));
    if(!latest.length) throw new Error('直接取得した在籍講師が0件でした。現在の一覧は変更しません。');
    activeCodes=new Set(latest.map(t=>t.code));
    teachers=latest;
    for(const code of [...selected]) if(!activeCodes.has(String(code))) selected.delete(code);
    renderTeachers();
    if(showStatus) notice('講師情報を更新しました（LINE登録済み・在籍 '+latest.length+'人）。','ok');
    return latest;
  }

  // APIや応急リストが後から古い一覧を入れても、直接取得済みの在籍コードで必ず絞る。
  if(typeof filtered==='function'){
    const baseFiltered=filtered;
    filtered=function(){
      const items=baseFiltered();
      return activeCodes?items.filter(t=>activeCodes.has(String(t.code))):items;
    };
  }

  // 既存の強制更新ハンドラを外し、Google Sheets直接確認を最優先にする。
  const oldSync=document.getElementById('forceRosterSync');
  if(oldSync){
    const sync=oldSync.cloneNode(true);
    oldSync.replaceWith(sync);
    sync.addEventListener('click',async()=>{
      const original=sync.textContent;
      sync.disabled=true;
      sync.textContent='更新しています…';
      try{
        await loadDirectRoster(true);
      }catch(err){
        notice('直接更新に失敗しました。現在の一覧はそのまま保持しています：'+String(err?.message||err),'error');
      }finally{
        sync.disabled=false;
        sync.textContent=original;
      }
    });
  }

  // 起動直後にも直接確認。成功すれば固定リスト/API待ちより先に正しい一覧へ置換する。
  loadDirectRoster(false).then(()=>notice('')).catch(()=>{});
})();

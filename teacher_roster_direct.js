'use strict';
(() => {
  let activeCodes=null;

  async function loadSnapshot(showStatus=false){
    if(showStatus) notice('高速講師一覧を更新しています…');
    const response=await fetch('teacher_roster_snapshot.json?t='+Date.now(),{cache:'no-store'});
    if(!response.ok) throw new Error('高速講師一覧を取得できませんでした。');
    const data=await response.json();
    const latest=Array.isArray(data?.teachers)?data.teachers:[];
    if(!latest.length) throw new Error('高速講師一覧が0件でした。現在の一覧は変更しません。');
    activeCodes=new Set(latest.map(t=>String(t.code||'')));
    teachers=latest.map(t=>({
      code:String(t.code||''),
      name:String(t.name||''),
      kana:String(t.kana||''),
      school:String(t.school||'')
    }));
    for(const code of [...selected]) if(!activeCodes.has(String(code))) selected.delete(code);
    renderTeachers();
    if(showStatus){
      const updated=data?.updatedAt?String(data.updatedAt):'';
      notice('講師一覧を更新しました（LINE登録済み・在籍 '+teachers.length+'人'+(updated?'／同期 '+updated:'')+'）。','ok');
    }
    return teachers;
  }

  // APIが古い講師一覧を後から返しても、スナップショットにいない人は表示しない。
  if(typeof filtered==='function'){
    const baseFiltered=filtered;
    filtered=function(){
      const items=baseFiltered();
      return activeCodes?items.filter(t=>activeCodes.has(String(t.code))):items;
    };
  }

  // 「強制更新」は、公開済みの高速一覧をキャッシュ無効で再取得する。
  const oldSync=document.getElementById('forceRosterSync');
  if(oldSync){
    const sync=oldSync.cloneNode(true);
    oldSync.replaceWith(sync);
    sync.addEventListener('click',async()=>{
      const original=sync.textContent;
      sync.disabled=true;
      sync.textContent='更新しています…';
      try{
        await loadSnapshot(true);
      }catch(err){
        notice('講師一覧の更新に失敗しました。現在の一覧はそのまま保持しています：'+String(err?.message||err),'error');
      }finally{
        sync.disabled=false;
        sync.textContent=original;
      }
    });
  }

  // 起動直後に最優先で高速一覧を適用。
  loadSnapshot(false).then(()=>notice('')).catch(()=>{});
})();

'use strict';
(() => {
  const MASTER_ID='1L5aFDXAmfUDkBg8d7X3WqJgMhdMq5tM5sfUZ2G-M58E';
  const CACHE_KEY='stepTeacherLineRosterCacheV3';
  const DEFAULT_ROSTER=[
    {code:'7002',name:'大野智子',kana:'オオノトモコ',school:'神領・大手'},
    {code:'7028',name:'伊東里紗',kana:'いとうりさ',school:'神領'},
    {code:'7040',name:'土屋大輔',kana:'つちやだいすけ',school:'大手'},
    {code:'7043',name:'酒巻裕亮',kana:'さかまきゆうすけ',school:'大手'},
    {code:'7045',name:'田口瑠南',kana:'たぐちるな',school:'神領・大手'},
    {code:'7048',name:'林房子',kana:'はやしふさこ',school:'大手'},
    {code:'7049',name:'松久稜平',kana:'まつひさりょうへい',school:'神領・大手'},
    {code:'7052',name:'長谷川瑠海',kana:'はせがわるみ',school:'大手'},
    {code:'7058',name:'山本悠真',kana:'やまもとゆうま',school:'神領'},
    {code:'7059',name:'島岡伶央那',kana:'しまおかれおな',school:'神領'},
    {code:'7061',name:'林　周悟',kana:'はやししゅうご',school:'神領'},
    {code:'7062',name:'重松　澪',kana:'しげまつみお',school:'神領'},
    {code:'7065',name:'柴田凌吾',kana:'しばたりょうご',school:'神領'},
    {code:'7067',name:'小川真矢',kana:'おがわまや',school:'大手'},
    {code:'7074',name:'早川瑛康',kana:'はやかわえいこう',school:'大手'},
    {code:'7075',name:'白石亜美',kana:'しらいしあみ',school:'神領・大手'},
    {code:'7082',name:'村田真博',kana:'ムラタマヒロ',school:'大手'},
    {code:'7083',name:'加藤大誠',kana:'カトウタイセイ',school:'神領・大手'},
    {code:'7086',name:'勝田裕己',kana:'カツダヒロキ',school:'神領'},
    {code:'7087',name:'佐野夢空',kana:'サノユウア',school:'神領'},
    {code:'7088',name:'作取夢芽子',kana:'サクトリユメコ',school:'神領'},
    {code:'7089',name:'石黒花笑',kana:'イシグロハナエ',school:'神領'},
    {code:'7090',name:'西木祐衣',kana:'ニシキユイ',school:'大手'},
    {code:'7091',name:'三浦寛南',kana:'ミウラカンナ',school:'大手'}
  ];
  let canonicalRoster=null;
  let canonicalSavedAt=0;

  function normalizeRoster(rows){
    return (Array.isArray(rows)?rows:[]).map(t=>({
      code:String(t.code||'').trim(),
      name:String(t.name||'').trim(),
      kana:String(t.kana||'').trim(),
      school:String(t.school||'').trim()
    })).filter(t=>/^7\d{3}$/.test(t.code)&&t.name);
  }

  function readCache(){
    try{
      const data=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!data||!Array.isArray(data.teachers)||!data.teachers.length)return null;
      return {teachers:normalizeRoster(data.teachers),savedAt:Number(data.savedAt)||0};
    }catch(_){return null}
  }

  function writeCache(list){
    canonicalSavedAt=Date.now();
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({teachers:list,savedAt:canonicalSavedAt}))}catch(_){}
  }

  const baseRenderTeachers=renderTeachers;
  function applyRoster(list,{save=false}={}){
    const next=normalizeRoster(list);
    if(!next.length)throw new Error('講師一覧が0件になったため、現在の一覧は変更しません。');
    canonicalRoster=next;
    teachers=next.map(t=>({...t}));
    for(const code of [...selected]) if(!next.some(t=>t.code===String(code))) selected.delete(code);
    if(save)writeCache(next);
    baseRenderTeachers();
    return next;
  }

  // 既存APIが後から古い一覧を返しても、確定済み一覧で必ず描画する。
  renderTeachers=function(){
    if(canonicalRoster)teachers=canonicalRoster.map(t=>({...t}));
    return baseRenderTeachers();
  };

  // 通信前に「前回キャッシュ」→なければ現在の同期済み一覧を即時表示。
  const cached=readCache();
  if(cached?.teachers?.length){
    canonicalSavedAt=cached.savedAt;
    canonicalRoster=cached.teachers;
    teachers=cached.teachers.map(t=>({...t}));
  }else{
    canonicalRoster=DEFAULT_ROSTER.map(t=>({...t}));
    teachers=DEFAULT_ROSTER.map(t=>({...t}));
  }
  try{baseRenderTeachers()}catch(_){}

  async function loadSnapshot(){
    const response=await fetch('teacher_roster_snapshot.json?t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('同期済み講師一覧を取得できませんでした。');
    const data=await response.json();
    const latest=normalizeRoster(data?.teachers);
    if(!latest.length)throw new Error('同期済み講師一覧が0件でした。');
    const snapshotTime=Date.parse(data?.updatedAt||'')||0;
    // 強制更新で作った新しい端末キャッシュを、古い自動同期データで巻き戻さない。
    if(cached?.teachers?.length&&canonicalSavedAt&&snapshotTime&&snapshotTime<canonicalSavedAt)return canonicalRoster;
    applyRoster(latest,{save:true});
    return latest;
  }

  function gvizMaster(timeoutMs=10000){
    return new Promise((resolve,reject)=>{
      const cb='__stepMaster_'+Date.now()+'_'+Math.floor(Math.random()*100000);
      const script=document.createElement('script');
      let done=false;
      const finish=(error,value)=>{
        if(done)return;done=true;
        clearTimeout(timer);
        try{delete window[cb]}catch(_){window[cb]=undefined}
        script.remove();
        error?reject(error):resolve(value);
      };
      const timer=setTimeout(()=>finish(new Error('講師マスターの確認がタイムアウトしました。')),timeoutMs);
      window[cb]=response=>{
        if(!response||response.status==='error'||!response.table){finish(new Error('講師マスターを読み込めませんでした。'));return}
        const rows=(response.table.rows||[]).map(r=>(r.c||[]).map(c=>c&&c.v!=null?String(c.v):''));
        finish(null,rows);
      };
      const params=new URLSearchParams({sheet:'講師マスター',tq:'select A,B,C,D,R',tqx:'out:json;responseHandler:'+cb});
      script.src='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(MASTER_ID)+'/gviz/tq?'+params.toString()+'&_='+Date.now();
      script.async=true;
      script.onerror=()=>finish(new Error('講師マスターへ接続できませんでした。'));
      document.head.appendChild(script);
    });
  }

  async function loadRegisteredCodes(){
    const response=await fetch('teacher_line_registered.json?t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('LINE登録済み講師情報を取得できませんでした。');
    const data=await response.json();
    const codes=new Set((Array.isArray(data?.codes)?data.codes:[]).map(v=>String(v).trim()).filter(v=>/^7\d{3}$/.test(v)));
    if(!codes.size)throw new Error('LINE登録済み講師が0件でした。');
    return codes;
  }

  async function forceRefresh(){
    const [masterRows,registered]=await Promise.all([gvizMaster(),loadRegisteredCodes()]);
    const latest=masterRows.map(row=>({
      code:String(row[0]||'').trim(),
      name:String(row[1]||'').trim(),
      kana:String(row[2]||'').trim(),
      active:String(row[3]||'').trim(),
      school:String(row[4]||'').trim()
    })).filter(t=>t.code&&t.active==='1'&&registered.has(t.code))
      .map(({code,name,kana,school})=>({code,name,kana,school}));
    return applyRoster(latest,{save:true});
  }

  const oldSync=document.getElementById('forceRosterSync');
  if(oldSync){
    const sync=oldSync.cloneNode(true);
    sync.textContent='講師情報を強制更新';
    sync.title='講師マスターの在籍・よみ・教室を今すぐ読み直します';
    oldSync.replaceWith(sync);
    sync.addEventListener('click',async()=>{
      const original=sync.textContent;
      sync.disabled=true;
      sync.textContent='更新しています…';
      notice('講師マスターの最新情報を確認しています…');
      try{
        const latest=await forceRefresh();
        notice('講師情報を強制更新しました（LINE登録済み・在籍 '+latest.length+'人）。','ok');
      }catch(err){
        notice('強制更新に失敗しました。現在の一覧はそのまま保持しています：'+String(err?.message||err),'error');
      }finally{
        sync.disabled=false;
        sync.textContent=original;
      }
    });
  }

  // 普段は重い講師マスターを読まない。軽い同期済みJSONだけ裏で確認する。
  loadSnapshot().then(()=>{if(document.getElementById('message')?.textContent.includes('最新情報'))notice('')}).catch(()=>{});
})();

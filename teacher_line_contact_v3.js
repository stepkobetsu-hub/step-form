'use strict';
(() => {
  const API='https://jbiolkvegexkqjcwtyye.supabase.co/functions/v1/line-teacher-api';
  const AUTH_KEY='lineTeacherStaffAuthV3';
  const CODE_KEY='lineTeacherStaffCode';
  const LEGACY_CODE_KEY='stepStaffAppCode';
  const LEGACY_PASSWORD_KEY='stepStaffAppPassword';
  const ROSTER_CACHE='stepLineTeacherRosterV2';
  const DRAFT_KEY='stepLineTeacherDraftV2';
  const $=id=>document.getElementById(id);
  let teachers=[], selected=new Set(), imagePayload=null, busy=false, loginResolve=null, loginReject=null, autoLoginTried=false;

  function savedAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
  function token(){return String(savedAuth()?.systemPortalSessionToken||'')}
  function status(text,type='info'){const el=$('status');el.textContent=text;el.className='notice '+type;el.classList.toggle('hidden',!text)}
  function saveRoster(list){try{localStorage.setItem(ROSTER_CACHE,JSON.stringify({savedAt:Date.now(),teachers:list}))}catch(_){}}
  function cachedRoster(){try{const x=JSON.parse(localStorage.getItem(ROSTER_CACHE)||'null');return Array.isArray(x?.teachers)?x.teachers:[]}catch{return []}}

  async function rawApi(action,extra={},timeoutMs=20000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,systemPortalSessionToken:token(),...extra}),cache:'no-store',signal:controller.signal});
      let data={};try{data=await r.json()}catch(_){data={}}
      if(!r.ok||data.ok===false){const e=new Error(String(data.error||`処理できませんでした（HTTP ${r.status}）`));e.status=r.status;e.code=data.code||'';throw e}
      return data;
    }catch(e){
      if(e?.name==='AbortError')throw new Error('20秒以内に応答がありませんでした。処理を中止しました。もう一度お試しください。');
      throw e;
    }finally{clearTimeout(timer)}
  }

  async function login(code,password){
    const data=await rawApi('login',{code,password,systemPortalSessionToken:''},20000);
    const auth={code:String(data.code||code),name:data.name||'',permissionLevel:String(data.permissionLevel||''),systemPortalSessionToken:data.sessionToken};
    localStorage.setItem(CODE_KEY,auth.code);
    localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    try{localStorage.removeItem(LEGACY_PASSWORD_KEY)}catch(_){}
    return data;
  }

  function openLogin(message='スタッフ確認をしてください。確認後は、ご自身でログアウトするまで有効です。'){
    $('loginCode').value=localStorage.getItem(CODE_KEY)||localStorage.getItem(LEGACY_CODE_KEY)||savedAuth()?.code||'';
    $('loginPassword').value='';
    $('loginMessage').textContent=message;
    $('loginMessage').classList.remove('hidden');
    $('loginOverlay').classList.remove('hidden');
    const help=document.querySelector('#loginOverlay .help');
    if(help)help.textContent='初回だけ確認します。ご自身でログアウトするまで有効です。';
    setTimeout(()=>$('loginPassword').focus(),0);
    return new Promise((resolve,reject)=>{loginResolve=resolve;loginReject=reject});
  }

  async function ensureSession(){
    if(token())return;
    if(!autoLoginTried){
      autoLoginTried=true;
      const code=localStorage.getItem(CODE_KEY)||localStorage.getItem(LEGACY_CODE_KEY)||'';
      const password=localStorage.getItem(LEGACY_PASSWORD_KEY)||'';
      if(code&&password){
        try{await login(code,password);return}catch(_){}
      }
    }
    await openLogin();
  }

  async function authenticated(action,extra={}){
    await ensureSession();
    try{return await rawApi(action,extra)}catch(e){
      if(e.status!==401)throw e;
      localStorage.removeItem(AUTH_KEY);
      await openLogin('スタッフ確認情報が見つかりません。確認後は、ご自身でログアウトするまで有効です。');
      return await rawApi(action,extra);
    }
  }

  function normalize(v){return String(v||'').normalize('NFKC').replace(/\s/g,'').toLowerCase()}
  function hira(v){return normalize(v).replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))}
  function roma(v){
    const m={あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',や:'ya',ゆ:'yu',よ:'yo',ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',ん:'n',が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',だ:'da',で:'de',ど:'do',ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po'};
    return [...hira(v)].map(c=>m[c]||c).join('');
  }
  function matches(t,q){if(!q)return true;const x=normalize(q),targets=[t.code,t.name,t.kana,hira(t.kana),roma(t.kana)].map(normalize);return targets.some(v=>v.includes(x))}
  function visible(){const q=$('search').value.trim(),school=$('school').value;return teachers.filter(t=>(!school||String(t.school||'').includes(school))&&matches(t,q))}

  function render(){
    const box=$('teacherList');box.replaceChildren();const list=visible();
    if(!list.length){const p=document.createElement('div');p.className='empty';p.textContent='該当する講師はいません。';box.append(p)}
    for(const t of list){const row=document.createElement('label');row.className='teacher'+(selected.has(t.code)?' selected':'');row.innerHTML=`<input type="checkbox" ${selected.has(t.code)?'checked':''}><span class="code"></span><strong></strong><span class="school"></span>`;row.querySelector('.code').textContent=t.code;row.querySelector('strong').textContent=t.name;row.querySelector('.school').textContent=t.school||'';row.querySelector('input').addEventListener('change',e=>{e.target.checked?selected.add(t.code):selected.delete(t.code);render()});box.append(row)}
    renderSelected();
  }
  function renderSelected(){
    $('count').textContent=selected.size+'人選択';$('selectedCount').textContent=selected.size+'人';const box=$('selectedList');box.replaceChildren();
    const chosen=teachers.filter(t=>selected.has(t.code));if(!chosen.length)box.innerHTML='<span class="help">まだ選択されていません。</span>';
    for(const t of chosen){const chip=document.createElement('span');chip.className='chip';chip.innerHTML='<strong></strong><button type="button">×</button>';chip.querySelector('strong').textContent=t.name+'先生';chip.querySelector('button').onclick=()=>{selected.delete(t.code);render()};box.append(chip)}
    $('openConfirm').disabled=!selected.size||(!$('body').value.trim()&&!imagePayload);
  }
  function setTeachers(list){teachers=(list||[]).map(t=>({code:String(t.code),name:String(t.name||''),kana:String(t.kana||''),school:String(t.school||'')}));for(const c of [...selected])if(!teachers.some(t=>t.code===c))selected.delete(c);saveRoster(teachers);render()}

  async function refreshRoster(force=false){
    const btn=$('forceRefresh');if(force){btn.disabled=true;btn.textContent='更新しています…';status('講師マスターの最新情報を確認しています…')}
    try{const data=await authenticated(force?'forceRefresh':'roster');setTeachers(data.teachers||[]);if(force)status(`講師情報を更新しました（${teachers.length}人）。`,'ok')}
    catch(e){if(force)status(e.message,'error')}
    finally{if(force){btn.disabled=false;btn.textContent='講師情報を強制更新'}}
  }

  function historyContentCell(r){
    const td=document.createElement('td');
    const details=document.createElement('details');
    details.className='history-details';
    const summary=document.createElement('summary');
    summary.textContent='送信内容を見る';
    summary.style.cursor='pointer';summary.style.fontWeight='800';summary.style.color='#08783b';
    details.append(summary);
    const body=document.createElement('div');
    body.style.whiteSpace='pre-wrap';body.style.minWidth='240px';body.style.maxWidth='440px';body.style.padding='10px';body.style.marginTop='7px';body.style.background='#f4fbf7';body.style.border='1px solid #dbe7e2';body.style.borderRadius='9px';body.style.lineHeight='1.6';
    body.textContent=String(r.message||'').trim()||'文章なし（画像のみ送信）';
    details.append(body);
    if(r.image_url){
      const img=document.createElement('img');
      img.src=String(r.image_url);img.alt='送信した画像';img.loading='lazy';
      img.style.display='block';img.style.maxWidth='320px';img.style.maxHeight='240px';img.style.marginTop='9px';img.style.borderRadius='9px';img.style.objectFit='contain';
      details.append(img);
    }
    td.append(details);
    return td;
  }

  async function loadHistory(){
    try{
      const data=await authenticated('history');const box=$('historyBody');box.replaceChildren();const rows=data.history||[];
      if(!rows.length){box.innerHTML='<tr><td colspan="6">送信履歴はまだありません。</td></tr>';return}
      for(const r of rows){
        const tr=document.createElement('tr');const dt=r.sent_at?new Date(r.sent_at).toLocaleString('ja-JP'):'';const targets=(r.target_names||[]).join('、');const result=r.failed_count?`${r.sent_count}件成功 / ${r.failed_count}件失敗`:`${r.sent_count}件成功`;
        const values=[dt,r.sender_name||r.sender_code,targets,r.sent_count,result];
        for(const v of values){const td=document.createElement('td');td.textContent=String(v??'');tr.append(td)}
        tr.append(historyContentCell(r));box.append(tr);
      }
    }catch(_){}
  }

  async function checkHealth(){
    try{const data=await authenticated('health');const configured=!!data.configured;$('settingsButton').classList.toggle('needs-setup',!configured);$('settingsButton').title=configured?'LINE送信設定を確認・変更':'LINE送信の設定が必要です';return configured}
    catch(e){status(e.message,'error');return false}
  }

  function updateBody(){const text=$('body').value;$('chars').textContent=text.length+' / 2000文字';$('preview').textContent=text||(imagePayload?'文章なし（画像のみ送信）':'ここに送信内容が表示されます。');$('previewImgWrap').classList.toggle('hidden',!imagePayload);if(imagePayload)$('previewImg').src=imagePayload.dataUrl;renderSelected()}
  function bytes(url){const s=String(url).split(',')[1]||'';return Math.floor(s.length*3/4)}
  async function prepareImage(file){
    if(!file)return clearImage();if(!['image/jpeg','image/png'].includes(file.type))throw new Error('JPEGまたはPNG画像を選んでください。');
    const img=await new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=String(rd.result)};rd.onerror=rej;rd.readAsDataURL(file)});
    let w=img.naturalWidth,h=img.naturalHeight;const max=1600;if(Math.max(w,h)>max){const r=max/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r)}let data='';
    for(let a=0;a<7;a++){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);for(const q of [.88,.78,.68,.58,.5]){data=c.toDataURL('image/jpeg',q);if(bytes(data)<=500*1024)break}if(bytes(data)<=500*1024)break;w=Math.round(w*.82);h=Math.round(h*.82)}
    if(bytes(data)>600*1024)throw new Error('画像を送信用サイズまで縮小できませんでした。');imagePayload={dataUrl:data,name:(file.name||'image').replace(/\.(png|jpe?g)$/i,'').slice(0,60)};$('imagePreview').src=data;$('imageCard').classList.remove('hidden');$('imageInfo').textContent=`送信用 ${Math.ceil(bytes(data)/1024)}KB`;updateBody();
  }
  function clearImage(){imagePayload=null;$('imageInput').value='';$('imageCard').classList.add('hidden');$('previewImgWrap').classList.add('hidden');updateBody()}

  function openSetup(){$('setupToken').value='';$('setupError').classList.add('hidden');$('setupOverlay').hidden=false;setTimeout(()=>$('setupToken').focus(),0)}
  async function saveToken(){
    const t=$('setupToken').value.trim();if(!t)return;
    $('setupSave').disabled=true;$('setupSave').textContent='接続確認中…';$('setupError').classList.add('hidden');
    try{const d=await authenticated('setLineToken',{token:t});$('setupOverlay').hidden=true;$('settingsButton').classList.remove('needs-setup');$('settingsButton').title='LINE送信設定を確認・変更';$('setupToken').value='';status(`LINE送信設定を保存しました${d.botName?'（'+d.botName+'）':''}。`,'ok');return true}
    catch(e){$('setupError').textContent=e.message;$('setupError').classList.remove('hidden');return false}
    finally{$('setupSave').disabled=false;$('setupSave').textContent='保存して接続確認'}
  }

  async function doSend(){
    if(busy)return;busy=true;$('send').disabled=true;$('send').textContent='送信しています…';
    const payload={teacherCodes:[...selected],message:$('body').value.trim(),imageDataUrl:imagePayload?.dataUrl||'',imageName:imagePayload?.name||''};
    try{let data;try{data=await authenticated('send',payload)}catch(e){if(e.status===428||e.code==='CONFIG_REQUIRED'){openSetup();throw new Error('初回だけLINE送信設定を行ってください。設定後、もう一度送信してください。')}throw e}$('confirm').classList.add('hidden');status(`${data.sentCount}人へLINEを送信しました。${data.failedCount?' '+data.failedCount+'人は送信できませんでした。':''}`,data.failedCount?'error':'ok');selected.clear();clearImage();render();await loadHistory()}
    catch(e){$('confirm').classList.add('hidden');status(e.message,'error')}
    finally{busy=false;$('send').disabled=false;$('send').textContent='確認して送信する'}
  }

  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const b=$('loginSubmit');b.disabled=true;b.textContent='確認しています…';$('loginMessage').classList.add('hidden');
    try{await login($('loginCode').value.trim(),$('loginPassword').value);$('loginOverlay').classList.add('hidden');$('loginPassword').value='';if(loginResolve){const r=loginResolve;loginResolve=null;loginReject=null;r()}else{await refreshRoster(false);await Promise.all([loadHistory(),checkHealth()])}}
    catch(err){$('loginMessage').textContent=err.message;$('loginMessage').classList.remove('hidden')}
    finally{b.disabled=false;b.textContent='開く'}
  });
  $('search').addEventListener('input',render);$('school').addEventListener('change',render);$('forceRefresh').onclick=()=>refreshRoster(true);$('selectVisible').onclick=()=>{visible().forEach(t=>selected.add(t.code));render()};$('clearSelection').onclick=()=>{selected.clear();render()};
  $('body').addEventListener('input',updateBody);$('saveDraft').onclick=()=>{localStorage.setItem(DRAFT_KEY,$('body').value);status('この端末に文章を保存しました。','ok')};$('imageInput').addEventListener('change',async e=>{try{await prepareImage(e.target.files?.[0])}catch(err){clearImage();status(err.message,'error')}});$('removeImage').onclick=clearImage;
  $('openConfirm').onclick=()=>{const names=teachers.filter(t=>selected.has(t.code)).map(t=>t.name+'先生');$('confirmTargets').textContent='送信先：'+names.join('、')+'（'+names.length+'人）';$('confirmBody').textContent=$('body').value.trim()||'文章なし（画像のみ送信）';$('confirmImgWrap').classList.toggle('hidden',!imagePayload);if(imagePayload)$('confirmImg').src=imagePayload.dataUrl;$('confirm').classList.remove('hidden')};$('cancelSend').onclick=()=>$('confirm').classList.add('hidden');$('send').onclick=doSend;
  $('settingsButton').onclick=openSetup;$('setupCancel').onclick=()=>$('setupOverlay').hidden=true;$('setupSave').onclick=saveToken;
  $('logoutBtn').onclick=()=>{const oldToken=token();if(oldToken)rawApi('logout').catch(()=>{});localStorage.removeItem(AUTH_KEY);location.reload()};

  async function init(){
    const help=document.querySelector('#loginOverlay .help');if(help)help.textContent='初回だけ確認します。ご自身でログアウトするまで有効です。';
    $('body').value=localStorage.getItem(DRAFT_KEY)||'';updateBody();
    const cache=cachedRoster();if(cache.length)setTeachers(cache);$('app').classList.remove('hidden');
    await ensureSession();
    await refreshRoster(false);
    await Promise.all([loadHistory(),checkHealth()]);
  }
  init().catch(e=>status(e.message||String(e),'error'));
})();

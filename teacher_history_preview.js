'use strict';
(() => {
  function enhance(){
    document.querySelectorAll('#historyBody details.history-details').forEach(details=>{
      if(details.dataset.compactReady==='1') return;
      const summary=details.querySelector('summary');
      const body=[...details.children].find(el=>el!==summary && el.tagName!=='IMG');
      const img=details.querySelector('img');
      if(!summary || !body) return;

      details.dataset.compactReady='1';
      details.classList.add('history-compact');
      if(details.parentElement) details.parentElement.classList.add('history-content-cell');
      const raw=(body.textContent||'').trim() || (img ? '画像のみ送信' : '送信内容なし');
      const oneLine=raw.replace(/\s+/g,' ');

      summary.textContent='';
      summary.className='history-summary';
      summary.setAttribute('aria-label','送信内容を開く');

      const preview=document.createElement('span');
      preview.className='history-summary-preview';
      preview.textContent=oneLine;

      const arrow=document.createElement('span');
      arrow.className='history-summary-arrow';
      arrow.textContent='›';
      arrow.setAttribute('aria-hidden','true');

      summary.append(preview,arrow);
      body.classList.add('history-full-message');
      if(img) img.classList.add('history-sent-image');
    });
  }

  enhance();
  const target=document.getElementById('historyBody');
  if(target){
    new MutationObserver(enhance).observe(target,{childList:true,subtree:true});
  }
})();

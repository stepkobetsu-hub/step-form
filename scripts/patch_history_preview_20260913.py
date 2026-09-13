from pathlib import Path

js_path = Path('teacher_line_contact_v3.js')
js = js_path.read_text(encoding='utf-8')
start = js.find('  function historyContentCell(r){')
end = js.find('\n  async function loadHistory(){', start)
if start < 0 or end < 0:
    raise SystemExit('historyContentCell block not found')
new_func = r'''  function historyContentCell(r){
    const td=document.createElement('td');
    td.className='history-content-cell';
    const details=document.createElement('details');
    details.className='history-details history-compact';

    const summary=document.createElement('summary');
    summary.className='history-summary';
    summary.setAttribute('aria-label','送信内容を開く');

    const preview=document.createElement('span');
    preview.className='history-summary-preview';
    const message=String(r.message||'').trim();
    preview.textContent=(message||'画像のみ送信').replace(/\s+/g,' ');

    const arrow=document.createElement('span');
    arrow.className='history-summary-arrow';
    arrow.textContent='›';
    arrow.setAttribute('aria-hidden','true');

    summary.append(preview,arrow);
    details.append(summary);

    const expanded=document.createElement('div');
    expanded.className='history-expanded';
    const body=document.createElement('div');
    body.className='history-full-message';
    body.textContent=message||'文章なし（画像のみ送信）';
    expanded.append(body);

    if(r.image_url){
      const img=document.createElement('img');
      img.src=String(r.image_url);
      img.alt='送信した画像';
      img.loading='lazy';
      img.className='history-sent-image';
      expanded.append(img);
    }
    details.append(expanded);
    td.append(details);
    return td;
  }
'''
js = js[:start] + new_func + js[end:]
js_path.write_text(js, encoding='utf-8')

html_path = Path('teacher_line_contact.html')
html = html_path.read_text(encoding='utf-8')
css_anchor = '.history th{color:#587069}'
extra_css = r'''.history-content-cell{min-width:220px;max-width:360px}.history-compact{width:100%}.history-summary{list-style:none;display:flex;align-items:center;gap:8px;width:100%;cursor:pointer;color:#536a62;font-size:11px;line-height:1.4}.history-summary::-webkit-details-marker{display:none}.history-summary-preview{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.history-summary-arrow{flex:0 0 auto;width:22px;height:22px;border:1px solid #cfded8;border-radius:50%;display:inline-grid;place-items:center;font-size:18px;font-weight:800;color:#315d51;background:#f7fbf9;transition:transform .18s ease}.history-compact[open] .history-summary-arrow{transform:rotate(90deg)}.history-expanded{margin-top:8px;padding:10px;background:#f4fbf7;border:1px solid #dbe7e2;border-radius:9px}.history-full-message{white-space:pre-wrap;font-size:13px;line-height:1.65;color:#18352e}.history-sent-image{display:block;max-width:320px;max-height:240px;margin-top:9px;border-radius:9px;object-fit:contain}'''
if extra_css not in html:
    if css_anchor not in html:
        raise SystemExit('history css anchor not found')
    html = html.replace(css_anchor, css_anchor + extra_css, 1)
html = html.replace('teacher_line_contact_v3.js?v=20260913-persistent-session-v1','teacher_line_contact_v3.js?v=20260913-history-preview-v1')
html_path.write_text(html, encoding='utf-8')

/* Radar Gencat Pro — UI */

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
const fmt = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 });
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('ca-ES') : '—');

const state = {
  raw: [],
  items: [],
  page: 1,
  size: 18,
  orderBy: 'date_desc',
  q: '',
  status: new Set(['licitacio','avaluacio','adjudicacio','formalitzacio','execucio','consulta','previ']),
  years: new Set(['2026']),
  organs: new Set(),
  cpv: '',
  min: '',
  max: ''
};

const storeKey = 'radar-ui-v4';

/* ========= Helpers ========= */
function loadStore(){
  try { Object.assign(state, JSON.parse(localStorage.getItem(storeKey) || '{}')); } catch {}
}
function saveStore(){
  const s = { ...state, raw: undefined, items: undefined };
  localStorage.setItem(storeKey, JSON.stringify(s));
}
function title(s){ return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function orgProfileUrl(organ, scope=''){
  const t = (`${organ} ${scope}`).toLowerCase();
  if (t.includes('centre de telecomunicacions') || t.includes('ctti')) return 'https://contractaciopublica.cat/ca/perfils-contractant/detall/ctti?categoria=0';
  if (t.includes("sistema d'emergències mèdiques") || t.includes('(sem)') || t.includes('semsa')) return 'https://contractaciopublica.cat/ca/perfils-contractant/detall/206778?categoria=0';
  if (t.includes('transports de barcelona') || t.includes(' tmb ')) return 'https://contractaciopublica.cat/ca/perfils-contractant/detall/TB?categoria=0';
  if (t.includes('ferrocarril metropolita') || t.includes('ferrocarril metropolità') || t.includes('fmb')) return 'https://contractaciopublica.cat/en/perfils-contractant/detall/30109100?categoria=0';
  return null;
}

/* ========= Carrega dades ========= */
async function loadSnapshot(){
  const url = `./data/snapshot.json?v=${Date.now()}`; // bust cache
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No s'ha pogut carregar ${url} (${res.status})`);
  const js = await res.json();
  return Array.isArray(js.items) ? js.items : [];
}

/* ========= Index/organismes ========= */
function buildOrgIndex(items){
  const map = new Map();
  for (const it of items){
    const k = (it.organ || '—').trim();
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a,b)=> b[1]-a[1]).slice(0, 120);
}
function renderOrgList(index){
  const holder = $('#organList'); holder.innerHTML = '';
  index.forEach(([name, n])=>{
    const id = 'org-' + name.replace(/\W+/g,'_');
    const checked = state.organs.size === 0 ? '' : (state.organs.has(name) ? 'checked' : '');
    holder.insertAdjacentHTML('beforeend', `
      <label class="chk"><input type="checkbox" class="org" id="${id}" value="${escapeHtml(name)}" ${checked}>
        ${escapeHtml(name)} <span class="muted">(${n})</span>
      </label>
    `);
  });
}

/* ========= Filtres ========= */
function applyFilters(){
  const q = state.q.trim().toLowerCase();
  const hasQ = q.length > 1;

  let items = state.raw.filter(it=>{
    // any
    const yearOk = state.years.size === 0 || (it.date && state.years.has(String(it.date).slice(0,4)));
    // estat
    const stOk = state.status.size === 0 || state.status.has((it.status || '').toLowerCase());
    // organ
    const orgOk = state.organs.size === 0 || state.organs.has(it.organ || '');
    // cpv
    const cpvOk = !state.cpv || (String(it.cpv||'').startsWith(state.cpv));
    // import
    const v = Number(it.amount || 0);
    const minOk = !state.min || v >= Number(state.min);
    const maxOk = !state.max || v <= Number(state.max);
    // text
    const t = `${it.title||''} ${it.organ||''} ${it.scope||''} ${it.expedient||''} ${it.cpv||''}`.toLowerCase();
    const qOk = !hasQ || t.includes(q);

    return yearOk && stOk && orgOk && cpvOk && minOk && maxOk && qOk;
  });

  // ordenació
  items.sort((a,b)=>{
    switch(state.orderBy){
      case 'date_desc': return new Date(b.date||0) - new Date(a.date||0);
      case 'date_asc':  return new Date(a.date||0) - new Date(b.date||0);
      case 'amount_desc': return (b.amount||0) - (a.amount||0);
      case 'amount_asc':  return (a.amount||0) - (b.amount||0);
      case 'priority_desc': {
        const w = p => ({'Oportunitat alta':3,'Seguiment prioritari':2,'Seguiment':1}[p]||0);
        return w(b.priority) - w(a.priority);
      }
      default: return 0;
    }
  });

  state.items = items;
  state.page = 1;
  saveStore();
  render();
}

function addActiveChip(holder, label, key){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = label + ' ✕';
  b.onclick = () => removeFilterKey(key);
  holder.appendChild(b);
}
function removeFilterKey(key){
  if (key === 'q') state.q = '';
  else if (key === 'cpv') state.cpv = '';
  else if (key === 'min') state.min = '';
  else if (key === 'max') state.max = '';
  else if (key.startsWith('yr:')) state.years.delete(key.split(':')[1]);
  else if (key.startsWith('st:')) state.status.delete(key.split(':')[1]);
  else if (key.startsWith('og:')) state.organs.delete(key.split(':')[1]);
  saveStore();
  applyFilters();
}

/* ========= Render ========= */
function cardHtml(it){
  const s = (it.status || '').toLowerCase();
  const color = s==='licitacio' ? 'warn'
              : s==='avaluacio' ? 'warn'
              : s==='adjudicacio' ? 'ok'
              : s==='execucio' ? 'ok'
              : 'status';
  const tags = (it.tags || []).slice(0,4).map(t => `<span class="pill">${escapeHtml(title(t))}</span>`).join('');
  const short = it.alerts?.latest_short || '';
  const url = it.url || it.follow_url || orgProfileUrl(it.organ||'', it.scope||'') || '#';

  return `
  <article class="card">
    <div class="meta">
      <span class="badge ${color}">${escapeHtml(title(it.status||''))}</span>
      <span class="badge">${fmtDate(it.date)}</span>
      <span class="badge">€ ${fmt.format(it.amount||0)}</span>
      ${it.priority ? `<span class="badge warn">${escapeHtml(it.priority)}</span>` : ''}
    </div>

    <div class="title">${escapeHtml(it.title||'Sense títol')}</div>

    <div class="meta">
      <span>${escapeHtml(it.organ||'—')}</span>
      ${it.expedient ? ` · <span class="muted">${escapeHtml(it.expedient)}</span>` : ''}
      ${it.cpv ? ` · <span class="muted">CPV ${escapeHtml(it.cpv)}</span>` : ''}
      ${it.programmed?.matched ? ` · <span class="muted">Prog: ${escapeHtml((it.programmed.title||'').slice(0,80))}</span>` : ''}
      ${it.incumbent ? ` · <span class="muted">Incumbent: ${escapeHtml(it.incumbent.provider||'')}</span>` : ''}
    </div>

    ${short ? `<div class="tags"><span class="pill">${escapeHtml(short)}</span>${tags}</div>` : `<div class="tags">${tags}</div>`}

    <div class="actions-row">
      <div class="link">
        ${url}Obrir expedient</a>
        <span class="ext">↗</span>
      </div>
      <div class="muted">${(it.alerts?.count||0)} avisos</div>
    </div>
  </article>`;
}

function render(){
  const { items, page, size } = state;
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const start = (page-1)*size;
  const slice = items.slice(start, start+size);

  // KPIs
  $('#kpiTotal').textContent = fmt.format(items.length);
  $('#kpiLicit').textContent = fmt.format(items.filter(x=>x.status==='licitacio').length);
  $('#kpiAvalu').textContent = fmt.format(items.filter(x=>x.status==='avaluacio').length);
  $('#kpiAdj').textContent   = fmt.format(items.filter(x=>x.status==='adjudicacio').length);
  $('#kpiExec').textContent  = fmt.format(items.filter(x=>x.status==='execucio').length);

  // pager
  $('#pageInfo').textContent = `${totalPages===0?0:page} / ${totalPages}`;
  $('#prev').disabled = page<=1;
  $('#next').disabled = page>=totalPages;

  // active filters chips
  const af = $('#activeFilters'); af.innerHTML = '';
  if (state.q) addActiveChip(af, `Text: “${state.q}”`, 'q');
  if (state.cpv) addActiveChip(af, `CPV: ${state.cpv}`, 'cpv');
  if (state.min) addActiveChip(af, `≥ ${fmt.format(state.min)} €`, 'min');
  if (state.max) addActiveChip(af, `≤ ${fmt.format(state.max)} €`, 'max');
  state.years.forEach(y => addActiveChip(af, `Any ${y}`, `yr:${y}`));
  state.status.forEach(s => addActiveChip(af, `Estat: ${title(s)}`, `st:${s}`));
  state.organs.forEach(o => addActiveChip(af, `Organisme: ${o}`, `og:${o}`));

  // grid
  const grid = $('#grid'); grid.innerHTML = '';
  slice.forEach(it=> grid.insertAdjacentHTML('beforeend', cardHtml(it)));

  $('#empty').classList.toggle('hide', items.length>0);
}

/* ========= Wire ========= */
function wire(){
  // search
  $('#btnSearch').onclick = () => { state.q = $('#q').value; applyFilters(); };
  $('#q').addEventListener('keydown', e => { if (e.key==='Enter'){ state.q = $('#q').value; applyFilters(); } });

  // quick chips
  $$('.chip').forEach(ch=>{
    ch.addEventListener('click', ()=>{
      const v = ch.dataset.chip;
      if (v === 'clear'){
        state.q=''; state.cpv=''; state.min=''; state.max='';
        state.status = new Set(['licitacio','avaluacio','adjudicacio','formalitzacio','execucio','consulta','previ']);
        state.years = new Set(['2026']);
        state.organs.clear();
        $('#q').value=''; $('#cpv').value=''; $('#min').value=''; $('#max').value='';
        $$('.st').forEach(x=> x.checked = true);
        $$('.yr').forEach(x=> x.checked = x.value==='2026');
        $$('.org').forEach(x=> x.checked = false);
        applyFilters();
        return;
      }
      const [k,val] = v.split(':');
      if (k==='year') state.years.add(val);
      else if (k==='organ'){
        if (val==='TMB'){
          $$('.org').forEach(x=>{
            if (x.value.toLowerCase().includes('transports de barcelona') || x.value.toLowerCase().includes('ferrocarril metropol')) {
              x.checked = true; state.organs.add(x.value);
            }
          });
        } else {
          $$('.org').forEach(x=>{
            if (x.value.toLowerCase().includes(val.toLowerCase())) { x.checked = true; state.organs.add(x.value); }
          });
        }
      } else if (k==='status') state.status.add(val);
      applyFilters();
    });
  });

  // order
  $('#orderBy').value = state.orderBy;
  $('#orderBy').onchange = (e)=>{ state.orderBy = e.target.value; saveStore(); render(); };

  // status toggles
  $$('.st').forEach(x=>{
    if (state.status.size) x.checked = state.status.has(x.value);
    x.addEventListener('change', ()=>{
      if (x.checked) state.status.add(x.value); else state.status.delete(x.value);
      applyFilters();
    });
  });

  // years
  $$('.yr').forEach(x=>{
    x.checked = state.years.has(x.value);
    x.addEventListener('change', ()=>{
      if (x.checked) state.years.add(x.value); else state.years.delete(x.value);
      applyFilters();
    });
  });

  // organ filter text
  $('#organFilter').addEventListener('input', (e)=>{
    const txt = e.target.value.toLowerCase();
    $$('#organList .chk').forEach(lab=>{
      lab.style.display = lab.textContent.toLowerCase().includes(txt) ? '' : 'none';
    });
  });

  // organ checks (delegació)
  $('#organList').addEventListener('change', (e)=>{
    if (e.target && e.target.classList.contains('org')){
      const val = e.target.value;
      if (e.target.checked) state.organs.add(val); else state.organs.delete(val);
      applyFilters();
    }
  });

  // cpv / import
  $('#cpv').value = state.cpv || '';
  $('#min').value = state.min || '';
  $('#max').value = state.max || '';

  $('#apply').onclick = ()=>{
    state.cpv = $('#cpv').value.trim();
    state.min = $('#min').value.trim();
    state.max = $('#max').value.trim();
    applyFilters();
  };
  $('#reset').onclick = ()=>{
    state.cpv=''; state.min=''; state.max='';
    $('#cpv').value=''; $('#min').value=''; $('#max').value='';
    applyFilters();
  };

  // pager
  $('#prev').onclick = ()=>{ if (state.page>1){ state.page--; render(); } };
  $('#next').onclick = ()=>{
    const totalPages = Math.max(1, Math.ceil(state.items.length / state.size));
    if (state.page<totalPages){ state.page++; render(); }
  };

  // theme toggle (light ↔ dark ↔ auto)
  $('#btnTheme').onclick = ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'auto';
    const nxt = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
    if (nxt === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', nxt);
    saveStore();
  };

  // refresh
  $('#btnRefresh').onclick = ()=> window.location.reload();
}

/* ========= Bootstrap ========= */
(async function init(){
  loadStore();
  wire();

  // Registre SW segur (si existeix al domini)
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch(e) {}
  }

  // Load data
  try{
    const items = await loadSnapshot();
    // normalitza enllaços (per si el sync ha deixat algun buit)
    state.raw = items.map(it=>{
      const u = it.url || it.follow_url || orgProfileUrl(it.organ||'', it.scope||'') || null;
      return { ...it, url: u, follow_url: u };
    });

    // index d'organs
    renderOrgList(buildOrgIndex(state.raw));

    applyFilters(); // també fa render()
  }catch(err){
    console.error(err);
    // mostra l'empty igualment
    state.raw = [];
    applyFilters();
  }
})();

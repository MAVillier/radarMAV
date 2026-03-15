// scripts/sync.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const OUT = path.join(DATA_DIR, 'snapshot.json');

const URLS = {
  // PSCP – Publicacions (Socrata)
  pub:  'https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json',
  // Execució (publicacions en execució)
  exe:  'https://analisi.transparenciacatalunya.cat/resource/8idu-wkjv.json',
  // Programació (planificació)
  plan: 'https://analisi.transparenciacatalunya.cat/resource/u9d7-egbx.json',
  // Adjudicacions
  awd:  'https://analisi.transparenciacatalunya.cat/resource/nn7v-4yxe.json'
};

const ISO_NOW = new Date().toISOString();

const YEAR = '2026';                 // focus d’enguany
const LIMIT_PUB = 50000;             // ample perquè no es quedi curt
const LIMIT_EXE = 20000;
const LIMIT_PLAN = 10000;
const LIMIT_AWD = 20000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url, params = {}, { retries = 5, timeoutMs = 30000 } = {}) {
  const qs = new URLSearchParams(params);
  const full = `${url}?${qs.toString()}`;
  let last;
  for (let i = 1; i <= retries; i++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(full, { headers: { accept: 'application/json' }, signal: ctl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      clearTimeout(to);
      last = e;
      if (i === retries) throw last;
      await sleep(1000 * i);
    }
  }
  throw last;
}

function n(v=''){ return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function get(o, arr){ for (const k of arr) if (o?.[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null; }
function num(v){ if (v===undefined||v===null||v==='') return null; const x = Number(String(v).replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.-]/g,'')); return Number.isFinite(x)?x:null; }

function infer(o, defs){
  const organ = get(o, ['nom_organ','organ_de_contractaci','orga_de_contractaci','organ']) || 'Sense organisme';
  const scope = get(o, ['nom_ambit','ambit','departament','nom_departament','departament_d_adscripcio','nom_departament_ens']) || '';
  const date  = get(o, ['data_publicacio','data_publicacio_anunci','data_publicaci','data_d_adjudicacio','data_adjudicacio','data_formalitzacio','data_inici','data_prevista']) || null;
  const title = get(o, ['descripcio_contracte','descripci_del_contracte','descripcio_del_contracte','objecte_contracte','objecte_del_lot','titol','descripcio']) || 'Sense títol';
  const exp   = get(o, ['codi_expedient','codi_d_expedient','expedient']) || '';
  const cpv   = get(o, ['codi_cpv','cpv','cpv_principal']) || '';
  const amount= get(o, ['import_licitacio','import_de_licitacio','import_licitat','valor_estimat_contracte','pressupost_base_licitacio','import_previst_sense_iva','import_previst','import_adjudicat_sense_iva','import_adjudicat','import']) || null;

  return {
    source: defs.source,
    status: defs.status,
    title, organ, scope, expedient: exp, cpv,
    amount: num(amount),
    date,
    url: get(o, ['url_expedient','url_publicacio','url_publicaci','enllac_expedient','enllac','link']) || null,
    short: defs.short || '',
    raw: o
  };
}

function is2026(x){
  return (x.date && String(x.date).startsWith(YEAR)) || String(x.expedient||'').includes(YEAR);
}

function groupKey(x){ return `${n(x.organ)}|${n(x.expedient||x.title).slice(0,180)}`; }

function statusFrom(o) {
  const t = n(Object.entries(o||{})
    .filter(([k]) => /(tipus|fase|publicaci|estat|anunci)/i.test(k))
    .map(([,v]) => String(v)).join(' | '));

  if (t.includes('consulta preliminar')) return 'consulta';
  if (t.includes('anunci previ'))       return 'previ';
  if (t.includes('execuc'))             return 'execucio';
  if (t.includes('formalitz'))          return 'formalitzacio';
  if (t.includes('adjudic'))            return 'adjudicacio';
  if (t.includes('avalu'))              return 'avaluacio';
  if (t.includes('licit'))              return 'licitacio';
  return 'licitacio';
}
function shortFrom(o) {
  const t = n(Object.values(o||{}).join(' | '));
  if (t.includes('rectif') || t.includes('esmena')) return 'Plecs rectificats';
  if (t.includes('ampli')) return 'Termini ampliat';
  if (t.includes('adjudic')) return 'Adjudicació publicada';
  if (t.includes('formalitz')) return 'Contracte formalitzat';
  if (t.includes('avalu')) return 'En avaluació';
  if (t.includes('consulta preliminar')) return 'Consulta mercat';
  if (t.includes('execuc')) return 'En execució';
  if (t.includes('licit')) return 'Licitació oberta';
  return 'Actualització';
}

async function build() {
  // Filtres 2026 a origen (Socrata)
  const wherePub =
    `(substr(data_publicacio,1,4)='${YEAR}' OR substr(data_publicacio_anunci,1,4)='${YEAR}' ` +
    `OR codi_expedient like 'CTTI-${YEAR}-%' OR codi_expedient like 'SEM-${YEAR}-%' OR codi_expedient like '2100%')`;

  const whereExe =
    `(substr(data_inici,1,4)='${YEAR}' OR substr(data_publicacio,1,4)='${YEAR}')`;

  const pubsRaw = await getJson(URLS.pub,  { $where: wherePub, $limit: LIMIT_PUB,  $order: 'data_publicacio DESC' });
  const exesRaw = await getJson(URLS.exe,  { $where: whereExe, $limit: LIMIT_EXE,  $order: 'data_publicacio DESC' });
  const planRaw = await getJson(URLS.plan, { $where: `(any=${YEAR})`, $limit: LIMIT_PLAN, $order: ':updated_at DESC' });
  const awdRaw  = await getJson(URLS.awd,  { $where: `(any=${YEAR})`, $limit: LIMIT_AWD,  $order: ':updated_at DESC' });

  console.log(`[sync] descarregat: pub=${pubsRaw.length} exe=${exesRaw.length} plan=${planRaw.length} awd=${awdRaw.length}`);

  const pubs = pubsRaw.map(o => infer(o, { source:'pub', status: statusFrom(o), short: shortFrom(o) })).filter(is2026);
  const exes = exesRaw.map(o => infer(o, { source:'exe', status: 'execucio', short: 'En execució' })).filter(is2026);
  const plans= planRaw.map(o => infer(o, { source:'plan', status: 'programada', short: 'Programació 2026' }));
  const awds = awdRaw.map(o => {
    const base = infer(o, { source:'awd', status: 'adjudicacio' });
    const L = num(get(o, ['import_licitat','import_licitacio']));
    const A = num(get(o, ['import_adjudicat_sense_iva','import_adjudicat']));
    return {
      ...base,
      licitat: L, adjudicat: A,
      provider: get(o, ['empresa_adjudicat_ria','empresa_adjudicataria','adjudicatari']) || '',
      discount_pct: (L && A && L>0) ? ((L-A)/L)*100 : null
    };
  });

  // Agrupació
  const groups = new Map();
  for (const it of [...pubs, ...exes, ...plans]) {
    const k = groupKey(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }

  const items = [];
  for (const list of groups.values()) {
    list.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
    const head = list[0];
    const pubLike = list.filter(x => x.source==='pub' || x.source==='exe');
    const alerts = {
      count: pubLike.length,
      latest_short: pubLike[0]?.short || head.short,
      recent_short: [...new Set(pubLike.map(x=>x.short).filter(Boolean))],
      url: pubLike.find(x=>x.url)?.url || head.url || null
    };

    items.push({
      title: head.title,
      organ: head.organ,
      scope: head.scope,
      expedient: head.expedient,
      cpv: head.cpv,
      amount: head.amount,
      date: head.date,
      status: head.status,
      url: head.url || alerts.url,
      follow_url: head.url || alerts.url,
      priority: '',
      tags: [...new Set(list.map(x=>x.status))],
      alerts
    });
  }

  items.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0) || (b.amount||0)-(a.amount||0));

  console.log(`[sync] agregat items=${items.length}`);

  return {
    meta: {
      generated_at: ISO_NOW,
      snapshot_scope: `Tot ${YEAR} · PSCP`,
      items: items.length,
      sources: ['PSCP publicacions', 'PSCP execució', 'Programació 2026', 'Adjudicacions 2026']
    },
    items
  };
}

await fs.mkdir(DATA_DIR, { recursive: true });

let snapshot;
try {
  snapshot = await build();
} catch (e) {
  console.error('[sync] ERROR:', e?.message || e);
  try {
    const cur = await fs.readFile(OUT, 'utf8');
    snapshot = JSON.parse(cur);
  } catch {
    snapshot = {
      meta: {
        generated_at: ISO_NOW,
        snapshot_scope: `Tot ${YEAR} · PSCP`,
        items: 0,
        sources: [],
        warning: 'Snapshot buit'
      },
      items: []
    };
  }
}

await fs.writeFile(OUT, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(`[sync] snapshot escrit: ${OUT} (${snapshot.items.length} fitxes)`);

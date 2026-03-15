import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const OUT = path.join(DATA_DIR, 'snapshot.json');
const URLS = { pub:'https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json', exe:'https://analisi.transparenciacatalunya.cat/resource/8idu-wkjv.json', plan:'https://analisi.transparenciacatalunya.cat/resource/u9d7-egbx.json', awd:'https://analisi.transparenciacatalunya.cat/resource/nn7v-4yxe.json' };
const NOW = new Date();const ISO_NOW = NOW.toISOString();
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function fetchJson(url, params={}, {retries=5,timeoutMs=30000,baseDelayMs=1200}={}){
  const qs = new URLSearchParams(params); const full=`${url}?${qs}`; let last=null;
  for(let a=1;a<=retries;a++){
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),timeoutMs);
    try{ const res=await fetch(full,{headers:{accept:'application/json'},signal:ctl.signal}); clearTimeout(t); if(!res.ok){const body = await res.text().catch(()=>'' ); throw new Error(`HTTP ${res.status} ${res.statusText} -> ${full}
${body}`);} return await res.json(); }
    catch(e){ clearTimeout(t); last=e; const m=String(e?.message||e); const retriable= m.includes('AbortError')||m.includes('fetch failed')||m.includes('network')||/HTTP (429|5\d\d)/.test(m); if(!retriable||a===retries) throw last; await sleep(baseDelayMs*a); }
  }
  throw last;
}
async function safe(name,url,params){ try{ return await fetchJson(url,params); }catch(e){ console.warn(`[WARN] ${name} falla:`, e?.message||e); return []; } }
function n(v=''){return String(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}
function get(o,k){ for(const x of k){ if(o?.[x]!==undefined && o?.[x]!==null && o?.[x]!=='') return o[x]; } return null }
function num(v){ if(v===undefined||v===null||v==='') return null; const x=Number(String(v).replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.-]/g,'')); return Number.isFinite(x)?x:null }
function inferDate(o){ return get(o,['data_publicacio','data_publicacio_anunci','data_publicaci','data_d_adjudicacio','data_adjudicacio','data_formalitzacio','data_inici','data_prevista']) || null }
function inferTitle(o){ return get(o,['descripcio_contracte','descripci_del_contracte','descripcio_del_contracte','objecte_contracte','objecte_del_lot','titol','descripcio']) || 'Sense títol' }
function inferOrgan(o){ return get(o,['nom_organ','organ_de_contractaci','orga_de_contractaci','organ']) || 'Sense organisme' }
function inferScope(o){ return get(o,['nom_ambit','ambit','departament','nom_departament','departament_d_adscripci','departament_d_adscripcio','nom_departament_ens']) || '' }
function inferExp(o){ return get(o,['codi_expedient','codi_d_expedient','expedient']) || '' }
function inferCPV(o){ return get(o,['codi_cpv','cpv','cpv_principal']) || '' }
function inferAmount(o){ return get(o,['import_licitacio','import_de_licitacio','import_licitat','valor_estimat_contracte','pressupost_base_licitacio','import_previst_sense_iva','import_previst','import_adjudicat_sense_iva','import_adjudicat','import']) || null }
function status(o){ const t=n(Object.entries(o||{}).filter(([k])=>/(tipus|fase|publicaci|estat|anunci)/i.test(k)).map(([,v])=>String(v)).join(' | ')); if(t.includes('consulta preliminar')) return 'consulta'; if(t.includes('anunci previ')) return 'previ'; if(t.includes('execuc')) return 'execucio'; if(t.includes('formalitz')) return 'formalitzacio'; if(t.includes('adjudic')) return 'adjudicacio'; if(t.includes('avalu')) return 'avaluacio'; if(t.includes('licit')) return 'licitacio'; return 'licitacio' }
function urlFrom(o,organ,scope){ return get(o,['url_expedient','url_publicacio','url_publicaci','enllac_expedient','enllac','link']) || null }
function normPub(o){ const organ=inferOrgan(o), scope=inferScope(o); return {source:'pub',status:status(o),title:inferTitle(o),organ,scope,expedient:inferExp(o),cpv:inferCPV(o),amount:num(inferAmount(o)),date:inferDate(o),url:urlFrom(o,organ,scope),short:'',raw:o} }
function normExe(o){ const organ=inferOrgan(o), scope=inferScope(o); return {source:'exe',status:'execucio',title:inferTitle(o),organ,scope,expedient:inferExp(o),cpv:inferCPV(o),amount:num(inferAmount(o)),date:inferDate(o),url:urlFrom(o,organ,scope),short:'En execució',raw:o} }
function normPlan(o){ const organ=inferOrgan(o), scope=inferScope(o); return {source:'plan',status:'programada',title:inferTitle(o),organ,scope,expedient:inferExp(o),cpv:inferCPV(o),amount:num(inferAmount(o)),date:inferDate(o)||'2026-01-01T00:00:00Z',url:urlFrom(o,organ,scope),short:'Programació 2026',raw:o} }
function normAwd(o){ const organ=inferOrgan(o), scope=inferScope(o); const L=num(get(o,['import_licitat','import_licitacio'])); const A=num(get(o,['import_adjudicat_sense_iva','import_adjudicat'])); return {source:'awd',title:inferTitle(o),organ,scope,expedient:inferExp(o),cpv:inferCPV(o),licitat:L,adjudicat:A,provider:get(o,['empresa_adjudicat_ria','empresa_adjudicataria','adjudicatari'])||'',date:inferDate(o),url:urlFrom(o,organ,scope),discount_pct:L&&A&&L>0?((L-A)/L)*100:null,raw:o} }
function is2026(d,exp){ return (d && String(d).startsWith('2026')) || String(exp||'').includes('2026') }
function keyFor(x){ return `${n(x.organ)}|${n(x.expedient||x.title).slice(0,180)}` }
async function build(){
  const [pubRaw,exeRaw,planRaw,awdRaw]=await Promise.all([
    safe('pub',URLS.pub,{$limit:'10000',$order:':updated_at DESC'}),
    safe('exe',URLS.exe,{$limit:'6000',$order:':updated_at DESC'}),
    safe('plan',URLS.plan,{$limit:'4000',$where:'(any = 2026 OR any = "2026")',$order:':updated_at DESC'}),
    safe('awd',URLS.awd,{$limit:'4000',$where:'(any = 2026 OR any = "2026")',$order:':updated_at DESC'})
  ]);
  const pubs=pubRaw.map(normPub).filter(x=>is2026(x.date,x.expedient));
  const exes=exeRaw.map(normExe).filter(x=>is2026(x.date,x.expedient));
  const plans=planRaw.map(normPlan);
  const awds=awdRaw.map(normAwd);
  const groups=new Map();
  for(const item of [...pubs,...exes,...plans]){ const k=keyFor(item); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(item); }
  const items=[];
  for(const arr of groups.values()){
    arr.sort((a,b)=> new Date(b.date||0)-new Date(a.date||0));
    const h=arr[0];
    const rp=arr.filter(x=>x.source==='pub'||x.source==='exe');
    const alerts={count:rp.length,latest_short:rp[0]?.short||h.short, recent_short:[...new Set(rp.map(x=>x.short).filter(Boolean))], url: rp.find(x=>x.url)?.url || h.url || null};
    const item={ title:h.title,organ:h.organ,scope:h.scope,expedient:h.expedient,cpv:h.cpv,amount:h.amount,date:h.date,status:h.status,url: h.url || alerts.url, follow_url: h.url || alerts.url, priority:'', tags:[...new Set(arr.map(x=>x.status))], alerts};
    items.push(item);
  }
  items.sort((a,b)=> new Date(b.date||0)-new Date(a.date||0) || (b.amount||0)-(a.amount||0));
  return { meta:{generated_at:ISO_NOW,snapshot_scope:'Tot 2026 · PSCP',items:items.length,sources:['PSCP publicacions','PSCP execució','Programació 2026','Adjudicacions 2026']}, items };
}
await fs.mkdir(DATA_DIR,{recursive:true});
let snap=null; try{ snap=await build(); }catch(e){ console.error('[FATAL]',e?.message||e); try{ const cur=await fs.readFile(OUT,'utf8'); snap=JSON.parse(cur);}catch{ snap={meta:{generated_at:ISO_NOW,snapshot_scope:'Tot 2026 · PSCP',items:0,sources:[],warning:'Snapshot buit'},items:[]}; } }
await fs.writeFile(OUT, JSON.stringify(snap,null,2), 'utf8');
console.log(`snapshot escrit: ${OUT} (${snap.items.length} fitxes)`);

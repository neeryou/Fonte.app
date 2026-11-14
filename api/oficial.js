// ============================================================================
// FONTE · Página propia de cada aviso oficial y de cada fecha institucional
// ----------------------------------------------------------------------------
//   fonte.city/aviso/<id>  → un comunicado (tabla comunicados)
//   fonte.city/fecha/<id>  → una fecha de institución (tabla institucion_fechas)
// (las reglas de vercel.json mandan esas direcciones acá).
//
// Se arma en el servidor para que Facebook, WhatsApp e Instagram lean el título,
// el texto y la foto (og:*) aunque no corran JavaScript. Solo lee datos públicos
// con la misma clave pública que usa la app; no escribe nada en la base.
// Los links viejos (?c=<id>, ?f=<id>) siguen abriendo la app como siempre.
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || "https://skpfycmkilahghvoxqxw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_3YK9XChJ8YeJzlXymHXUeQ_TbCPQReT";
const SITIO = "https://fonte.city";
const IMG_DEFECTO = SITIO + "/compartir.png"; // 1200x630
const ZONA = "America/Argentina/Cordoba";
const HORAS_PORTADA = 48; // igual que la app: un aviso sin vencimiento sale 48 h en inicio
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- utilidades ----------
const esc = (s)=> String(s == null ? "" : s).replace(/[&<>"']/g, (c)=> ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function urlSegura(u){
  const s = String(u || "").trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}
function recortar(s, max){
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
}
function colorValido(c){ return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c || "").trim()) ? String(c).trim() : ""; }
function siglaDe(nombre){
  const pal = String(nombre || "").replace(/\b(de|del|la|las|el|los|y)\b/gi, " ").split(/\s+/).filter(Boolean);
  return (pal.slice(0, 2).map(p => p[0]).join("") || "IN").toUpperCase();
}
function hoyIso(){ return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date()); }
// "vie 14 nov · 18:40"
function fechaHora(iso){
  const d = new Date(iso); if(isNaN(d)) return "";
  const p = {}; new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", hour12:false })
    .formatToParts(d).forEach(x => p[x.type] = x.value);
  const lim = (s)=> String(s || "").replace(".", "").toLowerCase();
  return lim(p.weekday) + " " + p.day + " " + lim(p.month) + " · " + p.hour + ":" + p.minute;
}
// fecha "2026-11-20" → "jueves 20 de noviembre"
function fechaLarga(isoDia){
  const [y, m, d] = String(isoDia || "").split("-").map(Number);
  if(!y || !m || !d) return String(isoDia || "");
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return DIAS[dt.getUTCDay()] + " " + d + " de " + MESES[m - 1];
}
function partesDia(isoDia){
  const [y, m, d] = String(isoDia || "").split("-").map(Number);
  const M = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  return { d: d || "—", m: M[(m || 1) - 1] || "" };
}
function difDias(a, b){ return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); }
function horaTurno(iso){
  const d = new Date(iso); if(isNaN(d)) return "";
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour:"2-digit", minute:"2-digit", hour12:false }).format(d).split(":");
  return String(Number(h) % 24) + (m !== "00" ? ":" + m : "");
}
function hastaFarm(iso){
  const hora = horaTurno(iso); if(!hora) return "";
  const fin = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));
  const dif = difDias(hoyIso(), fin);
  return dif <= 0 ? "hasta las " + hora + " h" : dif === 1 ? "hasta mañana " + hora + " h" : "hasta el " + fechaLarga(fin).split(" ").slice(0, 2).join(" ") + ", " + hora + " h";
}

// ---------- lectura de Supabase (solo GET/RPC públicos) ----------
const HDR = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
async function leer(ruta, opciones){
  const ctl = new AbortController();
  const t = setTimeout(()=> ctl.abort(), 4000);
  try{
    const r = await fetch(SUPABASE_URL + ruta, Object.assign({ headers: HDR, signal: ctl.signal }, opciones || {}));
    if(!r.ok){ const e = new Error("supabase " + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
// null = no existe / no es público; lanza error si falló la conexión
async function fila(tabla, id, extra){
  try{
    const arr = await leer("/rest/v1/" + tabla + "?select=*&id=eq." + encodeURIComponent(id) + (extra || "") + "&limit=1");
    return (arr && arr[0]) || null;
  }catch(e){
    if(e.status && e.status < 500) return null; // 400/404: id inválido o tabla sin acceso → "no está"
    throw e;
  }
}
const suave = (p)=> p.catch(()=> null); // lo de "Hoy en Quitilipi" nunca rompe la página

async function hoyEnQuitilipi(excluirTipo, excluirId){
  const hoy = hoyIso();
  const [farm, fechas, coms] = await Promise.all([
    suave(leer("/rest/v1/rpc/farmacia_de_turno_ahora", { method:"POST", headers: Object.assign({ "Content-Type":"application/json" }, HDR), body:"{}" })),
    suave(leer("/rest/v1/institucion_fechas?select=id,titulo,fecha,horario,instituciones(nombre)&activa=eq.true&fecha=gte." + hoy + "&order=fecha.asc&limit=3")),
    suave(leer("/rest/v1/comunicados?select=id,titulo,institucion,created_at,vence_at&order=created_at.desc&limit=12")),
  ]);
  const items = [];
  if(Array.isArray(farm) && farm.length){
    const nombres = farm.map(f => String(f.farmacia || "").trim()).filter(Boolean).slice(0, 2).join(" + ");
    if(nombres) items.push({ e:"💊", t:"Farmacia de turno", s: nombres + (farm[0].hasta ? " · " + hastaFarm(farm[0].hasta) : ""), href:"/" });
  }
  const ahora = Date.now();
  const otro = (Array.isArray(coms) ? coms : []).find(c => {
    if(excluirTipo === "c" && String(c.id) === String(excluirId)) return false;
    const v = c.vence_at ? Date.parse(c.vence_at) : (c.created_at ? Date.parse(c.created_at) + HORAS_PORTADA * 3600000 : NaN);
    return !isNaN(v) && v > ahora;
  });
  if(otro) items.push({ e:"📢", t:"Otro aviso oficial", s: recortar(otro.titulo, 70) + (otro.institucion ? " · " + otro.institucion : ""), href:"/aviso/" + encodeURIComponent(otro.id) });
  const prox = (Array.isArray(fechas) ? fechas : []).find(f => !(excluirTipo === "f" && String(f.id) === String(excluirId)));
  if(prox){
    const inst = prox.instituciones && prox.instituciones.nombre;
    items.push({ e:"📅", t:"Próxima fecha oficial", s: recortar(prox.titulo, 60) + " · " + fechaLarga(prox.fecha) + (inst ? " · " + inst : ""), href:"/fecha/" + encodeURIComponent(prox.id) });
  }
  return items;
}

// ---------- armado de la página ----------
const CSS = `
:root{ --serif:'Fraunces',Georgia,serif; --sans:'Work Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; --slab:'Alfa Slab One',Georgia,serif; --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --paper:#FBF8F1; --paper-2:#F4EFE4; --paper-3:#EDE6D6; --surface:#FFFDF9; --ink:#14120D; --ink-soft:#4A4438; --ink-faint:#8B8474; --ink-20:#C3BCA9;
  --line:#E3DCC9; --line-strong:#CFC5AC; --urgente:#A8382C; --terracota:#A8382C; --of:#1B3A5C; --of-tx:#1B3A5C; color-scheme:light; }
[data-tema="oscuro"]{ --paper:#17140F; --paper-2:#211D16; --paper-3:#2A251C; --surface:#1E1A13; --ink:#F5F1E6; --ink-soft:#C9C2B2; --ink-faint:#8A8375; --ink-20:#4E4738;
  --line:#332E24; --line-strong:#453F31; --urgente:#D9584B; --terracota:#D9584B; --of:#2C5A8C; --of-tx:#8FB6E0; color-scheme:dark; }
*{ box-sizing:border-box; }
html,body{ margin:0; background:var(--paper); color:var(--ink); font-family:var(--serif); -webkit-font-smoothing:antialiased; }
a{ color:inherit; }
.wrap{ max-width:560px; margin:0 auto; }
.top{ display:flex; align-items:center; justify-content:space-between; padding:12px 18px; border-bottom:1px solid var(--line); }
.brand{ font-family:var(--slab); font-size:1.35rem; line-height:1; text-decoration:none; color:var(--ink); }
.brand::after{ content:''; display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--terracota); margin-left:4px; vertical-align:top; margin-top:3px; }
.ghost{ font-family:var(--sans); font-size:.72rem; font-weight:700; color:var(--ink-soft); background:var(--paper-2); border:1px solid var(--line-strong); border-radius:999px; padding:6px 12px; text-decoration:none; white-space:nowrap; }
.origen{ font-family:var(--sans); font-size:.68rem; color:var(--ink-faint); padding:10px 18px 0; }
.card{ background:var(--surface); border:1px solid var(--line); border-radius:12px; }
.post{ margin:10px 18px 0; overflow:hidden; }
.post-head{ display:flex; align-items:center; gap:10px; padding:14px 14px 12px; border-bottom:1px solid var(--line); }
.logo{ width:42px; height:42px; border-radius:10px; background:var(--inst,var(--of)); color:#fff; font-family:var(--sans); font-weight:800; font-size:.8rem; display:flex; align-items:center; justify-content:center; flex:0 0 auto; overflow:hidden; }
.logo img{ width:100%; height:100%; object-fit:cover; display:block; }
.inst{ font-family:var(--sans); font-weight:700; font-size:.88rem; line-height:1.2; }
.seal{ display:inline-flex; align-items:center; gap:5px; font-family:var(--sans); font-size:.58rem; font-weight:800; letter-spacing:.04em; color:#fff; background:var(--of); border-radius:999px; padding:2px 8px 2px 4px; white-space:nowrap; margin-top:4px; }
.seal i{ width:13px; height:13px; border-radius:50%; background:#fff; color:var(--of); font-style:normal; font-size:.52rem; display:inline-flex; align-items:center; justify-content:center; font-weight:900; }
.body{ padding:14px; }
.tipo{ display:inline-flex; align-items:center; gap:6px; font-family:var(--sans); font-size:.6rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--of-tx); }
.tipo::before{ content:''; width:7px; height:7px; border-radius:50%; background:currentColor; }
.tipo.urg{ color:var(--urgente); }
h1{ font-family:var(--serif); font-weight:700; font-size:1.45rem; line-height:1.16; letter-spacing:-.008em; margin:8px 0 10px; overflow-wrap:anywhere; }
.texto{ font-size:.98rem; line-height:1.5; color:var(--ink-soft); margin:0 0 10px; white-space:pre-line; overflow-wrap:anywhere; }
.foto{ display:block; width:100%; height:auto; border-radius:8px; margin:4px 0 10px; background:var(--paper-2); }
.datos{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0 4px; }
.dato{ background:var(--paper-2); border-radius:8px; padding:9px 10px; min-width:0; }
.dato.full{ grid-column:1/-1; }
.dato .l{ font-family:var(--sans); font-size:.56rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); }
.dato .v{ font-family:var(--serif); font-weight:700; font-size:1rem; margin-top:2px; line-height:1.25; white-space:pre-line; overflow-wrap:anywhere; }
.video{ display:inline-flex; gap:6px; font-family:var(--sans); font-size:.76rem; font-weight:700; color:var(--ink); background:var(--paper-2); border:1px solid var(--line-strong); border-radius:999px; padding:7px 13px; text-decoration:none; margin:2px 0 8px; }
.verif{ display:flex; gap:10px; align-items:flex-start; background:color-mix(in srgb,var(--of) 8%,var(--surface)); border-top:1px solid color-mix(in srgb,var(--of) 22%,var(--line)); padding:12px 14px; }
.verif .ic{ width:26px; height:26px; border-radius:50%; background:var(--of); color:#fff; display:flex; align-items:center; justify-content:center; font-size:.8rem; font-weight:900; flex:0 0 auto; font-family:var(--sans); }
.verif .t{ font-family:var(--sans); font-size:.74rem; line-height:1.42; color:var(--ink-soft); }
.verif .t b{ color:var(--ink); }
.verif .meta{ font-family:var(--mono); font-size:.62rem; color:var(--ink-faint); margin-top:5px; }
.corr{ margin-top:6px; font-family:var(--sans); font-size:.7rem; color:var(--ink); background:var(--paper-2); border-left:3px solid var(--of); padding:6px 8px; border-radius:4px; }
.acts{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 18px 0; }
.btn{ display:flex; align-items:center; justify-content:center; gap:8px; font-family:var(--sans); font-size:.84rem; font-weight:700; border-radius:10px; padding:12px 14px; border:0; text-decoration:none; text-align:center; line-height:1.3; cursor:pointer; }
.btn.ink{ background:var(--ink); color:var(--paper); }
.btn.line{ background:var(--surface); color:var(--ink); border:1px solid var(--line-strong); }
.vencido{ margin:12px 18px 0; padding:12px 14px; border-radius:12px; background:var(--paper-2); border:1px solid var(--line-strong); font-family:var(--sans); }
.vencido b{ display:block; font-size:.86rem; }
.vencido span{ display:block; font-size:.72rem; color:var(--ink-faint); margin-top:2px; }
.apagado{ opacity:.62; }
.mas{ margin:0 18px; }
.eyebrow{ display:flex; align-items:center; gap:10px; margin:24px 0 6px; }
.eyebrow .t{ font-family:var(--sans); text-transform:uppercase; letter-spacing:.18em; font-weight:800; font-size:.6rem; white-space:nowrap; }
.eyebrow .ln{ flex:1; height:.5px; background:var(--ink); opacity:.5; }
.mi{ display:flex; gap:12px; align-items:center; padding:11px 0; border-bottom:1px solid var(--line); text-decoration:none; color:inherit; }
.mi .e{ font-size:1.15rem; width:34px; height:34px; border-radius:9px; background:var(--paper-2); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.mi .tx{ min-width:0; flex:1; }
.mi .tt{ font-family:var(--sans); font-size:.8rem; font-weight:700; }
.mi .ss{ font-family:var(--sans); font-size:.7rem; color:var(--ink-faint); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mi .ar{ color:var(--ink-faint); font-family:var(--sans); }
.vermas{ margin-top:14px; }
.pie{ font-family:var(--sans); font-size:.62rem; color:var(--ink-faint); text-align:center; padding:20px 18px 28px; line-height:1.5; }
.estado{ margin:28px 18px 0; padding:26px 18px; text-align:center; }
.estado .ico{ font-size:1.8rem; }
.estado h1{ font-size:1.3rem; margin:10px 0 6px; }
.estado p{ font-family:var(--sans); font-size:.8rem; color:var(--ink-soft); margin:0 0 16px; line-height:1.45; }
.toast{ position:fixed; left:50%; bottom:22px; transform:translateX(-50%) translateY(80px); background:var(--ink); color:var(--paper); font-family:var(--sans); font-size:.78rem; font-weight:700; padding:10px 16px; border-radius:999px; transition:transform .25s ease, opacity .25s ease; z-index:9; opacity:0; visibility:hidden; }
.toast.on{ transform:translateX(-50%) translateY(0); opacity:1; visibility:visible; }
`;

function cabecera(o){
  const titulo = o.titulo || "Fonte · Quitilipi";
  const desc = o.descripcion || "Lo oficial y lo que pasa en Quitilipi, en un solo lugar.";
  const img = o.imagen || IMG_DEFECTO;
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
${o.noindex ? '<meta name="robots" content="noindex">' : ""}
${o.url ? `<link rel="canonical" href="${esc(o.url)}">` : ""}
<meta property="og:site_name" content="Fonte · Quitilipi">
<meta property="og:locale" content="es_AR">
<meta property="og:type" content="${o.publicado ? "article" : "website"}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
${o.url ? `<meta property="og:url" content="${esc(o.url)}">` : ""}
<meta property="og:image" content="${esc(img)}">
${img === IMG_DEFECTO ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ""}
<meta property="og:image:alt" content="${esc(o.imagenAlt || titulo)}">
${o.publicado ? `<meta property="article:published_time" content="${esc(o.publicado)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="theme-color" content="#FBF8F1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/appletouchicon.png">
<script>try{var t=localStorage.getItem("fonte_tema");if(t)document.documentElement.setAttribute("data-tema",t);}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Work+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body><div class="wrap">
<div class="top"><a class="brand" href="/" aria-label="Ir a Fonte">Fonte</a><a class="ghost" href="/">Ver más de Quitilipi ›</a></div>`;
}

function listaHoy(items){
  if(!items || !items.length) return `<div class="mas"><a class="btn line vermas" href="/">Ver más de Quitilipi ›</a></div>`;
  return `<div class="mas">
<div class="eyebrow"><span class="t">Hoy en Quitilipi</span><span class="ln"></span></div>
${items.map(i => `<a class="mi" href="${esc(i.href)}"><div class="e">${i.e}</div><div class="tx"><div class="tt">${esc(i.t)}</div><div class="ss">${esc(i.s)}</div></div><span class="ar">›</span></a>`).join("\n")}
<a class="btn line vermas" href="/">Ver más de Quitilipi ›</a>
</div>`;
}

const PIE = `<div class="pie">Fonte junta lo oficial y lo que pasa en Quitilipi. No hace falta descargar nada.</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>`;

function scriptCompartir(datos){
  // datos va como JSON escapado para que no se pueda cerrar el <script> desde un texto
  const json = JSON.stringify(datos).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<script>
(function(){
  var D = ${json};
  var toast = document.getElementById("toast"), tt;
  function aviso(m){ toast.textContent = m; toast.classList.add("on"); clearTimeout(tt); tt = setTimeout(function(){ toast.classList.remove("on"); }, 2200); }
  function copiar(t){
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function(){ return true; }, function(){ return viejo(t); });
    return Promise.resolve(viejo(t));
  }
  function viejo(t){ try{ var a = document.createElement("textarea"); a.value = t; a.setAttribute("readonly",""); a.style.cssText = "position:fixed;top:0;left:0;opacity:0"; document.body.appendChild(a); a.select(); var ok = document.execCommand("copy"); a.remove(); return ok; }catch(e){ return false; } }
  var b = document.getElementById("compartir");
  if(b) b.addEventListener("click", function(){
    if(navigator.share){
      navigator.share({ title: D.titulo, text: D.texto, url: D.url }).catch(function(e){
        if(e && e.name === "AbortError") return;
        copiar(D.texto + "\\n" + D.url).then(function(ok){ aviso(ok ? "Link copiado ✓" : "No se pudo copiar"); });
      });
    } else {
      copiar(D.texto + "\\n" + D.url).then(function(ok){ aviso(ok ? "Link copiado: pegalo donde quieras ✓" : "No se pudo copiar el link"); });
    }
  });
})();
</script>`;
}

function paginaNoEsta(tipo, items){
  const que = tipo === "f" ? "Esta fecha ya no está vigente" : "Este aviso ya no está vigente";
  return cabecera({ titulo: que + " · Fonte", descripcion: "La institución lo sacó o ya no está publicado. Mirá lo último de Quitilipi en Fonte.", noindex: true })
    + `<div class="card estado"><div class="ico">🗂️</div><h1>${esc(que)}</h1><p>La institución lo sacó o ya no está publicado. En Fonte tenés lo último y oficial de Quitilipi.</p><a class="btn ink" href="/">Ver más de Quitilipi ›</a></div>`
    + listaHoy(items) + PIE + "</body></html>";
}

function paginaError(){
  return cabecera({ titulo: "Fonte · Quitilipi", noindex: true })
    + `<div class="card estado"><div class="ico">📶</div><h1>No pudimos cargar el aviso</h1><p>Puede ser la señal o un problema de un momento. Probá de nuevo en un ratito.</p><a class="btn ink" href="">Probar de nuevo</a><div style="height:8px"></div><a class="btn line" href="/">Ver más de Quitilipi ›</a></div>`
    + PIE + "</body></html>";
}

function bloqueCorreccion(r){
  // editado_at lo pone la base (trigger fonte_marcar_editado) al cambiar contenido visible; si la columna no viene, no se afirma nada.
  if(!Object.prototype.hasOwnProperty.call(r, "editado_at")) return { meta: "", nota: "" };
  if(!r.editado_at) return { meta: " · sin cambios", nota: "" };
  return { meta: " · corregido " + fechaHora(r.editado_at),
    nota: r.nota_correccion ? `<div class="corr"><b>Corrección:</b> ${esc(r.nota_correccion)}</div>` : "" };
}

function paginaAviso(o){
  const { tipo, r, inst, items } = o;
  const nombreInst = (inst && inst.nombre) || r.institucion || "Institución";
  const color = colorValido((inst && inst.color) || r.color);
  const sello = String((inst && inst.sello) || r.sello || siglaDe(nombreInst)).slice(0, 4).toUpperCase();
  const logoUrl = urlSegura(inst && inst.foto_url);
  const ruta = tipo === "f" ? "fecha" : "aviso";
  const url = SITIO + "/" + ruta + "/" + r.id;
  const foto = urlSegura(r.imagen_url);
  const publicado = r.created_at || null;
  const corr = bloqueCorreccion(r);

  let vencidoTxt = "";
  if(tipo === "c" && r.vence_at && Date.parse(r.vence_at) < Date.now()) vencidoTxt = "Venció " + fechaHora(r.vence_at) + ". Lo dejamos como registro de lo que publicó " + nombreInst + ".";
  if(tipo === "f" && r.fecha && r.fecha < hoyIso()) vencidoTxt = "Fue el " + fechaLarga(r.fecha) + ". Queda como registro de lo que publicó " + nombreInst + ".";

  let etiqueta, cuerpo, desc, compartirTexto;
  if(tipo === "c"){
    const urg = !!r.urgente && !vencidoTxt;
    etiqueta = `<span class="tipo${urg ? " urg" : ""}">${urg ? "Urgente · comunicado oficial" : "Comunicado oficial"}</span>`;
    cuerpo = (foto ? `<img class="foto" src="${esc(foto)}" alt="">` : "")
      + (r.texto ? `<p class="texto">${esc(r.texto)}</p>` : "")
      + (urlSegura(r.video_url) ? `<a class="video" href="${esc(urlSegura(r.video_url))}" target="_blank" rel="noopener">▶ Ver el video</a>` : "");
    desc = "✓ Oficial · " + nombreInst + (r.texto ? " — " + recortar(r.texto, 170) : "");
    compartirTexto = "📢 Comunicado oficial de " + nombreInst + ": " + (r.titulo || "");
  } else {
    const p = partesDia(r.fecha);
    const lugares = String(r.lugar || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    etiqueta = `<span class="tipo">Fecha oficial · ${esc(p.d)} ${esc(p.m)}</span>`;
    cuerpo = (foto ? `<img class="foto" src="${esc(foto)}" alt="">` : "")
      + `<div class="datos"><div class="dato${r.horario ? "" : " full"}"><div class="l">Cuándo</div><div class="v">${esc(fechaLarga(r.fecha))}</div></div>`
      + (r.horario ? `<div class="dato"><div class="l">Hora</div><div class="v">${esc(r.horario)}</div></div>` : "")
      + (lugares.length ? `<div class="dato full"><div class="l">Dónde</div><div class="v">${esc(lugares.join("\n"))}</div></div>` : "")
      + `</div>`
      + (r.descripcion ? `<p class="texto" style="margin-top:10px">${esc(r.descripcion)}</p>` : "");
    desc = "📅 " + fechaLarga(r.fecha) + (r.horario ? " · " + r.horario : "") + (lugares[0] ? " · " + lugares[0] : "") + " — " + nombreInst + (r.descripcion ? ". " + recortar(r.descripcion, 120) : "");
    compartirTexto = "📅 " + nombreInst + ": " + (r.titulo || "") + " · " + fechaLarga(r.fecha);
  }

  const titulo = r.titulo || (tipo === "f" ? "Fecha" : "Comunicado");
  const placaHref = "/?" + (tipo === "f" ? "f" : "c") + "=" + encodeURIComponent(r.id) + "&placa=1";

  return cabecera({ titulo, descripcion: recortar(desc, 200), url, imagen: foto, imagenAlt: titulo, publicado })
    + `<div class="origen">Página oficial en Fonte · no hace falta descargar nada</div>`
    + (vencidoTxt ? `<div class="vencido"><b>${tipo === "f" ? "Esta fecha ya pasó" : "Este aviso ya no está vigente"}</b><span>${esc(vencidoTxt)}</span></div>` : "")
    + `<article class="card post${vencidoTxt ? " apagado" : ""}"${color ? ` style="--inst:${color}"` : ""}>
  <div class="post-head">
    <div class="logo">${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : esc(sello)}</div>
    <div style="flex:1;min-width:0"><div class="inst">${esc(nombreInst)}</div><span class="seal"><i>✓</i>Cuenta oficial verificada</span></div>
  </div>
  <div class="body">${etiqueta}<h1>${esc(titulo)}</h1>${cuerpo}</div>
  <div class="verif"><div class="ic">✓</div>
    <div class="t"><b>Publicado por ${esc(nombreInst)} · verificado por Fonte.</b> Fonte comprobó que esta cuenta es de la institución y solo corrige errores de ortografía.${corr.nota}
      ${publicado ? `<div class="meta">Publicado ${esc(fechaHora(publicado))} (hora de Quitilipi)${esc(corr.meta)}</div>` : ""}</div>
  </div>
</article>
<div class="acts"><button class="btn ink" id="compartir" type="button">↗ Compartir</button><a class="btn line" href="${esc(placaHref)}">🖼 Bajar placa</a></div>`
    + listaHoy(items) + PIE
    + scriptCompartir({ titulo, texto: compartirTexto, url })
    + "</body></html>";
}

function enviar(res, status, html, cache){
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(html);
}

async function handler(req, res){
  let tipo = "c", id = "";
  try{
    const u = new URL(req.url, "http://x");
    tipo = u.searchParams.get("tipo") === "fecha" ? "f" : "c";
    id = String(u.searchParams.get("id") || "").trim();
  }catch(e){}
  try{
    if(!UUID.test(id)){
      return enviar(res, 404, paginaNoEsta(tipo, await hoyEnQuitilipi()), "public, s-maxage=60");
    }
    const r = tipo === "f" ? await fila("institucion_fechas", id, "&activa=eq.true") : await fila("comunicados", id);
    if(!r){
      return enviar(res, 404, paginaNoEsta(tipo, await hoyEnQuitilipi()), "public, s-maxage=30, stale-while-revalidate=60");
    }
    const [inst, items] = await Promise.all([
      r.institucion_id ? suave(fila("instituciones", r.institucion_id, "&activa=eq.true")) : Promise.resolve(null),
      hoyEnQuitilipi(tipo, id),
    ]);
    // cache corto: si la institución borra o corrige, se nota en un minuto
    return enviar(res, 200, paginaAviso({ tipo, r, inst, items }), "public, s-maxage=60, stale-while-revalidate=120");
  }catch(e){
    return enviar(res, 503, paginaError(), "no-store");
  }
}

module.exports = handler;
module.exports._interno = { fechaHora, fechaLarga, hoyIso };

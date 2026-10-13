// Fonte — service worker
// Muestra las notificaciones, abre la app cuando se tocan y guarda una copia
// en el celular para que Fonte abra rápido y funcione con mala señal.
const VERSION = "fonte-v2-2026-10-13";
const C_APP = VERSION + "-app";     // HTML, íconos, manifest, tipografías
const C_IMG = VERSION + "-img";     // fotos de las notas (máx. IMG_MAX)
const C_API = VERSION + "-api";     // respuestas de lectura de Supabase (respaldo sin señal)
const IMG_MAX = 60;
const API_MAX = 60;
const PUB_KEY = "sb_publishable_3YK9XChJ8YeJzlXymHXUeQ_TbCPQReT";

self.addEventListener("install", (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(C_APP).then(c=> c.addAll(["/"]).catch(()=>{})));
});
self.addEventListener("activate", (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=> !k.startsWith(VERSION)).map(k=> caches.delete(k)));
    await self.clients.claim();
  })());
});

async function recortar(nombre, max){
  const c = await caches.open(nombre);
  const ks = await c.keys();
  for(let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}
// Muestra lo guardado al toque y en paralelo trae lo nuevo para la próxima vez.
async function staleWhileRevalidate(req, nombre, ev){
  const c = await caches.open(nombre);
  const guardado = await c.match(req, { ignoreSearch: req.mode === "navigate" });
  const red = fetch(req).then(r=>{
    if(r && (r.ok || r.type === "opaque")) c.put(req, r.clone()).catch(()=>{});
    return r;
  }).catch(()=> null);
  if(guardado){ ev.waitUntil(red); return guardado; }
  const r = await red;
  return r || (req.mode === "navigate" ? (await c.match("/")) || Response.error() : Response.error());
}
async function cacheFirst(req){
  const c = await caches.open(C_IMG);
  const g = await c.match(req);
  if(g) return g;
  const r = await fetch(req);
  if(r && (r.ok || r.type === "opaque")){ c.put(req, r.clone()).then(()=> recortar(C_IMG, IMG_MAX)).catch(()=>{}); }
  return r;
}
async function networkFirst(req){
  const c = await caches.open(C_API);
  try{
    const r = await fetch(req);
    if(r && r.ok){ c.put(req, r.clone()).then(()=> recortar(C_API, API_MAX)).catch(()=>{}); }
    return r;
  }catch(e){
    const g = await c.match(req);
    if(g) return g;
    throw e;
  }
}

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  if(req.method !== "GET") return;                       // nunca POST/PATCH/DELETE
  let url; try{ url = new URL(req.url); }catch(e){ return; }
  if(url.protocol !== "https:" && url.protocol !== "http:") return;
  const ruta = url.pathname;
  // nada del reportero, del login ni de las funciones
  if(/reportero/i.test(ruta) || /reportero/i.test(req.referrer || "")) return;
  if(/\/(auth|functions|realtime)\/v1\//.test(ruta)) return;

  // Supabase: solo lecturas públicas (con la clave pública, no con sesión de usuario)
  if(/\.supabase\.co$/.test(url.hostname)){
    if(ruta.startsWith("/rest/v1/")){
      const a = req.headers.get("authorization") || "";
      if(a && a !== "Bearer " + PUB_KEY) return;
      event.respondWith(networkFirst(req));
      return;
    }
    if(ruta.startsWith("/storage/v1/object/public/") || ruta.startsWith("/storage/v1/render/image/public/")){
      event.respondWith(cacheFirst(req));
      return;
    }
    return;
  }
  // tipografías de Google
  if(url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    event.respondWith(staleWhileRevalidate(req, C_APP, event));
    return;
  }
  // fotos de otros sitios (las notas de medios)
  if(req.destination === "image" && url.origin !== self.location.origin){
    event.respondWith(cacheFirst(req));
    return;
  }
  // la app misma (HTML, manifest, íconos)
  if(url.origin === self.location.origin){
    if(ruta === "/sw.js") return;
    if(req.mode === "navigate" || req.destination === "image" || req.destination === "manifest" || /\.(png|ico|svg|webp|json)$/.test(ruta)){
      event.respondWith(staleWhileRevalidate(req, C_APP, event));
    }
  }
});


// Notificación disparada desde la app
self.addEventListener("message", (event)=>{
  const d = event.data || {};
  if(d.type === "mostrar-notificacion"){
    self.registration.showNotification(d.titulo || "Fonte", {
      body: d.cuerpo || "",
      icon: "/webappmanifest192x192.png",
      badge: "/favicon96x96.png",
      tag: d.tag || "fonte-aviso",
      renotify: false,
      data: { url: d.url || "/" }
    });
  }
});

// Soporte para push real (si más adelante se agrega un servidor de envío)
self.addEventListener("push", (event)=>{
  let d = {};
  try{ d = event.data ? event.data.json() : {}; }catch(e){ d = { titulo:"Fonte", cuerpo: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(d.titulo || "Fonte", {
      body: d.cuerpo || "",
      icon: "/webappmanifest192x192.png",
      badge: "/favicon96x96.png",
      tag: d.tag || "fonte-push",
      data: { url: d.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event)=>{
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type:"window", includeUncontrolled:true }).then(list=>{
      for(const c of list){ if("focus" in c) return c.focus(); }
      if(self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

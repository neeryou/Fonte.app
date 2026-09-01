// Fonte — service worker
// Se encarga de mostrar las notificaciones y de abrir la app cuando se tocan.

self.addEventListener("install", (e)=>{ self.skipWaiting(); });
self.addEventListener("activate", (e)=>{ e.waitUntil(self.clients.claim()); });

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

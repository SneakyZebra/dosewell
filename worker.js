const cacheName='dosewell-app-19';
const shell=['./','./index.html','./styles.css','./app.js','./iphone-setup.js','./native-alarms.js','./mobile-apps.html','./mobile-apps.js','./dose-log.js','./schedule.js',
  './store.js','./view.js','./icons.js','./rules.js','./rxterms.js','./name-index.js','./rxname-data.js','./ddinter.js','./ddinter-data.js','./interaction-checker.js','./drugbank-checker.js','./form.js','./exports.js',
  './phone-alarms.js','./android-clock.js','./clock-bridge.js','./clock-install.html','./reminder-transfer.js','./receive.html','./receive.js','./label-reader.js','./scan.js','./icon.svg','./inter.woff2',
  './move.html','./move.js','./plan-backup.js','./app.webmanifest','./app-192.png','./app-512.png'];
const known=new Set(shell.map(path=>new URL(path,self.registration.scope).href));
const ocrFiles=new Set(['tesseract.esm.min.js','worker.min.js','eng.traineddata.gz',
  'tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js']
  .map(file=>new URL('./ocr/'+file,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const cache=await caches.open(cacheName);await cache.addAll(shell);await self.skipWaiting()})());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys())if(name.startsWith('dosewell-app-')&&name!==cacheName)await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||(!known.has(request.url)&&!ocrFiles.has(request.url)))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(cacheName).then(cache=>cache.put(request,copy)).catch(()=>{}));
      }
      return response;
    }catch(error){
      const stored=await caches.match(request,{cacheName});
      if(stored)return stored;
      throw error;
    }
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const tab=tabs.find(t=>t.url.startsWith(self.registration.scope));
    if(tab){await tab.focus();tab.postMessage({view:'overview'});return}
    await self.clients.openWindow('./#overview');
  })());
});

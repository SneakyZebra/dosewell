// The private signing key stays in this browser. The companion remembers its
// public half only after the user approves the first alarm on the phone.
const keySpec = {name: 'ECDSA', namedCurve: 'P-256'};
const utf8 = new TextEncoder();
let currentIdentity;

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

async function openKeys() {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open('dosewell-clock-pairing',1);
    request.onupgradeneeded = ()=>request.result.createObjectStore('keys');
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  });
}

async function browserIdentity() {
  const db = await openKeys();
  try {
    // Generate outside the transaction. Concurrent first-time tabs then read
    // and conditionally store in serialized read/write transactions.
    const candidate = await crypto.subtle.generateKey(keySpec,false,['sign','verify']);
    const pair = await new Promise((resolve,reject)=>{
      const tx = db.transaction('keys','readwrite');
      const store = tx.objectStore('keys');
      const read = store.get('browser');
      let selected;
      read.onsuccess = ()=>{
        selected = read.result || candidate;
        if (!read.result) store.put(selected,'browser');
      };
      tx.oncomplete = ()=>resolve(selected);
      tx.onabort = ()=>reject(tx.error);
    });
    const spki = await crypto.subtle.exportKey('spki',pair.publicKey);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',spki));
    const code = Array.from(hash.slice(0,4),byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
    return {privateKey:pair.privateKey, pub:base64url(spki), code:code.slice(0,4)+' '+code.slice(4)};
  } finally { db.close(); }
}

export function clockIdentity() {
  if (!currentIdentity) currentIdentity = browserIdentity().catch(error=>{currentIdentity=null;throw error;});
  return currentIdentity;
}

export async function clockLink(identity, item, now=Date.now()) {
  const {entry,repeat} = item;
  const days = repeat ? entry.days.reduce((bits,d)=>bits | (1<<d),0) : 0;
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const data = {v:1,issued:now,nonce,at:entry.at.getTime(),hour:entry.at.getHours(),
    minute:entry.at.getMinutes(),days,label:'Dosewell · '+entry.label};
  const body = base64url(utf8.encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,utf8.encode(body));
  const fallback = encodeURIComponent(new URL('clock-install.html',document.baseURI).href);
  return 'intent://alarm/set?p='+body+'&s='+base64url(signature)+'&k='+identity.pub+
    '#Intent;scheme=dosewellclock;package=org.williamsindustries.dosewellclock;S.browser_fallback_url='+fallback+';end';
}

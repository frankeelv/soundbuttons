const DB_NAME = 'soundbuttons-db';
const DB_VER = 1;
const STORE = 'pads';

const DEFAULT_PADS = Array.from({length:10}, (_,i)=>({
  id: i+1,
  label: `Botón ${i+1}`,
  hasAudio: false
}));

let pads = [];
let currentId = null;
let deferredPrompt = null;

const listEl = document.getElementById('list');
const dlg = document.getElementById('dlg');
const inpLabel = document.getElementById('inpLabel');
const inpFile = document.getElementById('inpFile');
const btnSave = document.getElementById('btnSave');
const btnClearAudio = document.getElementById('btnClearAudio');
const fileInfo = document.getElementById('fileInfo');
const btnInstall = document.getElementById('btnInstall');

const audio = new Audio();
audio.preload = 'auto';

function regSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.hidden = false;
});
btnInstall.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.hidden = true;
});

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE)){
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

async function idbGetAll(){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = ()=> resolve(req.result || []);
    req.onerror = ()=> reject(req.error);
  });
}

async function idbPut(obj){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
    tx.objectStore(STORE).put(obj);
  });
}

async function idbGet(id){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error);
  });
}

function basenameNoExt(name){
  const n = (name || '').split('/').pop() || '';
  return n.replace(/\.[^/.]+$/, '');
}

function render(){
  listEl.innerHTML = '';
  for(const p of pads){
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'labelCol';

    const nm = document.createElement('div');
    nm.className = 'name';
    nm.textContent = p.label;

    const mt = document.createElement('div');
    mt.className = 'meta';
    mt.textContent = p.hasAudio ? 'Audio asignado' : 'Sin audio';

    left.appendChild(nm);
    left.appendChild(mt);

    const play = document.createElement('button');
    play.className = 'btn primary';
    play.textContent = 'Reproducir';
    play.addEventListener('click', ()=> playPad(p.id));

    const edit = document.createElement('button');
    edit.className = 'btn';
    edit.textContent = 'Editar';
    edit.addEventListener('click', ()=> openEditor(p.id));

    row.appendChild(left);
    row.appendChild(play);
    row.appendChild(edit);
    listEl.appendChild(row);
  }
}

async function load(){
  const all = await idbGetAll();
  if(all.length === 0){
    pads = DEFAULT_PADS.map(p=>({...p}));
    for(const p of pads){
      await idbPut({ id: p.id, label: p.label, audioBlob: null, fileName: null, mime: null });
    }
  } else {
    pads = DEFAULT_PADS.map(def=>{
      const found = all.find(x=>x.id===def.id);
      return {
        id: def.id,
        label: (found?.label) || def.label,
        hasAudio: !!found?.audioBlob
      };
    });
  }
  render();
}

async function playPad(id){
  const rec = await idbGet(id);
  if(!rec || !rec.audioBlob){
    toast('Este botón no tiene audio.');
    return;
  }
  const url = URL.createObjectURL(rec.audioBlob);
  try{
    audio.pause();
    audio.currentTime = 0;
    audio.src = url;
    await audio.play();
  } catch(e){
    toast('No se pudo reproducir el audio.');
  } finally {
    setTimeout(()=> URL.revokeObjectURL(url), 60000);
  }
}

function openEditor(id){
  currentId = id;
  inpFile.value = '';
  fileInfo.textContent = '';
  idbGet(id).then(rec=>{
    inpLabel.value = rec?.label || `Botón ${id}`;
    fileInfo.textContent = rec?.fileName ? `Audio actual: ${rec.fileName}` : (rec?.audioBlob ? 'Audio asignado' : 'Sin audio');
    dlg.showModal();
  });
}

btnClearAudio.addEventListener('click', async ()=>{
  if(currentId == null) return;
  const rec = await idbGet(currentId);
  if(!rec) return;
  rec.audioBlob = null;
  rec.fileName = null;
  rec.mime = null;
  await idbPut(rec);

  const idx = pads.findIndex(p=>p.id===currentId);
  if(idx>=0) pads[idx].hasAudio = false;
  fileInfo.textContent = 'Sin audio';
  render();
  toast('Audio eliminado.');
});

btnSave.addEventListener('click', async ()=>{
  if(currentId == null) return;

  const rec = await idbGet(currentId) || {id: currentId, label:'', audioBlob:null, fileName:null, mime:null};
  const typedLabel = (inpLabel.value || '').trim();

  const f = (inpFile.files && inpFile.files[0]) ? inpFile.files[0] : null;

  if(f){
    rec.audioBlob = f;
    rec.fileName = f.name;
    rec.mime = f.type || 'audio/*';

    // If user did NOT type a custom label, auto-use filename (no extension)
    rec.label = typedLabel ? typedLabel : (basenameNoExt(f.name) || rec.label || `Botón ${currentId}`);
  } else {
    // No new file; just update label if typed
    if(typedLabel) rec.label = typedLabel;
  }

  await idbPut(rec);

  const idx = pads.findIndex(p=>p.id===currentId);
  if(idx>=0){
    pads[idx].label = rec.label || pads[idx].label;
    pads[idx].hasAudio = !!rec.audioBlob;
  }
  render();
  toast('Guardado.');
});

function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.position='fixed';
  t.style.left='50%';
  t.style.bottom='18px';
  t.style.transform='translateX(-50%)';
  t.style.padding='10px 14px';
  t.style.border='1px solid rgba(255,255,255,.18)';
  t.style.borderRadius='14px';
  t.style.background='rgba(18,26,51,.95)';
  t.style.color='#e8ecff';
  t.style.zIndex='9999';
  t.style.boxShadow='0 14px 40px rgba(0,0,0,.35)';
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .25s'; }, 1200);
  setTimeout(()=> t.remove(), 1500);
}

regSW();
load();

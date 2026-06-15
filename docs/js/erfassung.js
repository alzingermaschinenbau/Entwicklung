document.getElementById('logo').innerHTML = ALZINGER_LOGO;
document.getElementById('appVer').textContent = APP_VERSION;
document.getElementById('footVer').textContent = APP_VERSION;

let projekte = [];
let kacheln = [];
let entwickler = [];
let currentProjekt = null;
let pendingStart = null;

document.querySelectorAll('.nav .pill[data-page]').forEach((p) => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.nav .pill').forEach((x) => x.classList.remove('active'));
    p.classList.add('active');
    document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
    document.getElementById('page-' + p.dataset.page).classList.add('active');
  });
});

async function boot() {
  await DB.init();
  const session = DB.session();
  if (!session) { window.location.href = 'index.html'; return; }
  document.getElementById('who').textContent = session.name;
  showSyncBadge();

  [projekte, kacheln, entwickler] = await Promise.all([
    DB.projekte(), DB.kacheln(), DB.entwickler(),
  ]);
  currentProjekt = projekte.length ? projekte[0].id : null;
  renderProjektTabs();
  await renderGrid();
  setInterval(renderGrid, 5000); // Geraete-Sync: regelmaessig nachladen
  setInterval(tick, 1000);
}

function showSyncBadge() {
  if (DB.isSync()) return;
  const who = document.getElementById('who');
  who.innerHTML = who.textContent + ' <span class="tag muted" style="margin-left:6px">Lokaler Modus</span>';
}

function renderProjektTabs() {
  const el = document.getElementById('projektTabs');
  el.innerHTML = projekte
    .map((m) => `<button class="mtab ${m.id === currentProjekt ? 'active' : ''}" data-id="${m.id}">${esc(m.name)}</button>`)
    .join('');
  el.querySelectorAll('.mtab').forEach((b) =>
    b.addEventListener('click', async () => {
      currentProjekt = Number(b.dataset.id);
      renderProjektTabs();
      await renderGrid();
    })
  );
}

let _active = [];

// Kacheln für ein Projekt: hat das Projekt eigene Kacheln (projekt_id gesetzt),
// werden NUR diese gezeigt; sonst die allgemeinen Kacheln (ohne projekt_id).
function kachelnForProjekt(pid) {
  const own = kacheln.filter((b) => Number(b.projekt_id) === Number(pid));
  return own.length ? own : kacheln.filter((b) => !b.projekt_id);
}

async function renderGrid() {
  const grid = document.getElementById('kachelGrid');
  if (!currentProjekt) { grid.innerHTML = '<div class="empty">Keine Projekte angelegt. Bitte im Cockpit anlegen.</div>'; return; }
  // ALLE offenen Einträge laden (über alle Projekte), damit parallele Buchungen
  // korrekt anteilig gezählt werden; für die Anzeige nach Projekt filtern.
  _active = await DB.activeEntries();
  const list = kachelnForProjekt(currentProjekt);
  if (!list.length) { grid.innerHTML = '<div class="empty">Für dieses Projekt sind noch keine Kacheln angelegt.</div>'; return; }
  grid.innerHTML = list
    .map((b) => {
      const running = _active.filter((a) => a.kachel_id === b.id);
      const workers = running
        .map((r) => `<div class="worker-row">
             <span class="wname">${esc(r.entwickler_name)}${r.parallel > 1 ? ` <span class="tag muted">÷${r.parallel}</span>` : ''}</span>
             <span class="flex">
               <span class="wtime timer" data-id="${r.id}">${fmtDuration(r.split_ms || 0)}</span>
               <button class="btn stop sm" onclick="stopEntry(${r.id})">Beenden</button>
             </span>
           </div>`)
        .join('');
      const actionBtn = `<button class="btn green full" onclick="openStart(${b.id})">＋ Starten</button>`;
      return `<div class="bg-card ${running.length ? 'running' : ''}">
        ${b.artikelnummer ? `<div class="art" style="font-size:12.5px;font-weight:600">${esc(b.artikelnummer)}</div>` : ''}
        <div class="bg-name">${esc(b.name)}</div>
        <div class="workers">${workers}</div>
        <div class="bg-status">${running.length ? '' : 'Bereit'}</div>
        ${actionBtn}
      </div>`;
    })
    .join('');
  tick();
}

function tick() {
  const split = computeSplit(_active, Date.now());
  document.querySelectorAll('.timer[data-id]').forEach((el) => {
    el.textContent = fmtDuration(split[Number(el.dataset.id)] || 0);
  });
}

function openStart(kachelId) {
  if (!entwickler.length) return toast('Bitte zuerst Entwickler im Cockpit anlegen');
  pendingStart = { projekt_id: currentProjekt, kachel_id: kachelId };
  const projekt = projekte.find((m) => m.id === currentProjekt);
  const k = kacheln.find((b) => b.id === kachelId);
  document.getElementById('startTitle').textContent = `${projekt.name} · ${kachelLabel(k.artikelnummer, k.name)}`;
  const sel = document.getElementById('startEntwickler');
  sel.innerHTML = '<option value="">Entwickler wählen…</option>' +
    entwickler.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  document.getElementById('startModal').classList.add('open');
}
function closeStart() {
  document.getElementById('startModal').classList.remove('open');
  pendingStart = null;
}
async function confirmStart() {
  const entwickler_id = Number(document.getElementById('startEntwickler').value);
  if (!entwickler_id) return toast('Bitte Entwickler wählen');
  try {
    await DB.startEntry(entwickler_id, pendingStart.projekt_id, pendingStart.kachel_id);
    closeStart();
    await renderGrid();
    toast('Arbeit gestartet');
  } catch (e) { toast(e.message); }
}
async function stopEntry(id) {
  await DB.stopEntry(id);
  await renderGrid();
  toast('Arbeit beendet');
}

// Änderungswunsch absenden (wird in den Settings als Liste gespeichert).
async function sendFeedback() {
  const text = (document.getElementById('fbText').value || '').trim();
  if (!text) return toast('Bitte einen Änderungswunsch schreiben');
  const author = (document.getElementById('fbName').value || '').trim();
  try {
    let list = [];
    try { list = JSON.parse((await DB.getSetting('feedback')) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list.push({ text, author, ts: Date.now() });
    await DB.setSetting('feedback', JSON.stringify(list));
    document.getElementById('fbText').value = '';
    toast('Danke! Änderungswunsch gesendet.');
  } catch (e) {
    toast('Konnte nicht gesendet werden');
  }
}

boot();

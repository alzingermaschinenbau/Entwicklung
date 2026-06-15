let projekteCache = [], kachelnCache = [], entwicklerCache = [];
let editingEntryId = null;
let projektHours = {};
let _overviewActive = []; // aktuell laufende Einträge (für anteilige Live-Timer)

document.querySelectorAll('.nav .pill[data-page]').forEach((p) => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.nav .pill').forEach((x) => x.classList.remove('active'));
    p.classList.add('active');
    document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
    document.getElementById('page-' + p.dataset.page).classList.add('active');
    onPage(p.dataset.page);
  });
});
function onPage(name) {
  if (name === 'overview') loadOverview();
  if (name === 'report') loadReport();
  if (name === 'entries') loadEntries();
  if (name === 'entwickler') loadEntwickler();
  if (name === 'master') loadMaster();
  if (name === 'feedback') loadFeedback();
}

async function boot() {
  await DB.init();
  const session = DB.session();
  if (!session) { window.location.href = 'index.html'; return; }
  document.getElementById('logo').innerHTML = ALZINGER_LOGO;
  document.getElementById('appVer').textContent = APP_VERSION;
  document.getElementById('footVer').textContent = APP_VERSION;
  document.getElementById('who').textContent = session.name;
  document.getElementById('firstName').textContent = session.name.split(' ')[0];
  showSyncBadge();

  [projekteCache, kachelnCache, entwicklerCache] = await Promise.all([
    DB.projekte(true), DB.kacheln(true), DB.entwickler(true),
  ]);
  fillSelects();
  setupDataSection();
  loadOverview();
  setInterval(() => {
    if (document.getElementById('page-overview').classList.contains('active')) loadOverview();
  }, 10000);
  setInterval(tickTimers, 1000);
}

function showSyncBadge() {
  if (DB.isSync()) return;
  const who = document.getElementById('who');
  who.innerHTML = who.textContent + ' <span class="tag muted" style="margin-left:6px">Lokaler Modus</span>';
}

function activeList(arr) { return arr.filter((x) => x.active); }
function fillSelects() {
  const prjOpts = '<option value="">Alle</option>' +
    activeList(projekteCache).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const empOpts = '<option value="">Alle</option>' +
    activeList(entwicklerCache).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  ['rProjekt', 'eProjekt'].forEach((id) => (document.getElementById(id).innerHTML = prjOpts));
  document.getElementById('eEntwickler').innerHTML = empOpts;
}

// ---------- Übersicht ----------
async function loadOverview() {
  const [stats, active] = await Promise.all([DB.stats(), DB.activeEntries()]);
  _overviewActive = active;
  document.getElementById('stats').innerHTML = `
    <div class="stat green"><div class="num">${stats.running}</div><div class="lbl">In Arbeit</div></div>
    <div class="stat"><div class="num">${stats.entwickler}</div><div class="lbl">Entwickler</div></div>
    <div class="stat blue"><div class="num">${stats.projekte}</div><div class="lbl">Projekte</div></div>
    <div class="stat purple"><div class="num">${stats.kacheln}</div><div class="lbl">Kacheln</div></div>`;
  const el = document.getElementById('liveList');
  if (!active.length) {
    el.innerHTML = '<div class="empty">Aktuell wird nichts bearbeitet.</div>';
  } else {
    el.innerHTML = active.map((a) => {
      const lang = netDuration(a.start_ts, Date.now()) >= LANGLAEUFER_MS; // echte Laufzeit (Langläufer)
      const par = a.parallel > 1 ? ` <span class="tag muted">geteilt ÷${a.parallel}</span>` : '';
      return `<div class="list-item${lang ? ' warn' : ''}">
      <div>
        <div style="font-weight:600">${esc(a.projekt_name)} · ${esc(kachelLabel(a.kachel_artikelnummer, a.kachel_name))}</div>
        <div class="muted" style="font-size:12px">${esc(a.entwickler_name)} · seit ${fmtDateTime(a.start_ts)}${par}${lang ? ' · <span class="tag warn">⚠ läuft sehr lange – vergessen?</span>' : ''}</div>
      </div>
      <div class="flex">
        <span class="tag ${lang ? 'warn' : 'live'} timer" data-id="${a.id}">${fmtDuration(a.split_ms || 0)}</span>
        <button class="btn stop sm" onclick="stopActive(${a.id})">Beenden</button>
      </div>
    </div>`;
    }).join('');
  }
  tickTimers();
}
async function stopActive(id) {
  await DB.stopEntry(id);
  toast('Arbeit beendet');
  loadOverview();
}
function tickTimers() {
  const split = computeSplit(_overviewActive, Date.now());
  document.querySelectorAll('.timer[data-id]').forEach((el) => {
    el.textContent = fmtDuration(split[Number(el.dataset.id)] || 0);
  });
}

// ---------- Auswertung ----------
function rangeFilter(fromId, toId, projektId) {
  const f = {};
  const from = document.getElementById(fromId).value;
  const to = document.getElementById(toId).value;
  if (from) f.from = new Date(from + 'T00:00:00').getTime();
  if (to) f.to = new Date(to + 'T23:59:59').getTime();
  if (projektId) { const m = document.getElementById(projektId).value; if (m) f.projekt_id = Number(m); }
  return f;
}

async function loadReport() {
  const filter = rangeFilter('rFrom', 'rTo', 'rProjekt');
  const [data, rows] = await Promise.all([DB.report(filter), DB.entries(filter)]);
  document.getElementById('reportTotals').innerHTML = `
    <div class="stat red"><div class="num">${fmtHours(data.totals.total_ms || 0)}</div><div class="lbl">Gesamtzeit</div></div>
    <div class="stat"><div class="num">${data.totals.entries || 0}</div><div class="lbl">Buchungen</div></div>
    <div class="stat green"><div class="num">${data.totals.running || 0}</div><div class="lbl">Laufend</div></div>`;

  const kEl = document.getElementById('reportKachel');
  const maxK = Math.max(1, ...data.byKachel.map((b) => b.total_ms));
  if (!data.byKachel.length) {
    kEl.innerHTML = '<div class="empty">Keine Daten im Zeitraum.</div>';
  } else {
    const byKEmp = {};
    data.breakdown.forEach((r) => { (byKEmp[r.kachel_id] = byKEmp[r.kachel_id] || []).push(r); });
    kEl.innerHTML = `<table><thead><tr><th>Kachel</th><th>Entwickler</th><th style="width:30%">Dauer</th><th>Zeit</th></tr></thead><tbody>` +
      data.byKachel.map((b) => {
        const people = (byKEmp[b.kachel_id] || []).map((p) => `${esc(p.entwickler_name)} (${fmtHours(p.total_ms)})`).join(', ');
        const pct = Math.round((b.total_ms / maxK) * 100);
        return `<tr>
          <td style="font-weight:600">${esc(kachelLabel(b.kachel_artikelnummer, b.kachel_name))} ${b.running ? '<span class="tag live">läuft</span>' : ''}</td>
          <td class="muted" style="font-size:13px">${people || '–'}</td>
          <td><div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div></td>
          <td style="font-weight:600;white-space:nowrap">${fmtHours(b.total_ms)}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
  }

  const empEl = document.getElementById('reportEntwickler');
  const maxEmp = Math.max(1, ...data.byEntwickler.map((e) => e.total_ms));
  if (!data.byEntwickler.length) {
    empEl.innerHTML = '<div class="empty">Keine Daten im Zeitraum.</div>';
  } else {
    empEl.innerHTML = `<table><thead><tr><th>Entwickler</th><th style="width:40%">Anteil</th><th>Buchungen</th><th>Zeit</th></tr></thead><tbody>` +
      data.byEntwickler.map((e) => {
        const pct = Math.round((e.total_ms / maxEmp) * 100);
        return `<tr>
          <td style="font-weight:600">${esc(e.entwickler_name)}</td>
          <td><div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div></td>
          <td>${e.entries}</td>
          <td style="font-weight:600;white-space:nowrap">${fmtHours(e.total_ms)}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
  }

  renderByProjekt(rows);
  renderHours(rows);
  renderHolidays(filter);
}

function printReport() {
  const f = document.getElementById('rFrom').value;
  const t = document.getElementById('rTo').value;
  const de = (s) => s ? s.split('-').reverse().join('.') : '…';
  const range = (f || t) ? `Zeitraum: ${de(f)} – ${de(t)}` : 'Gesamter Zeitraum';
  const logoUrl = new URL('assets/alzinger-logo.png', location.href).href;
  document.querySelector('.print-head').innerHTML =
    `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;border-bottom:2px solid #d1071a;padding-bottom:10px">
       <div>
         <div style="font-weight:800;font-size:21px">Entwicklung – Auswertung</div>
         <div class="muted" style="font-size:13px;margin-top:3px">${range} · erstellt ${new Date().toLocaleDateString('de-DE')}</div>
       </div>
       <img src="${logoUrl}" alt="ALZINGER" style="height:34px;display:block">
     </div>`;
  window.print();
}

// Bayerische Feiertage im gewählten Zeitraum (sonst laufendes Jahr).
function renderHolidays(filter) {
  const el = document.getElementById('reportHolidays');
  const now = new Date();
  const from = filter.from ? new Date(filter.from) : new Date(now.getFullYear(), 0, 1);
  const to = filter.to ? new Date(filter.to) : new Date(now.getFullYear(), 11, 31);
  const items = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    const map = bavarianHolidays(y);
    for (const key in map) {
      const [yy, mm, dd] = key.split('-').map(Number);
      const dt = new Date(yy, mm, dd);
      if (dt >= from && dt <= to) items.push({ dt, name: map[key] });
    }
  }
  items.sort((a, b) => a.dt - b.dt);
  if (!items.length) { el.innerHTML = '<div class="card"><div class="empty">Keine Feiertage im Zeitraum.</div></div>'; return; }
  el.innerHTML = `<div class="card"><table><thead><tr>
      <th>Datum</th><th>Tag</th><th>Feiertag</th>
    </tr></thead><tbody>${items.map((h) => `<tr>
      <td style="white-space:nowrap">${fmtDate(h.dt.getTime())}</td>
      <td>${WEEKDAYS_DE[h.dt.getDay()]}</td>
      <td style="font-weight:600">${esc(h.name)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// Stunden je Entwickler und Tag: Gestempelt (Ist, netto) vs. Soll-Arbeitszeit.
function renderHours(rows) {
  const el = document.getElementById('reportHours');
  const emps = {};
  for (const e of rows) {
    const start = new Date(e.start_ts);
    const ymd = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
    const ist = e.split_ms || 0;
    const emp = (emps[e.entwickler_id] = emps[e.entwickler_id] || { name: e.entwickler_name, days: {} });
    emp.days[ymd] = (emp.days[ymd] || { ist: 0, date: start });
    emp.days[ymd].ist += ist;
  }
  const list = Object.values(emps).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (!list.length) { el.innerHTML = '<div class="card"><div class="empty">Keine Daten im Zeitraum.</div></div>'; return; }

  el.innerHTML = list.map((emp) => {
    const days = Object.values(emp.days).sort((a, b) => a.date - b.date);
    let sumIst = 0, sumSoll = 0;
    const rowsHtml = days.map((d) => {
      const soll = sollNetMs(d.date);
      const diff = d.ist - soll;
      sumIst += d.ist; sumSoll += soll;
      const cls = diff < -60000 ? 'neg' : (diff > 60000 ? 'pos' : '');
      const hol = holidayName(d.date);
      return `<tr>
        <td style="white-space:nowrap">${fmtDate(d.date.getTime())}</td>
        <td>${WEEKDAYS_DE[d.date.getDay()]}${hol ? ` <span class="tag muted">${esc(hol)}</span>` : ''}</td>
        <td style="text-align:right">${fmtHM(soll)}</td>
        <td style="text-align:right;font-weight:600">${fmtHM(d.ist)}</td>
        <td style="text-align:right" class="diff ${cls}">${fmtHM(diff)}</td>
      </tr>`;
    }).join('');
    const dsum = sumIst - sumSoll;
    const scls = dsum < -60000 ? 'neg' : (dsum > 60000 ? 'pos' : '');
    return `<div class="card" style="margin-bottom:14px">
      <div class="chart-head">
        <span class="chart-machine">${esc(emp.name)}</span>
        <span class="muted" style="font-size:13px">Summe: ${fmtHM(sumIst)} / Soll ${fmtHM(sumSoll)} · <span class="diff ${scls}">${fmtHM(dsum)}</span></span>
      </div>
      <table><thead><tr>
        <th>Datum</th><th>Tag</th><th style="text-align:right">Soll</th><th style="text-align:right">Gestempelt</th><th style="text-align:right">Differenz</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
    </div>`;
  }).join('');
}

// Diagramm: je Projekt ein Balkendiagramm der Kacheln (netto, ohne Pausen)
function renderByProjekt(rows) {
  const el = document.getElementById('reportByProjekt');
  const byProjekt = {};
  for (const r of rows) {
    const ms = r.split_ms || 0;
    const m = (byProjekt[r.projekt_id] = byProjekt[r.projekt_id] ||
      { name: r.projekt_name, kachel: {}, emp: {}, entries: [] });
    m.kachel[r.kachel_id] = m.kachel[r.kachel_id] ||
      { label: kachelLabel(r.kachel_artikelnummer, r.kachel_name), ms: 0, running: 0 };
    m.kachel[r.kachel_id].ms += ms;
    if (!r.end_ts) m.kachel[r.kachel_id].running++;
    m.emp[r.entwickler_id] = m.emp[r.entwickler_id] || { name: r.entwickler_name, ms: 0, count: 0 };
    m.emp[r.entwickler_id].ms += ms;
    m.emp[r.entwickler_id].count++;
    m.entries.push({
      entwickler_name: r.entwickler_name, kachel_label: kachelLabel(r.kachel_artikelnummer, r.kachel_name),
      start_ts: r.start_ts, end_ts: r.end_ts, ms, running: !r.end_ts,
    });
  }
  // Projekte in der Reihenfolge der Stammdaten
  const order = projekteCache.map((m) => m.id).filter((id) => byProjekt[id]);
  if (!order.length) {
    el.innerHTML = '<div class="card"><div class="empty">Keine Daten im Zeitraum.</div></div>';
    return;
  }
  projektHours = {};
  el.innerHTML = order.map((pid) => {
    const m = byProjekt[pid];
    const list = Object.values(m.kachel).sort((a, b) => b.ms - a.ms);
    const max = Math.max(1, ...list.map((x) => x.ms));
    const total = list.reduce((s, x) => s + x.ms, 0);
    const byEmp = Object.values(m.emp).sort((a, b) => b.ms - a.ms);
    const entries = m.entries.slice().sort((a, b) => a.start_ts - b.start_ts);
    projektHours[pid] = { name: m.name, list, total, byEmp, entries };
    const bars = list.map((x) => {
      const pct = Math.round((x.ms / max) * 100);
      return `<div class="chart-row">
        <div class="chart-label">${esc(x.label)} ${x.running ? '<span class="tag live">läuft</span>' : ''}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${pct}%"></div></div>
        <div class="chart-val">${fmtHours(x.ms)}</div>
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:14px">
      <div class="chart-head">
        <span class="chart-machine">${esc(m.name)}</span>
        <span class="flex" style="gap:10px">
          <span class="muted" style="font-size:13px">Gesamt ${fmtHours(total)}</span>
          <button class="btn gray sm no-print" onclick="toggleProjektDetail(${pid})">👁 Details</button>
          <button class="btn gray sm no-print" onclick="printProjektHours(${pid})">🖨 PDF</button>
        </span>
      </div>
      ${bars}
      <div id="pdetail-${pid}" class="mdetail" style="display:none">${projektDetailHtml(pid)}</div>
    </div>`;
  }).join('');
}

// Detail je Projekt: Summe je Entwickler + einzelne Buchungen (wer/wann/wieviel)
function projektDetailHtml(pid) {
  const m = projektHours[pid];
  if (!m) return '';
  const emp = m.byEmp.map((e) =>
    `<tr><td>${esc(e.name)}</td><td style="text-align:right">${e.count}</td><td style="text-align:right;font-weight:600">${fmtHM(e.ms)}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="muted">Keine Daten</td></tr>';
  const rows = m.entries.map((x) =>
    `<tr>
      <td>${esc(x.entwickler_name)}</td>
      <td>${esc(x.kachel_label)}</td>
      <td>${fmtDateTime(x.start_ts)}</td>
      <td>${x.running ? '<span class="tag live">läuft</span>' : fmtDateTime(x.end_ts)}</td>
      <td style="text-align:right;font-weight:600">${fmtHM(x.ms)}</td>
    </tr>`
  ).join('') || '<tr><td colspan="5" class="muted">Keine Buchungen im Zeitraum</td></tr>';
  return `
    <div class="section-title" style="margin-top:14px">Zeit je Entwickler</div>
    <table><thead><tr><th>Entwickler</th><th style="text-align:right">Buchungen</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${emp}</tbody></table>
    <div class="section-title" style="margin-top:14px">Einzelbuchungen (wer · wann · wieviel)</div>
    <table><thead><tr><th>Entwickler</th><th>Kachel</th><th>Beginn</th><th>Ende</th><th style="text-align:right">Dauer</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
}

function toggleProjektDetail(pid) {
  const d = document.getElementById('pdetail-' + pid);
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

// Einzelnes Projekt drucken: Arbeitszeit je Kachel + Gesamt.
// Robust gegen iOS: Inhalt wird in ein EIGENES Druck-Dokument geschrieben, das
// ausschließlich dieses eine Projekt enthält – so kann nie die ganze Seite
// (alle Projekte) mitgedruckt werden.
function printProjektHours(pid) {
  const m = projektHours[pid];
  if (!m) return;
  const f = document.getElementById('rFrom').value, t = document.getElementById('rTo').value;
  const de = (s) => s ? s.split('-').reverse().join('.') : '…';
  const range = (f || t) ? `Zeitraum: ${de(f)} – ${de(t)}` : 'Gesamter Zeitraum';
  const max = Math.max(1, ...m.list.map((x) => x.ms));
  const rows = m.list.map((x) => {
    const pct = Math.round((x.ms / max) * 100);
    return `<div class="row">
      <div class="label">${esc(x.label)}${x.running ? ' <span class="lauf">läuft</span>' : ''}</div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <div class="val">${fmtHours(x.ms)}</div>
    </div>`;
  }).join('') || '<div class="empty">Keine Zeiten im Zeitraum.</div>';
  const empRows = m.byEmp.map((e) =>
    `<tr><td>${esc(e.name)}</td><td class="r">${e.count}</td><td class="r b">${fmtHM(e.ms)}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="mut">Keine Daten</td></tr>';
  const entryRows = m.entries.map((x) =>
    `<tr><td>${esc(x.entwickler_name)}</td><td>${esc(x.kachel_label)}</td><td>${fmtDateTime(x.start_ts)}</td><td>${x.running ? 'läuft' : fmtDateTime(x.end_ts)}</td><td class="r b">${fmtHM(x.ms)}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="mut">Keine Buchungen im Zeitraum</td></tr>';
  const logoUrl = new URL('assets/alzinger-logo-white.png', location.href).href;
  const erstellt = new Date().toLocaleDateString('de-DE');
  const anzEntw = m.byEmp.length;
  const anzBuch = m.entries.length;
  const doc = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(m.name)} – Arbeitszeit · ALZINGER</title>
    <style>
      *{box-sizing:border-box;}
      html,body{margin:0;padding:0;}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1c1d21;background:#fff;-webkit-font-smoothing:antialiased;}
      .brandbar{background:#d1071a;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 26px;}
      .brandbar img{height:34px;display:block;}
      .brandbar .tag{font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.92;font-weight:600;}
      .sheet{max-width:900px;margin:0 auto;padding:8mm 16mm 16mm;}
      .hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;border-bottom:2px solid #d1071a;padding:22px 0 14px;margin-bottom:18px;}
      .hd h1{font-size:23px;margin:0;font-weight:800;}
      .hd .sub{color:#6b7280;font-size:13px;margin-top:5px;}
      .stats{display:flex;gap:12px;margin-bottom:22px;}
      .stat{flex:1;border:1px solid #e6e7eb;border-radius:12px;padding:12px 14px;}
      .stat .n{font-size:21px;font-weight:800;}
      .stat.red .n{color:#d1071a;}
      .stat .l{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-top:2px;}
      h2{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin:24px 0 10px;}
      .card{border:1px solid #e6e7eb;border-radius:12px;padding:16px;}
      .row{display:grid;grid-template-columns:210px 1fr auto;align-items:center;gap:12px;padding:6px 0;}
      .label{font-size:13px;font-weight:600;overflow-wrap:anywhere;}
      .lauf{background:#e7f6ec;color:#16a34a;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;}
      .track{background:#f3f4f6;border-radius:8px;height:16px;overflow:hidden;}
      .fill{height:100%;background:#d1071a;border-radius:8px;min-width:2px;}
      .val{font-size:13px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;}
      .empty{color:#6b7280;padding:8px 0;}
      table{width:100%;border-collapse:collapse;font-size:12.5px;}
      th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #eef0f3;vertical-align:top;}
      thead th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border-bottom:1.5px solid #e6e7eb;}
      tbody tr:nth-child(even){background:#fafafa;}
      td.r,th.r{text-align:right;}
      td.b{font-weight:700;font-variant-numeric:tabular-nums;}
      .mut{color:#6b7280;}
      tr{break-inside:avoid;}
      .foot{margin-top:26px;padding-top:12px;border-top:1px solid #e6e7eb;color:#6b7280;font-size:11px;display:flex;justify-content:space-between;}
      @media print{@page{margin:0;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body>
      <div class="brandbar"><img src="${logoUrl}" alt="ALZINGER"><span class="tag">Entwicklungs-Zeiterfassung</span></div>
      <div class="sheet">
        <div class="hd">
          <div><h1>${esc(m.name)}</h1><div class="sub">Arbeitszeit je Kachel · ${range} · erstellt ${erstellt}</div></div>
        </div>
        <div class="stats">
          <div class="stat red"><div class="n">${fmtHours(m.total)}</div><div class="l">Gesamtzeit</div></div>
          <div class="stat"><div class="n">${anzEntw}</div><div class="l">Entwickler</div></div>
          <div class="stat"><div class="n">${anzBuch}</div><div class="l">Buchungen</div></div>
        </div>
        <h2>Arbeitszeit je Kachel</h2>
        <div class="card">${rows}</div>
        <h2>Zeit je Entwickler</h2>
        <table><thead><tr><th>Entwickler</th><th class="r">Buchungen</th><th class="r">Summe</th></tr></thead><tbody>${empRows}</tbody></table>
        <h2>Einzelbuchungen (wer · wann · wieviel)</h2>
        <table><thead><tr><th>Entwickler</th><th>Kachel</th><th>Beginn</th><th>Ende</th><th class="r">Dauer</th></tr></thead><tbody>${entryRows}</tbody></table>
        <div class="foot"><span>ALZINGER Maschinenbau · Entwicklungs-Zeiterfassung</span><span>${erstellt}</span></div>
      </div>
      <script>window.onload=function(){window.focus();window.print();};<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(doc);
    w.document.close();
    return;
  }
  // Fallback (Popup blockiert): bisheriger Druckbereich-Weg
  document.getElementById('printArea').innerHTML = `
    <div class="print-head">
      <div style="font-weight:800;font-size:20px">ALZINGER Entwicklung – ${esc(m.name)}</div>
      <div class="muted" style="font-size:13px">Arbeitszeit je Kachel · ${range} · erstellt ${new Date().toLocaleDateString('de-DE')}</div>
    </div>
    <div class="card">
      <div class="chart-head">
        <span class="chart-machine">${esc(m.name)}</span>
        <span class="chart-machine">Gesamt ${fmtHours(m.total)}</span>
      </div>
      ${m.list.map((x) => {
        const pct = Math.round((x.ms / max) * 100);
        return `<div class="chart-row">
          <div class="chart-label">${esc(x.label)} ${x.running ? '<span class="tag live">läuft</span>' : ''}</div>
          <div class="chart-track"><div class="chart-fill green" style="width:${pct}%"></div></div>
          <div class="chart-val">${fmtHours(x.ms)}</div>
        </div>`;
      }).join('') || '<div class="empty">Keine Zeiten im Zeitraum.</div>'}
    </div>`;
  document.body.classList.add('print-machines');
  window.print();
}
// Druckmodus zurücksetzen, sobald der Druck beendet ist (matchMedia, iOS-robust).
if (window.matchMedia) {
  const mqPrint = window.matchMedia('print');
  const onChange = (e) => { if (!e.matches) document.body.classList.remove('print-machines'); };
  if (mqPrint.addEventListener) mqPrint.addEventListener('change', onChange);
  else if (mqPrint.addListener) mqPrint.addListener(onChange);
}

// ---------- Zeiteinträge ----------
async function loadEntries() {
  const f = rangeFilter('eFrom', 'eTo', 'eProjekt');
  const emp = document.getElementById('eEntwickler').value;
  if (emp) f.entwickler_id = Number(emp);
  const rows = await DB.entries(f);
  const el = document.getElementById('entriesTable');
  if (!rows.length) { el.innerHTML = '<div class="empty">Keine Einträge gefunden.</div>'; return; }
  el.innerHTML = `<table><thead><tr>
      <th>Entwickler</th><th>Projekt</th><th>Kachel</th><th>Beginn</th><th>Ende</th><th>Dauer</th><th></th>
    </tr></thead><tbody>` +
    rows.map((r) => {
      const dur = r.end_ts ? fmtDuration(r.split_ms || 0) : '<span class="tag live">läuft</span>';
      return `<tr>
        <td style="font-weight:600">${esc(r.entwickler_name)}</td>
        <td>${esc(r.projekt_name)}</td>
        <td>${esc(kachelLabel(r.kachel_artikelnummer, r.kachel_name))}</td>
        <td style="white-space:nowrap">${fmtDateTime(r.start_ts)}</td>
        <td style="white-space:nowrap">${r.end_ts ? fmtDateTime(r.end_ts) : '–'}</td>
        <td style="white-space:nowrap">${dur}</td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn gray sm" onclick='openEntry(${JSON.stringify(r)})'>Bearbeiten</button>
          <button class="btn danger sm" onclick="deleteEntry(${r.id})">Löschen</button>
        </td>
      </tr>`;
    }).join('') + '</tbody></table>';
}
function openEntry(r) {
  editingEntryId = r.id;
  document.getElementById('entryMeta').textContent = `${r.entwickler_name} · ${r.projekt_name} · ${kachelLabel(r.kachel_artikelnummer, r.kachel_name)}`;
  document.getElementById('editStart').value = toLocalInputValue(r.start_ts);
  document.getElementById('editEnd').value = r.end_ts ? toLocalInputValue(r.end_ts) : '';
  document.getElementById('editNote').value = r.note || '';
  document.getElementById('entryModal').classList.add('open');
}
function closeEntryModal() { document.getElementById('entryModal').classList.remove('open'); editingEntryId = null; }
async function saveEntry() {
  try {
    await DB.updateEntry(
      editingEntryId,
      fromLocalInputValue(document.getElementById('editStart').value),
      document.getElementById('editEnd').value ? fromLocalInputValue(document.getElementById('editEnd').value) : null,
      document.getElementById('editNote').value
    );
    closeEntryModal();
    loadEntries();
    toast('Gespeichert');
  } catch (e) { toast(e.message); }
}
async function deleteEntry(id) {
  if (!confirm('Diesen Zeiteintrag wirklich löschen?')) return;
  await DB.deleteEntry(id);
  loadEntries();
  toast('Gelöscht');
}

// ---------- Entwickler ----------
async function loadEntwickler() {
  entwicklerCache = await DB.entwickler(true);
  fillSelects();
  const el = document.getElementById('empList');
  if (!entwicklerCache.length) { el.innerHTML = '<div class="empty">Noch keine Entwickler angelegt.</div>'; return; }
  el.innerHTML = entwicklerCache.map((e) => `<div class="list-item">
    <div class="flex"><span style="font-weight:600">${esc(e.name)}</span>${e.active ? '' : '<span class="tag muted">inaktiv</span>'}</div>
    <div class="flex">
      <button class="btn gray sm" onclick="renameEntwickler(${e.id})">Umbenennen</button>
      <button class="btn ${e.active ? 'danger' : 'gray'} sm" onclick="toggleEntwickler(${e.id}, ${e.active ? 0 : 1})">${e.active ? 'Deaktivieren' : 'Aktivieren'}</button>
    </div>
  </div>`).join('');
}
async function addEntwickler() {
  const name = document.getElementById('empName').value.trim();
  if (!name) return toast('Name erforderlich');
  await DB.addEntwickler(name);
  document.getElementById('empName').value = '';
  loadEntwickler();
  toast('Entwickler angelegt');
}
async function renameEntwickler(id) {
  const e = entwicklerCache.find((x) => x.id === id);
  const name = prompt('Neuer Name:', e ? e.name : '');
  if (!name) return;
  await DB.updateEntwickler(id, name, 1);
  loadEntwickler();
}
async function toggleEntwickler(id, active) {
  const e = entwicklerCache.find((x) => x.id === id);
  await DB.updateEntwickler(id, e.name, active);
  loadEntwickler();
}

// ---------- Projekte & Kacheln ----------
async function loadMaster() {
  [projekteCache, kachelnCache] = await Promise.all([DB.projekte(true), DB.kacheln(true)]);
  fillSelects();
  const kachelProjektSel = document.getElementById('kachelProjekt');
  if (kachelProjektSel) kachelProjektSel.innerHTML = '<option value="">Allgemein (alle Projekte)</option>' +
    activeList(projekteCache).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  renderProjektList();
  renderKachelList();
}
// Optionen für die Projekt-Zuordnung einer Kachel (mit aktueller Auswahl)
function kachelProjektOptions(selectedId) {
  return '<option value="">Allgemein</option>' + activeList(projekteCache)
    .map((m) => `<option value="${m.id}" ${Number(selectedId) === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}
async function setKachelProjekt(id, val) {
  await DB.setKachelProjekt(id, val ? Number(val) : null);
  loadMaster();
  toast('Zuordnung gespeichert');
}
function renderProjektList() {
  const el = document.getElementById('projektList');
  if (!projekteCache.length) { el.innerHTML = '<div class="empty">Noch nichts angelegt.</div>'; return; }
  el.innerHTML = projekteCache.map((x) => `<div class="list-item">
    <div class="flex"><span style="font-weight:600">${esc(x.name)}</span>${x.active ? '' : '<span class="tag muted">inaktiv</span>'}</div>
    <div class="flex">
      <button class="btn gray sm" onclick="renameProjekt(${x.id})">Umbenennen</button>
      <button class="btn ${x.active ? 'danger' : 'gray'} sm" onclick="toggleProjekt(${x.id}, ${x.active ? 0 : 1})">${x.active ? 'Deaktivieren' : 'Aktivieren'}</button>
    </div>
  </div>`).join('');
}
function renderKachelList() {
  const el = document.getElementById('kachelList');
  if (!kachelnCache.length) { el.innerHTML = '<div class="empty">Noch nichts angelegt.</div>'; return; }
  el.innerHTML = kachelnCache.map((x) => {
    const projektSel = `<select class="bg-mach-sel" onchange="setKachelProjekt(${x.id}, this.value)" title="Diese Kachel einem Projekt zuordnen">${kachelProjektOptions(x.projekt_id)}</select>`;
    return `<div class="list-item">
    <div class="flex">
      ${x.artikelnummer ? `<span class="art">${esc(x.artikelnummer)}</span>` : ''}
      <span style="font-weight:600">${esc(x.name)}</span>${x.active ? '' : '<span class="tag muted">inaktiv</span>'}
    </div>
    <div class="flex">
      ${projektSel}
      <button class="btn gray sm" onclick="renameKachel(${x.id})">Bearbeiten</button>
      <button class="btn ${x.active ? 'danger' : 'gray'} sm" onclick="toggleKachel(${x.id}, ${x.active ? 0 : 1})">${x.active ? 'Deaktivieren' : 'Aktivieren'}</button>
    </div>
  </div>`;
  }).join('');
}
async function addProjekt() {
  const name = document.getElementById('projektName').value.trim();
  if (!name) return toast('Name erforderlich');
  await DB.addProjekt(name);
  document.getElementById('projektName').value = '';
  loadMaster(); toast('Projekt angelegt');
}
async function addKachel() {
  const art = document.getElementById('kachelArt').value.trim();
  const name = document.getElementById('kachelName').value.trim();
  if (!name) return toast('Bezeichnung erforderlich');
  const pid = document.getElementById('kachelProjekt').value;
  await DB.addKachel(art, name, pid ? Number(pid) : null);
  document.getElementById('kachelArt').value = '';
  document.getElementById('kachelName').value = '';
  loadMaster(); toast('Kachel angelegt');
}
async function renameProjekt(id) {
  const x = projekteCache.find((x) => x.id === id);
  const name = prompt('Neuer Projektname:', x ? x.name : '');
  if (!name) return;
  await DB.updateProjekt(id, name, 1);
  loadMaster();
}
async function renameKachel(id) {
  const x = kachelnCache.find((x) => x.id === id);
  if (!x) return;
  const art = prompt('Artikelnummer (optional):', x.artikelnummer || '');
  if (art === null) return;
  const name = prompt('Bezeichnung:', x.name || '');
  if (!name) return;
  await DB.updateKachel(id, art.trim(), name.trim(), 1);
  loadMaster();
}
async function toggleProjekt(id, active) {
  const x = projekteCache.find((x) => x.id === id);
  await DB.updateProjekt(id, x.name, active);
  loadMaster();
}
async function toggleKachel(id, active) {
  const x = kachelnCache.find((x) => x.id === id);
  await DB.updateKachel(id, x.artikelnummer || '', x.name, active);
  loadMaster();
}

// ---------- Änderungswünsche ----------
async function loadFeedback() {
  const el = document.getElementById('fbList');
  let list = [];
  try { list = JSON.parse((await DB.getSetting('feedback')) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list) || !list.length) {
    el.innerHTML = '<div class="empty">Noch keine Änderungswünsche.</div>';
    return;
  }
  el.innerHTML = list.slice().sort((a, b) => b.ts - a.ts).map((f) => `
    <div class="list-item">
      <div>
        <div style="white-space:pre-wrap">${esc(f.text)}</div>
        <div class="muted" style="font-size:12px">${f.author ? esc(f.author) + ' · ' : ''}${fmtDateTime(f.ts)}</div>
      </div>
      <button class="btn danger sm" onclick="deleteFeedback(${f.ts})">Erledigt</button>
    </div>`).join('');
}
async function deleteFeedback(ts) {
  let list = [];
  try { list = JSON.parse((await DB.getSetting('feedback')) || '[]'); } catch (e) { list = []; }
  list = (Array.isArray(list) ? list : []).filter((x) => x.ts !== ts);
  await DB.setSetting('feedback', JSON.stringify(list));
  loadFeedback();
}

// ---------- Einstellungen ----------
function setupDataSection() {
  const box = document.getElementById('dataBox');
  if (!box) return;
  if (DB.isSync()) {
    box.innerHTML = '<p class="muted" style="margin:0;font-size:13px">✅ Geräte-Synchronisation aktiv – alle Daten werden zentral gespeichert und über alle Geräte geteilt.</p>';
  }
}
function exportData() {
  const blob = new Blob([JSON.stringify(Store.load(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'entwicklung-daten-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}
function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { Store.data = JSON.parse(reader.result); Store.save(); toast('Daten importiert'); loadOverview(); }
    catch (e) { toast('Datei ungültig'); }
  };
  reader.readAsText(file);
}
function resetData() {
  if (!confirm('Wirklich ALLE lokalen Daten in diesem Browser zurücksetzen?')) return;
  localStorage.removeItem(STORE_KEY);
  Store.data = null; Store.load();
  toast('Zurückgesetzt');
  loadOverview();
}

boot();

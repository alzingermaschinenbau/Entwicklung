// Gemeinsame Hilfsfunktionen für die Entwicklungs-Zeiterfassung

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtHours(ms) {
  const h = ms / 3600000;
  return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
}

// Stunden:Minuten (mit Vorzeichen), z. B. 8:45 oder -0:30
function fmtHM(ms) {
  const neg = ms < 0;
  const totalMin = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = String(totalMin % 60).padStart(2, '0');
  return `${neg ? '-' : ''}${h}:${m}`;
}

const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// ---- Bayerische Feiertage (Betrieb geschlossen) ----
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const _holCache = {};
function bavarianHolidays(year) {
  if (_holCache[year]) return _holCache[year];
  const H = {};
  const add = (dt, name) => { H[`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`] = name; };
  add(new Date(year, 0, 1), 'Neujahr');
  add(new Date(year, 0, 6), 'Heilige Drei Könige');
  add(new Date(year, 4, 1), 'Tag der Arbeit');
  add(new Date(year, 7, 15), 'Mariä Himmelfahrt');
  add(new Date(year, 9, 3), 'Tag der Deutschen Einheit');
  add(new Date(year, 10, 1), 'Allerheiligen');
  add(new Date(year, 11, 25), '1. Weihnachtsfeiertag');
  add(new Date(year, 11, 26), '2. Weihnachtsfeiertag');
  const e = easterSunday(year);
  const off = (n, name) => { const dt = new Date(e); dt.setDate(dt.getDate() + n); add(dt, name); };
  off(-2, 'Karfreitag'); off(1, 'Ostermontag'); off(39, 'Christi Himmelfahrt');
  off(50, 'Pfingstmontag'); off(60, 'Fronleichnam');
  _holCache[year] = H;
  return H;
}
function holidayName(date) {
  const map = bavarianHolidays(date.getFullYear());
  return map[`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`] || null;
}

// Soll-Arbeitszeit (netto, ohne Pausen) für einen Tag:
// Mo–Do 07:00–16:45, Fr 07:00–12:30, Sa/So und Feiertage 0.
function sollNetMs(date) {
  if (holidayName(date)) return 0; // Feiertag: Betrieb geschlossen
  const wd = date.getDay();
  let start, end;
  if (wd >= 1 && wd <= 4) { start = [7, 0]; end = [16, 45]; }
  else if (wd === 5) { start = [7, 0]; end = [12, 30]; }
  else return 0;
  const s = new Date(date); s.setHours(start[0], start[1], 0, 0);
  const e = new Date(date); e.setHours(end[0], end[1], 0, 0);
  return netDuration(s.getTime(), e.getTime());
}

// ---- Pausenzeiten (werden automatisch abgezogen) ----
// Mo–Do: 09:00–09:15 und 12:00–12:45 · Fr: 09:00–09:30
function breakWindows(weekday) {
  if (weekday >= 1 && weekday <= 4) return [[9, 0, 9, 15], [12, 0, 12, 45]];
  if (weekday === 5) return [[9, 0, 9, 30]];
  return [];
}

// Summe der Pausen-Minuten (in ms), die in das Intervall [start, end] fallen.
function breakMsInInterval(start, end) {
  if (!end || end <= start) return 0;
  let total = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  while (cur.getTime() <= last.getTime()) {
    for (const [h1, m1, h2, m2] of breakWindows(cur.getDay())) {
      const bs = new Date(cur); bs.setHours(h1, m1, 0, 0);
      const be = new Date(cur); be.setHours(h2, m2, 0, 0);
      const ov = Math.min(end, be.getTime()) - Math.max(start, bs.getTime());
      if (ov > 0) total += ov;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

// Netto-Arbeitszeit = Brutto minus Pausen-Anteil.
function netDuration(start, end) {
  const e = end || Date.now();
  return Math.max(0, e - start - breakMsInInterval(start, e));
}

// ---- Automatisches Ausstempeln (Feierabend) ----
// Wer vergisst zu beenden, wird automatisch um FEIERABEND_HOUR Uhr ausgestempelt.
const FEIERABEND_HOUR = 17; // 17:00
// Zeitpunkt, auf den ein vergessener (offener) Eintrag gekappt wird:
//   - Normalfall: 17:00 des Starttags
//   - Start nach 17:00 (Überstunden): Tagesende (Mitternacht), damit nichts über Nacht weiterläuft
function autoStopEnd(start_ts) {
  const f = new Date(start_ts);
  f.setHours(FEIERABEND_HOUR, 0, 0, 0);
  if (f.getTime() > start_ts) return f.getTime();
  const m = new Date(start_ts);
  m.setHours(24, 0, 0, 0); // 00:00 des Folgetags
  return m.getTime();
}
// true, wenn ein offener Eintrag jetzt automatisch beendet werden soll
function shouldAutoStop(start_ts, now) {
  return (now || Date.now()) >= autoStopEnd(start_ts);
}
const AUTO_STOP_NOTE = 'Automatisch um 17:00 beendet';
// Schwelle, ab der ein noch laufender Eintrag im Cockpit als „sehr lange" markiert wird
const LANGLAEUFER_MS = 9 * 60 * 60 * 1000; // 9 Stunden netto

function fmtDateTime(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toLocalInputValue(ts) {
  const d = new Date(ts);
  const off = d.getTimezoneOffset();
  const local = new Date(ts - off * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInputValue(val) {
  return val ? new Date(val).getTime() : null;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Beschriftung einer Kachel: „Artikelnummer · Bezeichnung" (Artikelnummer optional).
function kachelLabel(artikelnummer, name) {
  const art = (artikelnummer || '').trim();
  const bez = (name || '').trim();
  if (art && bez) return `${art} · ${bez}`;
  return art || bez || '—';
}

let _toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const ALZINGER_LOGO = `<img class="brand-logo" src="assets/alzinger-logo-white.png" alt="ALZINGER" />`;

// App-Version (zentral) – wird im Header und auf der Login-Seite angezeigt
const APP_VERSION = 'v4';

// Lokale Datenhaltung im Browser (localStorage) – Fallback ohne zentralen Server.
// Wird automatisch genutzt, solange in config.js keine Supabase-Schlüssel stehen.
const STORE_KEY = 'entwicklung_data_v1';

function defaultData() {
  return {
    nextId: 100,
    entwickler: [],
    projekte: [],
    kacheln: [],
    entries: [],
    settings: {},
  };
}

const Store = {
  data: null,

  load() {
    if (this.data) return this.data;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      this.data = raw ? JSON.parse(raw) : defaultData();
    } catch (e) {
      this.data = defaultData();
    }
    if (!this.data.settings) this.data.settings = {};
    return this.data;
  },

  save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
  },

  newId() {
    const d = this.load();
    return d.nextId++;
  },

  // ---- Stammdaten ----
  projekte(all = false) {
    const p = this.load().projekte.slice().sort((a, b) => a.sort - b.sort);
    return all ? p : p.filter((x) => x.active);
  },
  kacheln(all = false) {
    const k = this.load().kacheln.slice().sort((a, b) => a.sort - b.sort);
    return all ? k : k.filter((x) => x.active);
  },
  entwickler(all = false) {
    const e = this.load().entwickler
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return all ? e : e.filter((x) => x.active);
  },

  addEntwickler(name) {
    const d = this.load();
    d.entwickler.push({ id: this.newId(), name, active: 1, created_at: Date.now() });
    this.save();
  },
  updateEntwickler(id, name, active) {
    const e = this.load().entwickler.find((x) => x.id === id);
    if (e) { e.name = name; e.active = active ? 1 : 0; this.save(); }
  },

  // kind: 'projekte' | 'kacheln'
  addProjekt(name) {
    const d = this.load();
    const sort = d.projekte.length ? Math.max(...d.projekte.map((x) => x.sort)) + 1 : 0;
    d.projekte.push({ id: this.newId(), name, sort, active: 1 });
    this.save();
  },
  addKachel(artikelnummer, name, projektId) {
    const d = this.load();
    const sort = d.kacheln.length ? Math.max(...d.kacheln.map((x) => x.sort)) + 1 : 0;
    d.kacheln.push({
      id: this.newId(), artikelnummer: artikelnummer || '', name, sort, active: 1,
      projekt_id: projektId ? Number(projektId) : null,
    });
    this.save();
  },
  updateProjekt(id, name, active) {
    const x = this.load().projekte.find((x) => x.id === id);
    if (x) { x.name = name; x.active = active ? 1 : 0; this.save(); }
  },
  updateKachel(id, artikelnummer, name, active) {
    const x = this.load().kacheln.find((x) => x.id === id);
    if (x) { x.artikelnummer = artikelnummer || ''; x.name = name; x.active = active ? 1 : 0; this.save(); }
  },
  setKachelProjekt(id, projektId) {
    const x = this.load().kacheln.find((x) => x.id === id);
    if (x) { x.projekt_id = projektId ? Number(projektId) : null; this.save(); }
  },

  // ---- Zeiteinträge ----
  // Vergessene (offene) Einträge automatisch auf den Feierabend (17:00) kappen.
  _autoCloseStale() {
    const d = this.load();
    let changed = false;
    for (const e of d.entries) {
      if (!e.end_ts && shouldAutoStop(e.start_ts)) {
        e.end_ts = autoStopEnd(e.start_ts);
        if (!e.note) e.note = AUTO_STOP_NOTE;
        changed = true;
      }
    }
    if (changed) this.save();
  },

  activeEntries(projektId) {
    this._autoCloseStale();
    const d = this.load();
    return d.entries
      .filter((e) => !e.end_ts && (!projektId || e.projekt_id === projektId))
      .map((e) => this._decorate(e))
      .sort((a, b) => a.start_ts - b.start_ts);
  },

  startEntry(entwickler_id, projekt_id, kachel_id) {
    const d = this.load();
    // Ein Entwickler darf gleichzeitig nur an EINER Kachel eingestempelt sein.
    const running = d.entries.find((e) => !e.end_ts && e.entwickler_id === entwickler_id);
    if (running) {
      const k = d.kacheln.find((b) => b.id === running.kachel_id);
      const p = d.projekte.find((m) => m.id === running.projekt_id);
      throw new Error(
        `Dieser Entwickler ist bereits an „${k ? kachelLabel(k.artikelnummer, k.name) : '?'}" (${p ? p.name : '?'}) eingestempelt. Bitte zuerst dort beenden.`
      );
    }
    d.entries.push({
      id: this.newId(), entwickler_id, projekt_id, kachel_id,
      start_ts: Date.now(), end_ts: null, note: '',
    });
    this.save();
  },
  stopEntry(id) {
    const e = this.load().entries.find((x) => x.id === id);
    if (e && !e.end_ts) { e.end_ts = Date.now(); this.save(); }
  },
  updateEntry(id, start_ts, end_ts, note) {
    const e = this.load().entries.find((x) => x.id === id);
    if (!e) return;
    if (end_ts !== null && end_ts < start_ts) throw new Error('Ende liegt vor Beginn');
    e.start_ts = start_ts; e.end_ts = end_ts; e.note = note;
    this.save();
  },
  deleteEntry(id) {
    const d = this.load();
    d.entries = d.entries.filter((x) => x.id !== id);
    this.save();
  },

  _decorate(e) {
    const d = this.load();
    const emp = d.entwickler.find((x) => x.id === e.entwickler_id);
    const p = d.projekte.find((x) => x.id === e.projekt_id);
    const k = d.kacheln.find((x) => x.id === e.kachel_id);
    return {
      ...e,
      entwickler_name: emp ? emp.name : '—',
      projekt_name: p ? p.name : '—',
      kachel_artikelnummer: k ? (k.artikelnummer || '') : '',
      kachel_name: k ? k.name : '—',
    };
  },

  entries(filter = {}) {
    this._autoCloseStale();
    const d = this.load();
    let rows = d.entries.map((e) => this._decorate(e));
    if (filter.from) rows = rows.filter((r) => r.start_ts >= filter.from);
    if (filter.to) rows = rows.filter((r) => r.start_ts <= filter.to);
    if (filter.projekt_id) rows = rows.filter((r) => r.projekt_id === filter.projekt_id);
    if (filter.kachel_id) rows = rows.filter((r) => r.kachel_id === filter.kachel_id);
    if (filter.entwickler_id) rows = rows.filter((r) => r.entwickler_id === filter.entwickler_id);
    return rows.sort((a, b) => b.start_ts - a.start_ts);
  },

  // ---- Auswertung ----
  report(filter = {}) {
    const now = Date.now();
    const rows = this.entries(filter);
    const dur = (e) => netDuration(e.start_ts, e.end_ts || now); // Pausen automatisch abgezogen
    const byKachel = {}, byEmp = {}, breakdown = {};
    let total = 0, running = 0;
    for (const e of rows) {
      const d = dur(e);
      total += d;
      if (!e.end_ts) running++;
      (byKachel[e.kachel_id] = byKachel[e.kachel_id] || {
        kachel_id: e.kachel_id, kachel_artikelnummer: e.kachel_artikelnummer, kachel_name: e.kachel_name,
        total_ms: 0, entries: 0, running: 0,
      });
      byKachel[e.kachel_id].total_ms += d;
      byKachel[e.kachel_id].entries++;
      if (!e.end_ts) byKachel[e.kachel_id].running++;

      (byEmp[e.entwickler_id] = byEmp[e.entwickler_id] || {
        entwickler_id: e.entwickler_id, entwickler_name: e.entwickler_name, total_ms: 0, entries: 0,
      });
      byEmp[e.entwickler_id].total_ms += d;
      byEmp[e.entwickler_id].entries++;

      const key = e.kachel_id + '|' + e.entwickler_id;
      (breakdown[key] = breakdown[key] || {
        kachel_id: e.kachel_id, entwickler_name: e.entwickler_name, total_ms: 0,
      });
      breakdown[key].total_ms += d;
    }
    return {
      byKachel: Object.values(byKachel).sort((a, b) => b.total_ms - a.total_ms),
      byEntwickler: Object.values(byEmp).sort((a, b) => b.total_ms - a.total_ms),
      breakdown: Object.values(breakdown).sort((a, b) => b.total_ms - a.total_ms),
      totals: { total_ms: total, entries: rows.length, running },
    };
  },

  stats() {
    this._autoCloseStale();
    const d = this.load();
    return {
      entwickler: d.entwickler.filter((x) => x.active).length,
      projekte: d.projekte.filter((x) => x.active).length,
      kacheln: d.kacheln.filter((x) => x.active).length,
      running: d.entries.filter((e) => !e.end_ts).length,
    };
  },

  // ---- Einstellungen ----
  getSetting(key) { return this.load().settings[key] || ''; },
  setSetting(key, value) { this.load().settings[key] = value; this.save(); },
};

// ---- Rollen-Anmeldung (clientseitig). Passwörter werden NICHT im Klartext
//      gespeichert, sondern nur als gesalzener SHA-256-Hash verglichen. ----
const Auth = {
  SALT: 'AlzingerEntwicklung::',
  // Benutzername (klein) -> { hash, role, name }
  // Ein kombinierter Zugang: sieht Zeiterfassung UND Auswertung/Cockpit.
  CREDS: {
    entwicklung: { hash: 'c5bcc589f0fdb6b742751a83f4317d6bb7a741cf14be41d6209cc8cddcf0bbf6', role: 'admin', name: 'Entwicklung' },
  },
  async _hash(password) {
    const data = new TextEncoder().encode(this.SALT + password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  },
  async login(username, password) {
    const u = this.CREDS[String(username || '').trim().toLowerCase()];
    if (!u) return null;
    const h = await this._hash(password || '');
    if (h !== u.hash) return null;
    const sess = { role: u.role, name: u.name };
    localStorage.setItem('entwicklung_session', JSON.stringify(sess));
    return sess;
  },
  session() {
    try { return JSON.parse(localStorage.getItem('entwicklung_session')); }
    catch (e) { return null; }
  },
  logout() { localStorage.removeItem('entwicklung_session'); window.location.href = 'index.html'; },
  require(role) {
    const s = this.session();
    if (!s || (role && s.role !== role)) { window.location.href = 'index.html'; return null; }
    return s;
  },
};

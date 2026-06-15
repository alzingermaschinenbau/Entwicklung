// ------------------------------------------------------------------
// Einheitliche, asynchrone Datenschicht.
//   - LOKALER Modus  (keine Supabase-Konfiguration): nutzt localStorage (Store)
//   - SYNC-Modus     (Supabase konfiguriert): zentrale Datenbank über alle Geräte
// Beide Backends bieten dieselbe async-API, damit die Oberfläche identisch bleibt.
// ------------------------------------------------------------------
const DB = (() => {
  const cfg = window.ENTWICKLUNG_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  let sb = null;
  let cachedSession = null; // { role, name }

  if (useSupabase) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const isSync = () => useSupabase;

  // ---------------- AUTH ----------------
  // Einfacher Modus (wie CRM): der Login laeuft in der App (entwicklung/…),
  // der Datenzugriff laeuft ueber den anon-Schluessel. Keine Supabase-Benutzer noetig.
  async function init() {
    cachedSession = Auth.session() || null;
  }
  function session() { return cachedSession; }
  async function login(username, password) {
    cachedSession = await Auth.login(username, password);
    return cachedSession;
  }
  async function logout() {
    localStorage.removeItem('entwicklung_session');
    cachedSession = null;
    window.location.href = 'index.html';
  }

  // ---------------- helpers (Supabase) ----------------
  function decorate(r) {
    return {
      ...r,
      entwickler_name: r.entwickler ? r.entwickler.name : '—',
      projekt_name: r.projekte ? r.projekte.name : '—',
      kachel_artikelnummer: r.kacheln ? (r.kacheln.artikelnummer || '') : '',
      kachel_name: r.kacheln ? r.kacheln.name : '—',
    };
  }
  const ENTRY_SELECT = '*, entwickler(name), projekte(name), kacheln(name, artikelnummer)';

  function buildReport(rows) {
    const dur = (e) => e.split_ms || 0; // anteilig (Pausen abgezogen + parallel aufgeteilt)
    const byKachel = {}, byEmp = {}, breakdown = {};
    let total = 0, running = 0;
    for (const e of rows) {
      const d = dur(e); total += d; if (!e.end_ts) running++;
      (byKachel[e.kachel_id] = byKachel[e.kachel_id] || { kachel_id: e.kachel_id, kachel_artikelnummer: e.kachel_artikelnummer, kachel_name: e.kachel_name, total_ms: 0, entries: 0, running: 0 });
      byKachel[e.kachel_id].total_ms += d; byKachel[e.kachel_id].entries++; if (!e.end_ts) byKachel[e.kachel_id].running++;
      (byEmp[e.entwickler_id] = byEmp[e.entwickler_id] || { entwickler_id: e.entwickler_id, entwickler_name: e.entwickler_name, total_ms: 0, entries: 0 });
      byEmp[e.entwickler_id].total_ms += d; byEmp[e.entwickler_id].entries++;
      const key = e.kachel_id + '|' + e.entwickler_id;
      (breakdown[key] = breakdown[key] || { kachel_id: e.kachel_id, entwickler_name: e.entwickler_name, total_ms: 0 });
      breakdown[key].total_ms += d;
    }
    return {
      byKachel: Object.values(byKachel).sort((a, b) => b.total_ms - a.total_ms),
      byEntwickler: Object.values(byEmp).sort((a, b) => b.total_ms - a.total_ms),
      breakdown: Object.values(breakdown).sort((a, b) => b.total_ms - a.total_ms),
      totals: { total_ms: total, entries: rows.length, running },
    };
  }

  // ---------------- DATA API ----------------
  // Stammdaten
  async function projekte(all = false) {
    if (!useSupabase) return Store.projekte(all);
    let q = sb.from('projekte').select('*').order('sort');
    if (!all) q = q.eq('active', true);
    const { data } = await q;
    return (data || []).map((m) => ({ ...m, active: m.active ? 1 : 0 }));
  }
  async function kacheln(all = false) {
    if (!useSupabase) return Store.kacheln(all);
    let q = sb.from('kacheln').select('*').order('sort');
    if (!all) q = q.eq('active', true);
    const { data } = await q;
    return (data || []).map((b) => ({ ...b, active: b.active ? 1 : 0 }));
  }
  async function entwickler(all = false) {
    if (!useSupabase) return Store.entwickler(all);
    let q = sb.from('entwickler').select('*').order('name');
    if (!all) q = q.eq('active', true);
    const { data } = await q;
    return (data || []).map((e) => ({ ...e, active: e.active ? 1 : 0 }));
  }

  async function addEntwickler(name) {
    if (!useSupabase) return Store.addEntwickler(name);
    await sb.from('entwickler').insert({ name, active: true });
  }
  async function updateEntwickler(id, name, active) {
    if (!useSupabase) return Store.updateEntwickler(id, name, active);
    await sb.from('entwickler').update({ name, active: !!active }).eq('id', id);
  }

  async function addProjekt(name) {
    if (!useSupabase) return Store.addProjekt(name);
    const { data } = await sb.from('projekte').select('sort').order('sort', { ascending: false }).limit(1);
    const sort = data && data.length ? data[0].sort + 1 : 0;
    await sb.from('projekte').insert({ name, sort, active: true });
  }
  async function addKachel(artikelnummer, name, projektId) {
    if (!useSupabase) return Store.addKachel(artikelnummer, name, projektId);
    const { data } = await sb.from('kacheln').select('sort').order('sort', { ascending: false }).limit(1);
    const sort = data && data.length ? data[0].sort + 1 : 0;
    await sb.from('kacheln').insert({
      artikelnummer: artikelnummer || '', name, sort, active: true,
      projekt_id: projektId ? Number(projektId) : null,
    });
  }
  async function updateProjekt(id, name, active) {
    if (!useSupabase) return Store.updateProjekt(id, name, active);
    await sb.from('projekte').update({ name, active: !!active }).eq('id', id);
  }
  async function updateKachel(id, artikelnummer, name, active) {
    if (!useSupabase) return Store.updateKachel(id, artikelnummer, name, active);
    await sb.from('kacheln').update({ artikelnummer: artikelnummer || '', name, active: !!active }).eq('id', id);
  }
  // Eine Kachel einem Projekt zuordnen (oder allgemein = null).
  async function setKachelProjekt(id, projektId) {
    if (!useSupabase) return Store.setKachelProjekt(id, projektId);
    await sb.from('kacheln').update({ projekt_id: projektId ? Number(projektId) : null }).eq('id', id);
  }

  // Zeiteinträge
  // Vergessene (offene) Einträge automatisch auf den Feierabend (17:00) kappen.
  async function autoCloseStale() {
    if (!useSupabase) return;
    const { data } = await sb.from('time_entries').select('id, start_ts, note').is('end_ts', null);
    if (!data || !data.length) return;
    const now = Date.now();
    for (const e of data) {
      if (!shouldAutoStop(e.start_ts, now)) continue;
      await sb
        .from('time_entries')
        .update({ end_ts: autoStopEnd(e.start_ts), note: e.note || AUTO_STOP_NOTE })
        .eq('id', e.id)
        .is('end_ts', null);
    }
  }

  async function activeEntries(projektId) {
    if (!useSupabase) return Store.activeEntries(projektId);
    await autoCloseStale();
    // ALLE offenen Einträge laden (über alle Projekte), Split berechnen, dann filtern.
    const { data } = await sb.from('time_entries').select(ENTRY_SELECT).is('end_ts', null).order('start_ts');
    const all = (data || []).map(decorate);
    const split = computeSplit(all, Date.now());
    const cnt = {};
    all.forEach((r) => { cnt[r.entwickler_id] = (cnt[r.entwickler_id] || 0) + 1; });
    all.forEach((r) => { r.split_ms = split[r.id] || 0; r.parallel = cnt[r.entwickler_id]; });
    return projektId ? all.filter((r) => r.projekt_id === Number(projektId)) : all;
  }
  async function startEntry(entwickler_id, projekt_id, kachel_id) {
    if (!useSupabase) return Store.startEntry(entwickler_id, projekt_id, kachel_id);
    // Paralleles Einstempeln ist erlaubt (Zeit wird gleichmäßig auf die parallel
    // laufenden Kacheln aufgeteilt). Nur dieselbe Kachel nicht doppelt offen.
    const { data: dup } = await sb
      .from('time_entries')
      .select('id')
      .eq('entwickler_id', entwickler_id)
      .eq('kachel_id', kachel_id)
      .is('end_ts', null)
      .limit(1);
    if (dup && dup.length) throw new Error('Diese Kachel läuft für diesen Entwickler bereits.');
    const { error } = await sb.from('time_entries').insert({
      entwickler_id, projekt_id, kachel_id, start_ts: Date.now(), end_ts: null, note: '',
    });
    if (error) throw new Error('Stempeln fehlgeschlagen');
  }
  async function stopEntry(id) {
    if (!useSupabase) return Store.stopEntry(id);
    await sb.from('time_entries').update({ end_ts: Date.now() }).eq('id', id).is('end_ts', null);
  }
  async function updateEntry(id, start_ts, end_ts, note) {
    if (!useSupabase) return Store.updateEntry(id, start_ts, end_ts, note);
    if (end_ts !== null && end_ts < start_ts) throw new Error('Ende liegt vor Beginn');
    await sb.from('time_entries').update({ start_ts, end_ts, note }).eq('id', id);
  }
  async function deleteEntry(id) {
    if (!useSupabase) return Store.deleteEntry(id);
    await sb.from('time_entries').delete().eq('id', id);
  }

  async function entries(filter = {}) {
    if (!useSupabase) return Store.entries(filter);
    await autoCloseStale();
    // Nur nach Datum vorfiltern, Split über den gesamten Bereich berechnen,
    // DANN nach Projekt/Kachel/Entwickler filtern – so bleibt die Aufteilung korrekt.
    let q = sb.from('time_entries').select(ENTRY_SELECT);
    if (filter.from) q = q.gte('start_ts', filter.from);
    if (filter.to) q = q.lte('start_ts', filter.to);
    q = q.order('start_ts', { ascending: false }).limit(2000);
    const { data } = await q;
    let rows = (data || []).map(decorate);
    const split = computeSplit(rows, Date.now());
    rows.forEach((r) => { r.split_ms = split[r.id] || 0; });
    if (filter.projekt_id) rows = rows.filter((r) => r.projekt_id === Number(filter.projekt_id));
    if (filter.kachel_id) rows = rows.filter((r) => r.kachel_id === Number(filter.kachel_id));
    if (filter.entwickler_id) rows = rows.filter((r) => r.entwickler_id === Number(filter.entwickler_id));
    return rows;
  }

  async function report(filter = {}) {
    if (!useSupabase) return Store.report(filter);
    const rows = await entries(filter);
    return buildReport(rows);
  }

  async function stats() {
    if (!useSupabase) return Store.stats();
    await autoCloseStale();
    const count = async (table, mod) => {
      let q = sb.from(table).select('id', { count: 'exact', head: true });
      if (mod) q = mod(q);
      const { count: c } = await q;
      return c || 0;
    };
    const [emp, prj, kac, run] = await Promise.all([
      count('entwickler', (q) => q.eq('active', true)),
      count('projekte', (q) => q.eq('active', true)),
      count('kacheln', (q) => q.eq('active', true)),
      count('time_entries', (q) => q.is('end_ts', null)),
    ]);
    return { entwickler: emp, projekte: prj, kacheln: kac, running: run };
  }

  // Einstellungen
  async function getSetting(key) {
    if (!useSupabase) return Store.getSetting(key);
    const { data } = await sb.from('settings').select('value').eq('key', key).single();
    return data ? data.value : '';
  }
  async function setSetting(key, value) {
    if (!useSupabase) return Store.setSetting(key, value);
    await sb.from('settings').upsert({ key, value });
  }

  return {
    isSync, init, session, login, logout,
    projekte, kacheln, entwickler,
    addEntwickler, updateEntwickler, addProjekt, addKachel, updateProjekt, updateKachel,
    setKachelProjekt,
    activeEntries, startEntry, stopEntry, updateEntry, deleteEntry,
    entries, report, stats, getSetting, setSetting,
  };
})();

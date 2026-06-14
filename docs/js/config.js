// ------------------------------------------------------------------
// Konfiguration für die Geräte-Synchronisation (Supabase).
//
// Solange hier nichts eingetragen ist, läuft die App im LOKALEN Modus
// (Daten nur in diesem Browser, keine Synchronisation).
//
// Sobald SUPABASE_URL und SUPABASE_ANON_KEY ausgefüllt sind, synchronisiert
// die App alle Daten zentral über alle Geräte. Die beiden Werte findest du
// im Supabase-Projekt unter:  Project Settings → API
//   - Project URL        -> SUPABASE_URL
//   - Project API keys: anon public  -> SUPABASE_ANON_KEY
// ------------------------------------------------------------------
window.ENTWICKLUNG_CONFIG = {
  SUPABASE_URL: 'https://eescelcasqurtimiuory.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_tm3CHGZY1f4hKbsHMBmwIA_GtYTfSYI',
};

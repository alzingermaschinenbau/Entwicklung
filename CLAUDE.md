# CLAUDE.md – Projekt Entwicklung (Entwicklungszeit-Erfassung)

**Aktuelle Version: v5** (= v4 + auch die große „Drucken/PDF"-Gesamtauswertung
ohne Browser-Kopf/-Fußzeile: `@page{margin:0}` im `@media print` von
`styles.css`, Innenabstand über `.wrap`/`#printArea`).

Vorher: **v4** (= v3 + PDF je Projekt ohne Browser-Kopf/-Fußzeile:
`@page{margin:0}` im Druck-Dokument, eigener Innenabstand über `.sheet`).

Vorher: **v3** (= v2 + überarbeitetes PDF/Druck-Layout: ALZINGER-Briefkopf in
Rot mit Logo, Kennzahlen-Leiste, rote Balken und gestreifte Tabellen in
`printProjektHours`; Logo auch im Auswertungs-Druckkopf).

Vorher: **v2** (= v1 + „Änderungswünsche": Textfeld in der Zeiterfassung,
Liste/„Erledigt" im Cockpit; gespeichert in `settings` unter `feedback`).

Web-App für Alzinger Maschinenbau: Entwickler wählen am Bildschirm
**Projekt + Kachel**, stempeln sich auf eine Kachel und beenden die Arbeit beim
Fertigstellen. Daraus entsteht die Auswertung (Zeit je Kachel, je Entwickler).
Bedienung siehe `README.md`.

Basis ist die bestehende **Montage**-App (gleiche Architektur), hier aber als
eigenständiges Projekt mit eigener Supabase-Datenbank. Begriffe sind angepasst:
Projekt / Kachel / Artikelnummer / Bezeichnung / Entwickler statt Maschine /
Baugruppe / Mitarbeiter. Entfernt gegenüber Montage: Ausstattung, Bilder,
NFC-Chip-Stempeln, Webkatalog, Standard-Seed.

## Architektur (nur Browser-Variante, GitHub Pages)

- Frontend statisch im Ordner `docs/`, **kein Build-Schritt**, Oberfläche
  **Deutsch**, Cache-Busting über `?v=…` an JS/CSS, Version im Header.
- Datenschicht `docs/js/db.js` (`DB`) mit zwei Backends, gleiche async-API:
  - **Lokal** (localStorage) → `docs/js/store.js` (`Store`)
  - **Sync** (Supabase) → direkt in `docs/js/db.js`
- Konfiguration: `docs/js/config.js` (`window.ENTWICKLUNG_CONFIG`). Leer =
  lokaler Modus.
- Seiten: `docs/index.html` (Login), `docs/erfassung.html` (Board,
  `docs/js/erfassung.js`), `docs/cockpit.html` (Auswertung/Verwaltung,
  `docs/js/cockpit.js`). Gemeinsame Helfer: `docs/js/common.js`.
- Schema: `supabase/schema.sql` (idempotent, `alter table … add column if not
  exists`). Tabellen: `projekte`, `kacheln` (mit `artikelnummer`, `name`,
  `projekt_id`), `entwickler`, `time_entries`, `settings`.

## Anmeldung / Zugänge

- **Ein kombinierter Zugang** sieht Zeiterfassung UND Auswertung (Rolle
  `admin`). Geprüft wird **clientseitig** (`Auth` in `docs/js/store.js`).
- Da `docs/` öffentlich ist, **kein Klartext-Passwort** – nur ein gesalzener
  **SHA-256-Hash** (`Auth.SALT` + Passwort), Vergleich per Web Crypto.
  - `SALT = 'AlzingerEntwicklung::'`
  - Benutzer `entwicklung` / Passwort `Lepton5100`
    (Hash `c5bcc589f0fdb6b742751a83f4317d6bb7a741cf14be41d6209cc8cddcf0bbf6`)
- Passwort ändern = neuen Hash `sha256(SALT + Passwort)` erzeugen und in
  `Auth.CREDS` eintragen. Kein Klartext committen.

## Stempel-Regeln (verbindlich)

- **Ein Entwickler kann gleichzeitig nur an genau EINER Kachel eingestempelt
  sein.** Mehrere Entwickler an derselben Kachel sind erlaubt.
- Will sich ein Entwickler an einer anderen Kachel einstempeln, während er noch
  eingestempelt ist, **erscheint eine Warnmeldung** (Hinweis, an welcher
  Kachel/Projekt) und der neue Start wird **abgelehnt**.
- Umsetzung beim Start (kein offener Eintrag `end_ts IS NULL` desselben
  Entwicklers): `docs/js/store.js` → `startEntry()` (lokal),
  `docs/js/db.js` → `startEntry()` (Supabase). Meldung über `toast(e.message)`.

## Automatisches Ausstempeln (Feierabend)

- Vergessene offene Einträge werden **um 17:00** gekappt (`FEIERABEND_HOUR` in
  `docs/js/common.js`); Start nach 17:00 → Tagesende (Mitternacht).
- Umsetzung „lazy" beim Lesen (`activeEntries`/`entries`/`report`/`stats`):
  `Store._autoCloseStale()` bzw. `DB.autoCloseStale()`. Notiz:
  `Automatisch um 17:00 beendet`.

## Pausen & Soll-Arbeitszeit

- Pausen automatisch abgezogen (`breakWindows`/`netDuration` in `common.js`):
  Mo–Do 09:00–09:15 und 12:00–12:45, Fr 09:00–09:30.
- Soll (`sollNetMs`): Mo–Do 07:00–16:45, Fr 07:00–12:30; Sa/So und bayerische
  Feiertage = 0.

## Langläufer-Warnung (Cockpit)

Noch laufende Einträge über `LANGLAEUFER_MS` (9 h netto) werden in der
Cockpit-Übersicht rot markiert.

## Auswertung / PDF

- Zeit je Kachel und je Entwickler, Filter nach Zeitraum/Projekt, Detail
  „wer/wann/wieviel".
- **PDF je Projekt** (`printProjektHours` in `docs/js/cockpit.js`) schreibt ein
  eigenes Druck-Dokument in ein neues Fenster (iOS-robust); Fallback über
  `#printArea` + `body.print-machines`, falls Popups blockiert sind.

## Datensicherung

- GitHub Action `.github/workflows/backup.yml`: täglich **23:00 Europe/Berlin**
  (DST-sicher über zwei Cron-Zeiten + Prüfung), exportiert die Supabase-Tabellen
  als JSON-**Artifact** (90 Tage). Erfordert Repo-Variable `SUPABASE_URL` und
  Secret `SUPABASE_KEY`.

## Konventionen

- Sprache der Oberfläche und Meldungen: **Deutsch**.
- Kein Build-Schritt (statisches HTML/CSS/JS).
- Versionsstände informell als `v<N>` (oben in dieser Datei + Cache-Busting
  `?v=…`). Bei UI-/JS-/CSS-Änderungen die Version in `docs/js/common.js`
  (`APP_VERSION`) und die `?v=` in den HTML-Dateien erhöhen.

## Schnell-Check nach Änderungen

```bash
node -c docs/js/common.js
node -c docs/js/store.js
node -c docs/js/db.js
node -c docs/js/erfassung.js
node -c docs/js/cockpit.js
```

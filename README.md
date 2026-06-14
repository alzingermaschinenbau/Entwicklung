# Entwicklung – Zeiterfassung (Alzinger Maschinenbau)

Web-App zur Zeiterfassung für das Entwicklungsteam. Entwickler wählen am
Bildschirm **Projekt + Kachel**, starten die Arbeit und beenden sie beim
Fertigstellen. Im Hintergrund entsteht eine Auswertung: welche Kachel wie lange
gedauert hat und wer daran gearbeitet hat.

Die App ist eine eigenständige, statische Anwendung (kein Build-Schritt) und
läuft auf GitHub Pages aus dem Ordner `docs/`. Die Datenhaltung erfolgt über
Supabase (geräteübergreifend) oder – solange keine Supabase-Schlüssel
hinterlegt sind – lokal im Browser (localStorage).

## Struktur

- **Projekte** (Reiter oben) – frei anlegbar, beschriftbar und deaktivierbar.
- **Kacheln** (Grid darunter) – jede Kachel hat **Artikelnummer + Bezeichnung**,
  frei anlegbar und einem Projekt zuordenbar (oder „allgemein" für alle).

## Funktionen

- **Zeiterfassung** (`erfassung.html`)
  - Übersicht je Projekt mit allen Kacheln
  - Start/Stopp pro Kachel – Entwickler wird beim Start ausgewählt
  - Mehrere Entwickler können gleichzeitig an einer Kachel arbeiten
  - Ein Entwickler kann gleichzeitig nur an **einer** Kachel eingestempelt sein
    (sonst Warnmeldung mit Hinweis, wo er noch eingestempelt ist)
  - Live-Timer der laufenden Arbeiten
- **Cockpit / Auswertung** (`cockpit.html`)
  - Übersicht mit Kennzahlen und laufenden Arbeiten
    (Langläufer > 9 h netto werden **rot** markiert)
  - **Auswertung**: Zeit je Kachel (mit Balken) inkl. beteiligter Entwickler,
    Zeit je Entwickler, Filter nach Zeitraum und Projekt
  - **Kacheln je Projekt** mit Detail (wer/wann/wieviel) und **PDF je Projekt**
    (eigenes Druck-Fenster, iOS-robust)
  - Stunden je Entwickler (Soll/Ist je Tag), bayerische Feiertage
  - **Zeiteinträge** ansehen, korrigieren (Beginn/Ende/Notiz) oder löschen
  - **Entwickler** sowie **Projekte & Kacheln** verwalten

## Anmeldung

Ein kombinierter Zugang sieht **Zeiterfassung und Auswertung**:

| Benutzer      | Passwort     |
|---------------|--------------|
| `Entwicklung` | `Lepton5100` |

Die Anmeldung wird **clientseitig** geprüft. Da `docs/` öffentlich ist, steht
dort **kein Klartext-Passwort**, sondern nur ein gesalzener **SHA-256-Hash**
(Web Crypto). Groß-/Kleinschreibung des Benutzernamens ist egal.

## GitHub Pages einrichten

1. Im Repo: **Settings → Pages → Source: Deploy from a branch**
2. Branch `main`, Ordner **`/docs`** auswählen, speichern.
3. Nach kurzer Zeit ist die App erreichbar unter
   `https://alzingermaschinenbau.github.io/Entwicklung/`

## Geräte-Synchronisation (Supabase)

Solange `docs/js/config.js` leer ist, läuft die App im **lokalen Modus**
(Daten nur im jeweiligen Browser). Für zentrale, geteilte Daten die beiden
Supabase-Schlüssel eintragen – Anleitung in
**[`SETUP-SUPABASE.md`](SETUP-SUPABASE.md)**.

## Datensicherung

Täglich **23:00 Europe/Berlin** exportiert die GitHub Action
`.github/workflows/backup.yml` die Supabase-Tabellen als JSON und lädt sie als
**Artifact** hoch (Aufbewahrung 90 Tage). Voraussetzung: Repo-Variable
`SUPABASE_URL` und Secret `SUPABASE_KEY` hinterlegen.

## Logik (Regeln)

- **Ein Entwickler kann gleichzeitig nur an genau EINER Kachel eingestempelt
  sein.** Mehrere Entwickler an derselben Kachel sind erlaubt.
- **Automatisches Ausstempeln um 17:00**: vergessene (offene) Einträge werden
  auf 17:00 des Starttags gekappt; Start nach 17:00 → Tagesende (Mitternacht).
- **Pausen** werden automatisch abgezogen (Mo–Do 09:00–09:15 und 12:00–12:45,
  Fr 09:00–09:30).
- **Soll-Arbeitszeit**: Mo–Do 07:00–16:45, Fr 07:00–12:30; Sa/So und
  bayerische Feiertage = 0.

# Geräte-Synchronisation einrichten (Supabase) – einfacher Modus

Damit sich die Entwicklungs-Daten über **alle Geräte** synchronisieren,
brauchst du ein kostenloses Supabase-Projekt. Das machst du **einmal**. Der
Login läuft wie gewohnt in der App (`Entwicklung` / `Lepton5100`) – es müssen
**keine** Benutzer in Supabase angelegt werden.

Dauer: ca. 5 Minuten.

---

## 1. Projekt anlegen
1. Auf <https://supabase.com> anmelden → **New project**.
2. Name z. B. `entwicklung`, Datenbank-Passwort vergeben, Region **Central EU
   (Frankfurt)** → **Create**. Kurz warten, bis es bereit ist.

## 2. Datenbank einrichten
1. Links **SQL Editor** → **New query**.
2. Den **kompletten Inhalt** von `supabase/schema.sql` einfügen → **Run**.
   Ergebnis: „Success".

## 3. Die zwei Schlüssel in die App eintragen
1. In Supabase: **Project Settings → API**:
   - **Project URL**
   - **anon public** key
2. In `docs/js/config.js` eintragen:
   ```js
   window.ENTWICKLUNG_CONFIG = {
     SUPABASE_URL: 'https://DEINPROJEKT.supabase.co',
     SUPABASE_ANON_KEY: 'eyJ... (anon public key)',
   };
   ```
3. Committen/pushen. Nach dem nächsten GitHub-Pages-Build synchronisieren alle
   Geräte.

## 4. (Optional) Tägliche Datensicherung aktivieren
Für die GitHub Action `.github/workflows/backup.yml` im Repo hinterlegen:
**Settings → Secrets and variables → Actions**
- **Variables → New variable**: `SUPABASE_URL` = deine Project URL
- **Secrets → New secret**: `SUPABASE_KEY` = anon public key (oder Service-Key)

---

## Hinweise

- Der anon-Key ist für den Browser gedacht und darf veröffentlicht werden.
  Da der Zugriff offen ist (wie beim CRM), sind die Daten nicht streng
  geschützt – für einen internen Betrieb ist das in der Regel ausreichend.
- Solange `config.js` leer ist, läuft die App im **lokalen Modus** (Daten nur
  im jeweiligen Browser).

Wenn du möchtest, trage ich Schritt 3 für dich ein – schick mir einfach die
**Project URL** und den **anon public** Key.

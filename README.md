# claude-voice

Mit Claude Code reden statt tippen — auf macOS, mit lokaler Spracherkennung.

Drei Wege, die sich dieselbe Konfiguration und dieselbe Sprachausgabe teilen:

| | was es tut |
|---|---|
| **Vorlese-Hook** | Claude Code liest jede fertige Antwort vor. Du tippst weiter wie immer. |
| **`claude-voice`** | Freisprech-Loop im Terminal: reden, kurz Pause, Antwort kommt gesprochen zurück. |
| **`claude-voice-ui`** | Lokale Browser-UI mit Push-to-Talk-Knopf und Waveform. |

Die Spracherkennung läuft komplett lokal über [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
Nur der fertig transkribierte Text geht an die Claude-API — Audio verlässt den Rechner nie.

## Installation

```bash
git clone <dieses-repo> ~/claude-voice
cd ~/claude-voice && ./install.sh
```

`install.sh` prüft die Abhängigkeiten, legt Symlinks nach `~/.claude`, kopiert die
Beispielkonfiguration, lädt auf Wunsch das Whisper-Modell (~547 MB) und registriert
den Stop-Hook in `settings.json`. Nichts wird überschrieben, was schon existiert.

Abhängigkeiten: `brew install whisper-cpp sox ffmpeg jq` plus Node (für die UI).

Danach `~/.claude/bin` in den PATH und `~/.claude/hooks/voice on`.

## Benutzung

```bash
claude-voice              # Freisprech-Loop, neue Session
claude-voice --last       # letzte Voice-Session fortsetzen
claude-voice --yolo       # Tools ohne Rückfrage (bypassPermissions)

claude-voice-ui           # Browser-UI auf 127.0.0.1:7331
claude-voice-ui --port N

~/.claude/hooks/voice on|off|toggle|stop|test|voices|status
```

Im Loop beendet „stopp" oder Ctrl-C. In der UI: Klick oder Leertaste halten zum
Sprechen, Esc bricht die Ausgabe ab.

## Sprachausgabe

Alles spricht über `bin/claude-say`. Ohne Konfiguration nimmt es die macOS-Stimme.
Liegt ein ElevenLabs-Key vor, nimmt es den — und fällt bei jedem API-Fehler
(Kontingent leer, Key ungültig) still auf die Systemstimme zurück statt zu verstummen.

```bash
security add-generic-password -a "$USER" -s elevenlabs-api-key -w
claude-say --doctor     # Key gegen die API prüfen
claude-say --list       # verfügbare Stimmen und Modelle des Accounts
```

Alternativ die Umgebungsvariable `ELEVENLABS_API_KEY`.

## Konfiguration

`~/.claude/voice.conf` gilt überall, `~/.claude/voice-loop.conf` überschreibt sie
für Loop und UI. Siehe `conf/*.example` für alle Schalter. Die wichtigsten:

- `CLAUDE_MODEL` — leer heißt dein Default. Für ein Gespräch ist ein schnelleres
  Modell oft angenehmer als das stärkste.
- `SILENCE_SEC` — wie lange Stille die Aufnahme beendet. Höher, wenn dir der Loop
  beim Nachdenken ins Wort fällt.
- `MIN_DUR` — kurze Einwürfe wie „ja" werden sonst als Husten verworfen.
- `VOCAB` — Fachwörter, auf die Whisper vorgespannt wird. Ohne das wird aus
  „Stop Hook" gern „Stopthook".

## Wie es zusammenhängt

```
Mikro ──> sox rec ──> whisper.cpp ──> claude -p ──> claude-say ──> Lautsprecher
          (Stille      (lokal, de)     (eigene       (ElevenLabs
           erkennen)                    Session)      oder say)
```

Loop und UI melden sich für ihre Laufzeit in `~/.claude/voice-locks/` an (eine Datei
pro PID). Der Stop-Hook schweigt, solange dort ein lebender Prozess steht — sonst
spräche jede Antwort doppelt. Tote Einträge nach einem Absturz werden beim nächsten
Blick aufgeräumt, und zwei parallele Instanzen melden sich nicht gegenseitig ab.

Antworten im Loop und in der UI sind per `--append-system-prompt` auf drei bis vier
Sätze ohne Markdown begrenzt. Vorgelesene Codeblöcke sind unbrauchbar.

## Bekannte Grenzen

- Nur macOS (`say`, `afplay`, sox-Aufnahme über CoreAudio).
- Der Headless-Modus von `claude -p` verweigert ohne `--yolo` Tool-Aufrufe, die eine
  Bestätigung bräuchten — stillschweigend. Für echte Arbeit im Loop brauchst du das Flag.
- Kein Wake-Word. Der Loop nimmt auf, sobald es laut genug wird.
- Die UI bindet nur an `127.0.0.1`, weil der Endpunkt `claude -p` startet. Nicht ins
  Netz stellen.

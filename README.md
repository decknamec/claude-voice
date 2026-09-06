# claude-voice

Mit Claude Code reden statt tippen — auf macOS, mit lokaler Spracherkennung.

Drei Wege, die sich dieselbe Konfiguration und dieselbe Sprachausgabe teilen:

| | was es tut |
|---|---|
| **Vorlese-Hook** | Claude Code liest jede fertige Antwort vor. Du tippst weiter wie immer. |
| **`claude-voice`** | Freisprech-Loop im Terminal: reden, kurz Pause, Antwort kommt gesprochen zurück. |
| **`claude-voice-ui`** | Lokale Browser-UI: Push-to-Talk, mitlaufender Text, Freigaben für Werkzeuge, Abbrechen. |

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

Abhängigkeiten: `brew install whisper-cpp sox ffmpeg jq`. Die UI braucht zusätzlich
Node und holt sich beim ersten Start das Agent SDK per `npm install` (einmalig).

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
Sprechen, **Esc** oder „abbrechen" hält den laufenden Turn samt Sprachausgabe an,
„beenden" fährt den Server herunter.

Die UI hält **eine** Agent-Session offen, statt pro Äußerung einen neuen Prozess
zu starten. Das bringt drei Dinge, die vorher nicht gingen:

- **Antwort in ~2 s statt ~13 s.** Der Prozessstart dominierte vorher alles.
- **Text läuft mit,** während er entsteht; jeder fertige Satz geht sofort in die
  Sprachausgabe, statt auf die komplette Antwort zu warten.
- **Freigaben.** Will Claude ein Werkzeug benutzen, das eine Bestätigung braucht,
  erscheint eine Karte mit Werkzeugname und Parametern. Der Turn hält an, bis du
  entschieden hast. Über die CLI ist das nicht möglich — sie lehnt solche Aufrufe
  im Headless-Betrieb kommentarlos ab, ohne zu fragen.

Der Berechtigungsmodus lässt sich im Kopf umschalten und gilt sofort für die
laufende Session — von „fragt nach" bis „ohne jede Rückfrage". Letzteres wird
rot dargestellt, weil es jede Bestätigung abschaltet.

Der Server verlangt ein Token, das beim Start erzeugt und in die geöffnete URL
gehängt wird. Ohne das könnte jede Webseite, die du im selben Browser offen hast,
die Endpunkte auslösen — „nur localhost" schützt davor nicht.

## Sprachausgabe

Alles spricht über `bin/claude-say`. Drei Backends, umschaltbar per `TTS_BACKEND`
in der Konfig oder `--tts` beim Start:

| Backend | Erzeugung | Kosten | Anmerkung |
|---|---|---|---|
| `elevenlabs` | ~1,1 s | Credits | beste Qualität, braucht Netz und Key |
| `edge` | ~0,5 s | – | Microsoft-Neural-Stimmen, kostenlos, ohne Key. **Nicht lokal** — geht über einen undokumentierten Endpunkt |
| `piper` | ~0,7 s | – | lokal und offline, hörbar synthetischer |
| `say` | sofort | – | macOS-Systemstimme, sprödeste Qualität |

`auto` (Default) nimmt ElevenLabs wenn ein Key da ist, sonst Edge, Piper, `say`.
In der Browser-UI lässt sich Backend und Stimme im Kopf umschalten; was nicht
eingerichtet ist, erscheint ausgegraut mit dem Grund daneben.
Ein fehlschlagendes Backend fällt immer auf `say` zurück — Stille wäre die
schlechteste Antwort, wenn man auf eine Sprachausgabe wartet.

```bash
claude-voice --tts piper
claude-voice-ui --tts piper
claude-say --backends        # was ist verfügbar und aktiv
claude-say --tts edge --voice de-DE-ConradNeural "Text"
```

Warum nicht Kokoro, MLX Audio, Kimi oder Gemma: [docs/tts-evaluation.md](docs/tts-evaluation.md).

**Edge einrichten** (kostenlos, kein Key):

```bash
uv tool install edge-tts
edge-tts --list-voices | grep ^de-
```

**Piper einrichten** (lokal, kostenlos):

```bash
uv tool install piper-tts
mkdir -p ~/.claude/piper-voices && cd ~/.claude/piper-voices
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE
curl -fLO $B/thorsten/medium/de_DE-thorsten-medium.onnx
curl -fLO $B/thorsten/medium/de_DE-thorsten-medium.onnx.json
```

Andere deutsche Stimmen liegen unter `de/de_DE/` im selben Repository
(kerstin, eva_k, karlsson, pavoque, ramona), Pfad dann in `PIPER_MODEL` eintragen.

**ElevenLabs einrichten:** Liegt ein Key vor, wird er genutzt.

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
Loop:  Mikro ─> sox rec ─> whisper.cpp ─> claude -p ────────> claude-say ─> 🔈
                (Stille)    (lokal)       (Prozess je Turn)

UI:    Mikro ─> Browser ─> whisper-server ─> Agent SDK ──┬──> claude-say ─> 🔈
                            (Modell bleibt   (eine offene │     (satzweise)
                             geladen)         Session)    └──> Freigabe-Karte
```

Der Loop startet weiterhin einen Prozess je Äußerung — für ein Terminal-Werkzeug
ist das vertretbar. Die UI hält die Session offen, weil sie Freigaben und
mitlaufenden Text braucht.

Loop und UI melden sich für ihre Laufzeit in `~/.claude/voice-locks/` an (eine Datei
pro PID). Der Stop-Hook schweigt, solange dort ein lebender Prozess steht — sonst
spräche jede Antwort doppelt. Tote Einträge nach einem Absturz werden beim nächsten
Blick aufgeräumt, und zwei parallele Instanzen melden sich nicht gegenseitig ab.

Antworten im Loop und in der UI sind per `--append-system-prompt` auf drei bis vier
Sätze ohne Markdown begrenzt. Vorgelesene Codeblöcke sind unbrauchbar.

## Bekannte Grenzen

- Nur macOS (`say`, `afplay`, sox-Aufnahme über CoreAudio).
- Der CLI-Loop startet weiterhin einen Prozess je Äußerung (~13 s pro Turn). Wer
  Tempo will, nimmt die UI (~2 s). Der Umbau des Loops steht aus.
- Freigaben gibt es nur in der UI. Der Loop verweigert ohne `--yolo` weiterhin
  stillschweigend alles, was eine Bestätigung bräuchte.
- Der Headless-Modus von `claude -p` verweigert ohne `--yolo` Tool-Aufrufe, die eine
  Bestätigung bräuchten — stillschweigend. Für echte Arbeit im Loop brauchst du das Flag.
- Kein Wake-Word. Der Loop nimmt auf, sobald es laut genug wird.
- Die UI bindet nur an `127.0.0.1`, weil der Endpunkt `claude -p` startet. Nicht ins
  Netz stellen.

## Tests

```bash
tests/smoke.sh
```

Kein Netz, keine API-Aufrufe, wenige Sekunden. Deckt die Fehlerklasse ab, die beim
Bau wiederholt zugeschlagen hat: bash-3.2-Syntax (macOS liefert kein bash 4),
Argument-Parsing, Vorrang der Konfigquellen, Lock-Verhalten bei zwei parallelen
Sprechern, Textaufbereitung, und ob die UI-Endpunkte hinter der Token-Prüfung liegen.

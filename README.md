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
Sprechen, Esc bricht die Ausgabe ab, „beenden" im Kopf fährt den Server herunter
und schließt die Session.

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

## Geprüfte Alternativen, die nicht taugten

Alles auf einem M5 mit demselben deutschen Satz gemessen, damit das niemand
noch einmal durchspielen muss:

| Kandidat | Ergebnis |
|---|---|
| **Kokoro-82M** | Kann kein Deutsch. Unterstützt nur EN, JA, ZH, ES, FR, HI, IT, PT — trotz häufiger Empfehlung als bestes leichtgewichtiges Modell. |
| **MLX Audio** | Läuft, aber die deutschfähigen Modelle sind nicht portiert. `mlx-community/chatterbox-turbo-*` ist die englische Variante (meldet `Language: en`), KugelAudio hat gar keinen MLX-Port. Warm 4,06 s pro Satz. |
| **Kimi-Audio** | Kann Sprache erzeugen, aber 10B Parameter, nur `en`/`zh`, auf CUDA und Docker ausgelegt. Auf einem Mac unpraktisch. |
| **Gemma** | Kein TTS. Die Audio-Fähigkeit der E2B/E4B-Modelle ist Eingabe, nicht Ausgabe. Googles TTS heißt Gemini TTS und ist Cloud plus kostenpflichtig. |

Noch nicht geprüft, aber plausibel für besseres lokales Deutsch:
[Chatterbox Multilingual](https://huggingface.co/ResembleAI/chatterbox) (0,5B
Llama-Backbone, MIT, 23 Sprachen inklusive Deutsch) und
[CrispTTS](https://github.com/CrispStrobe/CrispTTS), ein CLI explizit für
deutsches TTS. Beide brauchen PyTorch.

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
- Die Sprachausgabe ist nicht der Flaschenhals: ein Turn kostet ~13 s, davon ~1 s
  das Sprechen. Der Rest ist der Start eines frischen `claude -p` je Äußerung.
- Der Headless-Modus von `claude -p` verweigert ohne `--yolo` Tool-Aufrufe, die eine
  Bestätigung bräuchten — stillschweigend. Für echte Arbeit im Loop brauchst du das Flag.
- Kein Wake-Word. Der Loop nimmt auf, sobald es laut genug wird.
- Die UI bindet nur an `127.0.0.1`, weil der Endpunkt `claude -p` startet. Nicht ins
  Netz stellen.

# Geprüfte TTS-Alternativen

Kandidaten für lokale deutsche Sprachausgabe, alle auf einem M5 mit demselben
Satz gemessen. Festgehalten, damit das niemand noch einmal durchspielt.

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

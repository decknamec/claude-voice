# TTS alternatives that were evaluated

Candidates for local German speech output, all measured on an M5 with the same
sentence. Recorded so nobody has to work through it again.

| Candidate | Result |
|---|---|
| **Kokoro-82M** | Cannot do German. Supports only EN, JA, ZH, ES, FR, HI, IT, PT, despite being frequently recommended as the best lightweight model. |
| **MLX Audio** | Runs, but the German-capable models are not ported. `mlx-community/chatterbox-turbo-*` is the English variant (it reports `Language: en`), and KugelAudio has no MLX port at all. 4.06 s per sentence warm. |
| **Kimi-Audio** | Can generate speech, but it is 10B parameters, `en`/`zh` only, and built for CUDA and Docker. Impractical on a Mac. |
| **Gemma** | Not a TTS model. The audio capability of the E2B/E4B models is input, not output. Google's TTS is called Gemini TTS and is cloud-hosted and paid. |

Not evaluated yet, but plausible for better local German:
[Chatterbox Multilingual](https://huggingface.co/ResembleAI/chatterbox) (0.5B
Llama backbone, MIT, 23 languages including German) and
[CrispTTS](https://github.com/CrispStrobe/CrispTTS), a CLI explicitly for German
TTS. Both need PyTorch.

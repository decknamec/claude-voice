import { api } from './api.ts'

// Alles Hörbare und alles, was sich pro Bild ändert, lebt hier — außerhalb von
// React. Pegel, Wellenform und Sprachaktivität ändern sich mit der Bildrate;
// sie durch den Zustand einer Komponente zu schleifen hieße, den Baum
// sechzigmal in der Sekunde neu zu zeichnen.

const VAD_WORKLET = `
class Vad extends AudioWorkletProcessor {
  constructor () {
    super()
    // process() läuft je Renderquantum von 128 Samples — bei 48 kHz sind das
    // 2,67 ms. Blockzahlen deshalb aus der Abtastrate rechnen, nicht raten.
    const proSek = sampleRate / 128
    this.startB = Math.round(0.20 * proSek)
    this.endB   = Math.round(0.90 * proSek)
    this.calibB = Math.round(1.00 * proSek)
    this.floor = 0.012; this.calib = []
    this.hot = 0; this.quiet = 0; this.recording = false; this.n = 0
    this.port.onmessage = e => {
      if (e.data.recording !== undefined) { this.recording = e.data.recording; this.hot = 0; this.quiet = 0 }
      if (e.data.recalibrate) { this.calib = [] }
      if (e.data.tune) {
        if (e.data.tune.startSec) this.startB = Math.round(e.data.tune.startSec * proSek)
        if (e.data.tune.endSec)   this.endB   = Math.round(e.data.tune.endSec * proSek)
      }
    }
  }
  process (inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    let sum = 0
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]
    const rms = Math.sqrt(sum / ch.length)

    if (this.calib.length < this.calibB) {
      this.calib.push(rms)
      if (this.calib.length === this.calibB) {
        // Median statt Maximum: ein einzelnes Klacken beim Einschalten würde
        // den Grundpegel sonst auf Sprachniveau heben und alles taub machen.
        const sorted = [...this.calib].sort((a, b) => a - b)
        const med = sorted[sorted.length >> 1]
        this.floor = Math.max(0.010, med * 3.5)
        this.port.postMessage({ type: 'ready', floor: this.floor })
      }
      return true
    }

    // Hysterese: zum Anspringen muss es deutlich über dem Grundpegel liegen,
    // zum Aufhören deutlich darunter. Ohne das zählen die Atempausen zwischen
    // zwei Wörtern schon als Satzende.
    if (this.recording) {
      this.quiet = rms < this.floor * 0.65 ? this.quiet + 1 : 0
      if (this.quiet > this.endB) { this.quiet = 0; this.port.postMessage({ type: 'end' }) }
    } else {
      this.hot = rms > this.floor ? this.hot + 1 : 0
      if (this.hot > this.startB) { this.hot = 0; this.port.postMessage({ type: 'start' }) }
    }
    if ((this.n++ % 12) === 0) this.port.postMessage({ type: 'level', rms, floor: this.floor })
    return true
  }
}
registerProcessor('vad', Vad)
`

export type VadNachricht =
  | { type: 'start' } | { type: 'end' }
  | { type: 'ready'; floor: number }
  | { type: 'level'; rms: number; floor: number }

type Horcher = {
  aufnahmeFertig?: (blob: Blob) => void
  vorschau?: (text: string) => void
  vad?: (m: VadNachricht) => void
  wiedergabe?: () => void
}

class Audio1 {
  stream: MediaStream | null = null
  ac: AudioContext | null = null
  analyser: AnalyserNode | null = null
  daten: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  private quelle: MediaStreamAudioSourceNode | null = null
  private knoten: AudioWorkletNode | null = null
  private rec: MediaRecorder | null = null
  private stuecke: Blob[] = []
  private vorschauLaeuft = false
  private horcher: Horcher = {}

  pegel = 0
  grundpegel = 0.012

  // ── Wiedergabe ─────────────────────────────────────────────────────
  // Im Browser, nicht auf dem Server: nur so kann die Echounterdrückung von
  // getUserMedia die eigene Stimme herausrechnen und Dazwischenreden geht.
  readonly el = new Audio()
  private schlange: string[] = []
  private laeuft = false
  tempo = 1

  constructor () {
    this.el.preload = 'auto'
    this.el.addEventListener('ended', () => this.weiter())
    this.el.addEventListener('error', () => this.weiter())
  }

  an (h: Horcher) { this.horcher = { ...this.horcher, ...h } }

  private weiter () {
    this.laeuft = false
    this.abspielen()
    this.horcher.wiedergabe?.()
  }

  einreihen (id: string) { this.schlange.push(id); this.abspielen(); this.horcher.wiedergabe?.() }

  private abspielen () {
    if (this.laeuft || !this.schlange.length) return
    const id = this.schlange.shift()!
    this.laeuft = true
    this.el.src = api.audioUrl(id)
    this.el.playbackRate = this.tempo
    this.el.play().catch(() => { this.laeuft = false; this.abspielen() })
  }

  stopp () {
    this.schlange.length = 0
    this.el.pause(); this.el.removeAttribute('src'); this.el.load()
    this.laeuft = false
    this.horcher.wiedergabe?.()
  }

  spricht () { return this.laeuft || this.schlange.length > 0 }
  stumm (an: boolean) { this.el.muted = an; if (an) this.stopp() }
  setzeTempo (t: number) { this.tempo = t; this.el.playbackRate = t }

  // ── Aufnahme ───────────────────────────────────────────────────────
  async mikro () {
    if (this.stream) return this.stream
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    this.ac = new AudioContext()
    this.analyser = this.ac.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.75
    this.quelle = this.ac.createMediaStreamSource(this.stream)
    this.quelle.connect(this.analyser)
    this.daten = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount))
    return this.stream
  }

  async starteAufnahme () {
    await this.mikro()
    if (this.ac!.state === 'suspended') await this.ac!.resume()
    this.stuecke = []
    this.rec = new MediaRecorder(this.stream!, { mimeType: 'audio/webm' })
    this.rec.ondataavailable = e => {
      if (e.data.size) { this.stuecke.push(e.data); void this.vorschauTick() }
    }
    this.rec.onstop = () => {
      const blob = new Blob(this.stuecke, { type: 'audio/webm' })
      this.stuecke = []
      this.horcher.aufnahmeFertig?.(blob)
    }
    // Häppchenweise, damit die Vorschau schon während des Sprechens etwas hat.
    // Der erste Block trägt den Container-Header, also ist jedes Präfix gültig.
    this.rec.start(900)
    this.vadModus(true)
  }

  stoppeAufnahme () {
    this.vadModus(false)
    if (this.rec && this.rec.state === 'recording') this.rec.stop()
  }

  nimmtAuf () { return this.rec?.state === 'recording' }

  /** Zwischenstand anzeigen. Beiwerk: ein Fehler hier darf nichts stoppen. */
  private async vorschauTick () {
    if (this.vorschauLaeuft || this.stuecke.length < 2) return
    this.vorschauLaeuft = true
    try {
      const { said } = await api.vorschau(new Blob(this.stuecke, { type: 'audio/webm' }))
      if (said) this.horcher.vorschau?.(said)
    } catch { /* still */ }
    finally { this.vorschauLaeuft = false }
  }

  // ── Sprachaktivität ────────────────────────────────────────────────
  async haengeVadAn () {
    if (this.knoten || !this.ac) return
    const url = URL.createObjectURL(new Blob([VAD_WORKLET], { type: 'application/javascript' }))
    await this.ac.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    this.knoten = new AudioWorkletNode(this.ac, 'vad', { numberOfOutputs: 0 })
    this.quelle!.connect(this.knoten)
    this.knoten.port.onmessage = e => {
      const m = e.data as VadNachricht
      if (m.type === 'level') { this.pegel = m.rms; this.grundpegel = m.floor }
      if (m.type === 'ready') this.grundpegel = m.floor
      this.horcher.vad?.(m)
    }
  }

  /** Der Worklet muss wissen, ob gerade aufgenommen wird — sonst kann er
   *  Anfang und Ende nicht unterscheiden. */
  vadModus (recording: boolean) { this.knoten?.port.postMessage({ recording }) }
  neuKalibrieren () { this.knoten?.port.postMessage({ recalibrate: true }) }
  stellen (o: { startSec?: number; endSec?: number }) { this.knoten?.port.postMessage({ tune: o }) }

  /** Momentaner Pegel für die Wellenform, 0 bis 1. */
  jetzt () {
    if (!this.analyser) return 0
    this.analyser.getByteFrequencyData(this.daten)
    let s = 0
    for (let i = 0; i < this.daten.length; i++) s += this.daten[i]
    return s / this.daten.length / 255
  }
}

export const audio = new Audio1()

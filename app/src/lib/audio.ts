import { api } from './api.ts'

/**
 * Everything audible and everything that changes per frame lives here, outside
 * React. Level, waveform and voice activity change at frame rate; routing them
 * through component state would redraw the tree sixty times a second.
 */

const VAD_WORKLET = `
class Vad extends AudioWorkletProcessor {
  constructor () {
    super()
    // process() runs per render quantum of 128 samples, which is 2.67 ms at
    // 48 kHz. Block counts are derived from the sample rate rather than assumed.
    const perSecond = sampleRate / 128
    this.startBlocks = Math.round(0.20 * perSecond)
    this.endBlocks   = Math.round(0.90 * perSecond)
    this.calibBlocks = Math.round(1.00 * perSecond)
    this.floor = 0.012; this.calib = []
    this.hot = 0; this.quiet = 0; this.recording = false; this.n = 0
    this.port.onmessage = e => {
      if (e.data.recording !== undefined) { this.recording = e.data.recording; this.hot = 0; this.quiet = 0 }
      if (e.data.recalibrate) { this.calib = [] }
      if (e.data.tune) {
        if (e.data.tune.startSec) this.startBlocks = Math.round(e.data.tune.startSec * perSecond)
        if (e.data.tune.endSec)   this.endBlocks   = Math.round(e.data.tune.endSec * perSecond)
      }
    }
  }
  process (inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    let sum = 0
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]
    const rms = Math.sqrt(sum / ch.length)

    if (this.calib.length < this.calibBlocks) {
      this.calib.push(rms)
      if (this.calib.length === this.calibBlocks) {
        // Median rather than maximum: a single click while switching on would
        // otherwise lift the floor to speech level and deafen the detector.
        const sorted = [...this.calib].sort((a, b) => a - b)
        const median = sorted[sorted.length >> 1]
        this.floor = Math.max(0.010, median * 3.5)
        this.port.postMessage({ type: 'ready', floor: this.floor })
      }
      return true
    }

    // Hysteresis: starting needs a level clearly above the floor, stopping one
    // clearly below. Without it the breath between two words counts as the end
    // of a sentence.
    if (this.recording) {
      this.quiet = rms < this.floor * 0.65 ? this.quiet + 1 : 0
      if (this.quiet > this.endBlocks) { this.quiet = 0; this.port.postMessage({ type: 'end' }) }
    } else {
      this.hot = rms > this.floor ? this.hot + 1 : 0
      if (this.hot > this.startBlocks) { this.hot = 0; this.port.postMessage({ type: 'start' }) }
    }
    if ((this.n++ % 12) === 0) this.port.postMessage({ type: 'level', rms, floor: this.floor })
    return true
  }
}
registerProcessor('vad', Vad)
`

export type VadMessage =
  | { type: 'start' } | { type: 'end' }
  | { type: 'ready'; floor: number }
  | { type: 'level'; rms: number; floor: number }

type Listeners = {
  recordingDone?: (blob: Blob) => void
  preview?: (text: string) => void
  vad?: (m: VadMessage) => void
  playback?: () => void
}

class AudioEngine {
  stream: MediaStream | null = null
  ac: AudioContext | null = null
  analyser: AnalyserNode | null = null
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  private source: MediaStreamAudioSourceNode | null = null
  private vadNode: AudioWorkletNode | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private previewInFlight = false
  private listeners: Listeners = {}

  level = 0
  floor = 0.012

  /**
   * Playback runs in the browser rather than on the server: only then can the
   * echo cancellation of getUserMedia subtract our own voice, which is what
   * makes interrupting possible.
   */
  readonly el = new Audio()
  private queue: string[] = []
  private playing = false
  rate = 1

  constructor () {
    this.el.preload = 'auto'
    this.el.addEventListener('ended', () => this.advance())
    this.el.addEventListener('error', () => this.advance())
  }

  on (l: Listeners) { this.listeners = { ...this.listeners, ...l } }

  private advance () {
    this.playing = false
    this.playNext()
    this.listeners.playback?.()
  }

  enqueue (id: string) { this.queue.push(id); this.playNext(); this.listeners.playback?.() }

  private playNext () {
    if (this.playing || !this.queue.length) return
    const id = this.queue.shift()!
    this.playing = true
    this.el.src = api.audioUrl(id)
    this.el.playbackRate = this.rate
    this.el.play().catch(() => { this.playing = false; this.playNext() })
  }

  stopPlayback () {
    this.queue.length = 0
    this.el.pause(); this.el.removeAttribute('src'); this.el.load()
    this.playing = false
    this.listeners.playback?.()
  }

  isSpeaking () { return this.playing || this.queue.length > 0 }
  setMuted (on: boolean) { this.el.muted = on; if (on) this.stopPlayback() }
  setRate (r: number) { this.rate = r; this.el.playbackRate = r }

  async microphone () {
    if (this.stream) return this.stream
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    this.ac = new AudioContext()
    this.analyser = this.ac.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.75
    this.source = this.ac.createMediaStreamSource(this.stream)
    this.source.connect(this.analyser)
    this.bins = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount))
    return this.stream
  }

  async startRecording () {
    await this.microphone()
    if (this.ac!.state === 'suspended') await this.ac!.resume()
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream!, { mimeType: 'audio/webm' })
    this.recorder.ondataavailable = e => {
      if (e.data.size) { this.chunks.push(e.data); void this.previewTick() }
    }
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'audio/webm' })
      this.chunks = []
      this.listeners.recordingDone?.(blob)
    }
    // In slices, so the preview has something while the sentence is still
    // running. The first slice carries the container header, which makes every
    // prefix a valid webm stream.
    this.recorder.start(900)
    this.setVadRecording(true)
  }

  stopRecording () {
    this.setVadRecording(false)
    if (this.recorder && this.recorder.state === 'recording') this.recorder.stop()
  }

  isRecording () { return this.recorder?.state === 'recording' }

  /** Shows what is understood so far. Decoration: a failure here stops nothing. */
  private async previewTick () {
    if (this.previewInFlight || this.chunks.length < 2) return
    this.previewInFlight = true
    try {
      const { said } = await api.preview(new Blob(this.chunks, { type: 'audio/webm' }))
      if (said) this.listeners.preview?.(said)
    } catch { /* silent by design */ }
    finally { this.previewInFlight = false }
  }

  async attachVad () {
    if (this.vadNode || !this.ac) return
    const url = URL.createObjectURL(new Blob([VAD_WORKLET], { type: 'application/javascript' }))
    await this.ac.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    this.vadNode = new AudioWorkletNode(this.ac, 'vad', { numberOfOutputs: 0 })
    this.source!.connect(this.vadNode)
    this.vadNode.port.onmessage = e => {
      const m = e.data as VadMessage
      if (m.type === 'level') { this.level = m.rms; this.floor = m.floor }
      if (m.type === 'ready') this.floor = m.floor
      this.listeners.vad?.(m)
    }
  }

  /**
   * The worklet needs to know whether a recording is running; without it, it
   * cannot tell the beginning of speech from its end.
   */
  setVadRecording (recording: boolean) { this.vadNode?.port.postMessage({ recording }) }
  recalibrate () { this.vadNode?.port.postMessage({ recalibrate: true }) }
  tune (o: { startSec?: number; endSec?: number }) { this.vadNode?.port.postMessage({ tune: o }) }

  /** Momentary level for the waveform, 0 to 1. */
  currentLevel () {
    if (!this.analyser) return 0
    this.analyser.getByteFrequencyData(this.bins)
    let sum = 0
    for (let i = 0; i < this.bins.length; i++) sum += this.bins[i]
    return sum / this.bins.length / 255
  }
}

export const audio = new AudioEngine()

/** Reuse the same media element and audio graph across challenges and games. */
interface PronunciationPlayer {
  audio: HTMLAudioElement
  context: AudioContext
  source: MediaElementAudioSourceNode
  gain: GainNode
}
const runtime: { player?: PronunciationPlayer } = import.meta.hot?.data.pronunciationPlayer ?? {}
if (import.meta.hot) import.meta.hot.data.pronunciationPlayer = runtime

export function getPronunciationPlayer(): PronunciationPlayer {
  if (!runtime.player) {
    const audio = new Audio()
    audio.preload = 'auto'
    const context = new AudioContext()
    const source = context.createMediaElementSource(audio)
    const gain = context.createGain()
    source.connect(gain)
    gain.connect(context.destination)
    runtime.player = { audio, context, source, gain }
  }
  return runtime.player
}

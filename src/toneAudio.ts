import type { ToneAudioSource } from './audioSources'

type Voice = Pick<SpeechSynthesisVoice, 'lang' | 'name' | 'voiceURI'>
type SpeechEngine = Pick<SpeechSynthesis, 'speak' | 'cancel'>
type PlaybackUpdate = (playing: boolean, error?: string) => void

export function mandarinVoices<T extends Voice>(voices: T[]): T[] {
  return voices.filter(voice => ['zh-cn', 'zh-hans-cn'].includes(voice.lang.toLowerCase().replaceAll('_', '-')))
}

export function prototypeAudioStatus(supported: boolean, voices: readonly Voice[]): string {
  if (!supported) return 'Browser speech synthesis is unavailable. Try a current browser that supports speech synthesis.'
  if (!voices.length) return 'Waiting for a zh-CN Mandarin voice. If none appears, install a Mandarin voice in your system or browser settings.'
  return 'Prototype audio uses browser speech synthesis; it is not a validated phonetic reference.'
}

export function createToneAudioPlayer(
  synthesis: SpeechEngine | undefined,
  createUtterance: (text: string) => SpeechSynthesisUtterance,
  update: PlaybackUpdate,
  createAudio: () => HTMLAudioElement,
) {
  let utterance: SpeechSynthesisUtterance | undefined
  let localAudio: HTMLAudioElement | undefined
  let resolvePlayback: ((played: boolean) => void) | undefined

  function stop() {
    const currentUtterance = utterance
    const currentAudio = localAudio
    const resolve = resolvePlayback
    utterance = undefined
    localAudio = undefined
    resolvePlayback = undefined
    if (currentUtterance) {
      currentUtterance.onend = null
      currentUtterance.onerror = null
      synthesis?.cancel()
    }
    if (currentAudio) {
      currentAudio.onended = null
      currentAudio.onerror = null
      currentAudio.pause()
      currentAudio.currentTime = 0
    }
    resolve?.(false)
    update(false)
  }

  function play(source: ToneAudioSource, text: string, voice?: SpeechSynthesisVoice): Promise<boolean> {
    stop()
    return new Promise(resolve => {
      resolvePlayback = resolve
      if (source.kind === 'local') {
        const audio = createAudio()
        localAudio = audio
        audio.src = source.url
        const finish = (played: boolean, error?: string) => {
          if (localAudio !== audio) return
          audio.onended = null
          audio.onerror = null
          localAudio = undefined
          resolvePlayback = undefined
          update(false, error)
          resolve(played)
        }
        audio.onended = () => finish(true)
        audio.onerror = () => finish(false, 'Could not play the local Mandarin recording. Check that the audio file is available, then try again.')
        update(true)
        void audio.play().catch(() => finish(false, 'Could not start the local Mandarin recording. Check that audio is enabled, then try again.'))
        return
      }

      if (!synthesis || !voice) {
        resolvePlayback = undefined
        update(false, 'No zh-CN Mandarin voice is available. Install a Mandarin voice in your system or browser settings to enable prototype audio.')
        resolve(false)
        return
      }
      const next = createUtterance(text)
      next.lang = source.language
      next.voice = voice
      const finish = (played: boolean, error?: string) => {
        if (utterance !== next) return
        next.onend = null
        next.onerror = null
        utterance = undefined
        resolvePlayback = undefined
        update(false, error)
        resolve(played)
      }
      next.onend = () => finish(true)
      next.onerror = event => finish(false, event.error === 'not-allowed'
        ? 'The browser blocked speech playback. Click Listen again or allow audio for this site.'
        : `Could not play the Mandarin prototype voice (${event.error}). Try again or check your browser audio settings.`)
      utterance = next
      update(true)
      try {
        synthesis.speak(next)
      } catch (problem) {
        finish(false, problem instanceof Error
          ? `Could not start Mandarin speech playback: ${problem.message}`
          : 'Could not start Mandarin speech playback.')
      }
    })
  }

  return { play, stop }
}

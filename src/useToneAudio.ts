import { useEffect, useRef, useState } from 'react'
import { audioSourceFor, toneAudioSources } from './audioSources'
import { createToneAudioPlayer, mandarinVoices, prototypeAudioStatus } from './toneAudio'
import { toneExample } from './tones'
import type { MandarinTone, ToneExample } from './tones'

export function useToneAudio() {
  const synthesis = typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis : undefined
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const player = useRef<ReturnType<typeof createToneAudioPlayer>>(null)
  const voice = voices[0]
  const usesPrototypeAudio = Object.values(toneAudioSources).some(source => source.kind === 'browser-speech')
  const status = usesPrototypeAudio
    ? prototypeAudioStatus(Boolean(synthesis), voices)
    : 'Local Mandarin reference recordings are available.'

  useEffect(() => {
    const refresh = () => setVoices(synthesis ? mandarinVoices(synthesis.getVoices()) : [])
    refresh()
    synthesis?.addEventListener('voiceschanged', refresh)
    const audioPlayer = createToneAudioPlayer(
      synthesis,
      text => new SpeechSynthesisUtterance(text),
      (active, problem) => {
        setPlaying(active)
        setError(problem ?? '')
      },
      () => new Audio(),
    )
    player.current = audioPlayer
    return () => {
      synthesis?.removeEventListener('voiceschanged', refresh)
      audioPlayer.stop()
      player.current = null
    }
  }, [synthesis])

  return {
    available(tone: MandarinTone) {
      return isAudioAvailable(tone)
    },
    playing,
    error,
    status,
    stop: () => player.current?.stop(),
    play(example: ToneExample): Promise<boolean> {
      if (!player.current) {
        setError('Audio playback is not available in this browser.')
        return Promise.resolve(false)
      }
      setError('')
      try {
        return player.current.play(audioSourceFor(example), example.hanzi, voice)
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : 'No audio source is configured for this example.')
        return Promise.resolve(false)
      }
    },
  }

  function isAudioAvailable(tone: MandarinTone) {
    const example = toneExample(tone)
    try {
      const source = audioSourceFor(example)
      return source.kind === 'local' || Boolean(synthesis && voice)
    } catch {
      return false
    }
  }
}

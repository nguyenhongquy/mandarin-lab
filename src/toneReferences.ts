import type { MandarinTone } from './tones.ts'
import type { PitchFrame } from './pitchAnalysis.ts'

export type ReferenceSource = 'local-tts' | 'corpus' | 'browser-tts'

export interface ToneReference {
  id: string
  syllable: string
  tone: MandarinTone
  source: ReferenceSource
  audioUrl?: string
  speakerId?: string
  voiceName?: string
  language?: string
  f0Trajectory?: PitchFrame[]
}

export interface ToneReferenceAudioProvider {
  status: string
  playing: boolean
  error: string
  available(reference: ToneReference): boolean
  play(reference: ToneReference): Promise<boolean>
  stop(): void
}

export function referenceSourceLabel(source: ReferenceSource): string {
  if (source === 'local-tts') return 'Local TTS — synthetic reference'
  if (source === 'corpus') return 'Corpus recording'
  return 'Browser TTS — prototype'
}

export function browserTtsReference(tone: MandarinTone): ToneReference {
  return { id: `browser-tts-ma-tone-${tone}`, syllable: 'ma', tone, source: 'browser-tts', language: 'zh-CN' }
}

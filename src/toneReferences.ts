import type { MandarinTone } from './tones.ts'
import type { PitchFrame } from './pitchAnalysis.ts'

export interface ToneReference {
  id: string
  syllable: string
  tone: MandarinTone
  speakerId?: string
  audioUrl?: string
  f0Trajectory?: PitchFrame[]
  source: 'schematic' | 'recorded'
}

export interface ToneReferenceAudioProvider {
  status: string
  playing: boolean
  error: string
  available(reference: ToneReference): boolean
  play(reference: ToneReference): Promise<boolean>
  stop(): void
}

export function schematicToneReference(tone: MandarinTone): ToneReference {
  return { id: `schematic-tone-${tone}`, syllable: 'ma', tone, source: 'schematic' }
}

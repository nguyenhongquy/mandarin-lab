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

export function schematicToneReference(tone: MandarinTone): ToneReference {
  return { id: `schematic-tone-${tone}`, syllable: 'ma', tone, source: 'schematic' }
}

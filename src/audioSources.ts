import { languageConfig } from './config.ts'
import { toneExamples } from './tones.ts'
import type { ToneExample } from './tones.ts'

export type ToneAudioSource =
  | { kind: 'local'; url: string; label: string }
  | { kind: 'browser-speech'; language: 'zh-CN'; label: 'Prototype audio' }

const sources: Record<string, ToneAudioSource> = {}
for (const example of toneExamples) {
  sources[example.id] = { kind: 'browser-speech', language: languageConfig.locale, label: 'Prototype audio' }
}

export const toneAudioSources: Readonly<Record<string, ToneAudioSource>> = sources

export function audioSourceFor(example: ToneExample): ToneAudioSource {
  const source = toneAudioSources[example.id]
  if (!source) throw new Error(`No audio source is configured for ${example.id}.`)
  return source
}

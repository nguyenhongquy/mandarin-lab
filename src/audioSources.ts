import { languageConfig } from './config.ts'
import { toneExample, toneExamples } from './tones.ts'
import type { ToneExample } from './tones.ts'
import type { ToneReference } from './toneReferences.ts'

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

export function audioSourceForReference(reference: ToneReference): ToneAudioSource {
  if (reference.source === 'browser-tts') {
    return audioSourceFor(toneExample(reference.tone))
  }
  if (!reference.audioUrl) {
    throw new Error(`Reference ${reference.id} has no audio URL.`)
  }
  if (reference.source === 'local-tts' || reference.source === 'corpus') {
    return { kind: 'local', url: reference.audioUrl, label: `${reference.source} reference` }
  }
  throw new Error(`Reference ${reference.id} has an unsupported source.`)
}

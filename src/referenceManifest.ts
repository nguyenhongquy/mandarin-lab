import type { MandarinTone } from './tones.ts'
import type { ToneReference } from './toneReferences.ts'

export const LOCAL_REFERENCE_MANIFEST_URL = '/references/local-tts/manifest.json'
const LOCAL_REFERENCE_AUDIO_BASE = '/references/local-tts/'

export interface LocalTtsManifestEntry {
  id: string
  syllable: string
  hanzi: string
  pinyin: string
  tone: MandarinTone
  source: 'local-tts'
  audioFile: string
  voiceName: string
  language: string
  generationMethod: string
}

export interface LocalTtsManifest {
  schemaVersion: 1
  references: LocalTtsManifestEntry[]
}

export interface LoadedLocalReferences {
  references: ToneReference[]
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Local TTS manifest field "${field}" must be a non-empty string.`)
  }
  return value.trim()
}

function parseEntry(value: unknown): LocalTtsManifestEntry {
  if (!isRecord(value)) throw new Error('Each local TTS manifest reference must be an object.')
  const tone = value.tone
  if (tone !== 1 && tone !== 2 && tone !== 3 && tone !== 4) {
    throw new Error('Each local TTS manifest reference must specify a tone from 1 to 4.')
  }
  const audioFile = requiredString(value.audioFile, 'audioFile')
  if (!/^[\w.-]+$/.test(audioFile) || audioFile === '.' || audioFile === '..') {
    throw new Error(`Unsafe local TTS audio filename "${audioFile}".`)
  }
  if (value.source !== 'local-tts') {
    throw new Error('Local TTS manifest references must declare source "local-tts".')
  }
  return {
    id: requiredString(value.id, 'id'),
    syllable: requiredString(value.syllable, 'syllable'),
    hanzi: requiredString(value.hanzi, 'hanzi'),
    pinyin: requiredString(value.pinyin, 'pinyin'),
    tone,
    source: 'local-tts',
    audioFile,
    voiceName: requiredString(value.voiceName, 'voiceName'),
    language: requiredString(value.language, 'language'),
    generationMethod: requiredString(value.generationMethod, 'generationMethod'),
  }
}

export function parseLocalTtsManifest(value: unknown): LocalTtsManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.references)) {
    throw new Error('Local TTS manifest must contain schemaVersion 1 and a references array.')
  }
  const references = value.references.map(parseEntry)
  const ids = new Set<string>()
  for (const reference of references) {
    if (ids.has(reference.id)) throw new Error(`Duplicate local TTS reference id "${reference.id}".`)
    ids.add(reference.id)
  }
  return { schemaVersion: 1, references }
}

export async function loadLocalTtsReferences(
  fetcher: typeof fetch = fetch,
  manifestUrl = LOCAL_REFERENCE_MANIFEST_URL,
): Promise<LoadedLocalReferences> {
  const manifestResponse = await fetcher(manifestUrl)
  if (!manifestResponse.ok) {
    throw new Error(`Could not load the local TTS reference manifest (${manifestResponse.status}).`)
  }
  const manifest = parseLocalTtsManifest(await manifestResponse.json())
  const references: ToneReference[] = []
  const warnings: string[] = []

  for (const entry of manifest.references) {
    const audioUrl = `${LOCAL_REFERENCE_AUDIO_BASE}${encodeURIComponent(entry.audioFile)}`
    try {
      let response = await fetcher(audioUrl, { method: 'HEAD' })
      if (!response.ok) {
        response = await fetcher(audioUrl)
        if (!response.ok) {
          warnings.push(`Local reference audio is missing for Tone ${entry.tone}: ${entry.audioFile}.`)
          continue
        }
        if (!(await response.arrayBuffer()).byteLength) {
          warnings.push(`Local reference audio is empty for Tone ${entry.tone}: ${entry.audioFile}.`)
          continue
        }
      }
      references.push({
        id: entry.id,
        syllable: entry.syllable,
        tone: entry.tone,
        source: 'local-tts',
        audioUrl,
        voiceName: entry.voiceName,
        language: entry.language,
      })
    } catch (problem) {
      warnings.push(problem instanceof Error
        ? `Could not check local reference audio ${entry.audioFile}: ${problem.message}`
        : `Could not check local reference audio ${entry.audioFile}.`)
    }
  }

  return { references, warnings }
}

export async function fetchReferenceAudio(reference: ToneReference, fetcher: typeof fetch = fetch): Promise<Blob> {
  if (reference.source === 'browser-tts' || !reference.audioUrl) {
    throw new Error('Measured reference audio is unavailable for this source.')
  }
  const response = await fetcher(reference.audioUrl)
  if (!response.ok) {
    throw new Error(`Could not load reference audio (${response.status}).`)
  }
  const blob = await response.blob()
  if (!blob.size) throw new Error('The local reference audio file is empty.')
  return blob
}

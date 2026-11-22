import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchReferenceAudio, loadLocalTtsReferences, parseLocalTtsManifest } from '../src/referenceManifest.ts'
import type { LocalTtsManifest } from '../src/referenceManifest.ts'

const manifest: LocalTtsManifest = {
  schemaVersion: 1,
  references: [{
    id: 'local-tts-ma-tone-1',
    syllable: 'ma',
    hanzi: '妈',
    pinyin: 'mā',
    tone: 1,
    source: 'local-tts',
    audioFile: 'ma1.wav',
    voiceName: 'Example Mandarin Voice',
    language: 'zh_CN',
    generationMethod: 'macOS say + afconvert',
  }],
}

test('manifest parsing requires explicit syllable, tone, source, voice, and audio filename metadata', () => {
  assert.deepEqual(parseLocalTtsManifest(manifest), manifest)
  assert.throws(() => parseLocalTtsManifest({
    schemaVersion: 1,
    references: [{ ...manifest.references[0], tone: 5 }],
  }), /tone from 1 to 4/)
  assert.throws(() => parseLocalTtsManifest({
    schemaVersion: 1,
    references: [{ ...manifest.references[0], audioFile: '../ma1.wav' }],
  }), /Unsafe local TTS audio filename/)
})

test('missing reference files are omitted with a warning so the caller can use Browser TTS', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith('manifest.json')) return new Response(JSON.stringify(manifest))
    if (init?.method === 'HEAD') return new Response(null, { status: 404 })
    return new Response(null, { status: 404 })
  }
  const result = await loadLocalTtsReferences(fetcher)
  assert.equal(result.references.length, 0)
  assert.match(result.warnings[0] ?? '', /audio is missing for Tone 1/)
})

test('loader maps manifest entries to explicit local audio URLs and retries unsupported HEAD with GET', async () => {
  const methods: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    methods.push(`${String(input)}:${init?.method ?? 'GET'}`)
    if (String(input).endsWith('manifest.json')) return new Response(JSON.stringify(manifest))
    if (init?.method === 'HEAD') return new Response(null, { status: 405 })
    return new Response(new Uint8Array([1, 2, 3]))
  }
  const result = await loadLocalTtsReferences(fetcher)
  assert.equal(result.references[0]?.source, 'local-tts')
  assert.equal(result.references[0]?.tone, 1)
  assert.equal(result.references[0]?.audioUrl, '/references/local-tts/ma1.wav')
  assert.deepEqual(methods.slice(1), [
    '/references/local-tts/ma1.wav:HEAD',
    '/references/local-tts/ma1.wav:GET',
  ])
})

test('reference audio fetch reports missing and empty audio rather than inventing a fallback', async () => {
  const reference = {
    id: 'local-tts-ma-tone-1', syllable: 'ma', tone: 1 as const, source: 'local-tts' as const,
    audioUrl: '/references/local-tts/ma1.wav',
  }
  await assert.rejects(fetchReferenceAudio(reference, async () => new Response(null, { status: 404 })), /Could not load reference audio/)
  await assert.rejects(fetchReferenceAudio(reference, async () => new Response(null, { status: 200 })), /file is empty/)
})

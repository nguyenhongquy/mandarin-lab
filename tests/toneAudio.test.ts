import assert from 'node:assert/strict'
import test from 'node:test'
import { createToneAudioPlayer, mandarinVoices, prototypeAudioStatus } from '../src/toneAudio.ts'
import type { ToneAudioSource } from '../src/audioSources.ts'

function voice(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name, voiceURI: name } as SpeechSynthesisVoice
}

test('prototype audio accepts only explicit mainland Mandarin voices and reports missing support', () => {
  const available = mandarinVoices([voice('en-US'), voice('zh-CN'), voice('zh-Hans-CN'), voice('zh-TW')])
  assert.deepEqual(available.map(item => item.lang), ['zh-CN', 'zh-Hans-CN'])
  assert.match(prototypeAudioStatus(true, []), /Waiting for a zh-CN Mandarin voice/)
  assert.match(prototypeAudioStatus(false, []), /unavailable/)
})

test('speech playback uses zh-CN and replay cancels the previous utterance', async () => {
  const spoken: SpeechSynthesisUtterance[] = []
  let cancels = 0
  const updates: [boolean, string?][] = []
  const player = createToneAudioPlayer({
    speak(item) { spoken.push(item) },
    cancel() { cancels += 1 },
  }, text => ({ text } as SpeechSynthesisUtterance), (playing, error) => updates.push([playing, error]), () => {
    throw new Error('Local audio should not be constructed in this test.')
  })
  const source: ToneAudioSource = { kind: 'browser-speech', language: 'zh-CN', label: 'Prototype audio' }
  const selected = voice('zh-CN')

  const firstPlayback = player.play(source, '妈', selected)
  assert.equal(spoken[0]?.lang, 'zh-CN')
  assert.equal(spoken[0]?.voice, selected)
  const secondPlayback = player.play(source, '麻', selected)
  assert.equal(cancels, 1)
  assert.equal(spoken[0]?.onend, null)
  assert.equal(spoken[1]?.text, '麻')
  player.stop()
  assert.equal(cancels, 2)
  assert.equal(updates.at(-1)?.[0], false)
  assert.equal(await firstPlayback, false)
  assert.equal(await secondPlayback, false)
  const completed = player.play(source, '马', selected)
  spoken[2]!.onend?.(new Event('end') as SpeechSynthesisEvent)
  assert.equal(await completed, true)
})

test('local playback reports errors and is stopped before another source starts', async () => {
  const local: ToneAudioSource = { kind: 'local', url: '/tones/tone1.mp3', label: 'Local recording' }
  const browser: ToneAudioSource = { kind: 'browser-speech', language: 'zh-CN', label: 'Prototype audio' }

  const failedUpdates: [boolean, string?][] = []
  const failedAudio = {
    src: '', currentTime: 0, onended: null, onerror: null,
    pause() {},
    play() { return Promise.reject(new Error('blocked')) },
  } as unknown as HTMLAudioElement
  const failedPlayer = createToneAudioPlayer(undefined, text => ({ text } as SpeechSynthesisUtterance),
    (playing, error) => failedUpdates.push([playing, error]), () => failedAudio)
  const failed = failedPlayer.play(local, '妈')
  await Promise.resolve()
  assert.equal(await failed, false)
  assert.equal(failedUpdates.some(([, error]) => error?.includes('Could not start the local Mandarin recording')), true)

  const spoken: SpeechSynthesisUtterance[] = []
  const updates: [boolean, string?][] = []
  let pauses = 0
  const localAudio = {
    src: '', currentTime: 0, onended: null, onerror: null,
    pause() { pauses += 1 },
    play() { return Promise.resolve() },
  } as unknown as HTMLAudioElement
  const player = createToneAudioPlayer({
    speak(item) { spoken.push(item) },
    cancel() {},
  }, text => ({ text } as SpeechSynthesisUtterance), (playing, error) => updates.push([playing, error]), () => localAudio)
  const localPlayback = player.play(local, '妈')
  player.play(browser, '妈', voice('zh-CN'))
  assert.equal(localAudio.src, '/tones/tone1.mp3')
  assert.ok(pauses > 0)
  assert.equal(spoken.length, 1)
  assert.equal(await localPlayback, false)
  const completed = player.play(local, '麻')
  localAudio.onended?.(new Event('ended'))
  assert.equal(await completed, true)
  player.stop()
})

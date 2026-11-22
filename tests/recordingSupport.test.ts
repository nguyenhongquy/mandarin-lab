import assert from 'node:assert/strict'
import test from 'node:test'
import { microphoneErrorMessage, releaseMicrophone, supportsMicrophoneRecording } from '../src/recordingSupport.ts'
import { decodeAndAnalyze } from '../src/audioDecoder.ts'

test('recording support requires both getUserMedia and MediaRecorder', () => {
  const mediaDevices: Pick<MediaDevices, 'getUserMedia'> = {
    getUserMedia: async () => { throw new Error('Not called by this test.') },
  }
  assert.equal(supportsMicrophoneRecording(mediaDevices, true), true)
  assert.equal(supportsMicrophoneRecording(undefined, true), false)
  assert.equal(supportsMicrophoneRecording(mediaDevices, false), false)
})

test('microphone failures are actionable and tracks are always released', () => {
  assert.match(microphoneErrorMessage({ name: 'NotAllowedError' }), /permission was denied/i)
  assert.match(microphoneErrorMessage({ name: 'NotFoundError' }), /No microphone was found/)
  assert.match(microphoneErrorMessage({ name: 'NotReadableError' }), /unavailable or in use/)
  let stops = 0
  releaseMicrophone({ getTracks: () => [{ stop() { stops += 1 } }, { stop() { stops += 1 } }] })
  assert.equal(stops, 2)
  releaseMicrophone(null)
})

test('empty recordings produce a local analysis warning without requiring a decoder', async () => {
  const result = await decodeAndAnalyze(new Blob())
  assert.equal(result.voicedFrameCount, 0)
  assert.match(result.warnings[0] ?? '', /empty/)
})

test('decoded PCM is analyzed locally and the AudioContext is closed afterward', async () => {
  let closed = false
  const sampleRate = 16000
  const samples = Float32Array.from({ length: sampleRate * 0.4 }, (_, index) =>
    0.4 * Math.sin(2 * Math.PI * 200 * index / sampleRate))
  const context = {
    state: 'running' as AudioContextState,
    async decodeAudioData() {
      return {
        sampleRate,
        length: samples.length,
        numberOfChannels: 1,
        getChannelData: () => samples,
      }
    },
    async close() { closed = true },
  }
  const analysis = await decodeAndAnalyze(new Blob(['local PCM']), () => context)
  assert.ok(Math.abs((analysis.medianF0Hz ?? 0) - 200) < 5)
  assert.equal(closed, true)
})

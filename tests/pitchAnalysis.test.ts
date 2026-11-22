import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePitch, pitchFeedback, relativeSemitones } from '../src/pitchAnalysis.ts'
import { semitoneTrajectory, splitPitchSegments } from '../src/pitchPlot.ts'
import { schematicToneReference } from '../src/toneReferences.ts'

function sine(frequency: number, seconds = 0.6, sampleRate = 16000, amplitude = 0.5) {
  return Float32Array.from({ length: Math.floor(seconds * sampleRate) }, (_, index) =>
    amplitude * Math.sin(2 * Math.PI * frequency * index / sampleRate))
}

function glide(startHz: number, endHz: number, seconds = 0.6, sampleRate = 16000) {
  const result = new Float32Array(Math.floor(seconds * sampleRate))
  let phase = 0
  for (let index = 0; index < result.length; index += 1) {
    const time = index / sampleRate
    const frequency = startHz + (endHz - startHz) * time / seconds
    phase += 2 * Math.PI * frequency / sampleRate
    result[index] = 0.5 * Math.sin(phase)
  }
  return result
}

test('YIN estimates synthetic tones across the configured human pitch range', () => {
  for (const frequency of [85, 180, 440]) {
    const analysis = analyzePitch(sine(frequency), 16000)
    assert.ok(analysis.medianF0Hz !== null)
    assert.ok(Math.abs(analysis.medianF0Hz - frequency) < frequency * 0.04)
    assert.ok(analysis.voicedPercent > 80)
  }
})

test('silence and unvoiced frames remain null and produce actionable warnings', () => {
  const silence = analyzePitch(new Float32Array(16000), 16000)
  assert.equal(silence.voicedFrameCount, 0)
  assert.ok(silence.frames.every(frame => frame.f0Hz === null))
  assert.ok(silence.warnings.some(warning => warning.includes('too few reliable voiced frames')))
  assert.deepEqual(pitchFeedback(silence), ['The recording contains too few reliable voiced frames for interpretation.'])
  const quiet = analyzePitch(sine(180, 0.4, 16000, 0.001), 16000)
  assert.equal(quiet.voicedFrameCount, 0)
})

test('empty, very short, and out-of-range recordings do not invent pitch', () => {
  assert.match(analyzePitch(new Float32Array(), 16000).warnings[0] ?? '', /empty/)
  const short = analyzePitch(sine(180, 0.01), 16000)
  assert.equal(short.frames.length, 0)
  assert.match(short.warnings[0] ?? '', /too short/)
  const low = analyzePitch(sine(55), 16000)
  assert.equal(low.medianF0Hz, null)
  const high = analyzePitch(sine(600), 16000)
  assert.equal(high.medianF0Hz, null)
})

test('relative semitones use the median and reject missing or invalid values', () => {
  assert.equal(relativeSemitones(220, 220), 0)
  assert.ok(Math.abs((relativeSemitones(440, 220) ?? 0) - 12) < 1e-10)
  assert.equal(relativeSemitones(null, 220), null)
  assert.equal(relativeSemitones(220, null), null)
  assert.deepEqual(semitoneTrajectory([
    { time: 0, f0Hz: 220, confidence: 0.9 },
    { time: 0.01, f0Hz: null, confidence: 0 },
    { time: 0.02, f0Hz: 440, confidence: 0.9 },
  ], 220), [0, null, 12])
})

test('trajectory segments preserve unvoiced gaps without interpolating across them', () => {
  const segments = splitPitchSegments([
    { time: 0, f0Hz: 200, confidence: 0.9 },
    { time: 0.01, f0Hz: 210, confidence: 0.9 },
    { time: 0.02, f0Hz: null, confidence: 0 },
    { time: 0.03, f0Hz: 240, confidence: 0.9 },
    { time: 0.04, f0Hz: 250, confidence: 0.9 },
  ])
  assert.deepEqual(segments.map(segment => segment.map(frame => frame.f0Hz)), [[200, 210], [240, 250]])
})

test('schematic references contain no invented recorded trajectory', () => {
  const reference = schematicToneReference(3)
  assert.deepEqual(reference, { id: 'schematic-tone-3', syllable: 'ma', tone: 3, source: 'schematic' })
  assert.equal(reference.f0Trajectory, undefined)
})

test('analysis reports duration, range, octave jumps, and descriptive observations', () => {
  const stable = analyzePitch(sine(200), 16000)
  assert.equal(stable.duration, 0.6)
  assert.ok(stable.minF0Hz !== null && stable.maxF0Hz !== null)
  assert.ok((stable.minF0Hz ?? 0) >= 70 && (stable.maxF0Hz ?? Infinity) <= 500)
  assert.deepEqual(pitchFeedback(stable), ['The detected pitch stays relatively level over the voiced portion.'])

  const rising = pitchFeedback(analyzePitch(glide(150, 300), 16000))
  const falling = pitchFeedback(analyzePitch(glide(300, 150), 16000))
  assert.deepEqual(rising, ['The detected pitch rises over the voiced portion.'])
  assert.deepEqual(falling, ['The detected pitch falls toward the end.'])

  const sampleRate = 16000
  const jumpSamples = new Float32Array(sampleRate * 0.6)
  let phase = 0
  for (let index = 0; index < jumpSamples.length; index += 1) {
    const frequency = index < jumpSamples.length / 2 ? 160 : 320
    phase += 2 * Math.PI * frequency / sampleRate
    jumpSamples[index] = 0.5 * Math.sin(phase)
  }
  const jump = analyzePitch(jumpSamples, sampleRate)
  assert.ok(jump.warnings.some(warning => warning.includes('possible octave jump')))
})

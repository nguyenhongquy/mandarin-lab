import assert from 'node:assert/strict'
import test from 'node:test'
import { compareToneFeatures } from '../src/acousticComparison.ts'
import { normalizePitchTime } from '../src/pitchComparison.ts'
import { analyzePitch, DEFAULT_PITCH_OPTIONS } from '../src/pitchAnalysis.ts'
import type { PitchAnalysis } from '../src/pitchAnalysis.ts'
import { DEFAULT_TONE_FEATURE_OPTIONS, extractToneFeatures } from '../src/toneAcoustics.ts'

function analysis(values: (number | null)[], hopSeconds = 0.01, startTime = 0): PitchAnalysis {
  const voiced = values.flatMap(value => value === null ? [] : [value])
  const sorted = [...voiced].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  const medianF0Hz = sorted.length % 2 ? upper ?? null
    : lower === undefined || upper === undefined ? null : (lower + upper) / 2
  const frames = values.map((f0Hz, index) => ({
    time: startTime + index * hopSeconds,
    f0Hz,
    confidence: f0Hz === null ? 0 : 0.95,
  }))
  return {
    frames,
    voicedFrameCount: voiced.length,
    voicedPercent: frames.length ? Math.round(voiced.length / frames.length * 100) : 0,
    duration: frames.length * hopSeconds,
    medianF0Hz,
    minF0Hz: voiced.length ? Math.min(...voiced) : null,
    maxF0Hz: voiced.length ? Math.max(...voiced) : null,
    warnings: [],
  }
}

function glide(startHz: number, endHz: number, count = 61): number[] {
  return Array.from({ length: count }, (_, index) =>
    startHz * (endHz / startHz) ** (index / (count - 1)))
}

function dippingSine() {
  const sampleRate = 16000
  const samples = new Float32Array(sampleRate * 0.8)
  let phase = 0
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate
    const frequency = 220 - 90 * Math.sin(Math.PI * time / 0.8)
    phase += 2 * Math.PI * frequency / sampleRate
    samples[index] = 0.55 * Math.sin(phase)
  }
  return { samples, sampleRate }
}

function featureFixture(reliability: 'high' | 'medium' | 'low' = 'high') {
  return {
    direction: 'rising' as const,
    startPitchSt: -4,
    endPitchSt: 4,
    netPitchChangeSt: 8,
    pitchRangeSt: 9,
    turningPointPosition: null,
    turningPointType: null,
    turningPointTime: null,
    turningPointF0Hz: null,
    earlySlopeSt: 7,
    lateSlopeSt: 8,
    earlyLateBoundaryTime: 0.3,
    voicedFrameRatio: 1,
    reliableFrameCount: 61,
    reliability,
    analysisInterval: { startTime: 0, endTime: 0.6, duration: 0.61, reliableFrameCount: 61 },
    excludedRegions: [],
    internalGapProportion: 0,
    octaveJumpCount: 0,
    warnings: [],
  }
}

test('extracts level, rising, and falling direction from measured F0', () => {
  const level = extractToneFeatures(analysis(Array(61).fill(200)))
  const rising = extractToneFeatures(analysis(glide(110, 260)))
  const falling = extractToneFeatures(analysis(glide(260, 110)))

  assert.equal(level.direction, 'level')
  assert.equal(level.reliability, 'high')
  assert.equal(level.netPitchChangeSt, 0)
  assert.equal(rising.direction, 'rising')
  assert.ok((rising.netPitchChangeSt ?? 0) > 10)
  assert.ok((rising.earlySlopeSt ?? 0) > 0)
  assert.ok((rising.lateSlopeSt ?? 0) > 0)
  assert.equal(falling.direction, 'falling')
  assert.ok((falling.netPitchChangeSt ?? 0) < -10)
  assert.ok((falling.earlySlopeSt ?? 0) < 0)
  assert.ok((falling.lateSlopeSt ?? 0) < 0)
})

test('detects meaningful falling-rising and rising-falling turning points', () => {
  const downUp = [...glide(230, 115, 31), ...glide(115, 230, 31).slice(1)]
  const upDown = [...glide(115, 230, 31), ...glide(230, 115, 31).slice(1)]
  const minimum = extractToneFeatures(analysis(downUp))
  const maximum = extractToneFeatures(analysis(upDown))

  assert.equal(minimum.direction, 'complex')
  assert.equal(minimum.turningPointType, 'minimum')
  assert.ok((minimum.turningPointPosition ?? 0) > 0.4 && (minimum.turningPointPosition ?? 1) < 0.6)
  assert.ok(minimum.turningPointTime !== null)
  assert.ok(minimum.turningPointF0Hz !== null)
  assert.equal(maximum.direction, 'complex')
  assert.equal(maximum.turningPointType, 'maximum')
})

test('extracts a turning point from PCM analyzed by the existing YIN pipeline', () => {
  const { samples, sampleRate } = dippingSine()
  const features = extractToneFeatures(analyzePitch(samples, sampleRate))
  assert.equal(features.direction, 'complex')
  assert.equal(features.turningPointType, 'minimum')
  assert.ok(Math.abs((features.turningPointTime ?? 0) - 0.4) < 0.04)
  assert.ok((features.turningPointF0Hz ?? 0) >= 120 && (features.turningPointF0Hz ?? Infinity) <= 140)
})

test('small fluctuations are robustly treated as level and pitch range uses percentiles', () => {
  const fluctuating = Array.from({ length: 61 }, (_, index) =>
    200 * 2 ** ((index % 2 ? 0.25 : -0.25) / 12))
  const valuesWithSpike = Array(61).fill(200)
  valuesWithSpike[30] = 400
  const level = extractToneFeatures(analysis(fluctuating))
  const robust = extractToneFeatures(analysis(valuesWithSpike))

  assert.equal(level.direction, 'level')
  assert.ok((level.pitchRangeSt ?? Infinity) < 1)
  assert.equal(robust.direction, 'level')
  assert.equal(robust.pitchRangeSt, 0)
  assert.equal(robust.turningPointType, null)
  assert.equal(robust.octaveJumpCount, 1)
  assert.ok(robust.warnings.some(warning => warning.includes('octave jump')))
})

test('selects one dominant region, reports excluded regions, and does not smooth across gaps', () => {
  const values = [...glide(120, 180, 31), ...Array(12).fill(null), ...glide(180, 240, 31)]
  const original = analysis(values)
  const feature = extractToneFeatures(original)

  assert.equal(feature.analysisInterval?.startTime, 0)
  assert.equal(feature.excludedRegions.length, 1)
  assert.ok(feature.warnings.some(warning => warning.includes('Multiple substantial voiced regions')))
  assert.equal(feature.reliability, 'medium')
  assert.deepEqual(original.frames.map(frame => frame.f0Hz), values)

  const shortGap = Array(61).fill(200)
  shortGap[30] = null
  const withGap = extractToneFeatures(analysis(shortGap))
  assert.equal(withGap.excludedRegions.length, 0)
  assert.ok((withGap.internalGapProportion ?? 0) > 0)
  assert.ok(withGap.warnings.some(warning => warning.includes('tracking gaps')))

  const dip = [...glide(230, 115, 31), ...glide(115, 230, 31).slice(1)]
  dip[29] = null
  dip[30] = null
  const gapAtTurn = extractToneFeatures(analysis(dip))
  assert.equal(gapAtTurn.turningPointType, null)
})

test('rejects silence, short tracks, low-confidence frames, and invalid F0 values', () => {
  const silence = extractToneFeatures(analysis(Array(80).fill(null)))
  const short = extractToneFeatures(analysis([150, 152, 154, 156, 158]))
  const lowConfidence = analysis(Array(40).fill(180))
  lowConfidence.frames = lowConfidence.frames.map(frame => ({ ...frame, confidence: DEFAULT_PITCH_OPTIONS.confidenceThreshold - 0.01 }))
  const invalid = analysis([200, 201, 202, 203, 204, 205, 206, 207, 208])
  invalid.frames[3] = { time: 0.03, f0Hz: Number.NaN, confidence: 1 }
  invalid.frames[4] = { time: 0.04, f0Hz: Number.POSITIVE_INFINITY, confidence: 1 }
  invalid.frames[5] = { time: 0.05, f0Hz: -10, confidence: 1 }

  assert.equal(silence.direction, 'unknown')
  assert.equal(silence.analysisInterval, null)
  assert.equal(short.reliability, 'low')
  assert.equal(short.direction, 'unknown')
  assert.equal(short.turningPointPosition, null)
  assert.equal(extractToneFeatures(lowConfidence).reliableFrameCount, 0)
  assert.equal(extractToneFeatures(lowConfidence).direction, 'unknown')
  assert.equal(extractToneFeatures(invalid).reliableFrameCount, 6)
})

test('classifies octave jumps and excessive gaps as reliability concerns', () => {
  const octave = [...Array(30).fill(150), ...Array(31).fill(300)]
  const jump = extractToneFeatures(analysis(octave))
  assert.equal(jump.octaveJumpCount, 1)
  assert.equal(jump.reliability, 'medium')

  const largeGap = [...Array(30).fill(180), ...Array(50).fill(null), ...Array(30).fill(185)]
  const fragmented = extractToneFeatures(analysis(largeGap))
  assert.equal(fragmented.excludedRegions.length, 1)
  assert.ok(fragmented.warnings.some(warning => warning.includes('Multiple substantial voiced regions')))
})

test('uses configurable thresholds and keeps confidence threshold aligned with the pitch analyzer', () => {
  assert.equal(DEFAULT_TONE_FEATURE_OPTIONS.confidenceThreshold, DEFAULT_PITCH_OPTIONS.confidenceThreshold)
  const values = glide(150, 210, 41)
  const standard = extractToneFeatures(analysis(values))
  const conservative = extractToneFeatures(analysis(values), { minReliableFrames: 50, highReliabilityMinFrames: 60 })
  assert.notEqual(standard.reliability, 'low')
  assert.equal(conservative.reliability, 'low')
  assert.equal(conservative.netPitchChangeSt, standard.netPitchChangeSt)
  assert.throws(() => extractToneFeatures(analysis(values), { smoothingWindowFrames: 2 }), RangeError)
})

test('long leading and trailing silence does not invalidate a reliable selected voiced interval', () => {
  const padded = analysis([...Array(180).fill(null), ...glide(120, 230, 30), ...Array(290).fill(null)])
  const features = extractToneFeatures(padded)
  assert.equal(features.reliability, 'medium')
  assert.equal(features.direction, 'rising')
  assert.ok(features.voicedFrameRatio < 0.1)
  assert.ok(features.analysisInterval && features.analysisInterval.duration > 0)
})

test('normalizes feature marker timestamps to the chart voiced interval', () => {
  const pitch = analysis([null, ...Array(10).fill(120), null, ...Array(10).fill(140), null], 0.02, 2)
  assert.equal(normalizePitchTime(pitch, 2.02), 0)
  assert.equal(normalizePitchTime(pitch, 2.42), 1)
  assert.ok(Math.abs((normalizePitchTime(pitch, 2.22) ?? 0) - 0.5) < 1e-10)
  assert.equal(normalizePitchTime(pitch, Number.NaN), null)
})

test('compares features only at sufficient reliability and reports signed differences', () => {
  const learner = featureFixture()
  learner.turningPointPosition = 0.5
  const reference = {
    ...featureFixture('medium'),
    direction: 'falling' as const,
    netPitchChangeSt: 5,
    pitchRangeSt: 7,
    turningPointPosition: 0.25,
  }
  const comparison = compareToneFeatures(learner, reference)
  assert.equal(comparison.directionMatch, false)
  assert.equal(comparison.netChangeDifferenceSt, 3)
  assert.equal(comparison.rangeDifferenceSt, 2)
  assert.equal(comparison.turningPointPositionDifference, 0.25)

  const withheld = compareToneFeatures(learner, { ...reference, reliability: 'low' })
  assert.equal(withheld.directionMatch, null)
  assert.equal(withheld.netChangeDifferenceSt, null)
  assert.ok(withheld.warnings.some(warning => warning.includes('Reference features have low reliability')))
})

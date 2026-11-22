import assert from 'node:assert/strict'
import test from 'node:test'
import { comparePitchAnalyses, normalizePitchAnalysis } from '../src/pitchComparison.ts'
import { splitPitchSegments } from '../src/pitchPlot.ts'
import type { PitchAnalysis } from '../src/pitchAnalysis.ts'

function analysis(values: (number | null)[], startTime = 0, hopSeconds = 0.02): PitchAnalysis {
  const voiced = values.flatMap(value => value === null ? [] : [value])
  const sorted = [...voiced].sort((a, b) => a - b)
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

test('normalizes each voiced interval independently while preserving original timestamps', () => {
  const reference = normalizePitchAnalysis(analysis([null, 100, 110, 120, 130, 140, 150, 160, 170, 180, null], 0.1))
  const learner = normalizePitchAnalysis(analysis([null, 200, 220, 240, 260, 280, 300, 320, 340, 360, null], 2, 0.04))
  assert.ok(reference && learner)
  assert.equal(reference[1]?.normalizedTime, 0)
  assert.equal(reference[9]?.normalizedTime, 1)
  assert.equal(learner[1]?.normalizedTime, 0)
  assert.equal(learner[9]?.normalizedTime, 1)
  assert.ok(Math.abs((reference[1]?.time ?? 0) - 0.12) < 1e-10)
  assert.ok(Math.abs((learner[1]?.time ?? 0) - 2.04) < 1e-10)
  reference.slice(1, 10).forEach((frame, index) => {
    assert.ok(Math.abs(frame.normalizedTime - (learner[index + 1]?.normalizedTime ?? -1)) < 1e-10)
  })
})

test('relative trajectories normalize against each recording median and keep unvoiced gaps disconnected', () => {
  const reference = normalizePitchAnalysis(analysis([100, 110, 120, 130, null, null, 150, 160, 170, 180]))
  const learner = normalizePitchAnalysis(analysis([200, 220, 240, 260, null, null, 300, 320, 340, 360]))
  assert.ok(reference && learner)
  assert.deepEqual(reference.filter(frame => frame.f0Hz !== null).map(frame => frame.relativePitch),
    learner.filter(frame => frame.f0Hz !== null).map(frame => frame.relativePitch))
  assert.equal(reference[4]?.relativePitch, null)
  assert.deepEqual(splitPitchSegments(reference).map(segment => segment.length), [4, 4])
  assert.deepEqual(splitPitchSegments(learner).map(segment => segment.length), [4, 4])
})

test('short or sparse tracks are not stretched into comparison trajectories', () => {
  assert.equal(normalizePitchAnalysis(analysis([120, 130, 140, 150, 160, null, null])), null)
  assert.equal(normalizePitchAnalysis(analysis([120, 130, 140, 150, 160, 170, 180, 190], 0, 0.005)), null)
  assert.match(comparePitchAnalyses(analysis([120, 130, 140]), analysis([120, 130, 140]))[0] ?? '',
    /reference contains too few reliable voiced frames/)
})

test('comparison feedback describes measured movement without scoring', () => {
  const risingReference = analysis([100, 105, 110, 120, 135, 150, 170, 190, 210, 230])
  const risingLearner = analysis([200, 210, 220, 240, 270, 300, 340, 380, 420, 460])
  assert.match(comparePitchAnalyses(risingReference, risingLearner)[0] ?? '', /Both recordings show an overall rising/)
  assert.match(comparePitchAnalyses(null, risingLearner)[0] ?? '', /browser TTS is audio-only/i)

  const flatLearner = analysis([200, 201, 202, 203, 204, 205, 206, 207, 208, 209])
  assert.match(comparePitchAnalyses(risingReference, flatLearner)[0] ?? '', /appears flatter than the reference/)
})

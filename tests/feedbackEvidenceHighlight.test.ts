import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFeedbackEvidence } from '../src/feedback/evidenceHighlight.ts'
import type { FeedbackEvidence } from '../src/feedback/toneFeedbackTypes.ts'
import type { PitchAnalysis } from '../src/pitchAnalysis.ts'

function analysis(startTime: number): PitchAnalysis {
  const frames = Array.from({ length: 11 }, (_, index) => ({
    time: startTime + index * 0.1,
    f0Hz: index === 5 ? null : 200,
    confidence: index === 5 ? 0 : 0.95,
  }))
  return {
    frames,
    voicedFrameCount: 10,
    voicedPercent: 91,
    duration: 1.1,
    medianF0Hz: 200,
    minF0Hz: 200,
    maxF0Hz: 200,
    warnings: [],
  }
}

function evidence(overrides: Partial<FeedbackEvidence> = {}): FeedbackEvidence {
  return {
    id: 'net-pitch-change',
    featureName: 'netPitchChangeSt',
    observedValue: 4,
    referenceValue: 1,
    unit: 'semitones',
    startTime: 0.3,
    endTime: 0.7,
    referenceStartTime: 2.2,
    referenceEndTime: 2.8,
    explanation: 'Measured movement across the selected interval.',
    ...overrides,
  }
}

test('maps evidence timestamps onto each recording’s independently normalized chart axis', () => {
  const highlight = normalizeFeedbackEvidence(
    evidence(),
    analysis(0),
    analysis(2),
  )

  assert.equal(highlight?.label, 'netPitchChangeSt')
  assert.deepEqual(highlight?.learner, { start: 0.3, end: 0.7 })
  assert.ok(Math.abs((highlight?.reference?.start ?? 0) - 0.2) < 1e-10)
  assert.ok(Math.abs((highlight?.reference?.end ?? 0) - 0.8) < 1e-10)
})

test('preserves point evidence and declines invalid or out-of-interval highlights', () => {
  const point = normalizeFeedbackEvidence(
    evidence({ startTime: 0.4, endTime: 0.4, referenceStartTime: undefined, referenceEndTime: undefined }),
    analysis(0),
    analysis(2),
  )
  const invalid = normalizeFeedbackEvidence(
    evidence({
      startTime: 0.8,
      endTime: 0.3,
      referenceStartTime: undefined,
      referenceEndTime: undefined,
    }),
    analysis(0),
    analysis(2),
  )
  const outOfInterval = normalizeFeedbackEvidence(
    evidence({ startTime: -0.1, endTime: 0.3, referenceStartTime: undefined, referenceEndTime: undefined }),
    analysis(0),
    null,
  )

  assert.deepEqual(point?.learner, { start: 0.4, end: 0.4 })
  assert.equal(point?.reference, null)
  assert.equal(invalid, null)
  assert.equal(outOfInterval, null)
})

test('does not highlight evidence when the chart track is too sparse to normalize', () => {
  const sparse = analysis(0)
  sparse.frames = sparse.frames.slice(0, 7)

  assert.equal(normalizeFeedbackEvidence(
    evidence({ referenceStartTime: undefined, referenceEndTime: undefined }),
    sparse,
    null,
  ), null)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { compareAttempts } from '../src/guidedPractice/attemptComparison.ts'
import {
  defaultExerciseForTone,
  exercisesForTone,
  guidedExerciseById,
  recommendExercise,
} from '../src/guidedPractice/exercises.ts'
import {
  createGuidedPracticeState,
  guidedPracticeReducer,
  MAX_GUIDED_ATTEMPTS,
} from '../src/guidedPractice/session.ts'
import type { PracticeAttempt } from '../src/guidedPractice/types.ts'
import type { ToneAcousticFeatures } from '../src/toneAcoustics.ts'

function features(overrides: Partial<ToneAcousticFeatures> = {}): ToneAcousticFeatures {
  return {
    direction: 'rising',
    startPitchSt: -2,
    endPitchSt: 3,
    netPitchChangeSt: 5,
    pitchRangeSt: 6,
    turningPointPosition: null,
    turningPointType: null,
    turningPointProminenceSt: null,
    turningPointTime: null,
    turningPointF0Hz: null,
    earlySlopeSt: 4,
    lateSlopeSt: 5,
    earlyLateBoundaryTime: 0.3,
    voicedFrameRatio: 0.8,
    reliableFrameCount: 48,
    reliability: 'high',
    analysisInterval: {
      startTime: 0.1,
      endTime: 0.6,
      duration: 0.5,
      reliableFrameCount: 48,
    },
    excludedRegions: [],
    internalGapProportion: 0,
    octaveJumpCount: 0,
    warnings: [],
    ...overrides,
  }
}

function attempt(
  id: string,
  exerciseId = 'tone-2-clear-rise',
  tone: 1 | 2 | 3 | 4 = 2,
  acousticFeatures: ToneAcousticFeatures | null = features(),
): PracticeAttempt {
  return {
    id,
    exerciseId,
    tone,
    timestamp: Number(id.replace(/\D/g, '')) || 1,
    acousticFeatures,
    feedbackCode: null,
    analysisReliability: acousticFeatures?.reliability ?? 'low',
    pitchAnalysis: null,
  }
}

test('guided exercises map feedback to focused cues and use a neutral fallback', () => {
  assert.equal(recommendExercise(1, 'T1_PITCH_DRIFT').id, 'tone-1-pitch-stability')
  assert.equal(recommendExercise(1, 'T1_RELATIVELY_STABLE').id, 'tone-1-pitch-stability')
  assert.equal(recommendExercise(2, 'T2_INSUFFICIENT_RISE').id, 'tone-2-clear-rise')
  assert.equal(recommendExercise(2, 'T2_CLEAR_RISE').id, 'tone-2-clear-rise')
  assert.equal(recommendExercise(3, 'T3_DIP_PRESENT').id, 'tone-3-dipping-contour')
  assert.equal(recommendExercise(3, 'T3_LOW_OR_LEVEL').id, 'tone-3-dipping-contour')
  assert.equal(recommendExercise(4, 'T4_INSUFFICIENT_FALL').id, 'tone-4-clear-fall')
  assert.equal(recommendExercise(3, 'INSUFFICIENT_EVIDENCE').id, 'recording-quality')
  assert.equal(recommendExercise(4, 'unrecognized-code').id, 'general-tone-exploration')
  assert.equal(defaultExerciseForTone(2).targetTone, 2)
  assert.ok(exercisesForTone(3).some(exercise => exercise.targetTone === null))
})

test('guided session pairs attempts only within its exercise and selected tone', () => {
  let state = createGuidedPracticeState(2, 'tone-2-clear-rise')
  state = guidedPracticeReducer(state, { type: 'attempt-analyzed', attempt: attempt('a1') })
  assert.equal(state.activeAttemptId, 'a1')
  assert.equal(state.selectedAttemptIds, null)

  state = guidedPracticeReducer(state, { type: 'attempt-analyzed', attempt: attempt('a2') })
  assert.deepEqual(state.selectedAttemptIds, ['a1', 'a2'])

  const unchanged = guidedPracticeReducer(state, {
    type: 'attempt-analyzed',
    attempt: attempt('wrong-tone', 'tone-2-clear-rise', 3),
  })
  assert.equal(unchanged, state)

  state = guidedPracticeReducer(state, {
    type: 'save-reflection',
    attemptId: 'a2',
    reflection: { response: 'unsure', note: 'Need another try' },
  })
  assert.equal(state.attempts[1]?.reflection?.note, 'Need another try')

  state = guidedPracticeReducer(state, {
    type: 'select-comparison',
    attemptIds: ['a1', 'wrong-tone'],
  })
  assert.equal(state.selectedAttemptIds, null)
})

test('guided attempt history is capped and can be cleared without persistence', () => {
  let state = createGuidedPracticeState(2, 'tone-2-clear-rise')
  for (let index = 0; index < MAX_GUIDED_ATTEMPTS + 2; index += 1) {
    state = guidedPracticeReducer(state, {
      type: 'attempt-analyzed',
      attempt: attempt(`a${index + 1}`),
    })
  }
  assert.equal(state.attempts.length, MAX_GUIDED_ATTEMPTS)
  assert.equal(state.attempts[0]?.id, 'a3')
  assert.deepEqual(state.selectedAttemptIds, ['a11', 'a12'])

  state = guidedPracticeReducer(state, { type: 'clear-history' })
  assert.deepEqual(state.attempts, [])
  assert.equal(state.activeAttemptId, null)
  assert.equal(state.selectedAttemptIds, null)
})

test('tone changes do not pair attempts from different tones in a general exercise', () => {
  let state = createGuidedPracticeState(1, 'general-tone-exploration')
  state = guidedPracticeReducer(state, {
    type: 'attempt-analyzed',
    attempt: attempt('tone-1', 'general-tone-exploration', 1),
  })
  state = guidedPracticeReducer(state, {
    type: 'select-exercise',
    exerciseId: 'general-tone-exploration',
    tone: 2,
  })
  state = guidedPracticeReducer(state, {
    type: 'attempt-analyzed',
    attempt: attempt('tone-2', 'general-tone-exploration', 2),
  })

  assert.equal(state.attempts.length, 2)
  assert.equal(state.selectedAttemptIds, null)
})

test('attempt comparison describes focused pitch movement without scoring', () => {
  const exercise = guidedExerciseById('tone-2-clear-rise')
  assert.ok(exercise)
  const attemptA = attempt('a', 'tone-2-clear-rise', 2, features({ netPitchChangeSt: 2 }))
  const attemptB = attempt('b', 'tone-2-clear-rise', 2, features({ netPitchChangeSt: 4 }))
  const result = compareAttempts(attemptA, attemptB, exercise)

  assert.equal(result.withheld, false)
  assert.match(result.observation, /larger upward pitch movement/)
  assert.ok(result.features.some(item => item.feature === 'netPitchChangeSt'))
  assert.doesNotMatch(result.observation, /score|correct|grade/i)
})

test('attempt comparison withholds contour claims when either attempt is unreliable', () => {
  const exercise = guidedExerciseById('tone-2-clear-rise')
  assert.ok(exercise)
  const result = compareAttempts(
    attempt('a', 'tone-2-clear-rise', 2, features()),
    attempt('b', 'tone-2-clear-rise', 2, features({ reliability: 'low' })),
    exercise,
  )

  assert.equal(result.withheld, true)
  assert.match(result.observation, /insufficient feature reliability/)
  assert.deepEqual(result.features.map(item => item.feature), ['reliability'])
})

test('Tone 3 comparison avoids treating a missing dip as an error', () => {
  const exercise = guidedExerciseById('tone-3-dipping-contour')
  assert.ok(exercise)
  const result = compareAttempts(
    attempt('a', exercise.id, 3, features({
      direction: 'level',
      turningPointType: null,
      turningPointProminenceSt: null,
    })),
    attempt('b', exercise.id, 3, features({
      direction: 'level',
      turningPointType: null,
      turningPointProminenceSt: null,
    })),
    exercise,
  )

  assert.match(result.observation, /does not establish an incorrect Tone 3/)
})

test('recording-quality exercise compares coverage while withholding pronunciation claims', () => {
  const exercise = guidedExerciseById('recording-quality')
  assert.ok(exercise)
  const result = compareAttempts(
    attempt('a', exercise.id, 2, features({ reliability: 'low', voicedFrameRatio: 0.1 })),
    attempt('b', exercise.id, 2, features({ reliability: 'low', voicedFrameRatio: 0.4 })),
    exercise,
  )

  assert.equal(result.withheld, false)
  assert.match(result.observation, /more frames above the pitch-confidence threshold/)
  assert.match(result.observation, /not pronunciation quality/)
  assert.ok(result.features.some(item => item.feature === 'voicedFrameRatio'))
})

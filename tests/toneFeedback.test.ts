import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateToneProduction } from '../src/feedback/evaluateToneProduction.ts'
import { evaluateToneFeedbackRules } from '../src/feedback/toneFeedbackRules.ts'
import { resolveToneFeedbackThresholds } from '../src/feedback/toneFeedbackThresholds.ts'
import type { ToneAcousticFeatures } from '../src/toneAcoustics.ts'

function featureFixture(
  overrides: Partial<ToneAcousticFeatures> = {},
): ToneAcousticFeatures {
  const base: ToneAcousticFeatures = {
    direction: 'rising',
    startPitchSt: -4,
    endPitchSt: 4,
    netPitchChangeSt: 8,
    pitchRangeSt: 9,
    turningPointPosition: null,
    turningPointType: null,
    turningPointProminenceSt: null,
    turningPointTime: null,
    turningPointF0Hz: null,
    earlySlopeSt: 7,
    lateSlopeSt: 8,
    earlyLateBoundaryTime: 0.3,
    voicedFrameRatio: 1,
    reliableFrameCount: 61,
    reliability: 'high',
    analysisInterval: {
      startTime: 0.1,
      endTime: 0.7,
      duration: 0.6,
      reliableFrameCount: 61,
    },
    excludedRegions: [],
    internalGapProportion: 0,
    octaveJumpCount: 0,
    warnings: [],
  }
  return { ...base, ...overrides }
}

test('tone 1 feedback describes stable movement or drift without judging pitch height', () => {
  const stable = evaluateToneProduction({
    tone: 1,
    learnerFeatures: featureFixture({
      direction: 'level',
      netPitchChangeSt: 0.4,
      pitchRangeSt: 1.8,
    }),
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })
  const drift = evaluateToneProduction({
    tone: 1,
    learnerFeatures: featureFixture({
      direction: 'falling',
      netPitchChangeSt: -4,
      pitchRangeSt: 4.5,
    }),
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })

  assert.equal(stable.primary.code, 'T1_RELATIVELY_STABLE')
  assert.match(stable.primary.explanation, /does not measure absolute pitch height/)
  assert.equal(drift.primary.code, 'T1_PITCH_DRIFT')
  assert.match(drift.primary.observation, /falls by about 4\.0 semitones/)
})

test('tone 2 allows an initial dip when the measured contour rises later', () => {
  const feedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: featureFixture({
      direction: 'complex',
      netPitchChangeSt: 3,
      earlySlopeSt: -2,
      lateSlopeSt: 6,
      turningPointType: 'minimum',
      turningPointProminenceSt: 1.7,
      turningPointTime: 0.3,
      turningPointPosition: 0.4,
    }),
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })

  assert.equal(feedback.primary.code, 'T2_CLEAR_RISE')
  assert.match(feedback.primary.observation, /dips at first, then rises later/)
  assert.doesNotMatch(feedback.primary.suggestion, /match/)
})

test('tone 2 distinguishes a modest rise from a clearly falling contour', () => {
  const modest = evaluateToneFeedbackRules(2, featureFixture({
    netPitchChangeSt: 2.49,
    direction: 'rising',
  }))
  const falling = evaluateToneFeedbackRules(2, featureFixture({
    netPitchChangeSt: -3,
    direction: 'falling',
  }))

  assert.equal(modest[0]?.code, 'T2_INSUFFICIENT_RISE')
  assert.equal(falling[0]?.code, 'UNEXPECTED_CONTOUR')
})

test('tone 3 reports dips without requiring a final rise and describes missing dips cautiously', () => {
  const dip = evaluateToneProduction({
    tone: 3,
    learnerFeatures: featureFixture({
      direction: 'complex',
      netPitchChangeSt: -1,
      earlySlopeSt: -4,
      lateSlopeSt: 0,
      turningPointType: 'minimum',
      turningPointProminenceSt: 1.5,
      turningPointTime: 0.4,
      turningPointPosition: 0.5,
    }),
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })
  const rise = evaluateToneProduction({
    tone: 3,
    learnerFeatures: featureFixture({ direction: 'rising' }),
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })

  assert.equal(dip.primary.code, 'T3_DIP_PRESENT')
  assert.match(dip.primary.observation, /local pitch minimum/)
  assert.equal(rise.primary.code, 'T3_UNEXPECTED_RISE')
  assert.match(rise.primary.observation, /does not establish an error/)
  assert.match(rise.primary.explanation, /does not infer a tone judgment/)
})

test('tone 3 dip and tone 4 fall use the same configured prominence and movement thresholds', () => {
  const thresholds = resolveToneFeedbackThresholds({
    minimumRiseSt: 3,
    minimumFallSt: 3,
    meaningfulTurningPointProminenceSt: 2,
  })
  const weakDip = evaluateToneFeedbackRules(3, featureFixture({
    direction: 'complex',
    netPitchChangeSt: 0,
    turningPointType: 'minimum',
    turningPointProminenceSt: 1.9,
  }), thresholds)
  const clearFall = evaluateToneFeedbackRules(4, featureFixture({
    direction: 'falling',
    netPitchChangeSt: -3,
    lateSlopeSt: -4,
  }), thresholds)
  const weakFall = evaluateToneFeedbackRules(4, featureFixture({
    direction: 'falling',
    netPitchChangeSt: -2.99,
    lateSlopeSt: -4,
  }), thresholds)

  assert.equal(weakDip[0]?.code, 'T3_LOW_OR_LEVEL')
  assert.equal(clearFall[0]?.code, 'T4_CLEAR_FALL')
  assert.equal(weakFall[0]?.code, 'T4_INSUFFICIENT_FALL')
})

test('low reliability, too few frames, and short intervals withhold tone-specific feedback', () => {
  const cases = [
    featureFixture({ reliability: 'low' }),
    featureFixture({ reliableFrameCount: 7 }),
    featureFixture({
      analysisInterval: {
        startTime: 0.1,
        endTime: 0.2,
        duration: 0.1,
        reliableFrameCount: 61,
      },
    }),
    featureFixture({ direction: 'unknown' }),
  ]

  for (const features of cases) {
    const feedback = evaluateToneFeedbackRules(2, features)
    assert.deepEqual(feedback.map(item => item.code), ['INSUFFICIENT_EVIDENCE'])
    assert.equal(feedback[0]?.confidence, 'low')
  }

  assert.equal(evaluateToneFeedbackRules(2, null)[0]?.code, 'INSUFFICIENT_EVIDENCE')
})

test('medium reliability is accepted only when configured and remains explicitly tentative', () => {
  const mediumFeatures = featureFixture({ reliability: 'medium' })
  const defaultFeedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: mediumFeatures,
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })
  const strictFeedback = evaluateToneFeedbackRules(
    2,
    mediumFeatures,
    { minimumReliability: 'high' },
  )

  assert.equal(defaultFeedback.primary.confidence, 'medium')
  assert.match(defaultFeedback.primary.confidenceExplanation, /Tentative/)
  assert.equal(strictFeedback[0]?.code, 'INSUFFICIENT_EVIDENCE')
})

test('browser TTS fallback clearly withholds measured-reference comparison', () => {
  const feedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: featureFixture(),
    referenceFeatures: null,
    referenceSource: 'browser-tts',
  })

  assert.equal(feedback.additional[0]?.code, 'REFERENCE_UNAVAILABLE')
  assert.match(feedback.additional[0]?.observation ?? '', /audio samples are not available/)
  assert.match(feedback.additional[0]?.explanation ?? '', /no reference F0 values are inferred/)
})

test('reliable reference comparisons use relative features and preserve original evidence timestamps', () => {
  const learner = featureFixture({
    direction: 'rising',
    netPitchChangeSt: 7,
    earlySlopeSt: 5,
    lateSlopeSt: 8,
    turningPointType: 'minimum',
    turningPointProminenceSt: 2,
    turningPointTime: 0.3,
    turningPointPosition: 0.35,
    analysisInterval: {
      startTime: 0.1,
      endTime: 0.7,
      duration: 0.6,
      reliableFrameCount: 61,
    },
  })
  const reference = featureFixture({
    direction: 'falling',
    netPitchChangeSt: -1,
    earlySlopeSt: -2,
    lateSlopeSt: -3,
    turningPointType: 'maximum',
    turningPointProminenceSt: 2,
    turningPointTime: 0.8,
    turningPointPosition: 0.65,
    analysisInterval: {
      startTime: 0.4,
      endTime: 1.2,
      duration: 0.8,
      reliableFrameCount: 61,
    },
  })
  const feedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: learner,
    referenceFeatures: reference,
    referenceSource: 'local-tts',
  })

  assert.equal(feedback.primary.code, 'T2_CLEAR_RISE')
  assert.equal(feedback.additional[0]?.code, 'REFERENCE_DIFFERENCE')
  assert.ok(feedback.additional[0]?.evidence.some(evidence =>
    evidence.startTime === 0.1
      && evidence.endTime === 0.7
      && evidence.referenceStartTime === 0.4
      && evidence.referenceEndTime === 1.2))
})

test('reference comparison is withheld when reference features are unreliable', () => {
  const feedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: featureFixture(),
    referenceFeatures: featureFixture({ reliability: 'low' }),
    referenceSource: 'local-tts',
  })

  assert.equal(feedback.primary.code, 'T2_CLEAR_RISE')
  assert.equal(feedback.additional[0]?.code, 'REFERENCE_UNAVAILABLE')
  assert.equal(feedback.additional.some(item => item.evidence.some(entry =>
    entry.featureName === 'direction' && entry.referenceValue !== undefined)), false)
})

test('a reliable reference is not mislabeled unavailable when the learner track is unreliable', () => {
  const feedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: featureFixture({ reliability: 'low' }),
    referenceFeatures: featureFixture({ direction: 'rising' }),
    referenceSource: 'local-tts',
  })

  assert.equal(feedback.primary.code, 'INSUFFICIENT_EVIDENCE')
  assert.equal(feedback.additional.some(item => item.code === 'REFERENCE_UNAVAILABLE'), false)
  assert.equal(feedback.additional.some(item => item.code === 'REFERENCE_DIFFERENCE'), false)
})

test('a high-priority tone observation stays primary over descriptive reference differences', () => {
  const feedback = evaluateToneProduction({
    tone: 2,
    learnerFeatures: featureFixture({ direction: 'falling', netPitchChangeSt: -5 }),
    referenceFeatures: featureFixture({ direction: 'rising', netPitchChangeSt: 5 }),
    referenceSource: 'local-tts',
  })

  assert.equal(feedback.primary.code, 'UNEXPECTED_CONTOUR')
  assert.equal(feedback.additional[0]?.code, 'REFERENCE_DIFFERENCE')
})

test('invalid thresholds fail explicitly and comparison priority remains deterministic', () => {
  assert.throws(() => resolveToneFeedbackThresholds({ minimumRiseSt: Number.NaN }), RangeError)
  assert.throws(() => resolveToneFeedbackThresholds({ minimumTurningPointPositionDifference: 1.1 }), RangeError)

  const input = {
    tone: 2 as const,
    learnerFeatures: featureFixture({ reliability: 'low' }),
    referenceFeatures: null,
    referenceSource: 'browser-tts' as const,
  }
  const first = evaluateToneProduction(input)
  const second = evaluateToneProduction(input)
  assert.equal(first.primary.code, 'INSUFFICIENT_EVIDENCE')
  assert.equal(first.additional[0]?.code, 'REFERENCE_UNAVAILABLE')
  assert.deepEqual(first, second)
})

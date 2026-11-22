import type { AcousticReliability, ToneAcousticFeatures } from '../toneAcoustics.ts'
import type { MandarinTone } from '../tones.ts'
import {
  resolveToneFeedbackThresholds,
  type ToneFeedbackThresholds,
} from './toneFeedbackThresholds.ts'
import type {
  FeedbackCode,
  FeedbackEvidence,
  FeedbackSeverity,
  ToneFeedbackDraft,
} from './toneFeedbackTypes.ts'

export type EvidenceFeature =
  | 'direction'
  | 'netPitchChangeSt'
  | 'pitchRangeSt'
  | 'earlySlopeSt'
  | 'lateSlopeSt'
  | 'turningPoint'
  | 'turningPointPosition'
  | 'turningPointProminenceSt'

const reliabilityRank: Record<AcousticReliability, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

function intervalForFeature(
  features: ToneAcousticFeatures,
  feature: EvidenceFeature,
): { startTime: number; endTime: number } | null {
  const interval = features.analysisInterval
  if (!interval) return null

  if (feature === 'earlySlopeSt') {
    return {
      startTime: interval.startTime,
      endTime: features.earlyLateBoundaryTime ?? (interval.startTime + interval.endTime) / 2,
    }
  }
  if (feature === 'lateSlopeSt') {
    return {
      startTime: features.earlyLateBoundaryTime ?? (interval.startTime + interval.endTime) / 2,
      endTime: interval.endTime,
    }
  }
  if (feature === 'turningPoint'
    || feature === 'turningPointPosition'
    || feature === 'turningPointProminenceSt') {
    if (features.turningPointTime !== null) {
      return { startTime: features.turningPointTime, endTime: features.turningPointTime }
    }
  }
  return { startTime: interval.startTime, endTime: interval.endTime }
}

function featureValue(
  features: ToneAcousticFeatures,
  feature: EvidenceFeature,
): number | string | null {
  switch (feature) {
    case 'direction':
      return features.direction
    case 'netPitchChangeSt':
      return features.netPitchChangeSt
    case 'pitchRangeSt':
      return features.pitchRangeSt
    case 'earlySlopeSt':
      return features.earlySlopeSt
    case 'lateSlopeSt':
      return features.lateSlopeSt
    case 'turningPoint':
      return features.turningPointType
    case 'turningPointPosition':
      return features.turningPointPosition
    case 'turningPointProminenceSt':
      return features.turningPointProminenceSt
  }
}

export function toneFeatureEvidence(
  feature: EvidenceFeature,
  features: ToneAcousticFeatures,
  explanation: string,
  referenceFeatures: ToneAcousticFeatures | null = null,
): FeedbackEvidence {
  const interval = intervalForFeature(features, feature)
  const referenceInterval = referenceFeatures
    ? intervalForFeature(referenceFeatures, feature)
    : null
  return {
    id: `${feature}-${features.reliableFrameCount}-${features.analysisInterval?.startTime ?? 'none'}`,
    featureName: feature,
    observedValue: featureValue(features, feature),
    ...(referenceFeatures ? { referenceValue: featureValue(referenceFeatures, feature) } : {}),
    ...(feature === 'earlySlopeSt' || feature === 'lateSlopeSt'
      ? { unit: 'semitones per normalized interval' }
      : feature.endsWith('St') ? { unit: 'semitones' }
        : feature === 'turningPoint' ? { unit: 'type' }
          : feature === 'turningPointPosition' ? { unit: 'normalized interval' } : {}),
    ...(interval ? { startTime: interval.startTime, endTime: interval.endTime } : {}),
    ...(referenceInterval
      ? {
          referenceStartTime: referenceInterval.startTime,
          referenceEndTime: referenceInterval.endTime,
        }
      : {}),
    explanation,
  }
}

function draft(
  code: FeedbackCode,
  severity: FeedbackSeverity,
  priority: number,
  confidence: AcousticReliability,
  evidence: FeedbackEvidence[],
): ToneFeedbackDraft {
  return { code, severity, priority, confidence, evidence }
}

function insufficientEvidence(
  features: ToneAcousticFeatures | null,
  message: string,
): ToneFeedbackDraft[] {
  const warning = features?.warnings[0] ?? message
  return [
    draft('INSUFFICIENT_EVIDENCE', 'retry', 100, 'low', [{
      id: 'insufficient-evidence',
      featureName: 'reliability',
      observedValue: features?.reliability ?? null,
      unit: 'reliability',
      ...(features?.analysisInterval
        ? {
            startTime: features.analysisInterval.startTime,
            endTime: features.analysisInterval.endTime,
          }
        : {}),
      explanation: warning,
    }]),
  ]
}

function reliabilityMeetsThreshold(
  reliability: AcousticReliability,
  minimum: ToneFeedbackThresholds['minimumReliability'],
): boolean {
  return reliabilityRank[reliability] >= reliabilityRank[minimum]
}

export function toneFeaturesMeetFeedbackThresholds(
  features: ToneAcousticFeatures,
  thresholds: ToneFeedbackThresholds,
): boolean {
  return features.reliability !== 'low'
    && reliabilityMeetsThreshold(features.reliability, thresholds.minimumReliability)
    && features.reliableFrameCount >= thresholds.minimumReliableFrames
    && features.analysisInterval !== null
    && features.analysisInterval.duration * 1000 >= thresholds.minimumVoicedDurationMs
}

function toneDraft(
  code: FeedbackCode,
  severity: FeedbackSeverity,
  priority: number,
  features: ToneAcousticFeatures,
  evidenceFeatures: EvidenceFeature[],
  explanation: string,
): ToneFeedbackDraft {
  return draft(
    code,
    severity,
    priority,
    features.reliability,
    evidenceFeatures.map((feature, index) => {
      const evidence = toneFeatureEvidence(feature, features, explanation)
      return { ...evidence, id: `${code.toLowerCase()}-${index}-${evidence.id}` }
    }),
  )
}

function evaluateToneRule(
  tone: MandarinTone,
  features: ToneAcousticFeatures,
  thresholds: ToneFeedbackThresholds,
): ToneFeedbackDraft {
  const net = features.netPitchChangeSt
  const direction = features.direction

  if (tone === 1) {
    const range = features.pitchRangeSt
    const stable = net !== null
      && Math.abs(net) <= thresholds.levelToleranceSt
      && (direction === 'level'
        || (range !== null && range <= thresholds.levelToleranceSt))
    return toneDraft(
      stable ? 'T1_RELATIVELY_STABLE' : 'T1_PITCH_DRIFT',
      stable ? 'info' : 'suggestion',
      stable ? 30 : 75,
      features,
      stable ? ['direction', 'netPitchChangeSt'] : ['direction', 'netPitchChangeSt', 'pitchRangeSt'],
      'These values describe measured movement only; they do not establish pitch height or pronunciation correctness.',
    )
  }

  if (tone === 2) {
    if (net !== null
      && net <= -thresholds.minimumRiseSt
      && direction === 'falling') {
      return toneDraft(
        'UNEXPECTED_CONTOUR',
        'suggestion',
        90,
        features,
        ['direction', 'netPitchChangeSt'],
        'The measured movement is being described, not scored against a speaker identity.',
      )
    }
    const risingTowardEnd = features.lateSlopeSt !== null && features.lateSlopeSt > 0
    const clearRise = net !== null
      && net >= thresholds.minimumRiseSt
      && (direction === 'rising' || (direction === 'complex' && risingTowardEnd))
    return toneDraft(
      clearRise ? 'T2_CLEAR_RISE' : 'T2_INSUFFICIENT_RISE',
      clearRise ? 'info' : 'suggestion',
      clearRise ? 30 : 75,
      features,
      clearRise && features.earlySlopeSt !== null && features.earlySlopeSt < 0 && risingTowardEnd
        ? ['netPitchChangeSt', 'earlySlopeSt', 'lateSlopeSt']
        : ['direction', 'netPitchChangeSt', 'lateSlopeSt'],
      'A small initial dip is allowed; the observation focuses on the overall movement and later part of the contour.',
    )
  }

  if (tone === 3) {
    const hasMeaningfulDip = features.turningPointType === 'minimum'
      && features.turningPointProminenceSt !== null
      && features.turningPointProminenceSt >= thresholds.meaningfulTurningPointProminenceSt
    if (hasMeaningfulDip) {
      return toneDraft(
        'T3_DIP_PRESENT',
        'info',
        30,
        features,
        ['turningPoint', 'turningPointProminenceSt'],
        'A detected dip is an acoustic observation; Tone 3 varies with speaking context and does not require a fixed full contour.',
      )
    }
    const riseWithoutDip = direction === 'rising'
      || (features.turningPointType === 'maximum'
        && (features.turningPointProminenceSt ?? 0) >= thresholds.meaningfulTurningPointProminenceSt)
    return toneDraft(
      riseWithoutDip ? 'T3_UNEXPECTED_RISE' : 'T3_LOW_OR_LEVEL',
      'info',
      riseWithoutDip ? 55 : 45,
      features,
      riseWithoutDip
        ? ['direction', 'netPitchChangeSt', 'turningPoint']
        : ['direction', 'turningPoint', 'turningPointProminenceSt'],
      'This observation does not require a final rise or a full 214 contour, and does not establish whether the tone is correct.',
    )
  }

  if (net !== null
    && net >= thresholds.minimumFallSt
    && direction === 'rising') {
    return toneDraft(
      'UNEXPECTED_CONTOUR',
      'suggestion',
      90,
      features,
      ['direction', 'netPitchChangeSt'],
      'The measured movement is being described, not scored against a speaker identity.',
    )
  }
  const fallingTowardEnd = features.lateSlopeSt !== null && features.lateSlopeSt < 0
  const clearFall = net !== null
    && net <= -thresholds.minimumFallSt
    && (direction === 'falling' || (direction === 'complex' && fallingTowardEnd))
  return toneDraft(
    clearFall ? 'T4_CLEAR_FALL' : 'T4_INSUFFICIENT_FALL',
    clearFall ? 'info' : 'suggestion',
    clearFall ? 30 : 75,
    features,
    clearFall && features.earlySlopeSt !== null && features.earlySlopeSt > 0 && fallingTowardEnd
      ? ['netPitchChangeSt', 'earlySlopeSt', 'lateSlopeSt']
      : ['direction', 'netPitchChangeSt', 'lateSlopeSt'],
    'These values describe measured movement only; absolute pitch is not compared with the reference speaker.',
  )
}

export function evaluateToneFeedbackRules(
  tone: MandarinTone,
  learnerFeatures: ToneAcousticFeatures | null,
  thresholdOverrides: Partial<ToneFeedbackThresholds> = {},
): ToneFeedbackDraft[] {
  const thresholds = resolveToneFeedbackThresholds(thresholdOverrides)
  if (!learnerFeatures) {
    return insufficientEvidence(null, 'No acoustic feature result was available.')
  }
  if (!toneFeaturesMeetFeedbackThresholds(learnerFeatures, thresholds)) {
    return insufficientEvidence(learnerFeatures, 'Too few reliable voiced frames or too little voiced duration for interpretation.')
  }
  if (learnerFeatures.direction === 'unknown' || learnerFeatures.netPitchChangeSt === null) {
    return insufficientEvidence(learnerFeatures, 'Pitch direction could not be estimated reliably.')
  }

  return [
    evaluateToneRule(
      tone,
      learnerFeatures,
      thresholds,
    ),
  ]
}

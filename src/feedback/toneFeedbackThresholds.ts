export interface ToneFeedbackThresholds {
  minimumReliableFrames: number
  minimumVoicedDurationMs: number
  minimumReliability: 'medium' | 'high'
  levelToleranceSt: number
  minimumRiseSt: number
  minimumFallSt: number
  meaningfulTurningPointProminenceSt: number
  minimumReferenceDifferenceSt: number
  minimumTurningPointPositionDifference: number
}

export const DEFAULT_TONE_FEEDBACK_THRESHOLDS: Readonly<ToneFeedbackThresholds> = {
  minimumReliableFrames: 8,
  minimumVoicedDurationMs: 120,
  minimumReliability: 'medium',
  levelToleranceSt: 2.5,
  minimumRiseSt: 2.5,
  minimumFallSt: 2.5,
  meaningfulTurningPointProminenceSt: 1.5,
  minimumReferenceDifferenceSt: 2,
  minimumTurningPointPositionDifference: 0.2,
}

export function resolveToneFeedbackThresholds(
  overrides: Partial<ToneFeedbackThresholds> = {},
): ToneFeedbackThresholds {
  const thresholds = { ...DEFAULT_TONE_FEEDBACK_THRESHOLDS, ...overrides }
  const numeric = [
    thresholds.minimumReliableFrames,
    thresholds.minimumVoicedDurationMs,
    thresholds.levelToleranceSt,
    thresholds.minimumRiseSt,
    thresholds.minimumFallSt,
    thresholds.meaningfulTurningPointProminenceSt,
    thresholds.minimumReferenceDifferenceSt,
    thresholds.minimumTurningPointPositionDifference,
  ]
  if (numeric.some(value => !Number.isFinite(value) || value < 0)
    || !Number.isInteger(thresholds.minimumReliableFrames) || thresholds.minimumReliableFrames < 1
    || thresholds.minimumVoicedDurationMs <= 0
    || thresholds.minimumTurningPointPositionDifference > 1
    || (thresholds.minimumReliability !== 'medium' && thresholds.minimumReliability !== 'high')) {
    throw new RangeError('Tone feedback thresholds must use positive frame/duration limits and finite nonnegative semitone values.')
  }
  return thresholds
}

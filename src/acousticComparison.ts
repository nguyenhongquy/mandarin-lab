import type { AcousticReliability, ToneAcousticFeatures } from './toneAcoustics.ts'

export interface AcousticComparison {
  directionMatch: boolean | null
  netChangeDifferenceSt: number | null
  rangeDifferenceSt: number | null
  turningPointPositionDifference: number | null
  warnings: string[]
}

function isSufficientlyReliable(reliability: AcousticReliability): boolean {
  return reliability === 'high' || reliability === 'medium'
}

export function compareToneFeatures(
  learner: ToneAcousticFeatures,
  reference: ToneAcousticFeatures,
): AcousticComparison {
  const warnings: string[] = []
  if (!isSufficientlyReliable(learner.reliability)) {
    warnings.push('Learner features have low reliability; acoustic comparison is withheld.')
  }
  if (!isSufficientlyReliable(reference.reliability)) {
    warnings.push('Reference features have low reliability; acoustic comparison is withheld.')
  }
  if (warnings.length) {
    return {
      directionMatch: null,
      netChangeDifferenceSt: null,
      rangeDifferenceSt: null,
      turningPointPositionDifference: null,
      warnings,
    }
  }

  const directionMatch = learner.direction === 'unknown' || reference.direction === 'unknown'
    ? null
    : learner.direction === reference.direction
  if (directionMatch === null) warnings.push('Direction comparison is unavailable for one or both feature sets.')
  return {
    directionMatch,
    netChangeDifferenceSt: learner.netPitchChangeSt === null || reference.netPitchChangeSt === null
      ? null : learner.netPitchChangeSt - reference.netPitchChangeSt,
    rangeDifferenceSt: learner.pitchRangeSt === null || reference.pitchRangeSt === null
      ? null : learner.pitchRangeSt - reference.pitchRangeSt,
    turningPointPositionDifference: learner.turningPointPosition === null || reference.turningPointPosition === null
      ? null : learner.turningPointPosition - reference.turningPointPosition,
    warnings,
  }
}

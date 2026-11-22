import { DEFAULT_TONE_FEATURE_OPTIONS } from '../toneAcoustics.ts'
import type { AcousticReliability } from '../toneAcoustics.ts'
import type { GuidedExercise, PracticeAttempt } from './types.ts'

export interface AttemptFeatureComparison {
  feature: string
  label: string
  attemptA: number | string | null
  attemptB: number | string | null
  unit?: string
}

export interface AttemptComparisonResult {
  withheld: boolean
  observation: string
  features: AttemptFeatureComparison[]
}

const MOVEMENT_CHANGE_THRESHOLD_ST = 0.5
const TURNING_POSITION_CHANGE_THRESHOLD = 0.1

function reliabilityRank(reliability: AcousticReliability): number {
  return reliability === 'high' ? 2 : reliability === 'medium' ? 1 : 0
}

function reliabilityRow(attemptA: PracticeAttempt, attemptB: PracticeAttempt): AttemptFeatureComparison {
  return {
    feature: 'reliability',
    label: 'Measurement reliability',
    attemptA: attemptA.analysisReliability,
    attemptB: attemptB.analysisReliability,
  }
}

function withheld(
  attemptA: PracticeAttempt,
  attemptB: PracticeAttempt,
  observation: string,
): AttemptComparisonResult {
  return {
    withheld: true,
    observation,
    features: [reliabilityRow(attemptA, attemptB)],
  }
}

function reliable(attempt: PracticeAttempt): boolean {
  return attempt.acousticFeatures !== null
    && attempt.acousticFeatures.reliability !== 'low'
    && attempt.analysisReliability !== 'low'
}

function direction(features: NonNullable<PracticeAttempt['acousticFeatures']>): string {
  return features.direction === 'unknown' ? 'unknown' : features.direction
}

function numericFeature(
  feature: string,
  label: string,
  attemptA: number | null,
  attemptB: number | null,
  unit = 'semitones',
): AttemptFeatureComparison {
  return { feature, label, attemptA, attemptB, unit }
}

function movementSummary(
  focus: GuidedExercise['focus'],
  attemptA: PracticeAttempt,
  attemptB: PracticeAttempt,
): string {
  const first = attemptA.acousticFeatures
  const second = attemptB.acousticFeatures
  if (!first || !second) return 'Acoustic feature comparison is unavailable.'
  if (first.netPitchChangeSt === null || second.netPitchChangeSt === null) {
    return 'Net pitch movement is unavailable, so no movement change is summarized.'
  }
  const delta = second.netPitchChangeSt - first.netPitchChangeSt

  if (focus === 'rising_movement') {
    if (delta >= MOVEMENT_CHANGE_THRESHOLD_ST) return 'The second attempt shows a larger upward pitch movement.'
    if (delta <= -MOVEMENT_CHANGE_THRESHOLD_ST) return 'The second attempt shows a smaller upward pitch movement.'
    if (first.direction !== second.direction) {
      return `The direction estimate changed from ${direction(first)} to ${direction(second)}; net movement did not change clearly.`
    }
    return 'No clear change in measured upward movement was detected.'
  }

  if (focus === 'falling_movement') {
    if (delta <= -MOVEMENT_CHANGE_THRESHOLD_ST) return 'The second attempt shows a larger downward pitch movement.'
    if (delta >= MOVEMENT_CHANGE_THRESHOLD_ST) return 'The second attempt shows a smaller downward pitch movement.'
    if (first.direction !== second.direction) {
      return `The direction estimate changed from ${direction(first)} to ${direction(second)}; net movement did not change clearly.`
    }
    return 'No clear change in measured downward movement was detected.'
  }

  return ''
}

function stabilitySummary(
  attemptA: PracticeAttempt,
  attemptB: PracticeAttempt,
): string {
  const first = attemptA.acousticFeatures
  const second = attemptB.acousticFeatures
  if (!first || !second) return 'Acoustic feature comparison is unavailable.'
  if (first.pitchRangeSt === null || second.pitchRangeSt === null
    || first.netPitchChangeSt === null || second.netPitchChangeSt === null) {
    return 'Pitch range or net drift is unavailable, so no stability change is summarized.'
  }
  const rangeChange = second.pitchRangeSt - first.pitchRangeSt
  const driftChange = Math.abs(second.netPitchChangeSt) - Math.abs(first.netPitchChangeSt)
  const rangeSmaller = rangeChange <= -MOVEMENT_CHANGE_THRESHOLD_ST
  const driftSmaller = driftChange <= -MOVEMENT_CHANGE_THRESHOLD_ST
  const rangeLarger = rangeChange >= MOVEMENT_CHANGE_THRESHOLD_ST
  const driftLarger = driftChange >= MOVEMENT_CHANGE_THRESHOLD_ST

  if (rangeSmaller && driftSmaller) return 'The second attempt has a smaller measured pitch range and less net drift.'
  if (rangeLarger && driftLarger) return 'The second attempt has a larger measured pitch range and more net drift.'
  if (rangeSmaller && !driftLarger) return 'The second attempt has a smaller measured pitch range.'
  if (driftSmaller && !rangeLarger) return 'The second attempt has less measured net drift.'
  if ((rangeSmaller || rangeLarger) && (driftSmaller || driftLarger)) {
    return 'Pitch range and net drift changed in different ways; no single stability change is summarized.'
  }
  return 'No clear change in measured pitch range or net drift was detected.'
}

function dippingSummary(
  attemptA: PracticeAttempt,
  attemptB: PracticeAttempt,
): string {
  const first = attemptA.acousticFeatures
  const second = attemptB.acousticFeatures
  if (!first || !second) return 'Acoustic feature comparison is unavailable.'
  const firstHasDip = first.turningPointType === 'minimum'
    && (first.turningPointProminenceSt ?? 0) >= DEFAULT_TONE_FEATURE_OPTIONS.turningProminenceThresholdSt
  const secondHasDip = second.turningPointType === 'minimum'
    && (second.turningPointProminenceSt ?? 0) >= DEFAULT_TONE_FEATURE_OPTIONS.turningProminenceThresholdSt
  if (!firstHasDip && secondHasDip) {
    return 'A falling–rising pattern is visible in the second attempt; this is descriptive, not a requirement for every Tone 3 context.'
  }
  if (firstHasDip && !secondHasDip) {
    return 'A local minimum is visible in the first attempt but not the second; Tone 3 realizations can vary by context.'
  }
  if (firstHasDip && secondHasDip
    && first.turningPointPosition !== null && second.turningPointPosition !== null) {
    const positionChange = second.turningPointPosition - first.turningPointPosition
    if (Math.abs(positionChange) >= TURNING_POSITION_CHANGE_THRESHOLD) {
      return `The second attempt’s detected minimum occurs ${positionChange > 0 ? 'later' : 'earlier'} on the normalized interval.`
    }
    if (first.earlySlopeSt !== null && first.lateSlopeSt !== null
      && second.earlySlopeSt !== null && second.lateSlopeSt !== null) {
      return 'A falling–rising pattern is visible in both attempts; their early and late movements can be compared below.'
    }
  }
  if (!firstHasDip && !secondHasDip) {
    return 'No clear local minimum was detected in either attempt; this does not establish an incorrect Tone 3.'
  }
  return 'The measured turning-point positions are unavailable for a clear comparison.'
}

function qualitySummary(attemptA: PracticeAttempt, attemptB: PracticeAttempt): string {
  const first = attemptA.analysisReliability
  const second = attemptB.analysisReliability
  const firstCoverage = attemptA.acousticFeatures?.voicedFrameRatio
  const secondCoverage = attemptB.acousticFeatures?.voicedFrameRatio
  let coverage = 'No clear change in reliable voiced-frame coverage was detected.'
  if (firstCoverage !== undefined && secondCoverage !== undefined
    && Number.isFinite(firstCoverage) && Number.isFinite(secondCoverage)) {
    const change = secondCoverage - firstCoverage
    if (change >= 0.05) {
      coverage = `Attempt B has more frames above the pitch-confidence threshold (${Math.round(secondCoverage * 100)}% vs. ${Math.round(firstCoverage * 100)}%).`
    } else if (change <= -0.05) {
      coverage = `Attempt B has fewer frames above the pitch-confidence threshold (${Math.round(secondCoverage * 100)}% vs. ${Math.round(firstCoverage * 100)}%).`
    }
  }
  const reliability = first === second
    ? `Both analyses are marked ${first} reliability.`
    : `Attempt B is marked ${second} reliability and Attempt A ${first}.`
  return `${coverage} This describes tracking coverage, not pronunciation quality. ${reliability}`
}

export function compareAttempts(
  attemptA: PracticeAttempt,
  attemptB: PracticeAttempt,
  exercise: GuidedExercise,
): AttemptComparisonResult {
  if (attemptA.id === attemptB.id
    || attemptA.exerciseId !== exercise.id
    || attemptB.exerciseId !== exercise.id
    || attemptA.tone !== attemptB.tone
    || (exercise.targetTone !== null
      && (attemptA.tone !== exercise.targetTone || attemptB.tone !== exercise.targetTone))) {
    return {
      withheld: true,
      observation: 'Select two different attempts for the same exercise and tone.',
      features: [],
    }
  }
  if (exercise.focus !== 'recording_quality' && (!reliable(attemptA) || !reliable(attemptB))) {
    return withheld(
      attemptA,
      attemptB,
      'At least one attempt has insufficient feature reliability; contour comparison is withheld.',
    )
  }

  const first = attemptA.acousticFeatures
  const second = attemptB.acousticFeatures
  if (!first || !second) {
    return withheld(attemptA, attemptB, 'Acoustic features are missing, so attempt comparison is withheld.')
  }
  const features: AttemptFeatureComparison[] = [reliabilityRow(attemptA, attemptB)]
  let observation: string

  if (exercise.focus === 'pitch_stability') {
    features.push(
      numericFeature('pitchRangeSt', 'Robust pitch range', first.pitchRangeSt, second.pitchRangeSt),
      numericFeature('netPitchChangeSt', 'Net pitch drift', first.netPitchChangeSt, second.netPitchChangeSt),
    )
    observation = stabilitySummary(attemptA, attemptB)
  } else if (exercise.focus === 'rising_movement') {
    features.push(
      numericFeature('netPitchChangeSt', 'Net pitch movement', first.netPitchChangeSt, second.netPitchChangeSt),
      { feature: 'direction', label: 'Direction', attemptA: direction(first), attemptB: direction(second) },
      numericFeature('earlySlopeSt', 'Early movement', first.earlySlopeSt, second.earlySlopeSt, 'semitones per normalized interval'),
      numericFeature('lateSlopeSt', 'Late movement', first.lateSlopeSt, second.lateSlopeSt, 'semitones per normalized interval'),
    )
    observation = movementSummary(exercise.focus, attemptA, attemptB)
  } else if (exercise.focus === 'falling_movement') {
    features.push(
      numericFeature('netPitchChangeSt', 'Net pitch movement', first.netPitchChangeSt, second.netPitchChangeSt),
      { feature: 'direction', label: 'Direction', attemptA: direction(first), attemptB: direction(second) },
      numericFeature('lateSlopeSt', 'Late movement', first.lateSlopeSt, second.lateSlopeSt, 'semitones per normalized interval'),
    )
    observation = movementSummary(exercise.focus, attemptA, attemptB)
  } else if (exercise.focus === 'dipping_movement') {
    features.push(
      { feature: 'turningPointType', label: 'Turning point', attemptA: first.turningPointType, attemptB: second.turningPointType },
      numericFeature('turningPointPosition', 'Turning-point position', first.turningPointPosition, second.turningPointPosition, 'normalized interval'),
      numericFeature('earlySlopeSt', 'Early movement', first.earlySlopeSt, second.earlySlopeSt, 'semitones per normalized interval'),
      numericFeature('lateSlopeSt', 'Late movement', first.lateSlopeSt, second.lateSlopeSt, 'semitones per normalized interval'),
    )
    observation = dippingSummary(attemptA, attemptB)
  } else if (exercise.focus === 'recording_quality') {
    features.push(
      numericFeature('voicedFrameRatio', 'Reliable voiced-frame coverage', first.voicedFrameRatio * 100, second.voicedFrameRatio * 100, 'percent'),
    )
    observation = qualitySummary(attemptA, attemptB)
  } else {
    features.push(
      { feature: 'direction', label: 'Direction', attemptA: direction(first), attemptB: direction(second) },
      numericFeature('netPitchChangeSt', 'Net pitch movement', first.netPitchChangeSt, second.netPitchChangeSt),
      numericFeature('pitchRangeSt', 'Robust pitch range', first.pitchRangeSt, second.pitchRangeSt),
      { feature: 'turningPointType', label: 'Turning point', attemptA: first.turningPointType, attemptB: second.turningPointType },
    )
    observation = 'Compare the measured contours as observations; no single feature determines correctness.'
  }

  const reliabilityChange = reliabilityRank(attemptB.analysisReliability)
    - reliabilityRank(attemptA.analysisReliability)
  if (reliabilityChange > 0 && exercise.focus !== 'recording_quality') {
    observation += ` Attempt B has higher measurement reliability (${attemptB.analysisReliability} vs. ${attemptA.analysisReliability}).`
  } else if (reliabilityChange < 0 && exercise.focus !== 'recording_quality') {
    observation += ` Attempt B has lower measurement reliability (${attemptB.analysisReliability} vs. ${attemptA.analysisReliability}).`
  }

  return { withheld: false, observation, features }
}

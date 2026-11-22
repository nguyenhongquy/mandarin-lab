import { compareToneFeatures } from '../acousticComparison.ts'
import type { ToneAcousticFeatures } from '../toneAcoustics.ts'
import {
  evaluateToneFeedbackRules,
  toneFeatureEvidence,
  toneFeaturesMeetFeedbackThresholds,
} from './toneFeedbackRules.ts'
import { resolveToneFeedbackThresholds } from './toneFeedbackThresholds.ts'
import type { ToneFeedbackDraft, ToneFeedbackInput, ToneFeedbackResult, ToneFeedbackThresholdOverrides } from './toneFeedbackTypes.ts'
import { renderToneFeedback } from './toneFeedbackTemplates.ts'

function reliabilityRank(features: ToneAcousticFeatures): number {
  return features.reliability === 'high' ? 2 : features.reliability === 'medium' ? 1 : 0
}

function referenceDifferenceDraft(
  learner: ToneAcousticFeatures,
  reference: ToneAcousticFeatures,
  thresholds: ReturnType<typeof resolveToneFeedbackThresholds>,
): ToneFeedbackDraft | null {
  const comparison = compareToneFeatures(learner, reference)
  const evidence = []
  if (comparison.directionMatch === false) {
    evidence.push(toneFeatureEvidence(
      'direction', learner, 'The reliable measured direction estimates differ.', reference))
  }
  if (comparison.netChangeDifferenceSt !== null
    && Math.abs(comparison.netChangeDifferenceSt) >= thresholds.minimumReferenceDifferenceSt) {
    evidence.push(toneFeatureEvidence(
      'netPitchChangeSt', learner, 'The relative net pitch changes differ beyond the exploratory threshold.', reference))
  }
  for (const feature of ['earlySlopeSt', 'lateSlopeSt'] as const) {
    const learnerValue = learner[feature]
    const referenceValue = reference[feature]
    if (learnerValue !== null && referenceValue !== null
      && Math.abs(learnerValue - referenceValue) >= thresholds.minimumReferenceDifferenceSt) {
      evidence.push(toneFeatureEvidence(
        feature, learner, `The ${feature === 'earlySlopeSt' ? 'early' : 'late'} relative movement differs beyond the exploratory threshold.`, reference))
    }
  }

  const learnerHasMeaningfulTurn = learner.turningPointType !== null
    && (learner.turningPointProminenceSt ?? 0) >= thresholds.meaningfulTurningPointProminenceSt
  const referenceHasMeaningfulTurn = reference.turningPointType !== null
    && (reference.turningPointProminenceSt ?? 0) >= thresholds.meaningfulTurningPointProminenceSt
  const turnBehaviorDiffers = learnerHasMeaningfulTurn !== referenceHasMeaningfulTurn
    || (learnerHasMeaningfulTurn && referenceHasMeaningfulTurn
      && learner.turningPointType !== reference.turningPointType)
  const turnPositionsDiffer = learnerHasMeaningfulTurn && referenceHasMeaningfulTurn
    && comparison.turningPointPositionDifference !== null
    && Math.abs(comparison.turningPointPositionDifference)
      >= thresholds.minimumTurningPointPositionDifference
  if (turnBehaviorDiffers) {
    evidence.push(toneFeatureEvidence(
      'turningPoint', learner, 'The measured turning-point behavior differs.', reference))
  } else if (turnPositionsDiffer) {
    evidence.push(toneFeatureEvidence(
      'turningPointPosition', learner, 'The measured turning-point positions differ on the normalized interval.', reference))
  }

  if (!evidence.length) return null
  return {
    code: 'REFERENCE_DIFFERENCE',
    severity: 'info',
    priority: 20,
    confidence: reliabilityRank(learner) < reliabilityRank(reference)
      ? learner.reliability : reference.reliability,
    evidence: evidence.map((item, index) => ({
      ...item,
      id: `reference-difference-${index}-${item.id}`,
    })),
  }
}

function referenceUnavailableDraft(
  features: ToneAcousticFeatures | null,
): ToneFeedbackDraft {
  return {
    code: 'REFERENCE_UNAVAILABLE',
    severity: 'info',
    priority: 10,
    confidence: features?.reliability ?? 'low',
    evidence: [{
      id: 'reference-unavailable',
      featureName: 'reference F0 trajectory',
      observedValue: features?.reliability ?? 'not analyzed',
      unit: 'status',
      explanation: 'A reliable measured reference trajectory is unavailable.',
    }],
  }
}

function prioritizeFeedback(drafts: ToneFeedbackDraft[]): ToneFeedbackDraft[] {
  return [...drafts].sort((first, second) =>
    second.priority - first.priority
    || first.code.localeCompare(second.code)
    || first.evidence[0]?.id.localeCompare(second.evidence[0]?.id ?? '') || 0)
}

export function evaluateToneProduction(
  input: ToneFeedbackInput,
  thresholdOverrides: ToneFeedbackThresholdOverrides = {},
): ToneFeedbackResult {
  const thresholds = resolveToneFeedbackThresholds(thresholdOverrides)
  const learnerIsReliable = input.learnerFeatures !== null
    && toneFeaturesMeetFeedbackThresholds(input.learnerFeatures, thresholds)
  const referenceIsReliable = input.referenceFeatures !== null
    && toneFeaturesMeetFeedbackThresholds(input.referenceFeatures, thresholds)
  const drafts = evaluateToneFeedbackRules(
    input.tone,
    input.learnerFeatures,
    thresholds,
  )

  const learnerFeatures = input.learnerFeatures
  const referenceFeatures = input.referenceFeatures
  if (learnerIsReliable && referenceIsReliable && learnerFeatures && referenceFeatures) {
    const difference = referenceDifferenceDraft(
      learnerFeatures,
      referenceFeatures,
      thresholds,
    )
    if (difference) drafts.push(difference)
  } else if (!referenceIsReliable) {
    drafts.push(referenceUnavailableDraft(learnerFeatures))
  }

  const context = {
    tone: input.tone,
    learnerFeatures: input.learnerFeatures,
    referenceSource: input.referenceSource,
  }
  const feedback = prioritizeFeedback(drafts)
    .map(draft => renderToneFeedback(draft, context))
  const [primary, ...additional] = feedback
  if (!primary) {
    throw new Error('Tone feedback rules returned no feedback item.')
  }
  return { primary, additional }
}

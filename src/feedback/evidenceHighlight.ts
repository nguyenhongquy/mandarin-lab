import { DEFAULT_PITCH_OPTIONS, type PitchAnalysis } from '../pitchAnalysis.ts'
import { normalizePitchTime, normalizePitchAnalysis } from '../pitchComparison.ts'
import type { FeedbackEvidence } from './toneFeedbackTypes.ts'

export interface NormalizedEvidenceInterval {
  start: number
  end: number
}

export interface NormalizedFeedbackHighlight {
  label: string
  learner: NormalizedEvidenceInterval | null
  reference: NormalizedEvidenceInterval | null
}

function normalizeInterval(
  analysis: PitchAnalysis | null,
  startTime: number | undefined,
  endTime: number | undefined,
): NormalizedEvidenceInterval | null {
  if (!analysis || startTime === undefined || endTime === undefined
    || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return null
  }
  const normalized = normalizePitchAnalysis(analysis)
  const first = normalized?.find(frame =>
    frame.f0Hz !== null && frame.confidence >= DEFAULT_PITCH_OPTIONS.confidenceThreshold)
  const last = normalized?.filter(frame =>
    frame.f0Hz !== null && frame.confidence >= DEFAULT_PITCH_OPTIONS.confidenceThreshold).at(-1)
  if (!first || !last || startTime < first.time || endTime > last.time) return null

  const start = normalizePitchTime(analysis, startTime)
  const end = normalizePitchTime(analysis, endTime)
  return start === null || end === null ? null : { start, end }
}

export function normalizeFeedbackEvidence(
  evidence: FeedbackEvidence,
  learnerAnalysis: PitchAnalysis | null,
  referenceAnalysis: PitchAnalysis | null,
): NormalizedFeedbackHighlight | null {
  const learner = normalizeInterval(learnerAnalysis, evidence.startTime, evidence.endTime)
  const reference = normalizeInterval(
    referenceAnalysis,
    evidence.referenceStartTime,
    evidence.referenceEndTime,
  )
  if (!learner && !reference) return null
  return { label: evidence.featureName, learner, reference }
}

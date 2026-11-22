import type { AcousticReliability, ToneAcousticFeatures } from '../toneAcoustics.ts'
import type { MandarinTone } from '../tones.ts'
import type { ToneReference } from '../toneReferences.ts'

export type FeedbackSeverity = 'info' | 'suggestion' | 'retry'

export type FeedbackCode =
  | 'INSUFFICIENT_EVIDENCE'
  | 'T1_PITCH_DRIFT'
  | 'T1_RELATIVELY_STABLE'
  | 'T2_INSUFFICIENT_RISE'
  | 'T2_CLEAR_RISE'
  | 'T3_LOW_OR_LEVEL'
  | 'T3_DIP_PRESENT'
  | 'T3_UNEXPECTED_RISE'
  | 'T4_INSUFFICIENT_FALL'
  | 'T4_CLEAR_FALL'
  | 'UNEXPECTED_CONTOUR'
  | 'REFERENCE_DIFFERENCE'
  | 'REFERENCE_UNAVAILABLE'
  | 'NO_CLEAR_ISSUE'

export interface FeedbackEvidence {
  id: string
  featureName: string
  observedValue: number | string | null
  referenceValue?: number | string | null
  unit?: string
  startTime?: number
  endTime?: number
  referenceStartTime?: number
  referenceEndTime?: number
  explanation: string
}

export interface ToneFeedback {
  code: FeedbackCode
  severity: FeedbackSeverity
  priority: number
  title: string
  observation: string
  explanation: string
  suggestion: string
  encouragement?: string
  evidence: FeedbackEvidence[]
  confidence: AcousticReliability
  confidenceExplanation: string
}

export interface ToneFeedbackDraft {
  code: FeedbackCode
  severity: FeedbackSeverity
  priority: number
  evidence: FeedbackEvidence[]
  confidence: AcousticReliability
}

export interface ToneFeedbackResult {
  primary: ToneFeedback
  additional: ToneFeedback[]
}

export interface ToneFeedbackInput {
  tone: MandarinTone
  learnerFeatures: ToneAcousticFeatures | null
  referenceFeatures: ToneAcousticFeatures | null
  referenceSource: ToneReference['source']
}

export type ToneFeedbackThresholdOverrides = Partial<{
  minimumReliableFrames: number
  minimumVoicedDurationMs: number
  minimumReliability: 'medium' | 'high'
  levelToleranceSt: number
  minimumRiseSt: number
  minimumFallSt: number
  meaningfulTurningPointProminenceSt: number
  minimumReferenceDifferenceSt: number
  minimumTurningPointPositionDifference: number
}>

import type { AcousticReliability, ToneAcousticFeatures } from '../toneAcoustics.ts'
import type { MandarinTone } from '../tones.ts'
import type { FeedbackCode } from '../feedback/toneFeedbackTypes.ts'
import type { PitchAnalysis } from '../pitchAnalysis.ts'

export type PracticeFocus =
  | 'pitch_stability'
  | 'rising_movement'
  | 'falling_movement'
  | 'dipping_movement'
  | 'recording_quality'
  | 'contour_exploration'

export interface GuidedExercise {
  id: string
  title: string
  targetTone: MandarinTone | null
  focus: PracticeFocus
  description: string
  listeningInstruction: string
  productionInstruction: string
  reflectionQuestion: string
  feedbackCodes: FeedbackCode[]
}

export type ReflectionResponse = 'yes' | 'unsure' | 'no'

export interface PracticeReflection {
  response: ReflectionResponse
  note?: string
}

export interface PracticeAttempt {
  id: string
  exerciseId: string
  tone: MandarinTone
  timestamp: number
  acousticFeatures: ToneAcousticFeatures | null
  feedbackCode: FeedbackCode | null
  analysisReliability: AcousticReliability
  pitchAnalysis: PitchAnalysis | null
  reflection?: PracticeReflection
}

export interface GuidedPracticeState {
  exerciseId: string
  tone: MandarinTone
  attempts: PracticeAttempt[]
  activeAttemptId: string | null
  selectedAttemptIds: readonly [string, string] | null
}

export type GuidedPracticeAction =
  | { type: 'select-exercise'; exerciseId: string; tone: MandarinTone }
  | { type: 'attempt-started' }
  | { type: 'attempt-analyzed'; attempt: PracticeAttempt }
  | { type: 'save-reflection'; attemptId: string; reflection: PracticeReflection }
  | { type: 'select-comparison'; attemptIds: readonly [string, string] | null }
  | { type: 'clear-history' }

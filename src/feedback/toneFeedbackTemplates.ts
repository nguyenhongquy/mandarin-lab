import type { AcousticReliability, ToneAcousticFeatures } from '../toneAcoustics.ts'
import type { MandarinTone } from '../tones.ts'
import type {
  FeedbackCode,
  ToneFeedback,
  ToneFeedbackDraft,
} from './toneFeedbackTypes.ts'

export interface ToneFeedbackTemplateContext {
  tone: MandarinTone
  learnerFeatures: ToneAcousticFeatures | null
  referenceSource: 'local-tts' | 'corpus' | 'browser-tts'
}

interface ToneFeedbackTemplate {
  title: string
  observation: (context: ToneFeedbackTemplateContext, draft: ToneFeedbackDraft) => string
  explanation: (context: ToneFeedbackTemplateContext, draft: ToneFeedbackDraft) => string
  suggestion: (context: ToneFeedbackTemplateContext, draft: ToneFeedbackDraft) => string
  encouragement?: (context: ToneFeedbackTemplateContext, draft: ToneFeedbackDraft) => string
}

function direction(features: ToneAcousticFeatures | null): string {
  return features?.direction ?? 'unknown'
}

function pitchMovement(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'no clear overall movement'
  const magnitude = Math.abs(value).toFixed(1)
  return value > 0 ? `rises by about ${magnitude} semitones`
    : value < 0 ? `falls by about ${magnitude} semitones`
      : 'stays level'
}

const templates: Record<FeedbackCode, ToneFeedbackTemplate> = {
  INSUFFICIENT_EVIDENCE: {
    title: 'Too little reliable pitch evidence',
    observation: () => 'The recording does not contain enough reliable voiced frames for a tone-specific interpretation.',
    explanation: (_context, draft) => draft.evidence[0]?.explanation
      ?? 'Pitch tracking can be limited by silence, noise, short duration, or unvoiced speech sounds.',
    suggestion: () => 'Try recording again in a quiet environment, speaking at a comfortable pace, and keeping the syllable clear.',
  },
  T1_PITCH_DRIFT: {
    title: 'Pitch changes during the syllable',
    observation: context => {
      const features = context.learnerFeatures
      if (features?.direction === 'complex') {
        return 'Your measured pitch varies noticeably across the selected interval.'
      }
      if (features?.netPitchChangeSt !== null && features?.netPitchChangeSt !== undefined) {
        return `Your measured pitch ${pitchMovement(features.netPitchChangeSt)} across the selected interval.`
      }
      return 'Your measured contour varies noticeably across the selected interval.'
    },
    explanation: () => 'This describes movement within the recording. It does not measure absolute pitch height or determine correctness.',
    suggestion: () => 'Try repeating the syllable with a comfortable, steadier pitch movement, then compare the contour again.',
  },
  T1_RELATIVELY_STABLE: {
    title: 'Pitch is relatively stable',
    observation: () => 'The measured pitch stays relatively stable across the selected interval.',
    explanation: () => 'Relative stability is an acoustic observation, not a pronunciation score, and does not measure absolute pitch height.',
    suggestion: () => 'Keep the pitch comfortable and use the contour as one cue while practicing.',
    encouragement: () => 'There is a stable measured span to compare across repetitions.',
  },
  T2_INSUFFICIENT_RISE: {
    title: 'A clear overall rise was not detected',
    observation: context => {
      const features = context.learnerFeatures
      if (direction(features) === 'complex') {
        return 'The measured contour has mixed movement, so a clear overall rise is not established.'
      }
      const net = features?.netPitchChangeSt
      if (net !== null && net !== undefined && net > 0) {
        return `Your pitch ${pitchMovement(net)}, but the overall rise is modest by the current exploratory threshold.`
      }
      return 'The measured contour does not show a clear overall upward movement.'
    },
    explanation: () => 'Tone 2 can begin with a small dip; the observation focuses on the overall movement and the later part of the contour.',
    suggestion: () => 'Try making the later portion more clearly upward without forcing a large pitch range.',
  },
  T2_CLEAR_RISE: {
    title: 'An overall rise is visible',
    observation: context => {
      const features = context.learnerFeatures
      if (features?.earlySlopeSt !== null && features?.earlySlopeSt !== undefined
        && features.earlySlopeSt < 0 && (features.lateSlopeSt ?? 0) > 0) {
        return 'Your measured pitch dips at first, then rises later, with an overall upward movement.'
      }
      return `Your measured pitch ${pitchMovement(features?.netPitchChangeSt)} across the selected interval.`
    },
    explanation: () => 'This is a description of the measured trajectory, not a correctness judgment or a required match to the reference voice.',
    suggestion: () => 'Notice the upward movement while keeping the beginning and pitch range comfortable.',
    encouragement: () => 'The recording contains a measurable upward movement to explore.',
  },
  T3_LOW_OR_LEVEL: {
    title: 'No clear dipping point was detected',
    observation: () => 'No clear dipping point was detected in the selected interval. This alone does not establish an incorrect Tone 3.',
    explanation: () => 'Tone 3 varies with speaking context; this prototype does not require a fixed full 214 contour or a final rise.',
    suggestion: () => 'Compare the contour with a listening example and consider the speaking context.',
  },
  T3_DIP_PRESENT: {
    title: 'A dipping movement is visible',
    observation: () => 'A local pitch minimum was detected in the selected interval.',
    explanation: () => 'The detected dip is an acoustic observation. It is not a correctness score, and Tone 3 does not require a fixed final rise.',
    suggestion: () => 'Explore how the dip changes across repetitions and speaking contexts.',
    encouragement: () => 'There is a measurable turning point to inspect in the chart.',
  },
  T3_UNEXPECTED_RISE: {
    title: 'A rising movement is visible',
    observation: () => 'Your measured pitch rises over the selected interval and no meaningful dip was detected. This does not establish an error.',
    explanation: () => 'Tone 3 may vary by context. This prototype does not infer a tone judgment from a rising contour alone.',
    suggestion: () => 'Compare this realization with a listening example and consider its speech context.',
  },
  T4_INSUFFICIENT_FALL: {
    title: 'A clear overall fall was not detected',
    observation: context => {
      const net = context.learnerFeatures?.netPitchChangeSt
      if (net !== null && net !== undefined && net < 0) {
        return `Your pitch ${pitchMovement(net)}, but a clear overall fall is not established by the current exploratory threshold.`
      }
      return 'The measured contour does not show a clear overall downward movement.'
    },
    explanation: () => 'This describes the measured movement only; absolute pitch is not compared with the reference speaker.',
    suggestion: () => 'Try emphasizing a downward movement while keeping the pitch range comfortable.',
  },
  T4_CLEAR_FALL: {
    title: 'A downward movement is visible',
    observation: context => `Your measured pitch ${pitchMovement(context.learnerFeatures?.netPitchChangeSt)} across the selected interval.`,
    explanation: () => 'This is an acoustic observation, not a pronunciation score or a requirement to match the reference speaker’s pitch range.',
    suggestion: () => 'Notice the downward movement and repeat it at a comfortable pitch range.',
    encouragement: () => 'The recording contains a measurable downward movement to explore.',
  },
  UNEXPECTED_CONTOUR: {
    title: 'The measured contour differs from the expected movement',
    observation: (context, draft) => {
      if (draft.priority <= 20) {
        return 'The measured learner and reference trajectories differ in one or more contour features.'
      }
      if (context.tone === 2) return 'Your measured pitch falls rather than showing an overall rise.'
      if (context.tone === 4) return 'Your measured pitch rises rather than showing an overall fall.'
      return 'The measured contour has a different overall movement from the selected tone’s teaching expectation.'
    },
    explanation: (_context, draft) => draft.priority <= 20
      ? 'A synthetic or recorded reference is one example, not a correctness standard; the comparison concerns contour features only.'
      : 'This is a cautious description of movement, not an automatic tone classification or pronunciation score.',
    suggestion: context => context.tone === 2
      ? 'Try exploring an upward movement, allowing a small initial dip if it occurs naturally.'
      : 'Try exploring a downward movement without matching the reference speaker’s absolute pitch.',
  },
  REFERENCE_DIFFERENCE: {
    title: 'Measured trajectories differ descriptively',
    observation: () => 'The measured learner and reference trajectories differ in one or more contour features.',
    explanation: () => 'The reference is one example, not a correctness standard. This comparison concerns relative movement only.',
    suggestion: () => 'Use the highlighted intervals to explore how the contours differ; do not try to match the reference’s absolute pitch.',
  },
  REFERENCE_UNAVAILABLE: {
    title: 'Measured reference comparison is unavailable',
    observation: context => context.referenceSource === 'browser-tts'
      ? 'Browser TTS can be played, but its audio samples are not available to the pitch analyzer.'
      : 'A reliable measured reference trajectory is not available for comparison.',
    explanation: context => context.referenceSource === 'browser-tts'
      ? 'Speech synthesis playback does not expose PCM audio through the browser API, so no reference F0 values are inferred.'
      : 'Reference playback can continue even when the audio is missing, cannot be decoded, or contains too few reliable voiced frames.',
    suggestion: () => 'Use the learner trajectory and schematic teaching contour for exploration; no measured reference values are substituted.',
  },
  NO_CLEAR_ISSUE: {
    title: 'No strong contour observation',
    observation: () => 'No strong tone-specific contour observation was produced from these features.',
    explanation: () => 'This is not confirmation of correctness; the rule set is exploratory and intentionally conservative.',
    suggestion: () => 'Continue listening and comparing repetitions without aiming for a numerical score.',
  },
}

function confidenceExplanation(code: FeedbackCode, confidence: AcousticReliability): string {
  if (code === 'REFERENCE_UNAVAILABLE') {
    return `Learner feature reliability is ${confidence}; a calibrated reference comparison is not available.`
  }
  if (confidence === 'low') {
    return 'Feature reliability is low, so no tone-specific interpretation was made.'
  }
  if (confidence === 'medium') {
    return 'Tentative interpretation based on medium-reliability features; this is not a calibrated probability or correctness judgment.'
  }
  return 'The features are high reliability for this recording, but the interpretation is exploratory and is not a correctness judgment.'
}

export function renderToneFeedback(
  draft: ToneFeedbackDraft,
  context: ToneFeedbackTemplateContext,
): ToneFeedback {
  const template = templates[draft.code]
  return {
    ...draft,
    title: template.title,
    observation: template.observation(context, draft),
    explanation: template.explanation(context, draft),
    suggestion: template.suggestion(context, draft),
    ...(template.encouragement
      ? { encouragement: template.encouragement(context, draft) }
      : {}),
    confidenceExplanation: confidenceExplanation(draft.code, draft.confidence),
  }
}

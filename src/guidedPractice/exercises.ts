import type { FeedbackCode } from '../feedback/toneFeedbackTypes.ts'
import type { MandarinTone } from '../tones.ts'
import type { GuidedExercise } from './types.ts'

export const GUIDED_EXERCISES: readonly GuidedExercise[] = [
  {
    id: 'tone-1-pitch-stability',
    title: 'Maintain steady pitch',
    targetTone: 1,
    focus: 'pitch_stability',
    description: 'Explore how steady the measured pitch is over this isolated syllable. Stability alone does not establish a correct Tone 1.',
    listeningInstruction: 'Listen to the reference. Notice whether its pitch stays relatively steady.',
    productionInstruction: 'Listen to the reference. Try maintaining a relatively steady pitch throughout the syllable.',
    reflectionQuestion: 'Could you keep your pitch relatively steady?',
    feedbackCodes: ['T1_PITCH_DRIFT'],
  },
  {
    id: 'tone-2-clear-rise',
    title: 'Produce a clear rise',
    targetTone: 2,
    focus: 'rising_movement',
    description: 'Explore the overall upward movement. A small initial dip is allowed; an exactly linear rise is not required.',
    listeningInstruction: 'Listen to the reference and notice the upward movement toward the end.',
    productionInstruction: 'Listen to the reference. Start comfortably lower and let your pitch rise toward the end.',
    reflectionQuestion: 'Could you hear the upward movement?',
    feedbackCodes: ['T2_INSUFFICIENT_RISE', 'UNEXPECTED_CONTOUR'],
  },
  {
    id: 'tone-3-dipping-contour',
    title: 'Explore the dipping contour',
    targetTone: 3,
    focus: 'dipping_movement',
    description: 'Explore a falling–rising movement in an isolated citation form. A complete dip or final rise is not required in every Tone 3 context.',
    listeningInstruction: 'Listen to the reference and notice any downward movement followed by a rise.',
    productionInstruction: 'Listen to the reference. Explore a downward movement followed by a rise.',
    reflectionQuestion: 'Did you notice a turning point in the contour?',
    feedbackCodes: ['T3_DIP_PRESENT'],
  },
  {
    id: 'tone-4-clear-fall',
    title: 'Produce a clear fall',
    targetTone: 4,
    focus: 'falling_movement',
    description: 'Explore downward pitch movement without trying to match the reference speaker’s absolute pitch.',
    listeningInstruction: 'Listen to the reference and notice the downward movement.',
    productionInstruction: 'Listen to the reference. Begin comfortably higher and move your pitch downward.',
    reflectionQuestion: 'Could you hear the downward movement?',
    feedbackCodes: ['T4_INSUFFICIENT_FALL', 'UNEXPECTED_CONTOUR'],
  },
  {
    id: 'recording-quality',
    title: 'Improve recording quality',
    targetTone: null,
    focus: 'recording_quality',
    description: 'A clear local recording helps the pitch tracker distinguish voiced speech from noise and silence.',
    listeningInstruction: 'Listen to the reference once, then prepare to record one syllable by itself.',
    productionInstruction: 'Record one clear syllable in a quiet environment, without overlapping speech.',
    reflectionQuestion: 'Was the recording clear and free of overlapping sounds?',
    feedbackCodes: ['INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'general-tone-exploration',
    title: 'Explore this tone',
    targetTone: null,
    focus: 'contour_exploration',
    description: 'Explore the selected tone without treating one schematic contour or speaker as a correctness standard.',
    listeningInstruction: 'Listen once, then describe the broad pitch movement you hear.',
    productionInstruction: 'Produce the selected syllable comfortably and notice its measured movement without aiming for an exact match.',
    reflectionQuestion: 'Which part of the contour was most noticeable?',
    feedbackCodes: [],
  },
]

export function exercisesForTone(tone: MandarinTone): GuidedExercise[] {
  return GUIDED_EXERCISES.filter(exercise =>
    exercise.targetTone === null || exercise.targetTone === tone)
}

export function guidedExerciseById(id: string): GuidedExercise | null {
  return GUIDED_EXERCISES.find(exercise => exercise.id === id) ?? null
}

function requiredExercise(id: string): GuidedExercise {
  const exercise = guidedExerciseById(id)
  if (!exercise) throw new Error(`Guided exercise is not configured: ${id}`)
  return exercise
}

export function defaultExerciseForTone(tone: MandarinTone): GuidedExercise {
  return GUIDED_EXERCISES.find(exercise => exercise.targetTone === tone)
    ?? requiredExercise('general-tone-exploration')
}

export function recommendExercise(tone: MandarinTone, feedbackCode: string): GuidedExercise {
  if (feedbackCode === 'INSUFFICIENT_EVIDENCE') {
    return requiredExercise('recording-quality')
  }
  if (tone === 1 && (feedbackCode === 'T1_PITCH_DRIFT' || feedbackCode === 'T1_RELATIVELY_STABLE')) {
    return requiredExercise('tone-1-pitch-stability')
  }
  if (tone === 2 && (feedbackCode === 'T2_INSUFFICIENT_RISE'
    || feedbackCode === 'T2_CLEAR_RISE' || feedbackCode === 'UNEXPECTED_CONTOUR')) {
    return requiredExercise('tone-2-clear-rise')
  }
  if (tone === 3 && (feedbackCode === 'T3_DIP_PRESENT' || feedbackCode === 'T3_LOW_OR_LEVEL'
    || feedbackCode === 'T3_UNEXPECTED_RISE')) {
    return requiredExercise('tone-3-dipping-contour')
  }
  if (tone === 4 && (feedbackCode === 'T4_INSUFFICIENT_FALL'
    || feedbackCode === 'T4_CLEAR_FALL' || feedbackCode === 'UNEXPECTED_CONTOUR')) {
    return requiredExercise('tone-4-clear-fall')
  }
  return requiredExercise('general-tone-exploration')
}

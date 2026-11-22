import type { MandarinTone } from '../tones.ts'
import type { GuidedPracticeAction, GuidedPracticeState } from './types.ts'

export const MAX_GUIDED_ATTEMPTS = 10

export function createGuidedPracticeState(
  tone: MandarinTone,
  exerciseId: string,
): GuidedPracticeState {
  return {
    exerciseId,
    tone,
    attempts: [],
    activeAttemptId: null,
    selectedAttemptIds: null,
  }
}

function validComparison(
  state: GuidedPracticeState,
  attemptIds: readonly [string, string] | null,
): attemptIds is readonly [string, string] {
  if (!attemptIds || attemptIds[0] === attemptIds[1]) return false
  return attemptIds.every(id =>
    state.attempts.some(attempt => attempt.id === id
      && attempt.exerciseId === state.exerciseId && attempt.tone === state.tone))
}

export function guidedPracticeReducer(
  state: GuidedPracticeState,
  action: GuidedPracticeAction,
): GuidedPracticeState {
  switch (action.type) {
    case 'select-exercise':
      return {
        ...state,
        exerciseId: action.exerciseId,
        tone: action.tone,
        activeAttemptId: null,
        selectedAttemptIds: null,
      }
    case 'attempt-started':
      return { ...state, activeAttemptId: null }
    case 'attempt-analyzed': {
      const { attempt } = action
      if (attempt.exerciseId !== state.exerciseId || attempt.tone !== state.tone
        || state.attempts.some(existing => existing.id === attempt.id)) {
        return state
      }
      const attempts = [...state.attempts, attempt].slice(-MAX_GUIDED_ATTEMPTS)
      const sameExercise = attempts.filter(item =>
        item.exerciseId === state.exerciseId && item.tone === state.tone)
      const previous = sameExercise.at(-2)
      const current = sameExercise.at(-1)
      return {
        ...state,
        attempts,
        activeAttemptId: attempt.id,
        selectedAttemptIds: previous && current
          ? [previous.id, current.id]
          : null,
      }
    }
    case 'save-reflection':
      return {
        ...state,
        attempts: state.attempts.map(attempt => attempt.id === action.attemptId
          ? { ...attempt, reflection: action.reflection }
          : attempt),
      }
    case 'select-comparison':
      return {
        ...state,
        selectedAttemptIds: validComparison(state, action.attemptIds)
          ? action.attemptIds : null,
      }
    case 'clear-history':
      return {
        ...state,
        attempts: [],
        activeAttemptId: null,
        selectedAttemptIds: null,
      }
  }
}

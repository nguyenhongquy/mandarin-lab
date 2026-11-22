import type { MandarinTone } from './tones'

export const SESSION_STORAGE_KEY = 'mandarin-speechlab.sessions.v1'

export type ExerciseMode = 'explore' | 'identify' | 'contrast'
export type SessionSummary = {
  sessionId: string
  mode: ExerciseMode
  selection: string
  attempts: number
  correct: number | null
  accuracy: number | null
  timestamp: string
}

function isSessionSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.sessionId === 'string'
    && (item.mode === 'explore' || item.mode === 'identify' || item.mode === 'contrast')
    && typeof item.selection === 'string'
    && typeof item.attempts === 'number'
    && (item.correct === null || typeof item.correct === 'number')
    && (item.accuracy === null || typeof item.accuracy === 'number')
    && typeof item.timestamp === 'string'
}

export function readSessions(storage: Pick<Storage, 'getItem'>): SessionSummary[] {
  const value = storage.getItem(SESSION_STORAGE_KEY)
  if (!value) return []
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every(isSessionSummary)) {
    throw new Error('Saved Mandarin practice data has an unexpected format.')
  }
  return parsed
}

export function saveSessionResult(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  result: Omit<SessionSummary, 'accuracy' | 'timestamp'>,
  now = new Date(),
): void {
  const previous = readSessions(storage)
  const entry: SessionSummary = {
    ...result,
    accuracy: result.attempts && result.correct !== null
      ? Math.round((result.correct / result.attempts) * 100) : null,
    timestamp: now.toISOString(),
  }
  const existing = previous.findIndex(item =>
    item.sessionId === entry.sessionId && item.mode === entry.mode && item.selection === entry.selection)
  if (existing >= 0) previous[existing] = entry
  else previous.unshift(entry)
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(previous.slice(0, 100)))
}

export function toneSelection(tone: MandarinTone): string {
  return `tone-${tone}`
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { readSessions, saveSessionResult, SESSION_STORAGE_KEY } from '../src/sessionTracking.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key: string) { return values.get(key) ?? null },
    setItem(key: string, value: string) { values.set(key, value) },
    value(key: string) { return values.get(key) },
  }
}

test('session results use a Mandarin-only key and upsert per mode and selection', () => {
  const storage = memoryStorage({ 'deutsch-lab.sessions': 'leave untouched' })
  const now = new Date('2026-01-02T03:04:05.000Z')
  saveSessionResult(storage, {
    sessionId: 'session-1', mode: 'contrast', selection: '1-2', attempts: 1, correct: 1,
  }, now)
  saveSessionResult(storage, {
    sessionId: 'session-1', mode: 'contrast', selection: '1-2', attempts: 2, correct: 1,
  }, now)
  saveSessionResult(storage, {
    sessionId: 'session-1', mode: 'explore', selection: 'tone-1', attempts: 1, correct: null,
  }, now)

  assert.equal(storage.value('deutsch-lab.sessions'), 'leave untouched')
  assert.equal(SESSION_STORAGE_KEY, 'mandarin-speechlab.sessions.v1')
  assert.deepEqual(readSessions(storage), [
    { sessionId: 'session-1', mode: 'explore', selection: 'tone-1', attempts: 1, correct: null, accuracy: null, timestamp: now.toISOString() },
    { sessionId: 'session-1', mode: 'contrast', selection: '1-2', attempts: 2, correct: 1, accuracy: 50, timestamp: now.toISOString() },
  ])
})

test('invalid saved session data is reported instead of silently discarded', () => {
  const storage = memoryStorage({ [SESSION_STORAGE_KEY]: '{"not":"a list"}' })
  assert.throws(() => readSessions(storage), /unexpected format/)
})

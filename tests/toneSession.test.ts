import assert from 'node:assert/strict'
import test from 'node:test'
import { accuracy, chooseContrastTone, createQuestion, getContrastPair, submitAnswer } from '../src/toneSession.ts'
import { toneAudioSources } from '../src/audioSources.ts'
import { contrastPairs, toneDefinitions, toneExamples } from '../src/tones.ts'

function seeded(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
}

test('tone data preserves the four citation examples and Pinyin tone marks', () => {
  assert.deepEqual(toneDefinitions.map(item => [item.tone, item.hanzi, item.pinyin]), [
    [1, '妈', 'mā'], [2, '麻', 'má'], [3, '马', 'mǎ'], [4, '骂', 'mà'],
  ])
  assert.equal(toneExamples.length, 4)
  assert.ok(toneExamples.every(example => toneAudioSources[example.id]?.kind === 'browser-speech'))
})

test('quiz questions contain all choices and avoid immediately repeating the last example', () => {
  const first = createQuestion(undefined, seeded(1))
  const second = createQuestion(first.example.id, seeded(1))
  assert.notEqual(first.example.id, second.example.id)
  assert.deepEqual([...first.choices].sort(), [1, 2, 3, 4])
  assert.deepEqual(second, createQuestion(first.example.id, seeded(1)))
  const answerPositions = new Set(Array.from({ length: 8 }, (_, index) => {
    const question = createQuestion(undefined, seeded(index + 1))
    return question.choices.indexOf(question.example.tone)
  }))
  assert.ok(answerPositions.size > 1)
})

test('answers are scored once and accuracy is based on submitted attempts', () => {
  const question = createQuestion(undefined, seeded(3))
  const target = question.example.tone
  const correct = submitAnswer(null, question, target)
  assert.deepEqual(correct, { tone: target, correct: true })
  const wrongTone = question.choices.find(tone => tone !== target)!
  assert.deepEqual(submitAnswer(null, question, wrongTone), { tone: wrongTone, correct: false })
  assert.equal(submitAnswer(correct, question, question.choices.find(tone => tone !== target)!), correct)
  assert.equal(accuracy(3, 4), 75)
  assert.equal(accuracy(0, 0), 0)
})

test('contrast trials and answers remain within the selected pair', () => {
  for (const pair of contrastPairs) {
    const previous = pair.tones[0]
    const next = chooseContrastTone(pair, previous, () => 0)
    assert.ok(pair.tones.includes(next))
    assert.notEqual(next, previous)
    assert.throws(() => getContrastPair(`not-${pair.id}`), /Unknown Mandarin tone contrast/)
  }
})

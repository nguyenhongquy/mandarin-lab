import { contrastPairs, toneExamples } from './tones.ts'
import type { ContrastPair, MandarinTone, ToneExample } from './tones.ts'

export type QuizQuestion = { example: ToneExample; choices: MandarinTone[] }
export type QuizAnswer = { correct: boolean; tone: MandarinTone }

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap]!, result[index]!]
  }
  return result
}

export function createQuestion(previousId?: string, random = Math.random): QuizQuestion {
  const examples = shuffled(toneExamples, random)
  if (examples.length > 1 && examples[0]?.id === previousId) {
    const swap = examples.findIndex(example => example.id !== previousId)
    if (swap > 0) [examples[0], examples[swap]] = [examples[swap]!, examples[0]!]
  }
  const example = examples[0]
  if (!example) throw new Error('No Mandarin tone examples are configured.')
  return { example, choices: shuffled([1, 2, 3, 4], random) as MandarinTone[] }
}

export function submitAnswer(answered: QuizAnswer | null, question: QuizQuestion, tone: MandarinTone): QuizAnswer | null {
  if (answered) return answered
  return { tone, correct: tone === question.example.tone }
}

export function accuracy(correct: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((correct / attempts) * 100)
}

export function chooseContrastTone(pair: ContrastPair, previous?: MandarinTone, random = Math.random): MandarinTone {
  const candidates = pair.tones.filter(tone => tone !== previous)
  const choices = candidates.length ? candidates : pair.tones
  const index = Math.floor(random() * choices.length)
  const tone = choices[index]
  if (tone === undefined) throw new Error(`Contrast pair ${pair.id} has no tones.`)
  return tone
}

export function getContrastPair(id: string): ContrastPair {
  const pair = contrastPairs.find(item => item.id === id)
  if (!pair) throw new Error(`Unknown Mandarin tone contrast: ${id}`)
  return pair
}

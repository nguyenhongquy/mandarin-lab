export type MandarinTone = 1 | 2 | 3 | 4

export interface ToneExample {
  id: string
  hanzi: string
  pinyin: string
  tone: MandarinTone
  syllable: string
  gloss?: string
  audioUrl?: string
}

export interface ToneDefinition {
  tone: MandarinTone
  hanzi: string
  pinyin: string
  description: string
  movement: string
}

export const toneDefinitions: readonly ToneDefinition[] = [
  { tone: 1, hanzi: '妈', pinyin: 'mā', description: 'High level', movement: 'High and approximately level' },
  { tone: 2, hanzi: '麻', pinyin: 'má', description: 'Rising', movement: 'Rising from low to high' },
  { tone: 3, hanzi: '马', pinyin: 'mǎ', description: 'Low / dipping', movement: 'Low, sometimes dipping' },
  { tone: 4, hanzi: '骂', pinyin: 'mà', description: 'Falling', movement: 'Falling from high to low' },
]

export const toneExamples: readonly ToneExample[] = toneDefinitions.map(({ tone, hanzi, pinyin }) => ({
  id: `ma-tone-${tone}`,
  hanzi,
  pinyin,
  tone,
  syllable: 'ma',
  gloss: ['mother', 'hemp; numb', 'horse', 'scold'][tone - 1],
}))

export function toneDefinition(tone: MandarinTone): ToneDefinition {
  const definition = toneDefinitions.find(item => item.tone === tone)
  if (!definition) throw new Error(`Unknown Mandarin tone: ${tone}`)
  return definition
}

export function toneExample(tone: MandarinTone): ToneExample {
  const example = toneExamples.find(item => item.tone === tone)
  if (!example) throw new Error(`No example is configured for Mandarin tone ${tone}`)
  return example
}

export type ContrastPair = {
  id: string
  label: string
  tones: readonly [MandarinTone, MandarinTone]
}

export const contrastPairs: readonly ContrastPair[] = [
  { id: '1-2', label: 'Tone 1 vs. Tone 2', tones: [1, 2] },
  { id: '1-4', label: 'Tone 1 vs. Tone 4', tones: [1, 4] },
  { id: '2-3', label: 'Tone 2 vs. Tone 3', tones: [2, 3] },
  { id: '2-4', label: 'Tone 2 vs. Tone 4', tones: [2, 4] },
  { id: '3-4', label: 'Tone 3 vs. Tone 4', tones: [3, 4] },
]

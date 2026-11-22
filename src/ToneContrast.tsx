import { useState } from 'react'
import { accuracy, chooseContrastTone, getContrastPair } from './toneSession'
import { ToneContour } from './ToneContour'
import { contrastPairs, toneDefinition } from './tones'
import type { MandarinTone } from './tones'

type PairScore = { attempts: number; correct: number }
const initialScores = () => Object.fromEntries(contrastPairs.map(pair => [pair.id, { attempts: 0, correct: 0 }])) as Record<string, PairScore>

export function ToneContrast({ audio, onResult }: {
  audio: { available: (tone: MandarinTone) => boolean; playing: boolean; play: (tone: MandarinTone) => Promise<boolean> }
  onResult: (pairId: string, attempts: number, correct: number) => void
}) {
  const [pairId, setPairId] = useState(contrastPairs[0]!.id)
  const [target, setTarget] = useState(() => chooseContrastTone(getContrastPair(contrastPairs[0]!.id)))
  const [lastByPair, setLastByPair] = useState<Record<string, MandarinTone>>({})
  const [answer, setAnswer] = useState<{ tone: MandarinTone; correct: boolean } | null>(null)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [scores, setScores] = useState<Record<string, PairScore>>(initialScores)
  const pair = getContrastPair(pairId)
  const definition = toneDefinition(target)
  const selectedScore = scores[pairId] ?? { attempts: 0, correct: 0 }

  function selectPair(nextId: string) {
    const nextPair = getContrastPair(nextId)
    const nextTone = chooseContrastTone(nextPair, lastByPair[nextId])
    setPairId(nextId)
    setTarget(nextTone)
    setAnswer(null)
    setHasPlayed(false)
  }

  function choose(tone: MandarinTone) {
    if (answer || !pair.tones.includes(tone)) return
    const isCorrect = tone === target
    const nextScore = { attempts: selectedScore.attempts + 1, correct: selectedScore.correct + Number(isCorrect) }
    setAnswer({ tone, correct: isCorrect })
    setScores(previous => ({ ...previous, [pairId]: nextScore }))
    onResult(pairId, nextScore.attempts, nextScore.correct)
  }

  function nextTrial() {
    setLastByPair(previous => ({ ...previous, [pairId]: target }))
    setTarget(chooseContrastTone(pair, target))
    setAnswer(null)
    setHasPlayed(false)
  }

  return <section className="space-y-5" aria-labelledby="contrast-heading">
    <div>
      <h2 className="text-xl font-semibold" id="contrast-heading">Contrast two tones</h2>
      <p className="mt-1 text-sm text-slate-600">Choose a pair, listen to one example, and identify which of its two tones you heard.</p>
    </div>
    <div className="panel space-y-5">
      <label className="block max-w-sm text-sm font-medium">
        Tone contrast
        <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
          value={pairId} disabled={audio.playing} onChange={event => selectPair(event.currentTarget.value)}>
          {contrastPairs.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
        </select>
      </label>
      <p className="text-center text-slate-600">Which tone did you hear?</p>
      <div className="mx-auto grid max-w-xl grid-cols-2 gap-3">
        {pair.tones.map(tone => <button type="button" key={tone}
          className="button button-secondary min-h-16 text-base" disabled={!hasPlayed || !audio.available(target) || audio.playing || Boolean(answer)}
          onClick={() => choose(tone)} aria-label={`Choose Tone ${tone}`}>
          Tone {tone} · {toneDefinition(tone).description}
        </button>)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="button button-primary" disabled={!audio.available(target) || audio.playing}
          onClick={() => { void audio.play(target).then(played => { if (played) setHasPlayed(true) }) }}>
          {audio.playing ? 'Playing…' : 'Play example'}
        </button>
        {answer && <button type="button" className="button button-secondary" disabled={!audio.available(target) || audio.playing}
          onClick={() => { void audio.play(target) }}>Replay example</button>}
      </div>
      {answer && <div className="rounded-xl border border-[#d6dfd6] bg-[#f7f9f5] p-4" aria-live="polite">
        <p className={`font-semibold ${answer.correct ? 'text-[#24654e]' : 'text-[#8f3b2e]'}`}>
          {answer.correct ? 'Correct.' : `This was Tone ${target}, ${definition.description.toLowerCase()}.`}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <p className="text-2xl font-semibold" lang="zh-Hans">{definition.hanzi}
            <span className="ml-3 text-lg font-normal" lang="zh-Latn-pinyin">{definition.pinyin}</span>
          </p>
          <ToneContour tone={target} />
        </div>
        <button type="button" className="button button-primary mt-3" disabled={audio.playing} onClick={nextTrial}>
          Next trial
        </button>
      </div>}
      <p className="text-center text-sm text-slate-600" aria-live="polite">
        {selectedScore.correct} / {selectedScore.attempts} correct · {accuracy(selectedScore.correct, selectedScore.attempts)}% for {pair.label}
      </p>
    </div>
    <section className="panel" aria-labelledby="pair-scores-heading">
      <h3 className="font-semibold" id="pair-scores-heading">Accuracy by contrast pair</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {contrastPairs.map(item => {
          const score = scores[item.id] ?? { attempts: 0, correct: 0 }
          return <li key={item.id} className="flex justify-between gap-3 rounded-lg bg-[#f7f9f5] px-3 py-2 text-sm">
            <span>{item.label}</span>
            <span>{score.correct}/{score.attempts} · {accuracy(score.correct, score.attempts)}%</span>
          </li>
        })}
      </ul>
    </section>
  </section>
}

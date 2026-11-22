import { useState } from 'react'
import { accuracy, createQuestion, submitAnswer } from './toneSession'
import type { QuizAnswer } from './toneSession'
import { ToneContour } from './ToneContour'
import { toneDefinition, toneExample } from './tones'
import type { MandarinTone } from './tones'

export function ToneIdentification({ audio, onResult }: {
  audio: { available: (tone: MandarinTone) => boolean; playing: boolean; play: (tone: MandarinTone) => Promise<boolean> }
  onResult: (attempts: number, correct: number) => void
}) {
  const [question, setQuestion] = useState(() => createQuestion())
  const [answer, setAnswer] = useState<QuizAnswer | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [hasPlayed, setHasPlayed] = useState(false)
  const target = question.example
  const correctTone = toneDefinition(target.tone)

  function choose(tone: MandarinTone) {
    const result = submitAnswer(answer, question, tone)
    if (answer || !result) return
    const nextAttempts = attempts + 1
    const nextCorrect = correct + Number(result.correct)
    setAnswer(result)
    setAttempts(nextAttempts)
    setCorrect(nextCorrect)
    onResult(nextAttempts, nextCorrect)
  }

  function nextQuestion() {
    setQuestion(createQuestion(target.id))
    setAnswer(null)
    setQuestionNumber(number => number + 1)
    setHasPlayed(false)
  }

  return <section className="space-y-5" aria-labelledby="identify-heading">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold" id="identify-heading">Identify the tone</h2>
        <p className="mt-1 text-sm text-slate-600">Listen as often as you need, then choose the tone you heard.</p>
      </div>
      <p className="rounded-lg bg-[#e5eee4] px-3 py-2 text-sm font-semibold" aria-live="polite">
        {correct} / {attempts} correct · {accuracy(correct, attempts)}% accuracy
      </p>
    </div>
    <div className="panel mx-auto max-w-2xl space-y-5 text-center">
      <p className="eyebrow">Question {questionNumber}</p>
      <p className="text-slate-600">Which tone did you hear?</p>
      <button type="button" className="button button-primary min-w-36" disabled={!audio.available(target.tone) || audio.playing}
        onClick={() => { void audio.play(target.tone).then(played => { if (played) setHasPlayed(true) }) }}>
        {audio.playing ? 'Playing…' : 'Play example'}
      </button>
      {!answer ? <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {question.choices.map(tone => <button type="button" key={tone}
            className="button button-secondary min-h-16 text-base" disabled={!hasPlayed || !audio.available(target.tone) || audio.playing}
            onClick={() => choose(tone)} aria-label={`Answer Tone ${tone}`}>
            Tone {tone}
          </button>)}
        </div>
        <p className="text-sm text-slate-500">The character, Pinyin, and contour stay hidden until you answer.</p>
      </> : <div className="space-y-4 rounded-xl border border-[#d6dfd6] bg-[#f7f9f5] p-4 text-left" aria-live="polite">
        <p className={`font-semibold ${answer.correct ? 'text-[#24654e]' : 'text-[#8f3b2e]'}`}>
          {answer.correct
            ? `Correct — Tone ${target.tone}, ${correctTone.description.toLowerCase()}.`
            : `This was Tone ${target.tone} — ${correctTone.description.toLowerCase()}. Listen for its ${correctTone.movement.toLowerCase()} movement.`}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-2xl font-semibold" lang="zh-Hans">{target.hanzi}
            <span className="ml-3 text-lg font-normal" lang="zh-Latn-pinyin">{target.pinyin}</span>
          </p>
          <ToneContour tone={target.tone} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button button-secondary" disabled={!audio.available(target.tone) || audio.playing}
            onClick={() => { void audio.play(target.tone) }}>Replay example</button>
          <button type="button" className="button button-primary" disabled={audio.playing} onClick={nextQuestion}>
            Next question
          </button>
        </div>
      </div>}
    </div>
  </section>
}

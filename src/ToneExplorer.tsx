import { useState } from 'react'
import { ToneContour } from './ToneContour'
import { toneDefinition, toneDefinitions, toneExample } from './tones'
import type { MandarinTone } from './tones'

export function ToneExplorer({ audio, onPlay }: {
  audio: { available: (tone: MandarinTone) => boolean; playing: boolean; play: (tone: MandarinTone) => Promise<boolean> }
  onPlay: (tone: MandarinTone, attempts: number) => void
}) {
  const [selected, setSelected] = useState<MandarinTone>(1)
  const [plays, setPlays] = useState<Record<MandarinTone, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })
  const current = toneDefinition(selected)

  function listen(tone: MandarinTone) {
    if (!audio.available(tone)) return
    void audio.play(tone).then(played => {
      if (!played) return
      const attempts = plays[tone] + 1
      setPlays(previous => ({ ...previous, [tone]: attempts }))
      onPlay(tone, attempts)
    })
  }

  return <section className="space-y-5" aria-labelledby="explore-heading">
    <div>
      <h2 className="text-xl font-semibold" id="explore-heading">Explore the four tones</h2>
      <p className="mt-1 text-sm text-slate-600">Select a tone to inspect its schematic contour, then listen to the prototype example.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {toneDefinitions.map(item => {
        const example = toneExample(item.tone)
        return <article key={item.tone}
          className={`tone-card ${selected === item.tone ? 'border-[#24654e] ring-2 ring-[#24654e]' : ''}`}>
          <button type="button" className="w-full text-left" aria-pressed={selected === item.tone}
            onClick={() => setSelected(item.tone)}>
            <span className="flex items-start justify-between gap-2">
              <span>
                <span className="block text-3xl font-semibold" lang="zh-Hans">{item.hanzi}</span>
                <span className="mt-1 block text-lg font-medium" lang="zh-Latn-pinyin">{item.pinyin}</span>
              </span>
              <span className="rounded-full bg-[#e5eee4] px-3 py-1 text-sm font-bold text-[#214d3d]">Tone {item.tone}</span>
            </span>
            <span className="mt-2 block text-sm text-slate-600">{item.description}</span>
            <span className="mt-2 block"><ToneContour tone={item.tone} showLabel={false} /></span>
          </button>
          <button type="button" className="button button-secondary mt-2 w-full" disabled={!audio.available(item.tone) || audio.playing}
            onClick={() => listen(item.tone)} aria-label={`Play Tone ${item.tone} prototype audio`}>
            {audio.playing ? 'Playing…' : `Play Tone ${item.tone}`}
          </button>
          <p className="mt-2 text-xs text-slate-500">{example.gloss} · Prototype voice</p>
        </article>
      })}
    </div>
    <div className="panel grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
      <div>
        <p className="eyebrow">Selected contour</p>
        <h3 className="mt-1 text-2xl font-semibold">Tone {current.tone} · {current.description}</h3>
        <p className="mt-2 text-slate-600">{current.movement}</p>
        {selected === 3 && <p className="mt-2 text-sm text-slate-600">
          The full dipping shape is a citation-form simplification. Tone 3 varies with context and is often realized without a full dip.
        </p>}
      </div>
      <ToneContour tone={selected} size="large" />
    </div>
  </section>
}

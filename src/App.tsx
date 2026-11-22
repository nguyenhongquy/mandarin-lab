import { useRef, useState } from 'react'
import { ToneContrast } from './ToneContrast'
import { ToneExplorer } from './ToneExplorer'
import { ToneIdentification } from './ToneIdentification'
import { ToneProductionExplorer } from './ToneProductionExplorer'
import { languageConfig } from './config'
import { saveSessionResult, toneSelection } from './sessionTracking'
import type { ExerciseMode } from './sessionTracking'
import type { MandarinTone } from './tones'
import { toneExample } from './tones'
import { useToneAudio } from './useToneAudio'
import type { ToneReferenceAudioProvider } from './toneReferences'

type Mode = ExerciseMode
type Workspace = 'listening' | 'production'
const workspaces: { id: Workspace; label: string }[] = [
  { id: 'listening', label: 'Tone Listening' },
  { id: 'production', label: 'Tone Production' },
]
const modes: { id: Mode; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'identify', label: 'Identify' },
  { id: 'contrast', label: 'Contrast' },
]

export function App() {
  const [mode, setMode] = useState<Mode>('explore')
  const [workspace, setWorkspace] = useState<Workspace>('listening')
  const [sessionId] = useState(() => crypto.randomUUID())
  const [storageNotice, setStorageNotice] = useState('')
  const audio = useToneAudio()
  const toneAudio = { ...audio, play: (tone: MandarinTone) => audio.play(toneExample(tone)) }
  const referenceAudio: ToneReferenceAudioProvider = {
    status: audio.status,
    playing: audio.playing,
    error: audio.error,
    available: audio.availableReference,
    play: audio.playReference,
    stop: audio.stop,
  }
  const tabs = useRef<Array<HTMLButtonElement | null>>([])

  function record(modeForResult: Mode, selection: string, attempts: number, correct: number | null) {
    try {
      saveSessionResult(window.localStorage, { sessionId, mode: modeForResult, selection, attempts, correct })
      setStorageNotice('')
    } catch (problem) {
      setStorageNotice(problem instanceof Error
        ? `Practice was not saved: ${problem.message}`
        : 'Practice could not be saved in this browser.')
    }
  }

  function playExplore(tone: MandarinTone, attempts: number) {
    record('explore', toneSelection(tone), attempts, null)
  }

  return <div className="mx-auto min-h-screen max-w-6xl px-4 sm:px-6">
    <header className="flex items-center justify-between border-b border-[#d6dfd6] py-4">
      <a href="/" className="text-lg font-bold tracking-tight text-[#153c31]">{languageConfig.name}</a>
      <span className="rounded-full bg-[#e5eee4] px-3 py-1 text-xs font-semibold text-[#214d3d]">
        {workspace === 'listening' ? 'Tone Listening' : 'Tone Production'}
      </span>
    </header>
    <main>
      <div className="py-8 sm:py-11">
        <p className="eyebrow">{workspace === 'listening' ? 'Mandarin listening practice' : 'Mandarin tone production'}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          {workspace === 'listening' ? 'Hear the tone.' : 'Record and explore pitch.'}
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          {workspace === 'listening'
            ? 'Explore the four citation tones, identify what you hear, and practice focused contrasts.'
            : 'Record an isolated syllable and inspect its locally measured pitch trajectory.'}
        </p>
      </div>
      {workspace === 'listening' && <div className="panel mb-5 space-y-2" role="status">
        <p className="text-sm font-semibold">{audio.status}</p>
        <p className="text-sm text-slate-600">
          No validated Mandarin recordings are bundled yet. Browser speech is a prototype only; it is not used to score pronunciation.
        </p>
        {audio.error && <p role="alert" className="text-sm text-[#8f3b2e]">{audio.error}</p>}
        {storageNotice && <p role="alert" className="text-sm text-[#8f3b2e]">{storageNotice}</p>}
      </div>}
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Practice areas">
        {workspaces.map(item => <button key={item.id} type="button" aria-pressed={workspace === item.id}
          className={`button ${workspace === item.id ? 'button-primary' : 'button-secondary'}`}
          onClick={() => {
            audio.stop()
            setWorkspace(item.id)
          }}>{item.label}</button>)}
      </nav>
      <section aria-label="Tone Listening" hidden={workspace !== 'listening'}>
        <nav className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Tone Listening modes">
          {modes.map((item, index) => <button key={item.id} ref={element => { tabs.current[index] = element }}
            type="button" role="tab" id={`tab-${item.id}`} tabIndex={mode === item.id ? 0 : -1}
            aria-selected={mode === item.id} aria-controls={`panel-${item.id}`}
            className={`button ${mode === item.id ? 'button-primary' : 'button-secondary'}`}
            onKeyDown={event => {
              const target = event.key === 'ArrowRight' ? (index + 1) % modes.length
                : event.key === 'ArrowLeft' ? (index + modes.length - 1) % modes.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : -1
              if (target < 0) return
              event.preventDefault()
              const nextMode = modes[target]
              if (!nextMode) return
              audio.stop()
              setMode(nextMode.id)
              tabs.current[target]?.focus()
            }}
            onClick={() => {
              audio.stop()
              setMode(item.id)
            }}>{item.label}</button>)}
        </nav>
        <section role="tabpanel" id="panel-explore" aria-labelledby="tab-explore" hidden={mode !== 'explore'}>
          <ToneExplorer audio={toneAudio} onPlay={playExplore} />
        </section>
        <section role="tabpanel" id="panel-identify" aria-labelledby="tab-identify" hidden={mode !== 'identify'}>
          <ToneIdentification audio={toneAudio} onResult={(attempts, correct) => record('identify', 'all-tones', attempts, correct)} />
        </section>
        <section role="tabpanel" id="panel-contrast" aria-labelledby="tab-contrast" hidden={mode !== 'contrast'}>
          <ToneContrast audio={toneAudio} onResult={(pairId, attempts, correct) => record('contrast', pairId, attempts, correct)} />
        </section>
      </section>
      {workspace === 'production' && <ToneProductionExplorer referenceAudio={referenceAudio} />}
    </main>
    <footer className="py-8 text-center text-xs text-slate-500">
      Tone contours are illustrative teaching diagrams, not measured pitch tracks.
    </footer>
  </div>
}

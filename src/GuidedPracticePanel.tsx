import { useEffect, useMemo, useState } from 'react'
import { compareAttempts } from './guidedPractice/attemptComparison.ts'
import { exercisesForTone, guidedExerciseById } from './guidedPractice/exercises.ts'
import type { PracticeReflection, ReflectionResponse } from './guidedPractice/types.ts'
import type { GuidedPracticeState } from './guidedPractice/types.ts'
import { F0TrajectoryChart } from './F0TrajectoryChart.tsx'
import type { PitchDisplayMode, PitchAttemptTrack } from './F0TrajectoryChart.tsx'
import { toneDefinition, toneDefinitions } from './tones.ts'
import type { MandarinTone } from './tones.ts'
import type { ToneReference, ToneReferenceAudioProvider } from './toneReferences.ts'
import { referenceSourceLabel } from './toneReferences.ts'
import { useToneRecording } from './useToneRecording.ts'
import { ToneContour } from './ToneContour.tsx'
import type { PitchAnalysis } from './pitchAnalysis.ts'

interface GuidedPracticePanelProps {
  state: GuidedPracticeState
  tone: MandarinTone
  reference: ToneReference
  referenceAudio: ToneReferenceAudioProvider
  referenceLoading: boolean
  referenceAnalysis: PitchAnalysis | null
  referenceCanPlot: boolean
  referenceAnalysisWarning: string
  analysisError: string
  analyzing: boolean
  recording: ReturnType<typeof useToneRecording>
  mode: PitchDisplayMode
  onModeChange: (mode: PitchDisplayMode) => void
  onToneChange: (tone: MandarinTone) => void
  onSelectExercise: (exerciseId: string, tone: MandarinTone) => void
  onStartRecording: () => void
  onStopRecording: () => void
  onRecordAgain: () => void
  onDiscardRecording: () => void
  onAnalyze: () => void
  onSaveReflection: (attemptId: string, reflection: PracticeReflection) => void
  onSelectComparison: (attemptIds: readonly [string, string] | null) => void
  onClearHistory: () => void
}

const ATTEMPT_COLORS = ['#9a7307', '#24654e']

function displayFeature(value: number | string | null, unit?: string): string {
  if (value === null) return 'Unavailable'
  if (typeof value !== 'number') return value
  const formatted = unit === 'percent' ? value.toFixed(0) : value.toFixed(2)
  return unit ? `${formatted} ${unit}` : formatted
}

function attemptTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function GuidedPracticePanel({
  state,
  tone,
  reference,
  referenceAudio,
  referenceLoading,
  referenceAnalysis,
  referenceCanPlot,
  referenceAnalysisWarning,
  analysisError,
  analyzing,
  recording,
  mode,
  onModeChange,
  onToneChange,
  onSelectExercise,
  onStartRecording,
  onStopRecording,
  onRecordAgain,
  onDiscardRecording,
  onAnalyze,
  onSaveReflection,
  onSelectComparison,
  onClearHistory,
}: GuidedPracticePanelProps) {
  const exercise = guidedExerciseById(state.exerciseId)
  const selectedTone = toneDefinition(tone)
  const availableExercises = exercisesForTone(tone)
  const currentAttempts = useMemo(() => state.attempts.filter(attempt =>
    attempt.exerciseId === state.exerciseId && attempt.tone === tone),
  [state.attempts, state.exerciseId, tone])
  const attemptAId = state.selectedAttemptIds?.[0] ?? ''
  const attemptBId = state.selectedAttemptIds?.[1] ?? ''
  const [comparisonChoice, setComparisonChoice] = useState<[string, string]>(['', ''])
  const [showReference, setShowReference] = useState(true)
  const [showSchematic, setShowSchematic] = useState(false)
  const activeAttempt = state.attempts.find(attempt => attempt.id === state.activeAttemptId) ?? null
  const [reflectionResponse, setReflectionResponse] = useState<ReflectionResponse>('unsure')
  const [reflectionNote, setReflectionNote] = useState('')

  useEffect(() => {
    const defaultA = attemptAId || currentAttempts.at(-2)?.id || ''
    const defaultB = attemptBId || currentAttempts.at(-1)?.id || ''
    setComparisonChoice([defaultA, defaultB])
  }, [attemptAId, attemptBId, currentAttempts])

  useEffect(() => {
    setReflectionResponse(activeAttempt?.reflection?.response ?? 'unsure')
    setReflectionNote(activeAttempt?.reflection?.note ?? '')
  }, [activeAttempt?.id, activeAttempt?.reflection])

  const selectedAttemptA = currentAttempts.find(attempt => attempt.id === comparisonChoice[0]) ?? null
  const selectedAttemptB = currentAttempts.find(attempt => attempt.id === comparisonChoice[1]) ?? null
  const selectedAttempts = [selectedAttemptA, selectedAttemptB] as const
  const comparison = exercise && selectedAttemptA && selectedAttemptB
    ? compareAttempts(selectedAttemptA, selectedAttemptB, exercise)
    : null
  const attemptTracks: PitchAttemptTrack[] = selectedAttempts.flatMap((attempt, index) =>
    attempt?.pitchAnalysis
      ? [{
          id: attempt.id,
          label: `Attempt ${index === 0 ? 'A' : 'B'}`,
          analysis: attempt.pitchAnalysis,
          color: ATTEMPT_COLORS[index] ?? '#64748b',
        }]
      : [])
  const chartAnalysis = selectedAttempts[1]?.pitchAnalysis
    ?? selectedAttempts[0]?.pitchAnalysis
    ?? null

  function chooseComparison(index: 0 | 1, id: string) {
    const next: [string, string] = [...comparisonChoice]
    next[index] = id
    setComparisonChoice(next)
    if (next[0] && next[1] && next[0] !== next[1]) {
      onSelectComparison(next)
    }
  }

  function saveReflection() {
    if (!activeAttempt) return
    const note = reflectionNote.trim()
    onSaveReflection(activeAttempt.id, {
      response: reflectionResponse,
      ...(note ? { note } : {}),
    })
  }

  if (!exercise) return <p role="alert" className="text-sm text-[#8f3b2e]">
    The selected guided exercise is unavailable. Choose a different exercise.
  </p>

  return <section className="space-y-5" aria-labelledby="guided-practice-heading">
    <div>
      <p className="eyebrow">Tone Production · Guided Practice</p>
      <h3 id="guided-practice-heading" className="mt-1 text-xl font-semibold">Practice one focused cue</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Use the same local recorder and pitch analysis as Free Exploration. Attempts stay in memory only; raw recordings are not added to practice history.
      </p>
    </div>

    <section className="panel space-y-4" aria-labelledby="guided-step-1">
      <div>
        <p className="eyebrow">Step 1</p>
        <h4 id="guided-step-1" className="mt-1 text-lg font-semibold">Choose a tone and focused exercise</h4>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Syllable and target tone
          <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
            value={tone} disabled={recording.recording || recording.requesting || Boolean(recording.blob)
              || referenceAudio.playing || analyzing}
            onChange={event => {
              const nextTone = toneDefinitions.find(item => item.tone === Number(event.currentTarget.value))
              if (nextTone) onToneChange(nextTone.tone)
            }}>
            {toneDefinitions.map(item => <option value={item.tone} key={item.tone}>
              Tone {item.tone} · {item.pinyin} · {item.hanzi}
            </option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Guided exercise
          <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
            value={exercise.id} disabled={analyzing}
            onChange={event => onSelectExercise(event.currentTarget.value, tone)}>
            {availableExercises.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-xl bg-[#f7f9f5] p-3">
        <p className="text-sm font-semibold">Tone {selectedTone.tone} · {selectedTone.pinyin} · {selectedTone.hanzi}</p>
        <p className="mt-1 text-sm font-semibold">{exercise.title}</p>
        <p className="mt-1 text-sm text-slate-700">{exercise.description}</p>
        <p className="mt-2 text-sm"><strong>Listen for:</strong> {exercise.listeningInstruction}</p>
        <p className="mt-1 text-sm"><strong>Try:</strong> {exercise.productionInstruction}</p>
      </div>
    </section>

    <section className="panel space-y-3" aria-labelledby="guided-step-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Step 2</p>
          <h4 id="guided-step-2" className="mt-1 text-lg font-semibold">Listen to the reference</h4>
        </div>
        <span className="rounded-full bg-[#fff7e8] px-3 py-1 text-xs font-semibold text-[#704d17]">
          {referenceSourceLabel(reference.source)}
        </span>
      </div>
      {referenceLoading
        ? <p role="status" className="text-sm text-slate-600">Checking for a generated local reference…</p>
        : reference.source === 'browser-tts'
          ? <p className="text-sm text-slate-600">
            Browser TTS is available for listening only; measured reference F0 is unavailable.
          </p>
          : <p className="text-sm text-slate-600">
            Synthetic audio is a listening aid, not a phonetically authoritative speaker model.
            {reference.voiceName ? ` Voice: ${reference.voiceName}.` : ''}
          </p>}
      {referenceAudio.error && <p role="alert" className="text-sm text-[#8f3b2e]">{referenceAudio.error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        {referenceAudio.playing ? 'Playing reference…' : referenceAudio.status}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-primary"
          disabled={referenceLoading || !referenceAudio.available(reference) || referenceAudio.playing
            || recording.recording || recording.requesting || recording.playing || analyzing}
          onClick={() => void referenceAudio.play(reference)}>
          Listen to reference
        </button>
        {referenceAudio.playing && <button type="button" className="button button-secondary" onClick={referenceAudio.stop}>
          Stop reference
        </button>}
      </div>
    </section>

    <section className="panel space-y-3" aria-labelledby="guided-step-3">
      <div>
        <p className="eyebrow">Step 3</p>
        <h4 id="guided-step-3" className="mt-1 text-lg font-semibold">Record a focused attempt</h4>
      </div>
      {!recording.supported && <p role="status" className="rounded-lg bg-[#fff7e8] p-3 text-sm text-[#704d17]">
        Microphone recording is not supported in this browser. Use a current browser on HTTPS or localhost.
      </p>}
      {recording.error && <p role="alert" className="text-sm text-[#8f3b2e]">{recording.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!recording.recording && <button type="button" className="button button-primary"
          disabled={!recording.supported || recording.requesting || recording.playing || referenceAudio.playing || analyzing}
          onClick={recording.blob ? onRecordAgain : onStartRecording}>
          {recording.requesting ? 'Requesting microphone…' : recording.blob ? 'Record another attempt' : 'Record attempt'}
        </button>}
        {recording.recording && <button type="button" className="button button-primary" onClick={onStopRecording}>
          Stop recording
        </button>}
      </div>
      {recording.recording && <p role="status" aria-live="polite" className="text-sm font-semibold text-[#8f3b2e]">
        Recording · {recording.elapsedSeconds.toFixed(1)} / 5.0 seconds · stops automatically at five seconds
      </p>}
      {recording.requesting && <p role="status" className="text-sm text-slate-600">Waiting for microphone permission…</p>}
      {recording.blob && <button type="button" className="button button-secondary"
        disabled={recording.playing || recording.recording || referenceAudio.playing || analyzing}
        onClick={onDiscardRecording}>Discard recording</button>}
      {!recording.recording && !recording.requesting && !recording.blob && recording.supported
        && <p className="text-sm text-slate-600">Audio remains local to this page and is not saved automatically.</p>}
    </section>

    <section className="panel space-y-3" aria-labelledby="guided-step-4">
      <div>
        <p className="eyebrow">Step 4</p>
        <h4 id="guided-step-4" className="mt-1 text-lg font-semibold">Listen and analyze locally</h4>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        {recording.playing ? 'Playing your local recording…' : recording.blob
          ? `Recording ready · ${recording.elapsedSeconds.toFixed(1)} seconds`
          : 'Record an attempt to enable playback and analysis.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary"
          disabled={!recording.blob || recording.playing || recording.recording || recording.requesting
            || referenceAudio.playing || analyzing}
          onClick={() => void recording.playRecording()}>
          Listen to my recording
        </button>
        {recording.playing && <button type="button" className="button button-secondary" onClick={recording.stopPlayback}>
          Stop recording playback
        </button>}
        <button type="button" className="button button-primary"
          disabled={!recording.blob || recording.recording || recording.playing || recording.requesting
            || referenceAudio.playing || referenceLoading || analyzing}
          onClick={onAnalyze}>
          {analyzing ? 'Analyzing locally…' : 'Analyze attempt'}
        </button>
      </div>
      {analysisError && <p role="alert" className="text-sm text-[#8f3b2e]">{analysisError}</p>}
      {analyzing && <p role="status" className="text-sm text-slate-600">Analyzing the attempt and any measured local reference…</p>}
      {referenceAnalysisWarning && <p role="status" className="rounded-lg bg-[#fff7e8] p-3 text-sm text-[#704d17]">
        {referenceAnalysisWarning}
      </p>}
    </section>

    <section className="panel space-y-4" aria-labelledby="guided-step-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Step 5</p>
          <h4 id="guided-step-5" className="mt-1 text-lg font-semibold">Compare attempts and reflect</h4>
        </div>
        <label className="text-sm font-medium">
          Display
          <select className="ml-2 rounded-lg border border-[#cdd9cd] bg-white p-2" value={mode}
            onChange={event => onModeChange(event.currentTarget.value === 'absolute' ? 'absolute' : 'relative')}>
            <option value="relative">Relative pitch</option>
            <option value="absolute">Absolute pitch (Hz)</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-slate-600">
        Select two analyzed attempts from the same exercise and tone. Relative mode normalizes each attempt independently to its own median; absolute mode preserves Hertz differences without implying you should match another speaker’s pitch.
      </p>
      {referenceAnalysisWarning && <p role="status" className="text-sm text-slate-600">{referenceAnalysisWarning}</p>}
      {currentAttempts.length >= 2 && <>
        <div className="grid gap-3 sm:grid-cols-2">
          {([0, 1] as const).map(index => <label key={index} className="text-sm font-medium">
            Attempt {index === 0 ? 'A' : 'B'}
            <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
              value={comparisonChoice[index] ?? ''}
              onChange={event => chooseComparison(index, event.currentTarget.value)}>
              <option value="">Choose an attempt</option>
              {currentAttempts.map((attempt, attemptIndex) => <option key={attempt.id} value={attempt.id}>
                Attempt {attemptIndex + 1} · {attemptTimestamp(attempt.timestamp)}
              </option>)}
            </select>
          </label>)}
        </div>
        {comparison && <div className={`rounded-lg p-3 text-sm ${comparison.withheld
          ? 'bg-[#fff7e8] text-[#704d17]' : 'bg-[#f1f6f1] text-[#153c31]'}`}>
          <p className="font-semibold">{comparison.withheld ? 'Comparison withheld' : 'Measured feature observations'}</p>
          <p className="mt-1">{comparison.observation}</p>
          {comparison.features.length > 0 && <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead><tr className="border-b border-current/20">
                <th scope="col" className="py-2 pr-3">Feature</th>
                <th scope="col" className="py-2 pr-3">Attempt A</th>
                <th scope="col" className="py-2">Attempt B</th>
              </tr></thead>
              <tbody>{comparison.features.map(feature => <tr key={feature.feature} className="border-b border-current/10">
                <th scope="row" className="py-2 pr-3 font-medium">{feature.label}</th>
                <td className="py-2 pr-3">{displayFeature(feature.attemptA, feature.unit)}</td>
                <td className="py-2">{displayFeature(feature.attemptB, feature.unit)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>}
        {chartAnalysis && (attemptTracks.length > 0 || (showReference && referenceCanPlot)) && <div className="space-y-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {referenceAnalysis && <label className="flex items-center gap-2">
              <input type="checkbox" checked={showReference} disabled={!referenceCanPlot}
                onChange={event => setShowReference(event.currentTarget.checked)} />
              Measured reference trajectory
            </label>}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showSchematic}
                onChange={event => setShowSchematic(event.currentTarget.checked)} />
              Schematic teaching contour
            </label>
          </div>
          <F0TrajectoryChart learnerAnalysis={chartAnalysis} referenceAnalysis={referenceAnalysis}
            referenceLabel={referenceSourceLabel(reference.source)} mode={mode}
            showLearner={false} showReference={showReference && referenceCanPlot}
            attemptTracks={attemptTracks} />
          {showSchematic && <div className="grid items-center gap-3 rounded-xl bg-[#f7f9f5] p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <p className="text-sm text-slate-600">
              Schematic teaching contour · illustrative only; not measured reference or speaker data.
            </p>
            <ToneContour tone={tone} showLabel={false} />
          </div>}
        </div>}
        {!chartAnalysis && <p role="status" className="text-sm text-slate-600">
          The selected attempts do not have enough reliable voiced frames to plot.
        </p>}
      </>}
      {currentAttempts.length === 1 && <p role="status" className="text-sm text-slate-600">
        One attempt is available. Record and analyze another attempt for a comparison.
      </p>}
      {currentAttempts.length === 0 && <p role="status" className="text-sm text-slate-600">
        No analyzed attempts yet. Complete the recording and analysis steps to begin a comparison.
      </p>}
      {activeAttempt && <form className="space-y-3 rounded-lg border border-[#d7e0d7] p-3"
        onSubmit={event => { event.preventDefault(); saveReflection() }}>
        <fieldset className="space-y-2">
          <legend className="font-semibold">Reflection · {exercise.reflectionQuestion}</legend>
          {([
            ['yes', 'Yes'],
            ['unsure', 'Not sure'],
            ['no', 'No'],
          ] as const).map(([value, label]) => <label key={value} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input type="radio" name="guided-reflection" value={value}
              checked={reflectionResponse === value} onChange={() => setReflectionResponse(value)} />
            {label}
          </label>)}
        </fieldset>
        <label className="block text-sm font-medium">
          Optional note
          <textarea className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
            rows={2} maxLength={240} value={reflectionNote}
            onChange={event => setReflectionNote(event.currentTarget.value)} />
        </label>
        <button type="submit" className="button button-secondary">Save reflection in this session</button>
      </form>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h5 className="font-semibold">Recent attempt history · {state.attempts.length}/10</h5>
        {state.attempts.length > 0 && <button type="button" className="button button-secondary" onClick={onClearHistory}>
          Clear history
        </button>}
      </div>
      {state.attempts.length > 0 && <ol className="space-y-2">
        {[...state.attempts].reverse().map(attempt => {
          const itemExercise = guidedExerciseById(attempt.exerciseId)
          return <li key={attempt.id} className="rounded-lg border border-[#d7e0d7] bg-white p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">{itemExercise?.title ?? 'Guided exercise'} · Tone {attempt.tone}</span>
              <span className="text-slate-600">{attemptTimestamp(attempt.timestamp)}</span>
            </div>
            <p className="mt-1 text-slate-600">
              Analysis reliability: {attempt.analysisReliability}
              {attempt.feedbackCode ? ` · Feedback context: ${attempt.feedbackCode}` : ''}
            </p>
            {attempt.reflection && <p className="mt-1 text-slate-600">
              Reflection: {attempt.reflection.response}
              {attempt.reflection.note ? ` · ${attempt.reflection.note}` : ''}
            </p>}
          </li>
        })}
      </ol>}
    </section>
  </section>
}

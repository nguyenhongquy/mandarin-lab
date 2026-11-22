import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { decodeAndAnalyze } from './audioDecoder'
import { AcousticInspector } from './AcousticInspector'
import { compareToneFeatures } from './acousticComparison'
import { F0TrajectoryChart } from './F0TrajectoryChart'
import type { PitchDisplayMode } from './F0TrajectoryChart'
import { comparePitchAnalyses, MIN_COMPARISON_VOICED_FRAMES, normalizePitchAnalysis } from './pitchComparison'
import { evaluateToneProduction } from './feedback/evaluateToneProduction.ts'
import { normalizeFeedbackEvidence } from './feedback/evidenceHighlight.ts'
import type { FeedbackCode, FeedbackEvidence } from './feedback/toneFeedbackTypes.ts'
import { ToneFeedbackPanel } from './ToneFeedbackPanel.tsx'
import type { PitchAnalysis } from './pitchAnalysis'
import { extractToneFeatures } from './toneAcoustics'
import { browserTtsReference, referenceSourceLabel } from './toneReferences'
import type { ToneReference } from './toneReferences'
import type { ToneReferenceAudioProvider } from './toneReferences'
import { toneDefinition, toneDefinitions } from './tones'
import type { MandarinTone } from './tones'
import { MAX_RECORDING_SECONDS } from './recordingSupport'
import { fetchReferenceAudio, loadLocalTtsReferences } from './referenceManifest'
import { useToneRecording } from './useToneRecording'
import { ToneContour } from './ToneContour'
import { GuidedPracticePanel } from './GuidedPracticePanel.tsx'
import { defaultExerciseForTone, guidedExerciseById, recommendExercise } from './guidedPractice/exercises.ts'
import { createGuidedPracticeState, guidedPracticeReducer } from './guidedPractice/session.ts'
import type { PracticeReflection } from './guidedPractice/types.ts'

function timer(seconds: number) {
  return `${seconds.toFixed(1)} / ${MAX_RECORDING_SECONDS.toFixed(1)} seconds`
}

export function ToneProductionExplorer({ referenceAudio }: { referenceAudio: ToneReferenceAudioProvider }) {
  const [tone, setTone] = useState<MandarinTone>(1)
  const [practiceMode, setPracticeMode] = useState<'free' | 'guided'>('free')
  const [guidedPractice, dispatchGuidedPractice] = useReducer(
    guidedPracticeReducer,
    createGuidedPracticeState(1, defaultExerciseForTone(1).id),
  )
  const [mode, setMode] = useState<PitchDisplayMode>('relative')
  const [analysis, setAnalysis] = useState<PitchAnalysis | null>(null)
  const [referenceAnalysis, setReferenceAnalysis] = useState<PitchAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [referenceAnalysisWarning, setReferenceAnalysisWarning] = useState('')
  const [referenceCatalogWarning, setReferenceCatalogWarning] = useState('')
  const [localReferences, setLocalReferences] = useState<ToneReference[]>([])
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [useBrowserFallback, setUseBrowserFallback] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [showReference, setShowReference] = useState(true)
  const [showLearner, setShowLearner] = useState(true)
  const [showSchematic, setShowSchematic] = useState(true)
  const [showAcousticMarkers, setShowAcousticMarkers] = useState(false)
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const attemptCounterRef = useRef(0)
  const recording = useToneRecording()
  const selectedTone = toneDefinition(tone)
  const localReference = localReferences.find(reference => reference.tone === tone && reference.syllable === 'ma')
  const reference = useBrowserFallback || !localReference ? browserTtsReference(tone) : localReference
  const referenceLabel = referenceSourceLabel(reference.source)
  const referenceCanPlot = Boolean(referenceAnalysis && normalizePitchAnalysis(referenceAnalysis))
  const learnerFeatures = useMemo(() => analysis ? extractToneFeatures(analysis) : null, [analysis])
  const referenceFeatures = useMemo(() => referenceAnalysis ? extractToneFeatures(referenceAnalysis) : null, [referenceAnalysis])
  const toneFeedback = useMemo(() => analysis && !analyzing
    ? evaluateToneProduction({
        tone,
        learnerFeatures,
        referenceFeatures,
        referenceSource: reference.source,
      })
    : null, [analysis, analyzing, tone, learnerFeatures, referenceFeatures, reference.source])
  const feedbackEvidence: FeedbackEvidence[] = toneFeedback
    ? [toneFeedback.primary, ...toneFeedback.additional].flatMap(item => item.evidence)
    : []
  const selectedFeedbackEvidence = feedbackEvidence.find(item => item.id === selectedEvidenceId) ?? null
  const highlightableEvidenceIds = new Set(feedbackEvidence
    .filter(item => normalizeFeedbackEvidence(item, analysis, referenceAnalysis) !== null)
    .map(item => item.id))
  const evidenceHighlight = selectedFeedbackEvidence
    ? normalizeFeedbackEvidence(selectedFeedbackEvidence, analysis, referenceAnalysis)
    : null
  const acousticComparison = learnerFeatures && referenceFeatures
    ? compareToneFeatures(learnerFeatures, referenceFeatures)
    : null
  const comparisonFeedback = analysis
    ? referenceAnalysis
      ? comparePitchAnalyses(referenceAnalysis, analysis)
      : []
    : []
  const feedback = analysis
    ? [...new Set([...comparisonFeedback, ...analysis.warnings, ...(referenceAnalysis?.warnings ?? [])])]
    : []

  function changeTone(nextTone: MandarinTone) {
    setTone(nextTone)
    const currentExercise = guidedExerciseById(guidedPractice.exerciseId)
    const nextExerciseId = currentExercise?.targetTone === null
      ? currentExercise.id
      : defaultExerciseForTone(nextTone).id
    dispatchGuidedPractice({ type: 'select-exercise', exerciseId: nextExerciseId, tone: nextTone })
    setUseBrowserFallback(false)
    setAnalysis(null)
    setReferenceAnalysis(null)
    setSelectedEvidenceId(null)
    setAnalysisError('')
    setReferenceAnalysisWarning('')
  }

  function selectGuidedExercise(exerciseId: string, selectedTone: MandarinTone) {
    const exercise = guidedExerciseById(exerciseId)
    if (!exercise || (exercise.targetTone !== null && exercise.targetTone !== selectedTone)) return
    dispatchGuidedPractice({ type: 'select-exercise', exerciseId, tone: selectedTone })
  }

  function practiceFeedback(code: FeedbackCode) {
    const exercise = recommendExercise(tone, code)
    dispatchGuidedPractice({ type: 'select-exercise', exerciseId: exercise.id, tone })
    setPracticeMode('guided')
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      referenceAudio.stop()
    }
  }, [referenceAudio.stop])

  useEffect(() => {
    setSelectedEvidenceId(null)
  }, [analysis, referenceAnalysis, reference.id, reference.source, tone])

  useEffect(() => {
    let active = true
    void loadLocalTtsReferences().then(result => {
      if (!active) return
      setLocalReferences(result.references)
      setReferenceCatalogWarning(result.warnings.join(' '))
    }).catch(problem => {
      if (active) setReferenceCatalogWarning(problem instanceof Error
        ? `Local TTS references could not be loaded: ${problem.message}`
        : 'Local TTS references could not be loaded.')
    }).finally(() => {
      if (active) setReferenceLoading(false)
    })
    return () => { active = false }
  }, [])

  async function analyze() {
    if (!recording.blob || recording.recording || recording.playing || referenceAudio.playing || analyzing) return
    setAnalyzing(true)
    setAnalysis(null)
    setReferenceAnalysis(null)
    setSelectedEvidenceId(null)
    setAnalysisError('')
    setReferenceAnalysisWarning('')
    try {
      const learnerResult = await decodeAndAnalyze(recording.blob)
      if (!mountedRef.current) return
      setAnalysis(learnerResult)
      let measuredReference: PitchAnalysis | null = null
      if (reference.source === 'browser-tts') {
        setReferenceAnalysis(null)
        setReferenceAnalysisWarning('Browser TTS is available for listening only; measured reference F0 comparison is unavailable.')
      } else {
        try {
          const referenceBlob = await fetchReferenceAudio(reference)
          const result = await decodeAndAnalyze(referenceBlob)
          if (!mountedRef.current) return
          measuredReference = result
          setReferenceAnalysis(result)
          if (result.voicedFrameCount < MIN_COMPARISON_VOICED_FRAMES || !normalizePitchAnalysis(result)) {
            setReferenceAnalysisWarning('The local reference was analyzed, but it contains too few reliable voiced frames for comparison.')
          }
        } catch (problem) {
          if (mountedRef.current) {
            setReferenceAnalysis(null)
            setReferenceAnalysisWarning(problem instanceof Error
              ? `The learner analysis is ready, but the local reference could not be analyzed: ${problem.message} Playback remains available.`
              : 'The learner analysis is ready, but local reference analysis failed. Playback remains available.')
          }
        }
      }
      if (practiceMode === 'guided' && mountedRef.current) {
        const features = extractToneFeatures(learnerResult)
        const referenceFeatures = measuredReference ? extractToneFeatures(measuredReference) : null
        const result = evaluateToneProduction({
          tone,
          learnerFeatures: features,
          referenceFeatures,
          referenceSource: reference.source,
        })
        attemptCounterRef.current += 1
        dispatchGuidedPractice({
          type: 'attempt-analyzed',
          attempt: {
            id: `guided-${Date.now()}-${attemptCounterRef.current}`,
            exerciseId: guidedPractice.exerciseId,
            tone,
            timestamp: Date.now(),
            acousticFeatures: features,
            feedbackCode: result.primary.code,
            analysisReliability: features.reliability,
            pitchAnalysis: learnerResult,
          },
        })
      }
    } catch (problem) {
      if (mountedRef.current) {
        setAnalysis(null)
        setAnalysisError(problem instanceof Error
          ? problem.message
          : 'Could not decode the learner recording for local pitch analysis.')
      }
    } finally {
      if (mountedRef.current) setAnalyzing(false)
    }
  }

  function discard() {
    recording.discard()
    setAnalysis(null)
    setReferenceAnalysis(null)
    setSelectedEvidenceId(null)
    setAnalysisError('')
    setReferenceAnalysisWarning('')
  }

  function listenToReference() {
    if (recording.recording || recording.requesting || recording.playing || referenceAudio.playing
      || analyzing || referenceLoading || !referenceAudio.available(reference)) return
    void referenceAudio.play(reference)
  }

  function startRecording() {
    if (referenceAudio.playing) return
    setAnalysis(null)
    setReferenceAnalysis(null)
    setSelectedEvidenceId(null)
    setAnalysisError('')
    setReferenceAnalysisWarning('')
    void recording.startRecording()
  }

  function listenToRecording() {
    if (referenceAudio.playing || recording.recording || recording.requesting) return
    void recording.playRecording()
  }

  function recordAgain() {
    discard()
    void recording.startRecording()
  }

  function startGuidedRecording() {
    dispatchGuidedPractice({ type: 'attempt-started' })
    startRecording()
  }

  function recordGuidedAttemptAgain() {
    dispatchGuidedPractice({ type: 'attempt-started' })
    recordAgain()
  }

  function chooseBrowserFallback() {
    if (analyzing || referenceAudio.playing) return
    setUseBrowserFallback(true)
    setReferenceAnalysis(null)
    setSelectedEvidenceId(null)
    setReferenceAnalysisWarning('Browser TTS is available for listening only; measured reference F0 comparison is unavailable.')
  }

  function chooseLocalReference() {
    if (analyzing || referenceAudio.playing) return
    setUseBrowserFallback(false)
    setReferenceAnalysis(null)
    setSelectedEvidenceId(null)
    setReferenceAnalysisWarning('')
  }

  return <section className="space-y-5" aria-labelledby="production-heading">
    <div>
      <p className="eyebrow">Tone Production</p>
      <h2 className="mt-1 text-2xl font-semibold" id="production-heading">Tone Production Explorer</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Follow the practice steps to hear a reference, record one syllable, and inspect its measured pitch. This tool describes acoustic observations; it does not grade or classify your pronunciation.
      </p>
    </div>

    <div role="group" aria-label="Production practice mode" className="flex flex-wrap gap-2">
      <button type="button" className={practiceMode === 'free' ? 'button button-primary' : 'button button-secondary'}
        aria-pressed={practiceMode === 'free'} disabled={analyzing}
        onClick={() => setPracticeMode('free')}>Free Exploration</button>
      <button type="button" className={practiceMode === 'guided' ? 'button button-primary' : 'button button-secondary'}
        aria-pressed={practiceMode === 'guided'} disabled={analyzing}
        onClick={() => setPracticeMode('guided')}>Guided Practice</button>
    </div>

    <div hidden={practiceMode !== 'free'} className="space-y-5">
    <section className="panel space-y-4" aria-labelledby="step-1-heading">
      <div>
        <p className="eyebrow">Step 1</p>
        <h3 className="mt-1 text-lg font-semibold" id="step-1-heading">Choose syllable and tone</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
        <label className="block text-sm font-medium">
          Syllable and target tone
          <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
            value={tone} disabled={recording.recording || recording.requesting || Boolean(recording.blob) || referenceAudio.playing || analyzing}
            onChange={event => {
              const nextTone = toneDefinitions.find(item => item.tone === Number(event.currentTarget.value))
              if (nextTone) changeTone(nextTone.tone)
            }}>
            {toneDefinitions.map(item => <option value={item.tone} key={item.tone}>
              Tone {item.tone} · {item.pinyin} · {item.hanzi}
            </option>)}
          </select>
        </label>
        <div className="rounded-xl bg-[#f7f9f5] p-3">
          <p className="text-sm font-semibold">Tone {selectedTone.tone} · {selectedTone.description}</p>
          <p className="mt-1 text-3xl" lang="zh-Hans">{selectedTone.hanzi}
            <span className="ml-3 text-xl" lang="zh-Latn-pinyin">{selectedTone.pinyin}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">The selected tone is a practice target, not an automatic correctness judgment.</p>
        </div>
      </div>
    </section>

    <section className="panel space-y-3" aria-labelledby="step-2-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Step 2</p>
          <h3 className="mt-1 text-lg font-semibold" id="step-2-heading">Listen to the reference</h3>
        </div>
        <span className="rounded-full bg-[#fff7e8] px-3 py-1 text-xs font-semibold text-[#704d17]">{referenceLabel}</span>
      </div>
      {referenceLoading
        ? <p className="text-sm text-slate-600" role="status">Checking for generated local TTS references…</p>
        : reference.source === 'browser-tts'
          ? <p className="text-sm text-slate-600">
            No generated local audio is available for this tone. Browser TTS is for listening only; its PCM is not exposed here, so measured reference F0 comparison is unavailable.
          </p>
          : <p className="text-sm text-slate-600">
            This locally generated voice is synthetic, not a phonetically authoritative or human-speaker reference.
            {reference.voiceName && ` Voice: ${reference.voiceName}.`}
          </p>}
      {!referenceLoading && reference.source === 'browser-tts' && <p className="text-sm text-slate-600" role="status" aria-live="polite">
        {referenceAudio.playing ? 'Playing Browser TTS prototype…' : referenceAudio.status}
      </p>}
      {!referenceLoading && reference.source !== 'browser-tts' && <p className="text-sm text-slate-600" role="status" aria-live="polite">
        {referenceAudio.playing ? `Playing ${referenceLabel}…` : `Ready · ${reference.language ?? 'local audio'}`}
      </p>}
      {referenceCatalogWarning && <p role="status" className="text-sm text-[#704d17]">{referenceCatalogWarning}</p>}
      {referenceAudio.error && <p role="alert" className="text-sm text-[#8f3b2e]">{referenceAudio.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-primary"
          disabled={!referenceAudio.available(reference) || referenceAudio.playing || recording.recording
            || recording.requesting || recording.playing || analyzing || referenceLoading}
          onClick={listenToReference}>
          Listen to reference
        </button>
        {localReference && !useBrowserFallback && <button type="button" className="button button-secondary"
          disabled={referenceAudio.playing || recording.recording || recording.requesting || recording.playing || analyzing}
          onClick={chooseBrowserFallback}>
          Use Browser TTS fallback
        </button>}
        {localReference && useBrowserFallback && <button type="button" className="button button-secondary"
          disabled={referenceAudio.playing || analyzing} onClick={chooseLocalReference}>
          Use local TTS reference
        </button>}
        {referenceAudio.playing && <button type="button" className="button button-secondary" onClick={referenceAudio.stop}>
          Stop reference
        </button>}
      </div>
    </section>

    <section className="panel space-y-3" aria-labelledby="step-3-heading">
      <div>
        <p className="eyebrow">Step 3</p>
        <h3 className="mt-1 text-lg font-semibold" id="step-3-heading">Record your pronunciation</h3>
      </div>
      {!recording.supported && <p role="status" className="rounded-lg bg-[#fff7e8] p-3 text-sm text-[#704d17]">
        Microphone recording is not supported in this browser. Use a current browser on HTTPS or localhost.
      </p>}
      {recording.error && <p role="alert" className="text-sm text-[#8f3b2e]">{recording.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!recording.recording && !recording.blob && <button type="button" className="button button-primary"
          disabled={!recording.supported || recording.playing || referenceAudio.playing || recording.requesting}
          onClick={startRecording}>
          {recording.requesting ? 'Requesting microphone…' : 'Record pronunciation'}
        </button>}
        {recording.recording && <button type="button" className="button button-primary" onClick={recording.stopRecording}>
          Stop recording
        </button>}
      </div>
      {recording.recording && <p className="text-sm font-semibold text-[#8f3b2e]" role="status" aria-live="polite">
        Recording · {timer(recording.elapsedSeconds)} · stops automatically at five seconds
      </p>}
      {recording.requesting && <p className="text-sm text-slate-600" role="status">Waiting for microphone permission…</p>}
      {!recording.recording && !recording.blob && !recording.requesting && recording.supported && <p className="text-sm text-slate-600">
        Audio remains in this page only. Recording is limited to five seconds; discard it when finished.
      </p>}
    </section>

    <section className="panel space-y-3" aria-labelledby="step-4-heading">
      <div>
        <p className="eyebrow">Step 4</p>
        <h3 className="mt-1 text-lg font-semibold" id="step-4-heading">Listen to your recording</h3>
      </div>
      <p className="text-sm text-slate-600" role="status">
        {recording.playing ? 'Playing your local recording…' : recording.blob
          ? `Local recording ready · ${timer(recording.elapsedSeconds)} · not uploaded or saved automatically`
          : 'Record a pronunciation first to enable playback.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary"
          disabled={!recording.blob || recording.recording || recording.requesting || recording.playing || referenceAudio.playing}
          onClick={listenToRecording}>
          Listen to my recording
        </button>
        {recording.playing && <button type="button" className="button button-secondary" onClick={recording.stopPlayback}>
          Stop recording playback
        </button>}
        {recording.blob && <button type="button" className="button button-secondary"
          disabled={recording.playing || referenceAudio.playing || analyzing} onClick={discard}>
          Discard recording
        </button>}
      </div>
    </section>

    <section className="panel space-y-4" aria-labelledby="step-5-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Step 5</p>
          <h3 className="mt-1 text-xl font-semibold" id="step-5-heading">Compare measured pitch trajectories</h3>
        </div>
        <p className="text-sm text-slate-600" role="status" aria-live="polite">
          {analyzing ? 'Analysis in progress…' : analysis
            ? referenceAnalysis ? referenceCanPlot ? 'Both recordings analyzed · measured F0' : 'Reference analyzed · too few reliable frames'
              : 'Learner analyzed · measured reference F0 unavailable'
            : 'Not analyzed yet'}
        </p>
      </div>
      <button type="button" className="button button-primary"
        disabled={!recording.blob || recording.recording || recording.playing || referenceAudio.playing || analyzing || referenceLoading}
        onClick={() => void analyze()}>
        {analyzing ? 'Analyzing locally…' : reference.source === 'browser-tts' ? 'Analyze learner recording' : 'Analyze both recordings'}
      </button>
      {analysisError && <p role="alert" className="text-sm text-[#8f3b2e]">{analysisError}</p>}
      {referenceAnalysisWarning && <p role="status" className="rounded-lg bg-[#fff7e8] p-3 text-sm text-[#704d17]">
        {referenceAnalysisWarning}
      </p>}
      {analysis && <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm font-semibold">Measured learner F0 and, when available, measured reference F0</p>
          <label className="text-sm font-medium">
            Display
            <select className="ml-2 rounded-lg border border-[#cdd9cd] bg-white p-2" value={mode}
              onChange={event => setMode(event.currentTarget.value === 'absolute' ? 'absolute' : 'relative')}>
              <option value="relative">Relative pitch</option>
              <option value="absolute">Absolute pitch (Hz)</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-600">
          {mode === 'absolute'
            ? 'Both trajectories use the same Hz axis. Absolute pitch differences are preserved; you do not need to match the synthetic voice’s pitch.'
            : 'Each recording is normalized independently to its own median F0. This emphasizes contour shape, not absolute pitch.'}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showReference} disabled={!referenceCanPlot}
              onChange={event => setShowReference(event.currentTarget.checked)} />
            Reference trajectory
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showLearner}
              onChange={event => setShowLearner(event.currentTarget.checked)} />
            Learner trajectory
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showSchematic}
              onChange={event => setShowSchematic(event.currentTarget.checked)} />
            Schematic teaching contour
          </label>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-[#f7f9f5] p-3"><dt className="text-slate-600">Duration</dt><dd className="mt-1 font-semibold">{analysis.duration.toFixed(2)} s</dd></div>
          <div className="rounded-lg bg-[#f7f9f5] p-3"><dt className="text-slate-600">Voiced frames</dt><dd className="mt-1 font-semibold">{analysis.voicedFrameCount} · {analysis.voicedPercent}%</dd></div>
          <div className="rounded-lg bg-[#f7f9f5] p-3"><dt className="text-slate-600">Median F0</dt><dd className="mt-1 font-semibold">{analysis.medianF0Hz === null ? 'Unavailable' : `${analysis.medianF0Hz.toFixed(1)} Hz`}</dd></div>
          <div className="rounded-lg bg-[#f7f9f5] p-3"><dt className="text-slate-600">Reliable F0 range</dt><dd className="mt-1 font-semibold">
            {analysis.minF0Hz === null || analysis.maxF0Hz === null ? 'Unavailable' : `${analysis.minF0Hz.toFixed(1)}–${analysis.maxF0Hz.toFixed(1)} Hz`}
          </dd></div>
        </dl>
        {referenceAnalysis && <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-[#fff7e8] p-3">
            <dt className="text-slate-600">Reference median F0 · {referenceLabel}</dt>
            <dd className="mt-1 font-semibold">{referenceAnalysis.medianF0Hz === null
              ? 'Unavailable' : `${referenceAnalysis.medianF0Hz.toFixed(1)} Hz`}</dd>
          </div>
          <div className="rounded-lg bg-[#fff7e8] p-3">
            <dt className="text-slate-600">Reference voiced frames</dt>
            <dd className="mt-1 font-semibold">{referenceAnalysis.voicedFrameCount} · {referenceAnalysis.voicedPercent}%</dd>
          </div>
        </dl>}
        <p className="text-xs text-slate-600">
          F0 values are measurements from audio, not ground truth. The 0–100% time axis independently normalizes each recording's reliable voiced interval; this approximate alignment does not establish phonetic segment correspondence. Hover over points for original timestamps. Unvoiced gaps remain disconnected.
        </p>
        <F0TrajectoryChart learnerAnalysis={analysis} referenceAnalysis={referenceAnalysis}
          referenceLabel={referenceLabel} mode={mode} showLearner={showLearner} showReference={showReference}
          learnerFeatures={learnerFeatures} referenceFeatures={referenceFeatures}
          showFeatureMarkers={showAcousticMarkers} evidenceHighlight={evidenceHighlight} />
        {toneFeedback && <ToneFeedbackPanel tone={tone} result={toneFeedback}
          selectedEvidenceId={selectedEvidenceId}
          highlightableEvidenceIds={highlightableEvidenceIds}
          onSelectEvidence={setSelectedEvidenceId}
          onClearHighlight={() => setSelectedEvidenceId(null)}
          onPracticeRecommendation={practiceFeedback} />}
        {showSchematic && <div className="grid items-center gap-3 rounded-xl bg-[#f7f9f5] p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <p className="text-sm text-slate-600">
            Schematic teaching contour for Tone {tone}; illustrative only, not measured TTS or speaker data.
          </p>
          <ToneContour tone={tone} showLabel={false} />
        </div>}
        {feedback.length > 0 && <details className="rounded-lg border border-[#d7e0d7] p-3">
          <summary className="cursor-pointer font-semibold">Additional acoustic comparison notes</summary>
          <div className="mt-2 space-y-2">
            {feedback.map(message => <p key={message} className="text-sm text-slate-700">{message}</p>)}
          </div>
        </details>}
      </>}
      <AcousticInspector learnerFeatures={learnerFeatures} referenceFeatures={referenceFeatures}
        referenceLabel={referenceLabel} comparison={acousticComparison}
        showMarkers={showAcousticMarkers} onShowMarkersChange={setShowAcousticMarkers} />
    </section>

    <section className="panel space-y-3" aria-labelledby="step-6-heading">
      <div>
        <p className="eyebrow">Step 6</p>
        <h3 className="mt-1 text-lg font-semibold" id="step-6-heading">Repeat the practice</h3>
      </div>
      <p className="text-sm text-slate-600">Listen to {referenceLabel} again, or record another take. Any schematic contour remains illustrative and is not measured reference F0.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary"
          disabled={!referenceAudio.available(reference) || referenceAudio.playing || recording.recording || recording.requesting || recording.playing || analyzing}
          onClick={listenToReference}>Listen to reference again</button>
        {recording.blob && <button type="button" className="button button-primary"
          disabled={recording.playing || referenceAudio.playing || analyzing || !recording.supported} onClick={recordAgain}>
          Record again
        </button>}
      </div>
    </section>
    </div>

    <div hidden={practiceMode !== 'guided'}>
      <GuidedPracticePanel state={guidedPractice} tone={tone} reference={reference}
        referenceAudio={referenceAudio} referenceLoading={referenceLoading}
        referenceAnalysis={referenceAnalysis} referenceCanPlot={referenceCanPlot}
        referenceAnalysisWarning={referenceAnalysisWarning} analysisError={analysisError}
        analyzing={analyzing}
        recording={recording} mode={mode}
        onModeChange={setMode} onToneChange={changeTone}
        onSelectExercise={selectGuidedExercise}
        onStartRecording={startGuidedRecording}
        onStopRecording={recording.stopRecording}
        onRecordAgain={recordGuidedAttemptAgain}
        onDiscardRecording={discard}
        onAnalyze={() => void analyze()}
        onSaveReflection={(attemptId, reflection: PracticeReflection) =>
          dispatchGuidedPractice({ type: 'save-reflection', attemptId, reflection })}
        onSelectComparison={attemptIds =>
          dispatchGuidedPractice({ type: 'select-comparison', attemptIds })}
        onClearHistory={() => dispatchGuidedPractice({ type: 'clear-history' })} />
    </div>
  </section>
}

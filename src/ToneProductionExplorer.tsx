import { useEffect, useRef, useState } from 'react'
import { decodeAndAnalyze } from './audioDecoder'
import { F0TrajectoryChart } from './F0TrajectoryChart'
import type { PitchDisplayMode } from './F0TrajectoryChart'
import { pitchFeedback } from './pitchAnalysis'
import type { PitchAnalysis } from './pitchAnalysis'
import { schematicToneReference } from './toneReferences'
import type { ToneReferenceAudioProvider } from './toneReferences'
import { toneDefinition, toneDefinitions } from './tones'
import type { MandarinTone } from './tones'
import { MAX_RECORDING_SECONDS } from './recordingSupport'
import { useToneRecording } from './useToneRecording'

function timer(seconds: number) {
  return `${seconds.toFixed(1)} / ${MAX_RECORDING_SECONDS.toFixed(1)} seconds`
}

export function ToneProductionExplorer({ referenceAudio }: { referenceAudio: ToneReferenceAudioProvider }) {
  const [tone, setTone] = useState<MandarinTone>(1)
  const [mode, setMode] = useState<PitchDisplayMode>('relative')
  const [analysis, setAnalysis] = useState<PitchAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const mountedRef = useRef(false)
  const recording = useToneRecording()
  const selectedTone = toneDefinition(tone)
  const reference = schematicToneReference(tone)
  const feedback = analysis
    ? [...new Set([...pitchFeedback(analysis), ...analysis.warnings])]
    : []

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      referenceAudio.stop()
    }
  }, [referenceAudio.stop])

  async function analyze() {
    if (!recording.blob || recording.recording || recording.playing || referenceAudio.playing || analyzing) return
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const result = await decodeAndAnalyze(recording.blob)
      if (mountedRef.current) setAnalysis(result)
    } catch (problem) {
      if (mountedRef.current) setAnalysisError(problem instanceof Error
        ? problem.message
        : 'Could not decode the recording for local pitch analysis.')
    } finally {
      if (mountedRef.current) setAnalyzing(false)
    }
  }

  function discard() {
    recording.discard()
    setAnalysis(null)
    setAnalysisError('')
  }

  function listenToReference() {
    if (recording.recording || recording.requesting || recording.playing || referenceAudio.playing
      || !referenceAudio.available(reference)) return
    void referenceAudio.play(reference)
  }

  function startRecording() {
    if (referenceAudio.playing) return
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

  return <section className="space-y-5" aria-labelledby="production-heading">
    <div>
      <p className="eyebrow">Tone Production</p>
      <h2 className="mt-1 text-2xl font-semibold" id="production-heading">Tone Production Explorer</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Follow the practice steps to hear a reference, record one syllable, and inspect its measured pitch. This tool describes acoustic observations; it does not grade or classify your pronunciation.
      </p>
    </div>

    <section className="panel space-y-4" aria-labelledby="step-1-heading">
      <div>
        <p className="eyebrow">Step 1</p>
        <h3 className="mt-1 text-lg font-semibold" id="step-1-heading">Choose syllable and tone</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
        <label className="block text-sm font-medium">
          Syllable and target tone
          <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
            value={tone} disabled={recording.recording || recording.requesting || Boolean(recording.blob) || referenceAudio.playing}
            onChange={event => {
              const nextTone = toneDefinitions.find(item => item.tone === Number(event.currentTarget.value))
              if (nextTone) setTone(nextTone.tone)
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
        <span className="rounded-full bg-[#fff7e8] px-3 py-1 text-xs font-semibold text-[#704d17]">Browser TTS — prototype</span>
      </div>
      <p className="text-sm text-slate-600">
        This reference is synthesized by your browser, not a validated native-speaker recording. Speech synthesis does not expose its audio PCM here, so no TTS F0 is measured or plotted.
      </p>
      <p className="text-sm text-slate-600" role="status" aria-live="polite">
        {referenceAudio.playing ? 'Playing Browser TTS reference…' : referenceAudio.status}
      </p>
      {referenceAudio.error && <p role="alert" className="text-sm text-[#8f3b2e]">{referenceAudio.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-primary"
          disabled={!referenceAudio.available(reference) || referenceAudio.playing || recording.recording
            || recording.requesting || recording.playing}
          onClick={listenToReference}>
          Listen to reference
        </button>
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
          <h3 className="mt-1 text-xl font-semibold" id="step-5-heading">Inspect your pitch trajectory</h3>
        </div>
        <p className="text-sm text-slate-600" role="status" aria-live="polite">
          {analyzing ? 'Analysis in progress…' : analysis ? 'Analysis ready · measured learner F0' : 'Not analyzed yet'}
        </p>
      </div>
      <button type="button" className="button button-primary"
        disabled={!recording.blob || recording.recording || recording.playing || referenceAudio.playing || analyzing}
        onClick={() => void analyze()}>
        {analyzing ? 'Analyzing locally…' : 'Analyze pronunciation'}
      </button>
      {analysisError && <p role="alert" className="text-sm text-[#8f3b2e]">{analysisError}</p>}
      {analysis && <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm font-semibold">Measured learner F0 · schematic teaching contour remains illustrative only</p>
          <label className="text-sm font-medium">
            Display
            <select className="ml-2 rounded-lg border border-[#cdd9cd] bg-white p-2" value={mode}
              onChange={event => setMode(event.currentTarget.value === 'absolute' ? 'absolute' : 'relative')}>
              <option value="relative">Relative pitch</option>
              <option value="absolute">Absolute pitch (Hz)</option>
            </select>
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
        <p className="text-xs text-slate-600">
          Learner F0 is measured from your recording, not ground truth. The schematic is a teaching contour, not TTS data or a real speaker. Relative pitch is calculated against your recording's median; the time axis is normalized and hover points for original timestamps.
        </p>
        <F0TrajectoryChart analysis={analysis} mode={mode} reference={reference} />
        <div className="panel space-y-2" aria-label="Descriptive feedback">
          <h4 className="font-semibold">What the detector observed</h4>
          {feedback.map(message => <p key={message} className="text-sm text-slate-700">{message}</p>)}
        </div>
      </>}
    </section>

    <section className="panel space-y-3" aria-labelledby="step-6-heading">
      <div>
        <p className="eyebrow">Step 6</p>
        <h3 className="mt-1 text-lg font-semibold" id="step-6-heading">Repeat the practice</h3>
      </div>
      <p className="text-sm text-slate-600">Listen to the browser-TTS prototype again, or record another take. The TTS audio and schematic contour are not measured reference F0.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary"
          disabled={!referenceAudio.available(reference) || referenceAudio.playing || recording.recording || recording.requesting || recording.playing}
          onClick={listenToReference}>Listen to reference again</button>
        {recording.blob && <button type="button" className="button button-primary"
          disabled={recording.playing || referenceAudio.playing || analyzing || !recording.supported} onClick={recordAgain}>
          Record again
        </button>}
      </div>
    </section>
  </section>
}

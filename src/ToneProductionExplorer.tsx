import { useEffect, useRef, useState } from 'react'
import { decodeAndAnalyze } from './audioDecoder'
import { F0TrajectoryChart } from './F0TrajectoryChart'
import type { PitchDisplayMode } from './F0TrajectoryChart'
import { pitchFeedback } from './pitchAnalysis'
import type { PitchAnalysis } from './pitchAnalysis'
import { schematicToneReference } from './toneReferences'
import { toneDefinition, toneDefinitions } from './tones'
import type { MandarinTone } from './tones'
import { MAX_RECORDING_SECONDS } from './recordingSupport'
import { useToneRecording } from './useToneRecording'

function timer(seconds: number) {
  return `${seconds.toFixed(1)} / ${MAX_RECORDING_SECONDS.toFixed(1)} seconds`
}

export function ToneProductionExplorer() {
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
    return () => { mountedRef.current = false }
  }, [])

  async function analyze() {
    if (!recording.blob || recording.recording || recording.playing || analyzing) return
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

  function recordAgain() {
    discard()
    void recording.startRecording()
  }

  return <section className="space-y-5" aria-labelledby="production-heading">
    <div>
      <p className="eyebrow">Tone Production</p>
      <h2 className="mt-1 text-2xl font-semibold" id="production-heading">Tone Production Explorer</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Record one isolated syllable and inspect its measured pitch trajectory. This tool describes acoustic observations; it does not grade or classify your pronunciation.
      </p>
    </div>
    <div className="panel space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
        <label className="block text-sm font-medium">
          Syllable and target tone
          <select className="mt-1 block w-full rounded-lg border border-[#cdd9cd] bg-white p-2"
            value={tone} disabled={recording.recording || Boolean(recording.blob)}
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
      {!recording.supported && <p role="status" className="rounded-lg bg-[#fff7e8] p-3 text-sm text-[#704d17]">
        Microphone recording is not supported in this browser. Use a current browser on HTTPS or localhost.
      </p>}
      {recording.error && <p role="alert" className="text-sm text-[#8f3b2e]">{recording.error}</p>}
      {analysisError && <p role="alert" className="text-sm text-[#8f3b2e]">{analysisError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!recording.recording && !recording.blob && <button type="button" className="button button-primary"
          disabled={!recording.supported || recording.playing || recording.requesting}
          onClick={() => void recording.startRecording()}>
          {recording.requesting ? 'Requesting microphone…' : 'Start recording'}
        </button>}
        {recording.recording && <button type="button" className="button button-primary" onClick={recording.stopRecording}>
          Stop recording
        </button>}
        {recording.blob && <>
          <button type="button" className="button button-secondary" disabled={recording.recording || recording.playing}
            onClick={() => void recording.playRecording()}>
            Play recording
          </button>
          <button type="button" className="button button-primary"
            disabled={recording.recording || recording.playing || analyzing} onClick={() => void analyze()}>
            {analyzing ? 'Analyzing locally…' : 'Analyze recording'}
          </button>
          <button type="button" className="button button-secondary"
            disabled={recording.playing || analyzing || !recording.supported} onClick={recordAgain}>
            Record again
          </button>
          <button type="button" className="button button-secondary"
            disabled={recording.playing || analyzing} onClick={discard}>
            Discard recording
          </button>
        </>}
        {recording.playing && <button type="button" className="button button-secondary" onClick={recording.stopPlayback}>
          Stop playback
        </button>}
      </div>
      {recording.recording && <p className="text-sm font-semibold text-[#8f3b2e]" role="status" aria-live="polite">
        Recording · {timer(recording.elapsedSeconds)} · stops automatically at five seconds
      </p>}
      {recording.blob && <p className="text-sm text-slate-600" role="status">
        Local recording ready · {timer(recording.elapsedSeconds)} · not uploaded or saved automatically
      </p>}
      {!recording.recording && !recording.blob && recording.supported && <p className="text-sm text-slate-600">
        Audio remains in this page only. Recording is limited to five seconds; discard it when finished.
      </p>}
    </div>

    {analysis && <section className="space-y-4" aria-labelledby="analysis-heading">
      <div className="panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Local analysis</p>
            <h3 className="mt-1 text-xl font-semibold" id="analysis-heading">Measured pitch trajectory</h3>
          </div>
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
          F0 estimates are measurements from this recording, not ground truth. Relative pitch is calculated against its median. The time axis is normalized; hover over points for original timestamps.
        </p>
        <F0TrajectoryChart analysis={analysis} mode={mode} reference={reference} />
      </div>
      <div className="panel space-y-2" aria-label="Descriptive feedback">
        <h3 className="font-semibold">What the detector observed</h3>
        {feedback.map(message => <p key={message} className="text-sm text-slate-700">{message}</p>)}
      </div>
    </section>}
  </section>
}

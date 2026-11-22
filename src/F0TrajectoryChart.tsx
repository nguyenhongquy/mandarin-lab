import { DEFAULT_PITCH_OPTIONS, relativeSemitones } from './pitchAnalysis'
import type { PitchAnalysis, PitchFrame } from './pitchAnalysis'
import { splitPitchSegments } from './pitchPlot'
import type { ToneReference } from './toneReferences'
import { ToneContour } from './ToneContour'

export type PitchDisplayMode = 'absolute' | 'relative'

const chart = { width: 720, height: 320, left: 60, right: 20, top: 20, bottom: 52 }
const plotWidth = chart.width - chart.left - chart.right
const plotHeight = chart.height - chart.top - chart.bottom

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  return sorted.length % 2 ? upper ?? null : lower === undefined || upper === undefined ? null : (lower + upper) / 2
}

function xPosition(time: number, duration: number) {
  return chart.left + (duration ? Math.max(0, Math.min(1, time / duration)) : 0) * plotWidth
}

function yPosition(value: number, mode: PitchDisplayMode) {
  const minimum = mode === 'absolute' ? DEFAULT_PITCH_OPTIONS.minF0Hz : -12
  const maximum = mode === 'absolute' ? DEFAULT_PITCH_OPTIONS.maxF0Hz : 12
  const clamped = Math.max(minimum, Math.min(maximum, value))
  return chart.top + (maximum - clamped) / (maximum - minimum) * plotHeight
}

function valueFor(frame: PitchFrame, mode: PitchDisplayMode, medianF0Hz: number | null): number | null {
  if (frame.f0Hz === null || frame.confidence < DEFAULT_PITCH_OPTIONS.confidenceThreshold) return null
  return mode === 'absolute' ? frame.f0Hz : relativeSemitones(frame.f0Hz, medianF0Hz)
}

function pathFor(frames: readonly PitchFrame[], mode: PitchDisplayMode, medianF0Hz: number | null, duration: number) {
  return splitPitchSegments(frames).map(segment => segment.flatMap((frame, index) => {
    const value = valueFor(frame, mode, medianF0Hz)
    if (value === null) return []
    return [`${index === 0 ? 'M' : 'L'} ${xPosition(frame.time, duration).toFixed(2)} ${yPosition(value, mode).toFixed(2)}`]
  }).join(' '))
}

function unvoicedBands(frames: readonly PitchFrame[], duration: number) {
  const step = frames.length > 1 ? frames[1]!.time - frames[0]!.time : 0.01
  const bands: { start: number; end: number }[] = []
  let start: number | null = null
  for (const frame of frames) {
    const unvoiced = frame.f0Hz === null || frame.confidence < DEFAULT_PITCH_OPTIONS.confidenceThreshold
    if (unvoiced && start === null) start = Math.max(0, frame.time - step / 2)
    if (!unvoiced && start !== null) {
      bands.push({ start, end: Math.min(duration, frame.time - step / 2) })
      start = null
    }
  }
  if (start !== null) bands.push({ start, end: duration })
  return bands
}

function chartTicks(mode: PitchDisplayMode) {
  return mode === 'absolute'
    ? [100, 200, 300, 400, 500]
    : [-12, -6, 0, 6, 12]
}

export function F0TrajectoryChart({ analysis, mode, reference }: {
  analysis: PitchAnalysis
  mode: PitchDisplayMode
  reference: ToneReference
}) {
  const measuredReferenceFrames = reference.source === 'recorded' ? reference.f0Trajectory ?? [] : []
  const measuredReferenceMedian = median(measuredReferenceFrames.flatMap(frame =>
    frame.f0Hz !== null && frame.confidence >= DEFAULT_PITCH_OPTIONS.confidenceThreshold ? [frame.f0Hz] : []))
  const referencePaths = measuredReferenceFrames.length
    ? pathFor(measuredReferenceFrames, mode, measuredReferenceMedian, measuredReferenceFrames.at(-1)?.time ?? analysis.duration)
    : []
  const learnerPaths = pathFor(analysis.frames, mode, analysis.medianF0Hz, analysis.duration)
  const ticks = chartTicks(mode)
  const bands = unvoicedBands(analysis.frames, analysis.duration)

  return <div className="space-y-3">
    <figure>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-auto w-full"
        role="img" aria-label={mode === 'absolute'
          ? 'Measured learner pitch trajectory in Hertz, over normalized recording time'
          : 'Measured learner pitch trajectory in semitones relative to the recording median'}>
        {bands.map((band, index) => <rect key={index} x={xPosition(band.start, analysis.duration)} y={chart.top}
          width={Math.max(1, xPosition(band.end, analysis.duration) - xPosition(band.start, analysis.duration))}
          height={plotHeight} fill="#eef1ef" />)}
        {ticks.map(tick => <g key={tick}>
          <line x1={chart.left} y1={yPosition(tick, mode)} x2={chart.width - chart.right} y2={yPosition(tick, mode)} stroke="#e1e7e2" />
          <text x={chart.left - 8} y={yPosition(tick, mode) + 4} textAnchor="end" className="pitch-axis-label">
            {mode === 'absolute' ? `${tick}` : `${tick > 0 ? '+' : ''}${tick}`}
          </text>
        </g>)}
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => <g key={fraction}>
          <line x1={chart.left + fraction * plotWidth} y1={chart.top} x2={chart.left + fraction * plotWidth}
            y2={chart.height - chart.bottom} stroke="#f0f2f0" />
          <text x={chart.left + fraction * plotWidth} y={chart.height - chart.bottom + 18}
            textAnchor="middle" className="pitch-axis-label">{Math.round(fraction * 100)}%</text>
        </g>)}
        <line x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.height - chart.bottom} className="contour-axis" />
        <line x1={chart.left} y1={chart.height - chart.bottom} x2={chart.width - chart.right}
          y2={chart.height - chart.bottom} className="contour-axis" />
        {referencePaths.map((path, index) => <path key={`reference-${index}`} d={path} fill="none"
          stroke="#c26b19" strokeWidth="2.5" strokeDasharray={mode === 'relative' ? undefined : '6 4'} />)}
        {learnerPaths.map((path, index) => <path key={`learner-${index}`} d={path} fill="none"
          stroke="#24654e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
        {analysis.frames.map((frame, index) => {
          const value = valueFor(frame, mode, analysis.medianF0Hz)
          if (value === null) return null
          return <circle key={index} cx={xPosition(frame.time, analysis.duration)} cy={yPosition(value, mode)} r="1.7" fill="#153c31">
            <title>{`${frame.time.toFixed(3)} seconds · ${frame.f0Hz?.toFixed(1)} Hz · confidence ${(frame.confidence * 100).toFixed(0)}%`}</title>
          </circle>
        })}
        <text x={(chart.left + chart.width - chart.right) / 2} y={chart.height - 8} textAnchor="middle" className="pitch-axis-label">
          Time (normalized; hover points for seconds)
        </text>
        <text x="15" y={chart.height / 2} textAnchor="middle" transform={`rotate(-90 15 ${chart.height / 2})`}
          className="pitch-axis-label">{mode === 'absolute' ? 'F0 (Hz)' : 'Relative pitch (semitones)'}</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        <span><i className="legend-line measured" />Measured learner F0</span>
        <span><i className="legend-swatch" />Unvoiced or below confidence threshold</span>
        {referencePaths.length > 0 && <span><i className="legend-line reference" />Recorded reference F0</span>}
      </figcaption>
    </figure>
    {analysis.voicedFrameCount === 0 && <p role="status" className="text-sm text-slate-600">
      No reliable pitch frames are available to plot.
    </p>}
    {mode === 'absolute' && reference.source === 'schematic' && <p className="text-xs text-slate-600">
      No schematic is drawn on the measured Hz axis.
    </p>}
    {mode === 'relative' && reference.source === 'schematic' && <div className="grid items-center gap-3 rounded-xl bg-[#f7f9f5] p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <p className="text-sm text-slate-600">
        Illustrative teaching reference for Tone {reference.tone}; this schematic is not measured data and does not represent a particular speaker.
      </p>
      <ToneContour tone={reference.tone} showLabel={false} />
    </div>}
  </div>
}

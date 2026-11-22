import { DEFAULT_PITCH_OPTIONS } from './pitchAnalysis'
import type { PitchAnalysis } from './pitchAnalysis'
import { normalizePitchAnalysis } from './pitchComparison'
import type { ComparisonFrame } from './pitchComparison'
import { splitPitchSegments } from './pitchPlot'

export type PitchDisplayMode = 'absolute' | 'relative'

const chart = { width: 720, height: 320, left: 60, right: 20, top: 20, bottom: 52 }
const plotWidth = chart.width - chart.left - chart.right
const plotHeight = chart.height - chart.top - chart.bottom

function xPosition(normalizedTime: number) {
  return chart.left + Math.max(0, Math.min(1, normalizedTime)) * plotWidth
}

function yPosition(value: number, mode: PitchDisplayMode) {
  const minimum = mode === 'absolute' ? DEFAULT_PITCH_OPTIONS.minF0Hz : -12
  const maximum = mode === 'absolute' ? DEFAULT_PITCH_OPTIONS.maxF0Hz : 12
  const clamped = Math.max(minimum, Math.min(maximum, value))
  return chart.top + (maximum - clamped) / (maximum - minimum) * plotHeight
}

function valueFor(frame: ComparisonFrame, mode: PitchDisplayMode): number | null {
  if (frame.f0Hz === null || frame.confidence < DEFAULT_PITCH_OPTIONS.confidenceThreshold) return null
  return mode === 'absolute' ? frame.f0Hz : frame.relativePitch
}

function pathFor(frames: readonly ComparisonFrame[], mode: PitchDisplayMode): string[] {
  return splitPitchSegments(frames).map(segment => segment.flatMap((frame, index) => {
    const value = valueFor(frame, mode)
    if (value === null) return []
    return [`${index === 0 ? 'M' : 'L'} ${xPosition(frame.normalizedTime).toFixed(2)} ${yPosition(value, mode).toFixed(2)}`]
  }).join(' '))
}

function pointsFor(frames: readonly ComparisonFrame[], mode: PitchDisplayMode, color: string) {
  return frames.flatMap((frame, index) => {
    const value = valueFor(frame, mode)
    if (value === null) return []
    return [<circle key={index} cx={xPosition(frame.normalizedTime)} cy={yPosition(value, mode)} r="1.7" fill={color}>
      <title>{`${frame.time.toFixed(3)} seconds · ${frame.f0Hz?.toFixed(1)} Hz · confidence ${(frame.confidence * 100).toFixed(0)}%`}</title>
    </circle>]
  })
}

function chartTicks(mode: PitchDisplayMode) {
  return mode === 'absolute'
    ? [100, 200, 300, 400, 500]
    : [-12, -6, 0, 6, 12]
}

export function F0TrajectoryChart({ learnerAnalysis, referenceAnalysis, referenceLabel, mode, showLearner, showReference }: {
  learnerAnalysis: PitchAnalysis
  referenceAnalysis: PitchAnalysis | null
  referenceLabel: string
  mode: PitchDisplayMode
  showLearner: boolean
  showReference: boolean
}) {
  const learnerFrames = normalizePitchAnalysis(learnerAnalysis)
  const referenceFrames = referenceAnalysis ? normalizePitchAnalysis(referenceAnalysis) : null
  const learnerPaths = showLearner && learnerFrames ? pathFor(learnerFrames, mode) : []
  const referencePaths = showReference && referenceFrames ? pathFor(referenceFrames, mode) : []
  const ticks = chartTicks(mode)

  return <div className="space-y-3">
    <figure>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-auto w-full"
        role="img" aria-label={mode === 'absolute'
          ? showReference && referenceFrames
            ? `Measured learner and ${referenceLabel} F0 trajectories in Hertz over independently normalized voiced intervals`
            : 'Measured learner F0 trajectory in Hertz over its normalized voiced interval'
          : showReference && referenceFrames
            ? `Measured learner and ${referenceLabel} pitch trajectories in semitones relative to each recording median`
            : 'Measured learner pitch trajectory in semitones relative to its median'}>
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
          stroke="#c26b19" strokeWidth="2.5" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />)}
        {learnerPaths.map((path, index) => <path key={`learner-${index}`} d={path} fill="none"
          stroke="#24654e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
        {showReference && referenceFrames && pointsFor(referenceFrames, mode, '#c26b19')}
        {showLearner && learnerFrames && pointsFor(learnerFrames, mode, '#153c31')}
        <text x={(chart.left + chart.width - chart.right) / 2} y={chart.height - 8} textAnchor="middle" className="pitch-axis-label">
          Voiced interval time (normalized; hover points for original seconds)
        </text>
        <text x="15" y={chart.height / 2} textAnchor="middle" transform={`rotate(-90 15 ${chart.height / 2})`}
          className="pitch-axis-label">{mode === 'absolute' ? 'F0 (Hz)' : 'Relative pitch (semitones)'}</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        {showReference && referenceFrames && <span><i className="legend-line reference" />Measured reference F0 · {referenceLabel}</span>}
        {showLearner && learnerFrames && <span><i className="legend-line measured" />Measured learner F0</span>}
        <span>Unvoiced or low-confidence intervals remain blank; lines do not bridge gaps.</span>
      </figcaption>
    </figure>
    {showReference && referenceAnalysis && !referenceFrames && <p role="status" className="text-sm text-slate-600">
      The reference contains too few reliable voiced frames to plot on the normalized interval.
    </p>}
    {showLearner && !learnerFrames && <p role="status" className="text-sm text-slate-600">
      The learner recording contains too few reliable voiced frames to plot on the normalized interval.
    </p>}
  </div>
}

import { DEFAULT_PITCH_OPTIONS } from './pitchAnalysis'
import type { PitchAnalysis } from './pitchAnalysis'
import { normalizePitchAnalysis, normalizePitchTime } from './pitchComparison'
import type { ComparisonFrame } from './pitchComparison'
import { splitPitchSegments } from './pitchPlot'
import type { ToneAcousticFeatures } from './toneAcoustics'
import type { NormalizedEvidenceInterval, NormalizedFeedbackHighlight } from './feedback/evidenceHighlight.ts'

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

function pointsFor(frames: readonly ComparisonFrame[], mode: PitchDisplayMode, color: string, keyPrefix = 'point') {
  return frames.flatMap((frame, index) => {
    const value = valueFor(frame, mode)
    if (value === null) return []
    return [<circle key={`${keyPrefix}-${index}`} cx={xPosition(frame.normalizedTime)} cy={yPosition(value, mode)} r="1.7" fill={color}>
      <title>{`${frame.time.toFixed(3)} seconds · ${frame.f0Hz?.toFixed(1)} Hz · confidence ${(frame.confidence * 100).toFixed(0)}%`}</title>
    </circle>]
  })
}

function chartTicks(mode: PitchDisplayMode) {
  return mode === 'absolute'
    ? [100, 200, 300, 400, 500]
    : [-12, -6, 0, 6, 12]
}

function evidenceBand(
  interval: NormalizedEvidenceInterval | null,
  color: string,
  label: string,
) {
  if (!interval) return null
  const rightEdge = chart.width - chart.right
  const startX = xPosition(interval.start)
  const endX = xPosition(interval.end)
  const width = Math.max(endX - startX, 6)
  const center = (startX + endX) / 2
  const x = Math.max(chart.left, Math.min(center - width / 2, rightEdge - width))
  return <rect key={label} x={x} y={chart.top} width={width} height={plotHeight}
    fill={color} fillOpacity="0.14" stroke={color} strokeDasharray="4 3">
    <title>{`${label} evidence interval on normalized voiced time`}</title>
  </rect>
}

function featureMarkers(
  analysis: PitchAnalysis,
  features: ToneAcousticFeatures,
  mode: PitchDisplayMode,
  color: string,
  label: string,
) {
  const interval = features.analysisInterval
  const frames = normalizePitchAnalysis(analysis)
  if (!interval || !frames) return null
  const start = normalizePitchTime(analysis, interval.startTime)
  const end = normalizePitchTime(analysis, interval.endTime)
  const midpoint = features.earlyLateBoundaryTime === null
    ? null : normalizePitchTime(analysis, features.earlyLateBoundaryTime)
  const turningTime = features.turningPointTime
  const turningFrame = turningTime === null ? null : frames
    .filter(frame => valueFor(frame, mode) !== null)
    .reduce<ComparisonFrame | null>((nearest, frame) =>
      nearest === null || Math.abs(frame.time - turningTime) < Math.abs(nearest.time - turningTime) ? frame : nearest, null)
  const turningValue = turningFrame ? valueFor(turningFrame, mode) : null
  const turningPosition = turningTime === null ? null : normalizePitchTime(analysis, turningTime)

  return <g aria-label={`${label} acoustic feature markers`}>
    {start !== null && end !== null && <g>
      {end > start && <rect x={xPosition(start)} y={chart.top} width={xPosition(end) - xPosition(start)}
        height={plotHeight} fill={color} opacity="0.05">
        <title>{`${label} selected analysis interval`}</title>
      </rect>}
      <line x1={xPosition(start)} y1={chart.top} x2={xPosition(start)} y2={chart.height - chart.bottom}
        stroke={color} strokeDasharray="3 4" strokeWidth="1.5">
        <title>{`${label} analysis interval start · ${interval.startTime.toFixed(3)} seconds`}</title>
      </line>
      <line x1={xPosition(end)} y1={chart.top} x2={xPosition(end)} y2={chart.height - chart.bottom}
        stroke={color} strokeDasharray="3 4" strokeWidth="1.5">
        <title>{`${label} analysis interval end · ${interval.endTime.toFixed(3)} seconds`}</title>
      </line>
    </g>}
    {midpoint !== null && <line x1={xPosition(midpoint)} y1={chart.top} x2={xPosition(midpoint)}
      y2={chart.height - chart.bottom} stroke="#65736a" strokeDasharray="2 5" strokeWidth="1">
      <title>{`${label} early/late boundary · ${features.earlyLateBoundaryTime?.toFixed(3)} seconds`}</title>
    </line>}
    {turningPosition !== null && turningValue !== null && turningFrame && <circle
      cx={xPosition(turningPosition)} cy={yPosition(turningValue, mode)} r="5"
      fill="white" stroke={color} strokeWidth="2.5">
      <title>{`${label} measured ${features.turningPointType ?? 'turning point'} · ${turningTime?.toFixed(3)} seconds · ${turningFrame.f0Hz?.toFixed(1)} Hz`}</title>
    </circle>}
  </g>
}

export interface PitchAttemptTrack {
  id: string
  label: string
  analysis: PitchAnalysis
  color: string
}

export function F0TrajectoryChart({ learnerAnalysis, referenceAnalysis, referenceLabel, mode, showLearner, showReference,
  learnerFeatures = null, referenceFeatures = null, showFeatureMarkers = false, evidenceHighlight = null,
  attemptTracks = [] }: {
  learnerAnalysis: PitchAnalysis
  referenceAnalysis: PitchAnalysis | null
  referenceLabel: string
  mode: PitchDisplayMode
  showLearner: boolean
  showReference: boolean
  learnerFeatures?: ToneAcousticFeatures | null
  referenceFeatures?: ToneAcousticFeatures | null
  showFeatureMarkers?: boolean
  evidenceHighlight?: NormalizedFeedbackHighlight | null
  attemptTracks?: readonly PitchAttemptTrack[]
}) {
  const learnerFrames = normalizePitchAnalysis(learnerAnalysis)
  const referenceFrames = referenceAnalysis ? normalizePitchAnalysis(referenceAnalysis) : null
  const learnerPaths = showLearner && learnerFrames ? pathFor(learnerFrames, mode) : []
  const referencePaths = showReference && referenceFrames ? pathFor(referenceFrames, mode) : []
  const plottedAttempts = attemptTracks.flatMap(track => {
    const frames = normalizePitchAnalysis(track.analysis)
    return frames ? [{ ...track, frames, paths: pathFor(frames, mode) }] : []
  })
  const ticks = chartTicks(mode)
  const visibleTrajectoryLabels = [
    ...(showReference && referenceFrames ? [`measured ${referenceLabel} F0`] : []),
    ...(showLearner && learnerFrames ? ['measured learner F0'] : []),
    ...plottedAttempts.map(track => track.label),
  ]

  return <div className="space-y-3">
    <figure>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-auto w-full"
        role="img" aria-label={`${visibleTrajectoryLabels.length
          ? `${visibleTrajectoryLabels.join(', ')} ${mode === 'absolute'
            ? 'trajectories in Hertz'
            : 'pitch trajectories in semitones relative to each recording median'} over independently normalized voiced intervals`
          : 'No pitch trajectories selected'}${evidenceHighlight
            ? `; selected evidence: ${evidenceHighlight.label}` : ''}`}>
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
        {evidenceHighlight && <>
          {evidenceBand(evidenceHighlight.reference, '#c26b19', 'Reference')}
          {evidenceBand(evidenceHighlight.learner, '#9a7307', 'Learner')}
        </>}
        {showFeatureMarkers && showLearner && learnerFeatures
          && featureMarkers(learnerAnalysis, learnerFeatures, mode, '#24654e', 'Learner')}
        {showFeatureMarkers && showReference && referenceAnalysis && referenceFeatures
          && featureMarkers(referenceAnalysis, referenceFeatures, mode, '#c26b19', referenceLabel)}
        {plottedAttempts.flatMap(track => track.paths.map((path, index) =>
          <path key={`attempt-${track.id}-${index}`} d={path} fill="none" stroke={track.color}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />))}
        {referencePaths.map((path, index) => <path key={`reference-${index}`} d={path} fill="none"
          stroke="#c26b19" strokeWidth="2.5" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />)}
        {learnerPaths.map((path, index) => <path key={`learner-${index}`} d={path} fill="none"
          stroke="#24654e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
        {plottedAttempts.flatMap(track => pointsFor(track.frames, mode, track.color, `attempt-${track.id}`))}
        {showReference && referenceFrames && pointsFor(referenceFrames, mode, '#c26b19', 'reference')}
        {showLearner && learnerFrames && pointsFor(learnerFrames, mode, '#153c31', 'learner')}
        {evidenceHighlight && <text x={chart.width - chart.right}
          y={chart.top + (showFeatureMarkers ? 26 : 10)}
          textAnchor="end" className="pitch-axis-label">Evidence · {evidenceHighlight.label}</text>}
        {showFeatureMarkers && <text x={chart.width - chart.right} y={chart.top + 10}
          textAnchor="end" className="pitch-axis-label">Feature markers use measured timestamps</text>}
        <text x={(chart.left + chart.width - chart.right) / 2} y={chart.height - 8} textAnchor="middle" className="pitch-axis-label">
          Voiced interval time (normalized; hover points for original seconds)
        </text>
        <text x="15" y={chart.height / 2} textAnchor="middle" transform={`rotate(-90 15 ${chart.height / 2})`}
          className="pitch-axis-label">{mode === 'absolute' ? 'F0 (Hz)' : 'Relative pitch (semitones)'}</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        {plottedAttempts.map(track => <span key={track.id}>
          <i className="legend-line measured" style={{ borderColor: track.color }} />{track.label} · measured F0
        </span>)}
        {showReference && referenceFrames && <span><i className="legend-line reference" />Measured reference F0 · {referenceLabel}</span>}
        {showLearner && learnerFrames && <span><i className="legend-line measured" />Measured learner F0</span>}
        {showFeatureMarkers && <span>Dashed lines · selected interval and midpoint; outlined point · detected turning point</span>}
        {evidenceHighlight && <span><i className="legend-line evidence-highlight" />Selected evidence interval · normalized voiced time</span>}
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

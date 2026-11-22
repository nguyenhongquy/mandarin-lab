import type { AcousticComparison } from './acousticComparison.ts'
import type { ToneAcousticFeatures } from './toneAcoustics.ts'

interface AcousticInspectorProps {
  learnerFeatures: ToneAcousticFeatures | null
  referenceFeatures: ToneAcousticFeatures | null
  referenceLabel: string
  comparison: AcousticComparison | null
  showMarkers: boolean
  onShowMarkersChange: (show: boolean) => void
}

function signedValue(value: number | null, suffix: string): string {
  if (value === null || !Number.isFinite(value)) return 'Not available'
  const rounded = Math.abs(value) < 0.05 ? 0 : value
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} ${suffix}`
}

function directionLabel(direction: ToneAcousticFeatures['direction'] | null): string {
  if (direction === null || direction === 'unknown') return 'Not available'
  return direction === 'level' ? 'Approximately level' : direction[0]?.toUpperCase() + direction.slice(1)
}

function turningPointLabel(features: ToneAcousticFeatures | null): string {
  if (!features?.turningPointType || features.turningPointPosition === null || features.turningPointTime === null) {
    return 'Not available'
  }
  const type = features.turningPointType === 'minimum' ? 'Minimum' : 'Maximum'
  return `${type} · ${(features.turningPointPosition * 100).toFixed(0)}% · ${features.turningPointTime.toFixed(2)} s`
}

function intervalLabel(features: ToneAcousticFeatures | null): string {
  const interval = features?.analysisInterval
  if (!interval) return 'Not available'
  return `${interval.startTime.toFixed(2)}–${interval.endTime.toFixed(2)} s · ${interval.duration.toFixed(2)} s`
}

function slopeLabel(value: number | null): string {
  return signedValue(value, 'st / normalized interval')
}

function featureValue(features: ToneAcousticFeatures | null, name: string): string {
  if (!features) return 'Not available'
  switch (name) {
    case 'direction':
      return directionLabel(features.direction)
    case 'start':
      return signedValue(features.startPitchSt, 'st')
    case 'end':
      return signedValue(features.endPitchSt, 'st')
    case 'net':
      return signedValue(features.netPitchChangeSt, 'st')
    case 'range':
      return features.pitchRangeSt === null ? 'Not available' : `${features.pitchRangeSt.toFixed(1)} st`
    case 'turning':
      return turningPointLabel(features)
    case 'prominence':
      return features.turningPointProminenceSt === null
        ? 'Not available' : `${features.turningPointProminenceSt.toFixed(1)} st`
    case 'early':
      return slopeLabel(features.earlySlopeSt)
    case 'late':
      return slopeLabel(features.lateSlopeSt)
    case 'interval':
      return intervalLabel(features)
    case 'reliability':
      return features.reliability[0]?.toUpperCase() + features.reliability.slice(1)
    case 'frames':
      return `${features.reliableFrameCount}`
    case 'coverage':
      return `${(features.voicedFrameRatio * 100).toFixed(0)}%`
    case 'gaps':
      return features.internalGapProportion === null
        ? 'Not available' : `${(features.internalGapProportion * 100).toFixed(1)}%`
    case 'octaves':
      return `${features.octaveJumpCount}`
    default:
      return 'Not available'
  }
}

const featureRows = [
  ['Pitch direction', 'direction'],
  ['Start pitch relative to median', 'start'],
  ['End pitch relative to median', 'end'],
  ['Net pitch change', 'net'],
  ['Robust pitch range (P10–P90)', 'range'],
  ['Turning point', 'turning'],
  ['Turning-point prominence', 'prominence'],
  ['Early trend', 'early'],
  ['Late trend', 'late'],
  ['Analysis interval', 'interval'],
  ['Reliability', 'reliability'],
  ['Reliable frames in selected interval', 'frames'],
  ['Reliable-frame coverage of recording', 'coverage'],
  ['Internal gap proportion', 'gaps'],
  ['Possible octave jumps', 'octaves'],
] as const

function differenceLabel(value: number | null, suffix: string): string {
  if (value === null || !Number.isFinite(value)) return 'Not available'
  const rounded = Math.abs(value) < 0.05 ? 0 : value
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} ${suffix}`
}

export function AcousticInspector({
  learnerFeatures,
  referenceFeatures,
  referenceLabel,
  comparison,
  showMarkers,
  onShowMarkersChange,
}: AcousticInspectorProps) {
  const warningRows: Array<[string, ToneAcousticFeatures | null]> = [
    ['Learner warnings', learnerFeatures],
    ['Reference warnings', referenceFeatures],
  ]
  const excludedRegions = (features: ToneAcousticFeatures | null) => {
    if (!features) return 'Not available'
    return features.excludedRegions.length
      ? features.excludedRegions.map(region =>
        `${region.startTime.toFixed(2)}–${region.endTime.toFixed(2)} s (${region.reliableFrameCount} frames)`).join('; ')
      : 'None'
  }

  return <details className="panel">
    <summary className="cursor-pointer text-lg font-semibold marker:text-[#24654e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      <span>Acoustic Inspector</span>
      <span className="ml-2 text-sm font-normal text-slate-600">Measured features and reliability</span>
    </summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">
        These are acoustic observations, not tone judgments. Semitone values are normalized to each recording's median F0. The selected interval is a voiced-region proxy, not verified phonetic segmentation.
        {referenceLabel.includes('synthetic') && ' The local TTS reference is synthetic and is not a phonetically authoritative target.'}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>P10–P90 pitch range is the span containing the central 80% of reliable measurements, reducing the effect of extremes.</li>
        <li>A turning point is a prominent measured minimum or maximum after a three-frame median filter; smoothing never crosses unvoiced gaps.</li>
        <li>Start and end pitch are relative semitones from the selected interval median; early and late trends use robust slopes over normalized time.</li>
      </ul>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showMarkers} onChange={event => onShowMarkersChange(event.currentTarget.checked)} />
        Show measured interval, midpoint, and turning-point chart markers
      </label>
      {!learnerFeatures && <p className="text-sm text-slate-600">Analyze a recording to inspect measured acoustic features.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#d7e0d7]">
              <th scope="col" className="p-2">Feature</th>
              <th scope="col" className="p-2">Learner</th>
              <th scope="col" className="p-2">{referenceLabel}</th>
            </tr>
          </thead>
          <tbody>
            {featureRows.map(([label, key]) => <tr key={key} className="border-b border-[#e7ece7] align-top">
              <th scope="row" className="p-2 font-medium">{label}</th>
              <td className="p-2">{featureValue(learnerFeatures, key)}</td>
              <td className="p-2">{featureValue(referenceFeatures, key)}</td>
            </tr>)}
            <tr className="border-b border-[#e7ece7] align-top">
              <th scope="row" className="p-2 font-medium">Excluded voiced regions</th>
              <td className="p-2">{excludedRegions(learnerFeatures)}</td>
              <td className="p-2">{excludedRegions(referenceFeatures)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        Reliable-frame coverage is the share of all analysis frames meeting the existing F0 confidence threshold; it is not a pronunciation-confidence score. Early and late trends are robust semitone slopes per normalized interval. Thresholds are provisional.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {warningRows.map(([label, features]) => {
          const warnings = features?.warnings ?? []
          return <section key={label} className="rounded-lg bg-[#f7f9f5] p-3">
            <h4 className="font-semibold">{label}</h4>
            {!features
              ? <p className="mt-1 text-sm text-slate-600">Analysis not available.</p>
              : warnings.length
              ? <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
              : <p className="mt-1 text-sm text-slate-600">No additional warnings.</p>}
          </section>
        })}
      </div>
      {comparison && <section className="rounded-lg bg-[#fff7e8] p-3" aria-label="Descriptive acoustic differences">
        <h4 className="font-semibold">Descriptive differences · learner minus reference</h4>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-600">Estimated direction</dt><dd>{comparison.directionMatch === null
            ? 'Not available' : comparison.directionMatch ? 'Same estimate' : 'Different estimates'}</dd></div>
          <div><dt className="text-slate-600">Net pitch change</dt><dd>{differenceLabel(comparison.netChangeDifferenceSt, 'st')}</dd></div>
          <div><dt className="text-slate-600">Robust pitch range</dt><dd>{differenceLabel(comparison.rangeDifferenceSt, 'st')}</dd></div>
          <div><dt className="text-slate-600">Turning-point position</dt><dd>{differenceLabel(comparison.turningPointPositionDifference === null
            ? null : comparison.turningPointPositionDifference * 100, 'percentage points')}</dd></div>
        </dl>
        {comparison.warnings.map(warning => <p key={warning} className="mt-2 text-sm text-slate-700">{warning}</p>)}
        <p className="mt-2 text-xs text-slate-600">Differences describe the measured tracks only and do not imply correctness or similarity.</p>
      </section>}
    </div>
  </details>
}

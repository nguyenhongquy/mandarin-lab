import { DEFAULT_PITCH_OPTIONS, relativeSemitones } from './pitchAnalysis.ts'
import type { PitchAnalysis, PitchFrame } from './pitchAnalysis.ts'

export type PitchDirection = 'rising' | 'falling' | 'level' | 'complex' | 'unknown'
export type AcousticReliability = 'high' | 'medium' | 'low'
export type TurningPointType = 'minimum' | 'maximum'

export interface AcousticRegion {
  startTime: number
  endTime: number
  duration: number
  reliableFrameCount: number
}

export interface ToneAcousticFeatures {
  direction: PitchDirection
  startPitchSt: number | null
  endPitchSt: number | null
  netPitchChangeSt: number | null
  pitchRangeSt: number | null
  turningPointPosition: number | null
  turningPointType: TurningPointType | null
  turningPointTime: number | null
  turningPointF0Hz: number | null
  earlySlopeSt: number | null
  lateSlopeSt: number | null
  earlyLateBoundaryTime: number | null
  voicedFrameRatio: number
  reliableFrameCount: number
  reliability: AcousticReliability
  analysisInterval: AcousticRegion | null
  excludedRegions: AcousticRegion[]
  internalGapProportion: number | null
  octaveJumpCount: number
  warnings: string[]
}

export interface ToneFeatureOptions {
  confidenceThreshold: number
  maxInternalGapSeconds: number
  minReliableFrames: number
  minVoicedDurationSeconds: number
  minVoicedFrameRatio: number
  highReliabilityMinFrames: number
  highReliabilityMinDurationSeconds: number
  highReliabilityMinFrameRatio: number
  highReliabilityMaxGapProportion: number
  maxReliableGapProportion: number
  substantialRegionMinFrames: number
  substantialRegionMinDurationSeconds: number
  edgeFraction: number
  minDirectionalChangeSt: number
  minDirectionalSlopeSt: number
  minDirectionConsistency: number
  levelRangeThresholdSt: number
  turningBaselineFraction: number
  turningProminenceThresholdSt: number
  smoothingWindowFrames: number
}

export const DEFAULT_TONE_FEATURE_OPTIONS: Readonly<ToneFeatureOptions> = {
  confidenceThreshold: DEFAULT_PITCH_OPTIONS.confidenceThreshold,
  maxInternalGapSeconds: 0.03,
  minReliableFrames: 8,
  minVoicedDurationSeconds: 0.12,
  minVoicedFrameRatio: 0.01,
  highReliabilityMinFrames: 24,
  highReliabilityMinDurationSeconds: 0.3,
  highReliabilityMinFrameRatio: 0.25,
  highReliabilityMaxGapProportion: 0.1,
  maxReliableGapProportion: 0.4,
  substantialRegionMinFrames: 8,
  substantialRegionMinDurationSeconds: 0.12,
  edgeFraction: 0.15,
  minDirectionalChangeSt: 1.5,
  minDirectionalSlopeSt: 1.5,
  minDirectionConsistency: 0.65,
  levelRangeThresholdSt: 2.5,
  turningBaselineFraction: 0.4,
  turningProminenceThresholdSt: 1.5,
  smoothingWindowFrames: 3,
}

interface PitchSample {
  time: number
  f0Hz: number
  confidence: number
}

interface TrendPoint {
  time: number
  normalizedTime: number
  value: number
}

interface TurningPoint {
  position: number
  time: number
  f0Hz: number
  type: TurningPointType
  prominence: number
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  return sorted.length % 2
    ? upper ?? null
    : lower === undefined || upper === undefined ? null : (lower + upper) / 2
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * fraction)] ?? null
}

function validateOptions(options: ToneFeatureOptions) {
  const ratios = [
    options.confidenceThreshold,
    options.minVoicedFrameRatio,
    options.highReliabilityMinFrameRatio,
    options.highReliabilityMaxGapProportion,
    options.maxReliableGapProportion,
    options.minDirectionConsistency,
  ]
  const counts = [
    options.minReliableFrames,
    options.highReliabilityMinFrames,
    options.substantialRegionMinFrames,
    options.smoothingWindowFrames,
  ]
  const thresholds = [
    options.maxInternalGapSeconds,
    options.minVoicedDurationSeconds,
    options.highReliabilityMinDurationSeconds,
    options.edgeFraction,
    options.minDirectionalChangeSt,
    options.minDirectionalSlopeSt,
    options.levelRangeThresholdSt,
    options.turningBaselineFraction,
    options.turningProminenceThresholdSt,
  ]
  if ([...ratios, ...counts, ...thresholds].some(value => !Number.isFinite(value))
    || ratios.some(value => value < 0 || value > 1)
    || counts.some(value => !Number.isInteger(value) || value < 1)
    || thresholds.some(value => value < 0)
    || options.maxInternalGapSeconds < 0 || options.minVoicedDurationSeconds <= 0
    || options.highReliabilityMinDurationSeconds < options.minVoicedDurationSeconds
    || options.highReliabilityMinFrames < options.minReliableFrames
    || options.highReliabilityMinFrameRatio < options.minVoicedFrameRatio
    || options.highReliabilityMaxGapProportion > options.maxReliableGapProportion
    || options.edgeFraction <= 0 || options.edgeFraction > 0.5
    || options.turningBaselineFraction <= 0 || options.turningBaselineFraction >= 0.5
    || options.smoothingWindowFrames % 2 === 0) {
    throw new RangeError('Tone feature settings must use valid confidence, duration, gap, and odd smoothing-window values.')
  }
}

function nominalFrameStep(frames: readonly PitchFrame[]): number {
  const steps = frames.slice(1).flatMap((frame, index) => {
    const previous = frames[index]
    const step = previous ? frame.time - previous.time : 0
    return Number.isFinite(step) && step > 0 && step <= 0.1 ? [step] : []
  })
  return median(steps) ?? DEFAULT_PITCH_OPTIONS.hopSeconds
}

function reliableSamples(analysis: PitchAnalysis, confidenceThreshold: number): PitchSample[] {
  return analysis.frames.flatMap(frame =>
    Number.isFinite(frame.time) && Number.isFinite(frame.f0Hz) && frame.f0Hz !== null && frame.f0Hz > 0
      && Number.isFinite(frame.confidence) && frame.confidence >= confidenceThreshold
      ? [{ time: frame.time, f0Hz: frame.f0Hz, confidence: frame.confidence }]
      : []).sort((first, second) => first.time - second.time)
}

function groupRegions(samples: readonly PitchSample[], nominalStep: number, maxGapSeconds: number): PitchSample[][] {
  const regions: PitchSample[][] = []
  let current: PitchSample[] = []
  for (const sample of samples) {
    const previous = current.at(-1)
    if (previous && sample.time - previous.time - nominalStep > maxGapSeconds) {
      regions.push(current)
      current = []
    }
    current.push(sample)
  }
  if (current.length) regions.push(current)
  return regions
}

function regionSummary(region: readonly PitchSample[], nominalStep: number): AcousticRegion {
  const first = region[0]
  const last = region.at(-1)
  const startTime = first?.time ?? 0
  const endTime = last?.time ?? startTime
  return {
    startTime,
    endTime,
    duration: Math.max(nominalStep, endTime - startTime + nominalStep),
    reliableFrameCount: region.length,
  }
}

function gapProportion(region: readonly PitchSample[], nominalStep: number): number {
  const summary = regionSummary(region, nominalStep)
  if (summary.duration <= 0) return 0
  let gapSeconds = 0
  for (let index = 1; index < region.length; index += 1) {
    const previous = region[index - 1]
    const current = region[index]
    if (previous && current) gapSeconds += Math.max(0, current.time - previous.time - nominalStep)
  }
  const proportion = gapSeconds / summary.duration
  return proportion < 1e-9 ? 0 : Math.min(1, proportion)
}

function octaveJumpCount(samples: readonly PitchSample[], nominalStep: number): number {
  let count = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (!previous || !current || current.time - previous.time > nominalStep * 1.5) continue
    const change = Math.abs(relativeSemitones(current.f0Hz, previous.f0Hz) ?? 0)
    if (change < 8 || change > 14) continue
    const next = samples[index + 1]
    const nextChange = previous && next && next.time - current.time <= nominalStep * 1.5
      ? Math.abs(relativeSemitones(next.f0Hz, previous.f0Hz) ?? 0)
      : Number.POSITIVE_INFINITY
    count += 1
    if (nextChange < 2) index += 1
  }
  return count
}

function medianFilter(values: readonly number[], requestedWindow: number): number[] {
  const radius = Math.floor(requestedWindow / 2)
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
    return median(window) ?? values[index] ?? 0
  })
}

function splitContiguousRuns(region: readonly PitchSample[], nominalStep: number): PitchSample[][] {
  const runs: PitchSample[][] = []
  let current: PitchSample[] = []
  for (const sample of region) {
    const previous = current.at(-1)
    if (previous && sample.time - previous.time > nominalStep * 1.5) {
      runs.push(current)
      current = []
    }
    current.push(sample)
  }
  if (current.length) runs.push(current)
  return runs
}

function trendPoints(
  region: readonly PitchSample[],
  medianF0Hz: number,
  interval: AcousticRegion,
  nominalStep: number,
  smoothingWindowFrames: number,
): TrendPoint[][] {
  const span = interval.endTime - interval.startTime
  if (span <= 0) return []
  return splitContiguousRuns(region, nominalStep).map(run => {
    const raw = run.flatMap(sample => {
      const pitch = relativeSemitones(sample.f0Hz, medianF0Hz)
      return pitch === null ? [] : [pitch]
    })
    return medianFilter(raw, smoothingWindowFrames).flatMap((value, index) => {
      const sample = run[index]
      return sample ? [{
        time: sample.time,
        normalizedTime: (sample.time - interval.startTime) / span,
        value,
      }] : []
    })
  }).filter(run => run.length > 0)
}

function theilSenSlope(points: readonly TrendPoint[]): number | null {
  const slopes: number[] = []
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const start = points[first]
      const end = points[second]
      if (!start || !end) continue
      const timeDelta = end.normalizedTime - start.normalizedTime
      if (timeDelta < 0.05) continue
      slopes.push((end.value - start.value) / timeDelta)
    }
  }
  return median(slopes)
}

function collectSlopes(runs: readonly TrendPoint[][]): number[] {
  return runs.flatMap(run => {
    const slope = theilSenSlope(run)
    return slope === null ? [] : [slope]
  })
}

function directionalShare(runs: readonly TrendPoint[][], direction: 1 | -1): number {
  let aligned = 0
  let meaningful = 0
  for (const run of runs) {
    for (let index = 1; index < run.length; index += 1) {
      const previous = run[index - 1]
      const current = run[index]
      if (!previous || !current) continue
      const change = current.value - previous.value
      if (Math.abs(change) < 0.05) continue
      meaningful += 1
      if (change * direction > 0) aligned += 1
    }
  }
  return meaningful ? aligned / meaningful : 0
}

function localMedian(values: readonly number[]): number | null {
  return median(values)
}

function findTurningPoint(
  runs: readonly TrendPoint[][],
  region: readonly PitchSample[],
  medianF0Hz: number,
  interval: AcousticRegion,
  options: ToneFeatureOptions,
): TurningPoint | null {
  const candidates: TurningPoint[] = []
  for (const run of runs) {
    if (run.length < 7) continue
    const lookback = Math.max(3, Math.floor(run.length * options.turningBaselineFraction))
    const minimumContext = Math.max(3, Math.floor(run.length * 0.1))
    for (let index = 2; index < run.length - 2; index += 1) {
      const previous = run[index - 1]
      const current = run[index]
      const next = run[index + 1]
      if (!previous || !current || !next) continue
      const isMinimum = current.value <= previous.value && current.value <= next.value
      const isMaximum = current.value >= previous.value && current.value >= next.value
      if (!isMinimum && !isMaximum) continue

      const leftPoints = run.slice(Math.max(0, index - lookback), index)
      const rightPoints = run.slice(index + 1, index + lookback + 1)
      if (leftPoints.length < minimumContext || rightPoints.length < minimumContext) continue
      const left = localMedian(leftPoints.map(point => point.value))
      const right = localMedian(rightPoints.map(point => point.value))
      if (left === null || right === null) continue
      const minimumProminence = Math.min(left - current.value, right - current.value)
      const maximumProminence = Math.min(current.value - left, current.value - right)
      const type = isMinimum && minimumProminence >= options.turningProminenceThresholdSt
        ? 'minimum'
        : isMaximum && maximumProminence >= options.turningProminenceThresholdSt ? 'maximum' : null
      if (!type) continue
      const prominence = type === 'minimum' ? minimumProminence : maximumProminence

      const sample = region.find(candidate => candidate.time === current.time)
      if (!sample) continue
      candidates.push({
        position: interval.endTime > interval.startTime
          ? Math.max(0, Math.min(1, (current.time - interval.startTime) / (interval.endTime - interval.startTime)))
          : 0,
        time: current.time,
        f0Hz: sample.f0Hz,
        type,
        prominence,
      })
    }
  }
  return candidates.sort((first, second) => second.prominence - first.prominence)[0] ?? null
}

function edgeMedian(values: readonly number[], fraction: number, fromEnd: boolean): number | null {
  const count = Math.max(3, Math.ceil(values.length * fraction))
  const selected = fromEnd ? values.slice(-count) : values.slice(0, count)
  return median(selected)
}

function classifyReliability(
  frameCount: number,
  interval: AcousticRegion,
  voicedFrameRatio: number,
  gapRatio: number,
  jumps: number,
  hasMultipleSubstantialRegions: boolean,
  options: ToneFeatureOptions,
): AcousticReliability {
  if (frameCount < options.minReliableFrames || interval.duration < options.minVoicedDurationSeconds
    || voicedFrameRatio < options.minVoicedFrameRatio || gapRatio > options.maxReliableGapProportion || jumps >= 2) {
    return 'low'
  }
  if (frameCount >= options.highReliabilityMinFrames
    && interval.duration >= options.highReliabilityMinDurationSeconds
    && voicedFrameRatio >= options.highReliabilityMinFrameRatio
    && gapRatio <= options.highReliabilityMaxGapProportion
    && jumps === 0 && !hasMultipleSubstantialRegions) {
    return 'high'
  }
  return 'medium'
}

function unavailableFeatures(warnings: string[], voicedFrameRatio: number): ToneAcousticFeatures {
  return {
    direction: 'unknown',
    startPitchSt: null,
    endPitchSt: null,
    netPitchChangeSt: null,
    pitchRangeSt: null,
    turningPointPosition: null,
    turningPointType: null,
    turningPointTime: null,
    turningPointF0Hz: null,
    earlySlopeSt: null,
    lateSlopeSt: null,
    earlyLateBoundaryTime: null,
    voicedFrameRatio,
    reliableFrameCount: 0,
    reliability: 'low',
    analysisInterval: null,
    excludedRegions: [],
    internalGapProportion: null,
    octaveJumpCount: 0,
    warnings,
  }
}

export function extractToneFeatures(
  analysis: PitchAnalysis,
  overrides: Partial<ToneFeatureOptions> = {},
): ToneAcousticFeatures {
  const options = { ...DEFAULT_TONE_FEATURE_OPTIONS, ...overrides }
  validateOptions(options)
  const voicedFrameRatio = analysis.frames.length
    ? analysis.frames.filter(frame => Number.isFinite(frame.f0Hz) && frame.f0Hz !== null && frame.f0Hz > 0
      && Number.isFinite(frame.confidence) && frame.confidence >= options.confidenceThreshold).length / analysis.frames.length
    : 0
  const samples = reliableSamples(analysis, options.confidenceThreshold)
  if (!samples.length) {
    return unavailableFeatures([...new Set([...analysis.warnings, 'No reliable voiced pitch frames were found.'])], voicedFrameRatio)
  }

  const nominalStep = nominalFrameStep(analysis.frames)
  const regions = groupRegions(samples, nominalStep, options.maxInternalGapSeconds)
  const selectedRegion = [...regions].sort((first, second) =>
    regionSummary(second, nominalStep).duration - regionSummary(first, nominalStep).duration
      || second.length - first.length)[0]
  if (!selectedRegion) return unavailableFeatures(analysis.warnings, voicedFrameRatio)

  const selectedSummary = regionSummary(selectedRegion, nominalStep)
  const excludedRegions = regions.filter(region => region !== selectedRegion)
    .map(region => regionSummary(region, nominalStep))
    .sort((first, second) => first.startTime - second.startTime)
  const substantialExcludedRegions = excludedRegions.filter(region =>
    region.reliableFrameCount >= options.substantialRegionMinFrames
      && region.duration >= options.substantialRegionMinDurationSeconds)
  const internalGapProportion = gapProportion(selectedRegion, nominalStep)
  const jumps = octaveJumpCount(selectedRegion, nominalStep)
  const hasMultipleSubstantialRegions = substantialExcludedRegions.length > 0
  const reliability = classifyReliability(selectedRegion.length, selectedSummary, voicedFrameRatio,
    internalGapProportion, jumps, hasMultipleSubstantialRegions, options)
  const regionMedianHz = median(selectedRegion.map(sample => sample.f0Hz))
  const semitones = regionMedianHz === null ? [] : selectedRegion.flatMap(sample => {
    const value = relativeSemitones(sample.f0Hz, regionMedianHz)
    return value === null || !Number.isFinite(value) ? [] : [value]
  })
  const lower = percentile(semitones, 0.1)
  const upper = percentile(semitones, 0.9)
  const startPitchSt = edgeMedian(semitones, options.edgeFraction, false)
  const endPitchSt = edgeMedian(semitones, options.edgeFraction, true)
  const netPitchChangeSt = startPitchSt === null || endPitchSt === null ? null : endPitchSt - startPitchSt
  const runs = regionMedianHz === null ? [] : trendPoints(
    selectedRegion, regionMedianHz, selectedSummary, nominalStep, options.smoothingWindowFrames)
  const earlyPoints = runs.map(run => run.filter(point => point.normalizedTime <= 0.5)).filter(run => run.length > 0)
  const latePoints = runs.map(run => run.filter(point => point.normalizedTime >= 0.5)).filter(run => run.length > 0)
  const earlySlopeSt = median(collectSlopes(earlyPoints))
  const lateSlopeSt = median(collectSlopes(latePoints))
  const turningPoint = reliability === 'low' || regionMedianHz === null
    ? null
    : findTurningPoint(runs, selectedRegion, regionMedianHz, selectedSummary, options)
  const robustTrend = median(collectSlopes(runs))
  let direction: PitchDirection = 'unknown'
  if (reliability !== 'low' && netPitchChangeSt !== null && lower !== null && upper !== null) {
    const range = upper - lower
    if (turningPoint) {
      direction = 'complex'
    } else if (netPitchChangeSt >= options.minDirectionalChangeSt && robustTrend !== null
      && robustTrend >= options.minDirectionalSlopeSt && directionalShare(runs, 1) >= options.minDirectionConsistency) {
      direction = 'rising'
    } else if (netPitchChangeSt <= -options.minDirectionalChangeSt && robustTrend !== null
      && robustTrend <= -options.minDirectionalSlopeSt && directionalShare(runs, -1) >= options.minDirectionConsistency) {
      direction = 'falling'
    } else if (range <= options.levelRangeThresholdSt && Math.abs(netPitchChangeSt) < options.minDirectionalChangeSt) {
      direction = 'level'
    } else {
      direction = 'complex'
    }
  }

  const warnings = [...analysis.warnings]
  if (selectedRegion.length < options.minReliableFrames
    || selectedSummary.duration < options.minVoicedDurationSeconds) {
    warnings.push('The dominant voiced interval is too short for confident direction or turning-point interpretation.')
  }
  if (excludedRegions.length) warnings.push(`${excludedRegions.length} other voiced region(s) were excluded from feature analysis.`)
  if (hasMultipleSubstantialRegions) {
    warnings.push('Multiple substantial voiced regions make isolated-syllable interpretation uncertain; only the dominant region was analyzed.')
  }
  if (internalGapProportion > 0) {
    warnings.push('Short internal tracking gaps were retained without filling or smoothing across them.')
  }
  if (jumps) warnings.push(`${jumps} possible octave jump(s) were detected in the selected voiced interval.`)
  if (reliability === 'low') warnings.push('Feature reliability is low; direction and turning-point interpretation are withheld.')

  return {
    direction,
    startPitchSt,
    endPitchSt,
    netPitchChangeSt,
    pitchRangeSt: lower === null || upper === null ? null : upper - lower,
    turningPointPosition: turningPoint?.position ?? null,
    turningPointType: turningPoint?.type ?? null,
    turningPointTime: turningPoint?.time ?? null,
    turningPointF0Hz: turningPoint?.f0Hz ?? null,
    earlySlopeSt,
    lateSlopeSt,
    earlyLateBoundaryTime: (selectedSummary.startTime + selectedSummary.endTime) / 2,
    voicedFrameRatio,
    reliableFrameCount: selectedRegion.length,
    reliability,
    analysisInterval: selectedSummary,
    excludedRegions,
    internalGapProportion,
    octaveJumpCount: jumps,
    warnings: [...new Set(warnings)],
  }
}

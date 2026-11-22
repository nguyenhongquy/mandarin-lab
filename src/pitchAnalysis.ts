export interface PitchFrame {
  time: number
  f0Hz: number | null
  confidence: number
}

export interface PitchAnalysis {
  frames: PitchFrame[]
  voicedFrameCount: number
  voicedPercent: number
  duration: number
  medianF0Hz: number | null
  minF0Hz: number | null
  maxF0Hz: number | null
  warnings: string[]
}

export interface PitchAnalyzerOptions {
  minF0Hz: number
  maxF0Hz: number
  windowSeconds: number
  hopSeconds: number
  confidenceThreshold: number
  yinThreshold: number
  silenceRmsThreshold: number
}

export const DEFAULT_PITCH_OPTIONS: Readonly<PitchAnalyzerOptions> = {
  minF0Hz: 70,
  maxF0Hz: 500,
  windowSeconds: 0.035,
  hopSeconds: 0.01,
  confidenceThreshold: 0.6,
  yinThreshold: 0.15,
  silenceRmsThreshold: 0.005,
}

const ANALYSIS_SAMPLE_RATE = 11025

function resample(samples: Float32Array, sampleRate: number, targetRate: number) {
  if (sampleRate <= targetRate) return { samples, sampleRate }
  const length = Math.floor(samples.length * targetRate / sampleRate)
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * sampleRate / targetRate
    const lower = Math.floor(position)
    const fraction = position - lower
    const first = samples[lower] ?? 0
    const second = samples[Math.min(lower + 1, samples.length - 1)] ?? first
    output[index] = first + (second - first) * fraction
  }
  return { samples: output, sampleRate: targetRate }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  return sorted.length % 2 ? upper ?? null : lower === undefined || upper === undefined ? null : (lower + upper) / 2
}

function estimateFrame(
  samples: Float32Array,
  offset: number,
  length: number,
  sampleRate: number,
  options: PitchAnalyzerOptions,
): { f0Hz: number | null; confidence: number } {
  let mean = 0
  let squareSum = 0
  for (let index = 0; index < length; index += 1) {
    const value = samples[offset + index] ?? 0
    mean += value
    squareSum += value * value
  }
  const rms = Math.sqrt(squareSum / length)
  if (rms < options.silenceRmsThreshold) return { f0Hz: null, confidence: 0 }

  mean /= length
  const minimumLag = Math.max(2, Math.floor(sampleRate / (options.maxF0Hz * 2)))
  const maximumLag = Math.min(length - 2, Math.floor(sampleRate / (options.minF0Hz * 0.75)))
  if (maximumLag <= minimumLag) return { f0Hz: null, confidence: 0 }

  const difference = new Float64Array(maximumLag + 1)
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let sum = 0
    for (let index = 0; index < length - lag; index += 1) {
      const first = (samples[offset + index] ?? 0) - mean
      const second = (samples[offset + index + lag] ?? 0) - mean
      const delta = first - second
      sum += delta * delta
    }
    difference[lag] = sum
  }

  const normalized = new Float64Array(maximumLag + 1)
  normalized[0] = 1
  let cumulative = 0
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    cumulative += difference[lag] ?? 0
    normalized[lag] = cumulative > 0 ? (difference[lag] ?? 0) * lag / cumulative : 1
  }

  let bestLag = -1
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    if ((normalized[lag] ?? 1) < options.yinThreshold) {
      bestLag = lag
      while (bestLag < maximumLag && (normalized[bestLag + 1] ?? 1) < (normalized[bestLag] ?? 1)) bestLag += 1
      break
    }
  }
  if (bestLag < 0) {
    let minimum = Number.POSITIVE_INFINITY
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      const value = normalized[lag] ?? 1
      if (value < minimum) {
        minimum = value
        bestLag = lag
      }
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - (normalized[bestLag] ?? 1)))
  if (confidence < options.confidenceThreshold) return { f0Hz: null, confidence }

  const before = normalized[bestLag - 1] ?? normalized[bestLag] ?? 1
  const center = normalized[bestLag] ?? 1
  const after = normalized[bestLag + 1] ?? center
  const denominator = before - 2 * center + after
  const adjustment = denominator === 0 ? 0 : Math.max(-1, Math.min(1, 0.5 * (before - after) / denominator))
  const f0Hz = sampleRate / (bestLag + adjustment)
  if (!Number.isFinite(f0Hz) || f0Hz < options.minF0Hz || f0Hz > options.maxF0Hz) {
    return { f0Hz: null, confidence }
  }
  return { f0Hz, confidence }
}

function hasOctaveJump(frames: readonly PitchFrame[], hopSeconds: number): boolean {
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]
    const current = frames[index]
    if (!previous?.f0Hz || !current?.f0Hz || current.time - previous.time > hopSeconds * 1.5) continue
    const ratio = current.f0Hz / previous.f0Hz
    if ((ratio >= 1.8 && ratio <= 2.2) || (ratio >= 0.45 && ratio <= 0.56)) return true
  }
  return false
}

export function analyzePitch(
  pcm: Float32Array,
  sampleRate: number,
  overrides: Partial<PitchAnalyzerOptions> = {},
): PitchAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('Sample rate must be a positive number.')
  const options = { ...DEFAULT_PITCH_OPTIONS, ...overrides }
  if (options.minF0Hz <= 0 || options.maxF0Hz <= options.minF0Hz
    || options.windowSeconds <= 0 || options.hopSeconds <= 0) {
    throw new RangeError('Pitch analysis settings must define a valid pitch range and frame timing.')
  }

  const duration = pcm.length / sampleRate
  const warnings: string[] = []
  if (pcm.length === 0) {
    return {
      frames: [], voicedFrameCount: 0, voicedPercent: 0, duration, medianF0Hz: null,
      minF0Hz: null, maxF0Hz: null, warnings: ['The recording is empty. Record audio before analysis.'],
    }
  }

  const reduced = resample(pcm, sampleRate, ANALYSIS_SAMPLE_RATE)
  const frameLength = Math.max(2, Math.round(reduced.sampleRate * options.windowSeconds))
  const hopLength = Math.max(1, Math.round(reduced.sampleRate * options.hopSeconds))
  if (reduced.samples.length < frameLength) {
    return {
      frames: [], voicedFrameCount: 0, voicedPercent: 0, duration, medianF0Hz: null,
      minF0Hz: null, maxF0Hz: null,
      warnings: ['The recording is too short for a reliable pitch analysis. Record a longer syllable.'],
    }
  }

  const frames: PitchFrame[] = []
  for (let start = 0; start + frameLength <= reduced.samples.length; start += hopLength) {
    const estimate = estimateFrame(reduced.samples, start, frameLength, reduced.sampleRate, options)
    frames.push({
      time: (start + frameLength / 2) / reduced.sampleRate,
      f0Hz: estimate.f0Hz,
      confidence: estimate.confidence,
    })
  }

  const voiced = frames.filter(frame => frame.f0Hz !== null && frame.confidence >= options.confidenceThreshold)
  const values = voiced.flatMap(frame => frame.f0Hz === null ? [] : [frame.f0Hz])
  const voicedPercent = frames.length ? Math.round(values.length / frames.length * 100) : 0
  if (values.length < 3 || voicedPercent < 10) {
    warnings.push('The recording contains too few reliable voiced frames for interpretation.')
  }
  if (hasOctaveJump(frames, options.hopSeconds)) {
    warnings.push('A possible octave jump was detected; inspect the pitch trajectory.')
  }

  return {
    frames,
    voicedFrameCount: values.length,
    voicedPercent,
    duration,
    medianF0Hz: median(values),
    minF0Hz: values.length ? Math.min(...values) : null,
    maxF0Hz: values.length ? Math.max(...values) : null,
    warnings,
  }
}

export function relativeSemitones(f0Hz: number | null, medianF0Hz: number | null): number | null {
  if (f0Hz === null || medianF0Hz === null || f0Hz <= 0 || medianF0Hz <= 0) return null
  return 12 * Math.log2(f0Hz / medianF0Hz)
}

export function pitchFeedback(analysis: PitchAnalysis): string[] {
  const reliable = analysis.frames.flatMap(frame =>
    frame.f0Hz !== null && frame.confidence >= DEFAULT_PITCH_OPTIONS.confidenceThreshold
      ? [{ time: frame.time, value: relativeSemitones(frame.f0Hz, analysis.medianF0Hz) }]
      : [])
  if (reliable.length < 5 || analysis.voicedPercent < 10) {
    return ['The recording contains too few reliable voiced frames for interpretation.']
  }

  const sampleCount = Math.max(2, Math.ceil(reliable.length * 0.2))
  const first = median(reliable.slice(0, sampleCount).flatMap(frame => frame.value === null ? [] : [frame.value]))
  const last = median(reliable.slice(-sampleCount).flatMap(frame => frame.value === null ? [] : [frame.value]))
  if (first === null || last === null) return ['The detected pitch trajectory is too sparse to describe reliably.']
  const change = last - first
  if (change >= 1.5) return ['The detected pitch rises over the voiced portion.']
  if (change <= -1.5) return ['The detected pitch falls toward the end.']
  return ['The detected pitch stays relatively level over the voiced portion.']
}

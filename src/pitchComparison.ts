import { DEFAULT_PITCH_OPTIONS, relativeSemitones } from './pitchAnalysis.ts'
import type { PitchAnalysis, PitchFrame } from './pitchAnalysis.ts'

export const MIN_COMPARISON_VOICED_FRAMES = 8
const MIN_COMPARISON_VOICED_SPAN_SECONDS = 0.06

export interface ComparisonFrame extends PitchFrame {
  normalizedTime: number
  relativePitch: number | null
}

function reliableFrames(analysis: PitchAnalysis): PitchFrame[] {
  return analysis.frames.filter(frame =>
    frame.f0Hz !== null && frame.confidence >= DEFAULT_PITCH_OPTIONS.confidenceThreshold)
}

export function normalizePitchAnalysis(analysis: PitchAnalysis): ComparisonFrame[] | null {
  const voiced = reliableFrames(analysis)
  const first = voiced[0]
  const last = voiced.at(-1)
  if (!first || !last || voiced.length < MIN_COMPARISON_VOICED_FRAMES
    || last.time - first.time < MIN_COMPARISON_VOICED_SPAN_SECONDS) return null

  const span = last.time - first.time
  return analysis.frames.map(frame => ({
    ...frame,
    normalizedTime: Math.max(0, Math.min(1, (frame.time - first.time) / span)),
    relativePitch: relativeSemitones(frame.f0Hz, analysis.medianF0Hz),
  }))
}

export function normalizePitchTime(analysis: PitchAnalysis, time: number): number | null {
  if (!Number.isFinite(time)) return null
  const voiced = reliableFrames(analysis)
  const first = voiced[0]
  const last = voiced.at(-1)
  if (!first || !last || last.time <= first.time) return null
  return Math.max(0, Math.min(1, (time - first.time) / (last.time - first.time)))
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  return sorted.length % 2 ? upper ?? null
    : lower === undefined || upper === undefined ? null : (lower + upper) / 2
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? null
}

type Movement = 'rising' | 'falling' | 'level' | 'mixed'
interface MovementSummary {
  movement: Movement
  span: number
  onset: number | null
}

function summarizeMovement(frames: ComparisonFrame[]): MovementSummary | null {
  const voiced = frames.filter(frame =>
    frame.f0Hz !== null && frame.confidence >= DEFAULT_PITCH_OPTIONS.confidenceThreshold
      && frame.relativePitch !== null)
  const sampleCount = Math.max(2, Math.ceil(voiced.length * 0.2))
  const start = median(voiced.slice(0, sampleCount).flatMap(frame =>
    frame.relativePitch === null ? [] : [frame.relativePitch]))
  const end = median(voiced.slice(-sampleCount).flatMap(frame =>
    frame.relativePitch === null ? [] : [frame.relativePitch]))
  const low = percentile(voiced.flatMap(frame => frame.relativePitch === null ? [] : [frame.relativePitch]), 0.1)
  const high = percentile(voiced.flatMap(frame => frame.relativePitch === null ? [] : [frame.relativePitch]), 0.9)
  if (start === null || end === null || low === null || high === null) return null

  const change = end - start
  const movement: Movement = change >= 2 ? 'rising'
    : change <= -2 ? 'falling'
      : Math.abs(change) < 1 ? 'level' : 'mixed'
  const direction = movement === 'rising' ? 1 : movement === 'falling' ? -1 : 0
  const onset = direction
    ? voiced.find(frame => direction * ((frame.relativePitch ?? start) - start) >= 1.5)?.normalizedTime ?? null
    : null
  return { movement, span: high - low, onset }
}

export function comparePitchAnalyses(
  reference: PitchAnalysis | null,
  learner: PitchAnalysis,
): string[] {
  if (!reference) {
    return ['Measured reference F0 is unavailable; browser TTS is audio-only, so comparison feedback is withheld.']
  }
  const referenceFrames = normalizePitchAnalysis(reference)
  if (!referenceFrames) {
    return ['The reference contains too few reliable voiced frames for comparison.']
  }
  const learnerFrames = normalizePitchAnalysis(learner)
  if (!learnerFrames) {
    return ['The learner recording contains too few reliable voiced frames for comparison.']
  }
  const referenceMovement = summarizeMovement(referenceFrames)
  const learnerMovement = summarizeMovement(learnerFrames)
  if (!referenceMovement || !learnerMovement) {
    return ['The trajectories are too sparse for a reliable comparison.']
  }

  const observations: string[] = []
  if (referenceMovement.movement === learnerMovement.movement
    && referenceMovement.movement !== 'mixed') {
    const movement = referenceMovement.movement === 'level' ? 'relatively level'
      : referenceMovement.movement === 'rising' ? 'rising' : 'falling'
    observations.push(`Both recordings show an overall ${movement} pitch movement over their voiced portions.`)
    if (referenceMovement.onset !== null && learnerMovement.onset !== null
      && learnerMovement.onset - referenceMovement.onset >= 0.15) {
      observations.push("The learner's measurable pitch movement begins later along normalized time than the reference.")
    }
  } else if (learnerMovement.span <= referenceMovement.span * 0.65
    && referenceMovement.span - learnerMovement.span >= 2) {
    observations.push("The learner's contour appears flatter than the reference over normalized voiced time.")
  } else {
    observations.push('The recordings show different overall pitch movement across their normalized voiced intervals.')
  }
  return observations
}

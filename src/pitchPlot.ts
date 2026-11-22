import { DEFAULT_PITCH_OPTIONS, relativeSemitones } from './pitchAnalysis.ts'
import type { PitchFrame } from './pitchAnalysis.ts'

export function splitPitchSegments(frames: readonly PitchFrame[]): PitchFrame[][] {
  const segments: PitchFrame[][] = []
  let current: PitchFrame[] = []
  for (const frame of frames) {
    if (frame.f0Hz === null || frame.confidence < DEFAULT_PITCH_OPTIONS.confidenceThreshold) {
      if (current.length) segments.push(current)
      current = []
      continue
    }
    current.push(frame)
  }
  if (current.length) segments.push(current)
  return segments
}

export function semitoneTrajectory(frames: readonly PitchFrame[], medianF0Hz: number | null): (number | null)[] {
  return frames.map(frame => relativeSemitones(frame.f0Hz, medianF0Hz))
}

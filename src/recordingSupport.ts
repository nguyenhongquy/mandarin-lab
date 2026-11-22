export const MAX_RECORDING_SECONDS = 5
export const MIN_RECORDING_SECONDS = 0.12

export function supportsMicrophoneRecording(
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined,
  mediaRecorderAvailable: boolean,
): boolean {
  return Boolean(mediaDevices?.getUserMedia && mediaRecorderAvailable)
}

export function releaseMicrophone(stream: Pick<MediaStream, 'getTracks'> | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

export function microphoneErrorMessage(problem: unknown): string {
  const name = problem && typeof problem === 'object' && 'name' in problem ? String(problem.name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission was denied. Allow microphone access for this site, then try again.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a microphone and try again.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is unavailable or in use by another application. Close other audio apps and try again.'
  }
  if (name === 'OverconstrainedError') {
    return 'The microphone could not meet the requested audio settings. Check the selected input and try again.'
  }
  return problem instanceof Error
    ? `Could not start microphone recording: ${problem.message}`
    : 'Could not start microphone recording. Check that a microphone is connected and available.'
}

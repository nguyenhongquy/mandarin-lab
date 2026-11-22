import { analyzePitch } from './pitchAnalysis.ts'
import type { PitchAnalysis } from './pitchAnalysis.ts'

type DecodedBuffer = Pick<AudioBuffer, 'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'>
type DecoderContext = {
  state: AudioContextState
  decodeAudioData(data: ArrayBuffer): Promise<DecodedBuffer>
  close(): Promise<void>
}

export async function decodeAndAnalyze(blob: Blob, createContext?: () => DecoderContext): Promise<PitchAnalysis> {
  if (!blob.size) return analyzePitch(new Float32Array(), 16000)
  if (!createContext && typeof AudioContext === 'undefined') {
    throw new Error('Web Audio decoding is not supported in this browser.')
  }
  const context = createContext ? createContext() : new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(buffer.length)
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel)
      for (let index = 0; index < buffer.length; index += 1) mono[index] = (mono[index] ?? 0) + (samples[index] ?? 0) / buffer.numberOfChannels
    }
    return analyzePitch(mono, buffer.sampleRate)
  } finally {
    if (context.state !== 'closed') await context.close()
  }
}

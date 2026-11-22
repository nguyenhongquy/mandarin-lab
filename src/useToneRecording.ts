import { useEffect, useRef, useState } from 'react'
import { MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS, microphoneErrorMessage, releaseMicrophone, supportsMicrophoneRecording } from './recordingSupport.ts'

export function useToneRecording() {
  const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  const supported = supportsMicrophoneRecording(mediaDevices, typeof MediaRecorder !== 'undefined')
  const [requesting, setRequesting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [error, setError] = useState('')
  const recordingRef = useRef(false)
  const requestingRef = useRef(false)
  const playingRef = useRef(false)
  const mountedRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef('')
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const intervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const failedRef = useRef(false)

  function clearTimers() {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    intervalRef.current = null
    timeoutRef.current = null
  }

  function stopPlayback() {
    const player = audioRef.current
    audioRef.current = null
    playingRef.current = false
    if (player) {
      player.onended = null
      player.onerror = null
      player.pause()
      player.currentTime = 0
    }
    if (mountedRef.current) setPlaying(false)
  }

  function discard() {
    stopPlayback()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = ''
    setRecordingUrl('')
    setBlob(null)
    setElapsedSeconds(0)
    setError('')
  }

  function stopRecording() {
    clearTimers()
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
  }

  async function startRecording() {
    setError('')
    if (!supported || !mediaDevices) {
      setError('Microphone recording is not supported in this browser. Use a current browser on HTTPS or localhost.')
      return
    }
    if (recordingRef.current || requestingRef.current || playingRef.current) {
      setError('Stop recording playback before starting a new recording.')
      return
    }
    requestingRef.current = true
    setRequesting(true)
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      if (!mountedRef.current) {
        requestingRef.current = false
        releaseMicrophone(stream)
        return
      }
      requestingRef.current = false
      setRequesting(false)
      if (playingRef.current) {
        releaseMicrophone(stream)
        setError('Stop recording playback before starting a new recording.')
        return
      }

      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      failedRef.current = false
      startedAtRef.current = performance.now()
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        failedRef.current = true
        setError('The browser could not record microphone audio. Check the microphone and try again.')
        clearTimers()
        try {
          if (recorder.state === 'recording') recorder.stop()
        } catch (problem) {
          requestingRef.current = false
          releaseMicrophone(streamRef.current)
          streamRef.current = null
          recorderRef.current = null
          recordingRef.current = false
          chunksRef.current = []
          setRecording(false)
          setRequesting(false)
          setError(microphoneErrorMessage(problem))
        }
      }
      recorder.onstop = () => {
        const duration = Math.min(MAX_RECORDING_SECONDS, (performance.now() - startedAtRef.current) / 1000)
        releaseMicrophone(streamRef.current)
        streamRef.current = null
        recorderRef.current = null
        recordingRef.current = false
        clearTimers()
        if (!mountedRef.current) return
        setRecording(false)
        setElapsedSeconds(duration)
        if (failedRef.current) {
          chunksRef.current = []
          return
        }
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (!recorded.size) {
          setError('The microphone returned an empty recording. Check the input and record again.')
          return
        }
        if (duration < MIN_RECORDING_SECONDS) {
          setError('That recording was too short to analyze. Record a syllable for at least 0.12 seconds.')
          return
        }
        try {
          const url = URL.createObjectURL(recorded)
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          urlRef.current = url
          setBlob(recorded)
          setRecordingUrl(url)
          setError('')
        } catch (problem) {
          setError(microphoneErrorMessage(problem))
        }
      }
      recorder.start(100)
      recordingRef.current = true
      setRecording(true)
      intervalRef.current = window.setInterval(() => {
        if (mountedRef.current) {
          setElapsedSeconds(Math.min(MAX_RECORDING_SECONDS, (performance.now() - startedAtRef.current) / 1000))
        }
      }, 100)
      timeoutRef.current = window.setTimeout(stopRecording, MAX_RECORDING_SECONDS * 1000)
    } catch (problem) {
      releaseMicrophone(streamRef.current)
      streamRef.current = null
      recorderRef.current = null
      recordingRef.current = false
      clearTimers()
      if (!mountedRef.current) return
      setRecording(false)
      setRequesting(false)
      setError(microphoneErrorMessage(problem))
    }
  }

  async function playRecording() {
    if (!recordingUrl || recordingRef.current || playingRef.current) return
    setError('')
    const player = new Audio(recordingUrl)
    audioRef.current = player
    playingRef.current = true
    setPlaying(true)
    const finish = (problem?: string) => {
      if (audioRef.current !== player) return
      player.onended = null
      player.onerror = null
      audioRef.current = null
      playingRef.current = false
      setPlaying(false)
      if (problem) setError(problem)
    }
    player.onended = () => finish()
    player.onerror = () => finish('Could not play the local recording. Try recording again.')
    try {
      await player.play()
    } catch (problem) {
      finish(problem instanceof Error
        ? `Could not play the local recording: ${problem.message}`
        : 'Could not play the local recording. Check that audio is enabled.')
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimers()
      const recorder = recorderRef.current
      if (recorder?.state === 'recording') recorder.stop()
      releaseMicrophone(streamRef.current)
      streamRef.current = null
      stopPlayback()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = ''
    }
  }, [])

  return {
    supported,
    requesting,
    recording,
    playing,
    elapsedSeconds,
    blob,
    recordingUrl,
    error,
    startRecording,
    stopRecording,
    playRecording,
    stopPlayback,
    discard,
  }
}

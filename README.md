# Mandarin SpeechLab

Mandarin SpeechLab is a local-first Mandarin practice app with Tone Listening and Tone Production modules. The original Deutsch Lab project remains separate and unchanged.

## Run locally

Requires Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Validate the project with:

```sh
npm test
npm run build
```

## Tone Listening modes

- **Explore** presents the four citation tones and their schematic contours.
- **Identify** hides the answer and contour until a response is submitted.
- **Contrast** offers Tone 1 vs. 2, Tone 1 vs. 4, Tone 2 vs. 3, Tone 2 vs. 4, and Tone 3 vs. 4, with accuracy tracked separately for each pair.

Contours are illustrative teaching diagrams, not measured pitch tracks. The full dipping Tone 3 shape is a citation-form simplification; its realization varies with context.

## Audio and saved practice

No validated Mandarin reference recordings are bundled. Where a `zh-CN` voice is available, the app offers browser speech synthesis as **prototype audio** only. It does not silently select a non-Mandarin voice, and it does not use this audio to score pronunciation. Install an appropriate Mandarin voice in system or browser settings if none is listed.

Session summaries are saved in browser localStorage under `mandarin-speechlab.sessions.v1`, separate from Deutsch Lab storage. The app does not use cloud services, accounts, or a backend database.

## Tone Production Explorer

The practice sequence is: choose one of the four `ma` tones, listen to a reference, record your pronunciation for up to five seconds, replay it, analyze both recordings when a local reference exists, and repeat. Local recordings are labeled **Local TTS — synthetic reference**. If the generated file is absent or unavailable, the app falls back to **Browser TTS — prototype**, which is listening-only. Browser playback reuses the Phase 1 speech provider, selects an available `zh-CN`/`zh-Hans-CN` voice, and reports when speech synthesis or a Mandarin voice is unavailable. Recording uses `getUserMedia` and `MediaRecorder`; audio decoding uses Web Audio.

Browser TTS is not a validated native-speaker recording. Voice identity, accent, tone realization, and audio quality depend on the browser and installed system voices. `speechSynthesis.speak()` does not expose its rendered PCM through this interface, so the app does not estimate or fabricate a browser-TTS F0 trajectory.

### Generate local TTS references on macOS

The app reads the explicit syllable, tone, audio filename, voice, and language mapping in `public/references/local-tts/manifest.json`. The checked-in manifest is empty until local audio is generated; missing files are skipped with a warning and Browser TTS remains available.

List available Mandarin-capable macOS voices, then pass the exact installed voice name (do not assume a voice such as Tingting is present):

```sh
node scripts/generate-local-tts.mjs --list-voices
node scripts/generate-local-tts.mjs --voice "Exact voice name from the list"
```

The developer-side script uses `say` with the four Chinese characters and `afconvert` to create stable `ma1.wav`–`ma4.wav` PCM files and update the manifest. Re-running it replaces the generated files. It does not run in the browser or contact a service. Check the applicable [Apple software license](https://www.apple.com/legal/sla/) and any voice-specific terms before committing or redistributing generated audio; no voice-generated recordings are bundled in this repository.

The temporary voice output used to validate generation was not retained or committed, and its redistribution terms were not verified. Review the terms for the exact installed voice before publishing generated files.

When a local file is available, the browser loads it, decodes it, and runs the same Phase 2A YIN analyzer used for learner audio. If reference decoding fails, the warning does not prevent reference playback or learner analysis. Browser-TTS fallback audio is never analyzed as measured reference F0.

F0 uses overlapping 35 ms frames and 10 ms hops, with a default 70–500 Hz acceptance range. The comparison offers absolute Hz on one shared scale and relative semitones normalized independently to each recording's median F0. Each reliable voiced interval is mapped to 0–100%; internal unvoiced gaps remain disconnected and hover points retain original timestamps. This simple time normalization is approximate and does not establish phonetic segment correspondence; dynamic time warping is not used. The absolute view preserves speaker pitch differences and does not imply the learner should match the synthetic voice's absolute pitch.

The reference and learner trajectories and the schematic teaching contour can be toggled separately. The schematic is illustrative, is not derived from audio, and is never presented as measured F0. Exploratory comparison feedback is withheld when either measured track has too few reliable voiced frames; it does not score pronunciation or judge tone correctness.

The provider-independent reference model can represent local TTS, browser TTS, or future corpus recordings with audio URL, speaker, voice, language, and measured F0 metadata. No ManDi recordings are downloaded or bundled. Raw learner recordings and analyses stay in page memory, are not uploaded or saved automatically, and are released when the production module is left or the recording is discarded. Browser microphone and Web Audio support are required. F0 is intended for practice and observation, not as ground-truth phonetic measurement.

## Phase 2D.1 Acoustic Inspector

`src/toneAcoustics.ts` consumes the existing `PitchAnalysis`; it does not estimate F0 or modify raw pitch frames. It rejects nonfinite/nonpositive F0 and frames below the existing 0.6 confidence threshold. Reliable frames separated by at most 30 ms of missing tracking are grouped into a candidate region, but missing values are never filled. The longest region is selected; other regions and multiple substantial regions (at least 8 frames and 0.12 seconds) are reported. A three-frame median filter is used only within uninterrupted voiced runs, so it never smooths across a gap.

All semitone features are relative to the selected interval's median F0. Start/end pitch use medians of the first/last 15% of reliable observations; robust range is P10–P90. Early/late trends are Theil–Sen slopes in semitones per normalized interval. Turning points use a three-frame median filter, left/right baselines spanning up to 40% of each contiguous voiced run, and a 1.5-semitone prominence threshold. Provisional direction rules require at least 1.5 semitones of net change, a robust slope of at least 1.5 semitones per normalized interval, and 65% directional consistency; "approximately level" requires a robust range no greater than 2.5 semitones, net change below 1.5 semitones, and no detected turning point. Otherwise, sufficiently reliable movement is described as complex rather than forced into a simple direction.

The exported defaults in `src/toneAcoustics.ts` make thresholds configurable. Low reliability is assigned below 8 selected frames, below 0.12 seconds, below 1% reliable-frame coverage of the full recording, above 40% internal gaps, or with at least two possible octave-jump events (8–14 semitones). High reliability requires at least 24 frames, 0.30 seconds, 25% whole-recording coverage, at most 10% internal gaps, and no detected octave jumps or other substantial voiced regions. Intermediate cases are medium; additional substantial regions or a single octave event prevent high reliability. These are provisional quality heuristics, not calibrated confidence estimates. Long leading/trailing silence is excluded from pitch movement and interval features; full-recording coverage is still shown, and can lower reliability from high to medium, but only drops it to low below 1%.

The Acoustic Inspector is collapsed by default and shows learner/reference measurements, analysis intervals, excluded regions, and warnings. Its optional chart markers map selected-interval boundaries, the early/late midpoint, and any detected turning point from their original measured timestamps. Feature differences are learner minus reference and are withheld when either analysis is low reliability. Matching or differing acoustic descriptions are not correctness judgments, scores, or claims that synthetic TTS is phonetically authoritative.

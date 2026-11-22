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

The practice sequence is: choose one of the four `ma` tones, listen to the reference, record your pronunciation for up to five seconds, replay it, analyze it, and repeat. The reference is labeled **Browser TTS — prototype**. It reuses the Phase 1 browser speech provider, selects an available `zh-CN`/`zh-Hans-CN` voice, and reports when speech synthesis or a Mandarin voice is unavailable. Recording uses `getUserMedia` and `MediaRecorder`; decoding uses Web Audio.

Browser TTS is not a validated native-speaker recording. Voice identity, accent, tone realization, and audio quality depend on the browser and installed system voices. `speechSynthesis.speak()` does not expose its rendered PCM through this interface, so the app does not estimate or fabricate a TTS F0 trajectory.

F0 is estimated from the learner's recording with a lightweight YIN difference-function implementation using overlapping 35 ms frames and 10 ms hops, with a default 70–500 Hz acceptance range.

Analysis displays absolute Hz or semitone movement relative to the recording's median F0. Unvoiced and low-confidence frames remain gaps. The relative view places the existing schematic tone contour beside the learner's measured trajectory; it is illustrative only and is never drawn as measured data on the absolute-Hz chart. Feedback describes detected movement and does not score or classify pronunciation.

The recorded-reference interface can accept local or hosted audio URLs, speaker IDs, and measured F0 metadata in a future corpus phase; no ManDi recordings are downloaded or bundled now. Raw learner recordings and analysis results stay in page memory, are not uploaded or saved automatically, and are released when the production module is left or the recording is discarded. Browser microphone and Web Audio support are required. The estimator is intended for practice and observation, not as ground-truth phonetic measurement; no pronunciation scores are produced.

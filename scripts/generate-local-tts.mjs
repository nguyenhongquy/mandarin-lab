import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { toneExamples } from '../src/tones.ts'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const defaultOutput = resolve(projectRoot, 'public/references/local-tts')
const generationMethod = 'macOS say + afconvert'

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`
    throw new Error(`${command} failed: ${detail}`)
  }
  return result.stdout
}

export function parseVoiceList(output) {
  return output.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(.*?)\s+(zh[_-][A-Za-z0-9_-]+)\s*(?:#.*)?$/i)
    if (!match?.[1] || !match[2]) return []
    return [{ name: match[1].trim(), language: match[2].trim() }]
  })
}

function printUsage() {
  console.log(`Usage:
  node scripts/generate-local-tts.mjs --list-voices
  node scripts/generate-local-tts.mjs --voice "Voice name from the list" [--output-dir path]

Generates four local WAV references and updates the manifest in the output directory.
Existing generated files are replaced when the script is run again.`)
}

function argumentsFrom(argv) {
  const options = { voice: '', outputDir: defaultOutput, listVoices: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument === '--list-voices') {
      options.listVoices = true
    } else if (argument === '--voice' || argument === '--output-dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
      if (argument === '--voice') options.voice = value
      else options.outputDir = resolve(value)
      index += 1
    } else {
      throw new Error(`Unknown option "${argument}". Use --help for usage.`)
    }
  }
  return options
}

async function generate(voiceName, outputDir) {
  if (!voiceName) throw new Error('Choose an installed Mandarin voice with --voice. Use --list-voices to inspect available voices.')
  const voices = parseVoiceList(run('say', ['-v', '?']))
  const voice = voices.find(item => item.name === voiceName)
  if (!voice) {
    const choices = voices.map(item => `${item.name} (${item.language})`).join(', ') || 'none found'
    throw new Error(`Voice "${voiceName}" is unavailable. Mandarin-capable voices reported by macOS: ${choices}.`)
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mandarin-speechlab-tts-'))
  try {
    const entries = []
    for (const example of toneExamples) {
      const audioFile = `${example.syllable}${example.tone}.wav`
      const aiffPath = join(temporaryDirectory, `${example.id}.aiff`)
      const wavPath = join(temporaryDirectory, audioFile)
      run('say', ['-v', voice.name, '-o', aiffPath, example.hanzi])
      run('afconvert', ['-f', 'WAVE', '-d', 'LEI16', aiffPath, wavPath])
      entries.push({
        id: `local-tts-${example.id}`,
        syllable: example.syllable,
        hanzi: example.hanzi,
        pinyin: example.pinyin,
        tone: example.tone,
        source: 'local-tts',
        audioFile,
        voiceName: voice.name,
        language: voice.language,
        generationMethod,
      })
    }

    await mkdir(outputDir, { recursive: true })
    for (const entry of entries) {
      const source = join(temporaryDirectory, entry.audioFile)
      const destination = join(outputDir, entry.audioFile)
      await rename(source, destination)
    }
    const manifest = { schemaVersion: 1, references: entries }
    const manifestTemporaryPath = join(temporaryDirectory, 'manifest.json')
    await writeFile(manifestTemporaryPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await rename(manifestTemporaryPath, join(outputDir, 'manifest.json'))
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }
  if (options.listVoices) {
    const voices = parseVoiceList(run('say', ['-v', '?']))
    if (!voices.length) {
      console.log('No Mandarin-capable voices were reported by macOS.')
      return
    }
    for (const voice of voices) console.log(`${voice.name}\t${voice.language}`)
    return
  }
  await generate(options.voice, options.outputDir)
  console.log(`Generated ${toneExamples.length} local TTS references in ${options.outputDir}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(problem => {
    console.error(problem instanceof Error ? problem.message : 'Local TTS generation failed.')
    process.exitCode = 1
  })
}

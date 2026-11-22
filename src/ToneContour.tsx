import type { MandarinTone } from './tones'

const paths: Record<MandarinTone, string> = {
  1: 'M 18 20 C 42 19 70 19 102 20',
  2: 'M 18 48 C 48 45 70 29 102 12',
  3: 'M 18 43 C 43 50 55 53 69 44 C 82 37 92 34 102 32',
  4: 'M 18 12 C 48 18 74 37 102 49',
}

export function ToneContour({ tone, showLabel = true, size = 'small' }: {
  tone: MandarinTone
  showLabel?: boolean
  size?: 'small' | 'large'
}) {
  const dimensions = size === 'large' ? { width: '100%', height: 180 } : { width: 150, height: 78 }
  return <figure className="tone-contour" aria-label={`Illustrative teaching contour for Tone ${tone}`}>
    <svg viewBox="0 0 120 68" width={dimensions.width} height={dimensions.height} role="img"
      aria-label={`Tone ${tone} schematic pitch contour; not an acoustic measurement`}>
      <line x1="18" y1="8" x2="18" y2="56" className="contour-axis" />
      <line x1="18" y1="56" x2="106" y2="56" className="contour-axis" />
      <path d={paths[tone]} className="contour-line" />
      <text x="60" y="67" textAnchor="middle" className="contour-caption">Time</text>
      <text x="8" y="34" textAnchor="middle" transform="rotate(-90 8 34)" className="contour-caption">Relative pitch</text>
    </svg>
    {showLabel && <figcaption className="text-xs text-slate-600">Illustrative teaching contour · not measured</figcaption>}
  </figure>
}

import { toneDefinition } from './tones.ts'
import type { MandarinTone } from './tones.ts'
import type { FeedbackEvidence, ToneFeedback, ToneFeedbackResult } from './feedback/toneFeedbackTypes.ts'

interface ToneFeedbackPanelProps {
  tone: MandarinTone
  result: ToneFeedbackResult
  selectedEvidenceId: string | null
  highlightableEvidenceIds: ReadonlySet<string>
  onSelectEvidence: (evidenceId: string) => void
  onClearHighlight: () => void
}

function evidenceValue(value: number | string | null): string {
  if (value === null) return 'Unavailable'
  return typeof value === 'number' ? value.toFixed(1) : value
}

function hasTimeInterval(evidence: FeedbackEvidence): boolean {
  const learner = evidence.startTime !== undefined && evidence.endTime !== undefined
    && Number.isFinite(evidence.startTime) && Number.isFinite(evidence.endTime)
    && evidence.endTime >= evidence.startTime
  const reference = evidence.referenceStartTime !== undefined && evidence.referenceEndTime !== undefined
    && Number.isFinite(evidence.referenceStartTime) && Number.isFinite(evidence.referenceEndTime)
    && evidence.referenceEndTime >= evidence.referenceStartTime
  return learner || reference
}

function EvidenceItem({
  evidence,
  selectedEvidenceId,
  highlightableEvidenceIds,
  onSelectEvidence,
}: {
  evidence: FeedbackEvidence
  selectedEvidenceId: string | null
  highlightableEvidenceIds: ReadonlySet<string>
  onSelectEvidence: (evidenceId: string) => void
}) {
  const highlightable = highlightableEvidenceIds.has(evidence.id) && hasTimeInterval(evidence)
  return <li className="rounded-lg border border-[#d7e0d7] bg-white p-3">
    <button type="button" className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24654e]"
      disabled={!highlightable}
      aria-pressed={selectedEvidenceId === evidence.id}
      onClick={() => onSelectEvidence(evidence.id)}>
      <span className="block font-medium">
        {evidence.featureName}: {evidenceValue(evidence.observedValue)}
        {evidence.unit ? ` ${evidence.unit}` : ''}
      </span>
      {evidence.referenceValue !== undefined && <span className="mt-1 block text-xs text-slate-600">
        Reference: {evidenceValue(evidence.referenceValue)}
        {evidence.unit ? ` ${evidence.unit}` : ''}
      </span>}
      <span className="mt-1 block text-xs text-slate-600">{evidence.explanation}</span>
      <span className="mt-2 block text-xs font-semibold text-[#24654e]">
        {selectedEvidenceId === evidence.id ? 'Highlighted on chart' : highlightable ? 'Highlight on chart' : 'No chart interval available'}
      </span>
    </button>
  </li>
}

function AdditionalFeedback({
  feedback,
  selectedEvidenceId,
  highlightableEvidenceIds,
  onSelectEvidence,
}: {
  feedback: ToneFeedback
  selectedEvidenceId: string | null
  highlightableEvidenceIds: ReadonlySet<string>
  onSelectEvidence: (evidenceId: string) => void
}) {
  return <article className="space-y-2 border-t border-[#e1e7e2] pt-3">
    <h5 className="font-semibold">{feedback.title}</h5>
    <p className="text-sm text-slate-700">{feedback.observation}</p>
    <p className="text-xs text-slate-600">{feedback.explanation}</p>
    {feedback.evidence.length > 0 && <ul className="space-y-2">
      {feedback.evidence.map(evidence => <EvidenceItem key={evidence.id} evidence={evidence}
        selectedEvidenceId={selectedEvidenceId} highlightableEvidenceIds={highlightableEvidenceIds}
        onSelectEvidence={onSelectEvidence} />)}
    </ul>}
  </article>
}

export function ToneFeedbackPanel({
  tone,
  result,
  selectedEvidenceId,
  highlightableEvidenceIds,
  onSelectEvidence,
  onClearHighlight,
}: ToneFeedbackPanelProps) {
  const target = toneDefinition(tone)
  const primary = result.primary
  return <section className="rounded-xl border border-[#d7e0d7] bg-white p-4" aria-labelledby="tone-feedback-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-lg font-semibold" id="tone-feedback-heading">Tone Feedback</h4>
        <p className="mt-1 text-sm text-slate-600" lang="zh-Hans">
          Target · Tone {tone} · {target.pinyin} · {target.hanzi}
        </p>
      </div>
      <span className="rounded-full bg-[#f7f9f5] px-3 py-1 text-xs font-semibold text-slate-700">
        {primary.severity === 'retry' ? 'More evidence needed' : 'Exploratory · not a score'}
      </span>
    </div>

    <div className={`mt-4 rounded-lg p-4 ${primary.severity === 'retry'
      ? 'bg-[#fff7e8] text-[#704d17]'
      : primary.severity === 'suggestion'
        ? 'bg-[#f7f9f5] text-[#153c31]'
        : 'bg-[#f1f6f1] text-[#153c31]'}`}>
      <h5 className="font-semibold">{primary.title}</h5>
      <p className="mt-2 text-sm">{primary.observation}</p>
      <p className="mt-2 text-sm">{primary.explanation}</p>
      <p className="mt-3 text-sm"><strong>Try:</strong> {primary.suggestion}</p>
      {primary.encouragement && <p className="mt-2 text-sm font-medium">{primary.encouragement}</p>}
      <p className="mt-3 text-xs">
        Measurement reliability: {primary.confidence}. {primary.confidenceExplanation}
      </p>
    </div>

    {primary.evidence.length > 0 && <div className="mt-4 space-y-2">
      <h5 className="text-sm font-semibold">Supporting evidence</h5>
      <ul className="space-y-2">
        {primary.evidence.map(evidence => <EvidenceItem key={evidence.id} evidence={evidence}
          selectedEvidenceId={selectedEvidenceId} highlightableEvidenceIds={highlightableEvidenceIds}
          onSelectEvidence={onSelectEvidence} />)}
      </ul>
    </div>}

    {result.additional.length > 0 && <details className="mt-4 rounded-lg border border-[#e1e7e2] p-3">
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        Additional observations and evidence ({result.additional.length})
      </summary>
      <div className="mt-3 space-y-3">
        {result.additional.map(feedback => <AdditionalFeedback key={`${feedback.code}-${feedback.priority}`}
          feedback={feedback} selectedEvidenceId={selectedEvidenceId}
          highlightableEvidenceIds={highlightableEvidenceIds} onSelectEvidence={onSelectEvidence} />)}
      </div>
    </details>}

    {selectedEvidenceId && <button type="button" className="button button-secondary mt-4" onClick={onClearHighlight}>
      Clear chart highlight
    </button>}
  </section>
}

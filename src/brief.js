export const BRIEF_FIELDS = [
  'headline',
  'summary',
  'decisions',
  'actions',
  'risks',
  'questions',
  'evidence',
  'nextSteps',
  'flashcards',
  'confidenceNote'
];

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean).slice(0, 12);
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { task: item.trim(), owner: 'Unassigned', due: 'No date stated', priority: 'Medium' };
      }
      return {
        task: cleanString(item?.task),
        owner: cleanString(item?.owner) || 'Unassigned',
        due: cleanString(item?.due) || 'No date stated',
        priority: ['High', 'Medium', 'Low'].includes(item?.priority) ? item.priority : 'Medium'
      };
    })
    .filter((item) => item.task)
    .slice(0, 12);
}

function normalizeFlashcards(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ front: cleanString(item?.front), back: cleanString(item?.back) }))
    .filter((item) => item.front && item.back)
    .slice(0, 8);
}

export function normalizeBrief(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    headline: cleanString(source.headline) || 'Decision brief',
    summary: cleanString(source.summary) || 'No summary was generated.',
    decisions: stringArray(source.decisions),
    actions: normalizeActions(source.actions),
    risks: stringArray(source.risks),
    questions: stringArray(source.questions),
    evidence: stringArray(source.evidence),
    nextSteps: stringArray(source.nextSteps),
    flashcards: normalizeFlashcards(source.flashcards),
    confidenceNote: cleanString(source.confidenceNote) || 'Review names, dates, and commitments before sharing.'
  };
}

export function parseBriefResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('The model returned an empty response.');
  }

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || rawText;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error('The model response did not contain a JSON object.');
  }

  return normalizeBrief(JSON.parse(candidate.slice(start, end + 1)));
}

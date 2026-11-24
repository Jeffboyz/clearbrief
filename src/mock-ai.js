import { normalizeBrief } from './brief.js';

function splitUnits(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((unit) => unit.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((unit) => unit.length > 12);
}

function unique(items, limit = 8) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function inferOwner(sentence) {
  const patterns = [
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:will|to|should|needs to|is responsible for)\b/,
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:will|owns|is responsible for)\b/
  ];
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (match) return match[1];
  }
  return 'Unassigned';
}

function inferDue(sentence) {
  const match = sentence.match(/\b(?:by|before|on)\s+((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|tomorrow|next week|\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|\d{4}-\d{2}-\d{2})/i);
  return match ? match[0].replace(/^(by|before|on)\s+/i, '') : 'No date stated';
}

function inferPriority(sentence) {
  if (/\b(urgent|asap|critical|blocker|must|deadline|today)\b/i.test(sentence)) return 'High';
  if (/\b(later|eventually|nice to have|when possible)\b/i.test(sentence)) return 'Low';
  return 'Medium';
}

function buildMockBrief(text, context, phase) {
  const units = splitUnits(text);
  const lowerUnits = units.map((unit) => unit.toLowerCase());

  const decisions = unique(units.filter((_, i) =>
    /(decided|agreed|approved|confirmed|we will use|the plan is|chosen|go with)/.test(lowerUnits[i])
  ), 5);

  const actions = units
    .filter((_, i) => /(todo|action|will|need to|needs to|should|must|prepare|send|build|test|review|follow up|schedule)/.test(lowerUnits[i]))
    .slice(0, 7)
    .map((sentence) => ({
      task: sentence.replace(/\s+/g, ' '),
      owner: inferOwner(sentence),
      due: inferDue(sentence),
      priority: inferPriority(sentence)
    }));

  const risks = unique(units.filter((_, i) =>
    /(risk|blocked|blocker|concern|delay|issue|problem|unclear|missing|failure|offline|privacy)/.test(lowerUnits[i])
  ), 5);

  const questions = unique(units.filter((unit, i) =>
    unit.includes('?') || /(unknown|not sure|need to confirm|open question|whether)/.test(lowerUnits[i])
  ), 5);

  const evidence = unique(units.filter((_, i) =>
    /(\d|%|users?|customers?|participants?|teams?|deadline|results?|data|survey|tested|measured)/.test(lowerUnits[i])
  ), 5);

  const topic = context.title || 'the discussion';
  const opening = units.slice(0, 2).join(' ');
  const summary = opening
    ? `${opening} The brief separates confirmed decisions from follow-up work so the team can act without rereading the full ${context.inputType.toLowerCase()}.`
    : `This brief structures ${topic} into decisions, actions, risks, and open questions.`;

  const flashcards = context.inputType === 'Study notes'
    ? units
        .filter((unit) => /\bis\b|\bmeans\b|\brefers to\b/i.test(unit))
        .slice(0, 5)
        .map((unit) => {
          const [front, ...rest] = unit.split(/\s+(?:is|means|refers to)\s+/i);
          return { front: `What is ${front.trim()}?`, back: rest.join(' ').trim() || unit };
        })
        .filter((card) => card.back)
    : [];

  const nextSteps = actions.length
    ? actions.slice(0, 4).map((action) => `${action.owner}: ${action.task}`)
    : ['Confirm the owner and due date for the first follow-up item.'];

  return normalizeBrief({
    headline: phase === 'cloud'
      ? `${topic}: polished decision brief`
      : `${topic}: instant private brief`,
    summary: phase === 'cloud'
      ? `${summary} The cloud pass sharpens the wording, prioritizes the work, and turns unresolved points into an explicit follow-up agenda.`
      : summary,
    decisions: decisions.length ? decisions : ['No explicit decision was stated; the output preserves follow-ups separately.'],
    actions,
    risks,
    questions,
    evidence,
    nextSteps,
    flashcards,
    confidenceNote: phase === 'cloud'
      ? 'Demo cloud pass: simulated locally. With Firebase configured, this pass uses Gemini in the cloud through Firebase AI Logic.'
      : 'Demo on-device pass: simulated locally so the complete product flow works before a Firebase project is connected.'
  });
}

export async function generateMockBrief({ text, context, phase = 'device' }) {
  await new Promise((resolve) => setTimeout(resolve, phase === 'cloud' ? 650 : 350));
  return buildMockBrief(text, context, phase);
}

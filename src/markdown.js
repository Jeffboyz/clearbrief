function list(items, formatter = (item) => item) {
  return items?.length ? items.map((item) => `- ${formatter(item)}`).join('\n') : '- None identified.';
}

export function briefToMarkdown(brief, metadata = {}) {
  const actions = brief.actions?.length
    ? brief.actions.map((action) => `- [ ] **${action.task}** — Owner: ${action.owner}; Due: ${action.due}; Priority: ${action.priority}`).join('\n')
    : '- None identified.';

  const flashcards = brief.flashcards?.length
    ? brief.flashcards.map((card) => `- **Q:** ${card.front}\n  **A:** ${card.back}`).join('\n')
    : '';

  return `# ${brief.headline}

> Route: ${metadata.routeLabel || 'Hybrid'}${metadata.source ? ` · Source: ${metadata.source}` : ''}${metadata.generatedAt ? ` · Generated: ${metadata.generatedAt}` : ''}

## Executive summary
${brief.summary}

## Decisions
${list(brief.decisions)}

## Action items
${actions}

## Risks and blockers
${list(brief.risks)}

## Open questions
${list(brief.questions)}

## Evidence and notable details
${list(brief.evidence)}

## Recommended next steps
${list(brief.nextSteps)}
${flashcards ? `\n## Study flashcards\n${flashcards}\n` : ''}
## Review note
${brief.confidenceNote}
`;
}

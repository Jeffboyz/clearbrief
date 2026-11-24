const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_CREDENTIAL_RE = /(https?:\/\/[^\s/@:]+:)[^\s/@]+@/gi;
const PHONE_RE = /(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)/g;
const SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const LABELED_SECRET_RE = /\b(password|passcode|api[_ -]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi;

function replaceWithCounter(text, regex, label, counter) {
  return text.replace(regex, (match) => {
    if (label === '[PHONE]' && (match.replace(/\D/g, '').length < 8 || match.replace(/\D/g, '').length > 15)) {
      return match;
    }
    counter.count += 1;
    return label;
  });
}

export function redactSensitiveText(input) {
  const counter = { count: 0 };
  let text = String(input || '');

  text = replaceWithCounter(text, URL_CREDENTIAL_RE, '$1[REDACTED]@', counter);
  text = replaceWithCounter(text, EMAIL_RE, '[EMAIL]', counter);
  text = replaceWithCounter(text, SECRET_RE, '[SECRET]', counter);
  text = text.replace(LABELED_SECRET_RE, (_match, label) => {
    counter.count += 1;
    return `${label}: [REDACTED]`;
  });
  text = replaceWithCounter(text, PHONE_RE, '[PHONE]', counter);

  return { text, count: counter.count };
}

export function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

const STORAGE_KEY = 'clearbrief.history.v1';

export function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBriefToHistory(entry) {
  const history = [entry, ...loadHistory()].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

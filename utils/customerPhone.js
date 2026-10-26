function normalizeDanishPhone(value) {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('45')) digits = digits.slice(2);
  return /^\d{8}$/.test(digits) ? digits : null;
}

function phoneFromFirstLine(description) {
  const firstLine = String(description || '').split(/\r?\n/, 1)[0].trim();
  const phoneText = firstLine.replace(/^telefon\s*:\s*/i, '');
  if (!/^[+()\d\s-]+$/.test(phoneText)) return null;
  return normalizeDanishPhone(phoneText);
}

module.exports = { normalizeDanishPhone, phoneFromFirstLine };

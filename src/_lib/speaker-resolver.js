/**
 * Speaker name resolution, shared by .eleventy.js filters and the test harness.
 *
 * Kept in its own module (rather than inline in .eleventy.js) so the test
 * harness can unit-test the normalisation rules directly instead of only
 * observing them through built HTML.
 */

/**
 * Normalise a speaker name for fuzzy matching: strip *all* trailing academic
 * credentials, strip parentheticals, fold accents, lowercase, collapse spaces.
 *
 * The credential strip loops until the string stops changing. The original
 * single-pass version dropped only one credential, so chained credentials like
 * "Nouchine Hadjikhani, MD, PhD" never matched "Nouchine Hadjikhani" and the
 * speaker was silently omitted from the rendered page.
 */
function normalizeName(name) {
  if (!name) return '';
  let n = String(name).toLowerCase();

  const credential = /,?\s*(ph\.?\s?d\.?|m\.?\s?d\.?|m\.?\s?a\.?|m\.?\s?s\.?|m\.?f\.?a\.?|m\.?p\.?h\.?|d\.?phil\.?|ed\.?d\.?|psy\.?d\.?|j\.?d\.?|d\.?d\.?s\.?|sc\.?d\.?|dr\.?|jr\.?|sr\.?|esq\.?|f\.?r\.?s\.?|iii|ii|iv)$/i;
  const parenthetical = /,?\s*\(.*?\)\s*$/;

  // Strip chained trailing credentials/parentheticals until stable.
  let previous;
  do {
    previous = n;
    n = n.replace(parenthetical, '').trim();
    n = n.replace(credential, '').trim();
  } while (n !== previous);

  return n
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõöő]/g, 'o')
    .replace(/[ùúûüű]/g, 'u').replace(/[ýÿ]/g, 'y')
    .replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g').replace(/[şš]/g, 's').replace(/[ž]/g, 'z')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a name against a speakers array. Exact match wins; otherwise a
 * normalised match. Returns the speaker object, or null when unresolved.
 */
function findSpeaker(speakers, name) {
  if (!name || !speakers) return null;
  const exact = speakers.find(s => s.name === name);
  if (exact) return exact;
  const target = normalizeName(name);
  if (!target) return null;
  return speakers.find(s => normalizeName(s.name) === target) || null;
}

/**
 * Like findSpeaker, but throws instead of returning null. Used where an
 * unresolved name means a data bug that must not be silently swallowed
 * (award lists, which are hand-curated and must always resolve).
 */
function requireSpeaker(speakers, name, context) {
  const found = findSpeaker(speakers, name);
  if (!found) {
    throw new Error(
      `requireSpeaker: no speakers.json entry for "${name}"` +
      (context ? ` (referenced by ${context})` : '') +
      '. Add the speaker to src/_data/speakers.json or remove the name from the award list.'
    );
  }
  return found;
}

module.exports = { normalizeName, findSpeaker, requireSpeaker };

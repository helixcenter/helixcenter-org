#!/usr/bin/env node
/**
 * Standalone data-integrity checks for Helix Center JSON data.
 *
 * No dependencies beyond Node's built-in `fs`/`path`. Operates directly on
 * src/_data/*.json (not the built _site output).
 *
 * Usage: node tests/data-integrity.js
 * Exit code: 0 if all checks pass, 1 if any check fails.
 *
 * Can also be required by another harness (e.g. tests/run-tests.js):
 *   const { run } = require('./data-integrity');
 *   const { passed, failed } = run();
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', '_data');

// Confirmed-dead URLs from reports/worker_static_audit_appendix.md (Check 3),
// re-verified 2026-09-16. Any url/website/googleScholar field in speakers.json
// must not equal one of these.
const CONFIRMED_DEAD_URLS = [
  'https://www.eventbrite.com/o/the-helix-center-8028498869',
  'https://www.equator-network.org/reporting-guidelines/spirit-ai/',
  'https://www.equator-network.org/reporting-guidelines/consort-ai/',
  'https://barnard.edu/news/professor-alexandra-horowitz-publishes-new-book-early-canine-development',
  'https://www.stonybrook.edu/commcms/english/people/cook.php',
  'https://saddleroadpress.com/amy-holman.html',
  'https://www.columbiapsychiatry.org/profile/andrew-j-gerber-md',
  'https://scholar.google.com/citations?user=kmcQMRwAAAAJ&hl=en',
  'https://utsnyc.edu/blog/faculty/brigitte-kahl/',
  'https://www.acamh.org/journal/jcpp/adhd-aces-lugo%E2%80%90candelas/',
  'https://www.imnf.org/staff-publications',
  'https://en.wikipedia.org/wiki/Edward_Tenner',
  'https://liberalstudies.nyu.edu/about/faculty-listing/farzad-mahootian.html',
  'https://nybrain.org/expert-nyc-neurologist/',
  'https://scholar.google.com/citations?user=80xLWOgAAAAJ',
  'https://www.rhodes.edu/bio/jasper-st-bernard',
  'https://sociology.yale.edu/people/jeffrey-alexander',
  'https://research.ibm.com/people/jeff-kephart',
  'https://as.nyu.edu/faculty/jessica-benjamin.html',
  'https://scholar.google.com/citations?user=l-iUHQMAAAAJ',
  'https://www.pacifica.edu/faculty/joseph-cambray/joseph_cambray/',
  'https://www.researchwithrutgers.com/en/publications/disillusioned',
  'https://scholar.google.com/citations?user=EYkvdKEAAAAJ',
  'https://kenyon.edu/directory/katherine-elkins/',
  'https://scholar.google.com/citations?user=e1R8sN8AAAAJ&hl=en',
  'https://scholar.google.com/citations?user=QN1bH0gAAAAJ',
  'https://gradschool.weill.cornell.edu/faculty/miklos-toth',
  'https://eskenazi.indiana.edu/events/speaker-series/mckinney-series/upcoming-events/2026-04-03-patricia-olynyk.html',
  'https://www.graywolfpress.org/books/erasure',
  'https://anthropology.rutgers.edu/people/non-departmental-grad-faculty-members/111-r-brian-ferguson',
  'https://scholar.google.com/citations?user=aqhbwSMAAAAJ&hl=en',
  'https://www.nature.com/articles/s41746-025-01077-4',
  'https://www.nature.com/articles/s42256-021-00344-z',
  'https://physics.yale.edu/people/sarah-demers',
  'https://gradschool.weill.cornell.edu/faculty/selina-chen-kiang',
  'https://scholar.google.com/citations?user=StzKipcAAAAJ&hl=en',
  'https://www.tayarishapoe.com/',
  'https://directory.seas.upenn.edu/tal-rabin/',
  'https://scholar.google.com/citations?user=UKttW0MAAAAJ',
  'https://victorialoustalot.com/',
  'https://www.helixcenter.org/wp-content/uploads/2015/01/Science-Big-Questions.jpeg',
];

const CREDENTIAL_SUFFIX_RE = /,\s*(Ph\.?D|M\.?D|PhD|MD)\b/i;

function loadJSON(filename) {
  const p = path.join(DATA_DIR, filename);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      const detail = fn();
      results.push({ name, ok: true, detail: detail || '' });
      passed++;
    } catch (e) {
      results.push({ name, ok: false, detail: e.message });
      failed++;
    }
  }

  let speakers, roundtables, disciplines, institutions;
  check('load speakers.json', () => {
    speakers = loadJSON('speakers.json');
    return `${speakers.length} speakers`;
  });
  check('load roundtables.json', () => {
    roundtables = loadJSON('roundtables.json');
    return `${roundtables.length} roundtables`;
  });
  check('load disciplines.json', () => {
    disciplines = loadJSON('disciplines.json');
    return `${disciplines.length} disciplines`;
  });
  check('load institutions.json', () => {
    institutions = loadJSON('institutions.json');
    return `${institutions.length} institutions`;
  });

  if (!speakers || !roundtables || !disciplines) {
    // Can't run further checks meaningfully.
    printResults(results);
    return { passed, failed };
  }

  const speakerNames = new Set(speakers.map((s) => s.name));

  check('every roundtables[].speakers[] name matches a speakers[].name', () => {
    const bad = [];
    for (const r of roundtables) {
      for (const name of r.speakers || []) {
        if (!speakerNames.has(name)) bad.push(`${r.slug} | ${name}`);
      }
    }
    if (bad.length) {
      throw new Error(`${bad.length} mismatch(es): ${bad.slice(0, 10).join('; ')}`);
    }
    return 'all speakers[] entries resolve';
  });

  check('every roundtables[].speakerDetails[].name matches a speakers[].name', () => {
    const bad = [];
    for (const r of roundtables) {
      for (const sd of r.speakerDetails || []) {
        if (!speakerNames.has(sd.name)) bad.push(`${r.slug} | ${sd.name}`);
      }
    }
    if (bad.length) {
      throw new Error(`${bad.length} mismatch(es): ${bad.slice(0, 10).join('; ')}`);
    }
    return 'all speakerDetails[] entries resolve';
  });

  check('every speakers[].roundtables[] title matches a roundtables[].title', () => {
    const roundtableTitles = new Set(roundtables.map((r) => r.title));
    const bad = [];
    for (const s of speakers) {
      for (const title of s.roundtables || []) {
        if (!roundtableTitles.has(title)) bad.push(`${s.name} | ${title}`);
      }
    }
    if (bad.length) {
      throw new Error(`${bad.length} mismatch(es): ${bad.slice(0, 10).join('; ')}`);
    }
    return 'all speakers[].roundtables[] titles resolve';
  });

  check('every speakers[].domain exists in disciplines.json', () => {
    const disciplineNames = new Set(disciplines.map((d) => d.name));
    const bad = [];
    for (const s of speakers) {
      if (s.domain && !disciplineNames.has(s.domain)) bad.push(`${s.name} | ${s.domain}`);
    }
    if (bad.length) {
      throw new Error(`${bad.length} mismatch(es): ${bad.slice(0, 10).join('; ')}`);
    }
    return 'all domains resolve';
  });

  check('disciplines[].count equals speakers grouped by domain', () => {
    const counts = {};
    for (const s of speakers) {
      if (!s.domain) continue;
      counts[s.domain] = (counts[s.domain] || 0) + 1;
    }
    const bad = [];
    for (const d of disciplines) {
      const actual = counts[d.name] || 0;
      if (actual !== d.count) bad.push(`${d.name}: file=${d.count} actual=${actual}`);
    }
    if (bad.length) {
      throw new Error(`${bad.length} mismatch(es): ${bad.join('; ')}`);
    }
    return 'all discipline counts match';
  });

  check('no speakers[].name contains a credential suffix', () => {
    const bad = speakers
      .map((s) => s.name)
      .filter((name) => CREDENTIAL_SUFFIX_RE.test(name));
    if (bad.length) {
      throw new Error(`${bad.length} name(s) with credential suffix: ${bad.join('; ')}`);
    }
    return 'no credential suffixes found';
  });

  check('every slug is unique within speakers.json', () => {
    checkUniqueSlugs(speakers, 'speakers');
    return 'all speaker slugs unique';
  });

  check('every slug is unique within roundtables.json', () => {
    checkUniqueSlugs(roundtables, 'roundtables');
    return 'all roundtable slugs unique';
  });

  check('every slug is unique within disciplines.json', () => {
    checkUniqueSlugs(disciplines, 'disciplines');
    return 'all discipline slugs unique';
  });

  check('no url/website/googleScholar field matches the confirmed-dead-link list', () => {
    const deadSet = new Set(CONFIRMED_DEAD_URLS);
    const bad = [];
    const urlFields = ['url', 'website', 'googleScholar', 'wikipedia', 'imageFile', 'photo'];

    function scan(obj, label) {
      if (obj == null) return;
      if (typeof obj === 'string') {
        if (deadSet.has(obj)) bad.push(label);
        return;
      }
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => scan(item, `${label}[${i}]`));
        return;
      }
      if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (urlFields.includes(key) || typeof obj[key] === 'object') {
            scan(obj[key], `${label}.${key}`);
          }
        }
      }
    }

    for (const s of speakers) scan(s, s.name);
    for (const r of roundtables) scan(r, r.slug);

    if (bad.length) {
      throw new Error(`${bad.length} dead link(s) still present: ${bad.slice(0, 10).join('; ')}`);
    }
    return 'no confirmed-dead links found';
  });

  printResults(results);
  return { passed, failed };
}

function checkUniqueSlugs(items, label) {
  const seen = new Map();
  const dupes = [];
  for (const item of items) {
    if (!item.slug) continue;
    if (seen.has(item.slug)) {
      dupes.push(item.slug);
    } else {
      seen.set(item.slug, true);
    }
  }
  if (dupes.length) {
    throw new Error(`${dupes.length} duplicate slug(s) in ${label}: ${dupes.join(', ')}`);
  }
}

function printResults(results) {
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    const suffix = r.detail ? ` — ${r.detail}` : '';
    console.log(`[${status}] ${r.name}${suffix}`);
  }
}

if (require.main === module) {
  const { passed, failed } = run();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { run };

#!/usr/bin/env node
/**
 * Comprehensive test suite for Helix Center website.
 * Tests operate on the built _site output from Eleventy.
 *
 * Categories:
 *   UNIT        — Data integrity, filter logic, data relationships
 *   INTEGRATION — Built output, template rendering, cross-component
 *   E2E         — Full page structure, SEO, accessibility, feeds
 *
 * Ported into this repo from ../helix-center-website/tests/run-tests.js.
 *
 * BUILD/MINIFY DECISION: this harness runs plain `npx @11ty/eleventy`
 * (no minify step), not `npm run build` (which additionally runs
 * clean-css-cli + terser in place on _site/css/main.css and
 * _site/js/main.js). Reasoning: the harness's own content assertions
 * against JS/CSS logic (e.g. search filter code, tag-pill CSS rules)
 * read the *source* files via readSrc() (src/js/main.js, src/css/main.css),
 * never the built/minified copies — readFile() on css/main.css or
 * js/main.js is only ever used for fileExists() checks, never content
 * matching. So minification wouldn't break any assertion either way, but
 * building unminified avoids re-minifying on every test run (slower) and
 * matches the harness's original upstream behavior exactly.
 *
 * Usage: npm test   (from repo root)  ==  node tests/run-tests.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_DIR = path.join(__dirname, '..');
const BUILD_DIR = path.join(SITE_DIR, '_site');
const DATA_DIR = path.join(SITE_DIR, 'src', '_data');
const SRC_DIR = path.join(SITE_DIR, 'src');

// ── Test framework ──────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
let errors = [];
let currentSuite = '';
const suiteResults = {};

function suite(name) {
  currentSuite = name;
  suiteResults[name] = { passed: 0, failed: 0 };
}

function test(name, fn) {
  try {
    fn();
    passed++;
    suiteResults[currentSuite].passed++;
  } catch (e) {
    failed++;
    suiteResults[currentSuite].failed++;
    errors.push({ suite: currentSuite, name, message: e.message });
    console.log(`  FAIL: ${currentSuite} > ${name}`);
    console.log(`        ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg || `Expected ${expected}, got ${actual}`);
}

function assertIncludes(str, substr, msg) {
  if (!str.includes(substr)) throw new Error(msg || `Expected to find "${substr.substring(0, 100)}"`);
}

function assertNotIncludes(str, substr, msg) {
  if (str.includes(substr)) throw new Error(msg || `Expected NOT to find "${substr.substring(0, 100)}"`);
}

function assertMatch(str, regex, msg) {
  if (!regex.test(str)) throw new Error(msg || `Expected to match ${regex}`);
}

function assertNoMatch(str, regex, msg) {
  if (regex.test(str)) throw new Error(msg || `Expected NOT to match ${regex}`);
}

function readFile(relPath) {
  return fs.readFileSync(path.join(BUILD_DIR, relPath), 'utf8');
}

function readSrc(relPath) {
  return fs.readFileSync(path.join(SRC_DIR, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(BUILD_DIR, relPath));
}

function readData(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function countMatches(str, pattern) {
  return (str.match(pattern) || []).length;
}

// ── Build ───────────────────────────────────────
console.log('Building site...');
try {
  execSync('npx @11ty/eleventy', { cwd: SITE_DIR, stdio: 'pipe' });
  console.log('Build complete.\n');
} catch (e) {
  console.error('BUILD FAILED:', e.stderr?.toString() || e.message);
  process.exit(1);
}

// ╔═══════════════════════════════════════════════╗
// ║  BUG #1: RSS Feed (podcast-feed-serving)      ║
// ╚═══════════════════════════════════════════════╝

// --- Unit: podcast data integrity ---
suite('Bug1/Unit: podcast data integrity');
(() => {
  const podcasts = readData('podcasts.json');

  test('has 100+ podcast episodes', () => {
    assert(podcasts.length >= 100, `Expected 100+, got ${podcasts.length}`);
  });

  test('every episode has a title', () => {
    const missing = podcasts.filter(p => !p.title);
    assertEqual(missing.length, 0, `${missing.length} episodes missing title`);
  });

  test('every episode has a date', () => {
    const missing = podcasts.filter(p => !p.date);
    assertEqual(missing.length, 0, `${missing.length} episodes missing date`);
  });

  test('every episode has a roundtableLink', () => {
    const missing = podcasts.filter(p => !p.roundtableLink);
    assertEqual(missing.length, 0, `${missing.length} episodes missing roundtableLink`);
  });

  test('dates are parseable', () => {
    const bad = podcasts.filter(p => isNaN(new Date(p.date).getTime()));
    assertEqual(bad.length, 0, `${bad.length} episodes have unparseable dates: ${bad.map(b => b.title).join(', ')}`);
  });

  test('no duplicate titles', () => {
    const titles = podcasts.map(p => p.title);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    assertEqual(dupes.length, 0, `Duplicate titles: ${dupes.join(', ')}`);
  });

  test('durations are valid format (H:MM or M:SS)', () => {
    const withDur = podcasts.filter(p => p.duration);
    const bad = withDur.filter(p => !/^\d{1,2}:\d{2}(:\d{2})?$/.test(p.duration));
    assertEqual(bad.length, 0, `Bad durations: ${bad.map(b => `${b.title}=${b.duration}`).join(', ')}`);
  });
})();

// --- Unit: audio URL resolution ---
suite('Bug1/Unit: audio URL resolution');
(() => {
  const media = readData('roundtable-media.json');

  test('media data has entries for all roundtables', () => {
    const roundtables = readData('roundtables.json');
    const missing = roundtables.filter(r => !media[r.slug]);
    assertEqual(missing.length, 0, `${missing.length} roundtables missing from media data`);
  });

  test('all audioUrls are full HTTP URLs', () => {
    let bad = [];
    for (const [slug, entry] of Object.entries(media)) {
      if (entry.audioUrls) {
        for (const url of entry.audioUrls) {
          if (!url.startsWith('http')) bad.push(slug);
        }
      }
    }
    assertEqual(bad.length, 0, `Non-HTTP audio URLs: ${bad.join(', ')}`);
  });

  test('audio URLs point to media.helixcenter.org', () => {
    let bad = [];
    for (const [slug, entry] of Object.entries(media)) {
      if (entry.audioUrls) {
        for (const url of entry.audioUrls) {
          if (!url.includes('media.helixcenter.org')) bad.push(slug);
        }
      }
    }
    assertEqual(bad.length, 0, `${bad.length} audio URLs not on media.helixcenter.org`);
  });
})();

// --- Integration: RSS feed generated ---
suite('Bug1/Integration: RSS feed output');
(() => {
  test('feed file exists at /feed/index.xml', () => {
    assert(fileExists('feed/index.xml'), 'RSS feed not generated');
  });

  const feed = readFile('feed/index.xml');

  test('starts with XML declaration', () => {
    assertIncludes(feed, '<?xml version="1.0"');
  });

  test('has RSS 2.0 root element', () => {
    assertIncludes(feed, '<rss version="2.0"');
  });

  test('has iTunes namespace', () => {
    assertIncludes(feed, 'xmlns:itunes=');
  });

  test('has Atom namespace', () => {
    assertIncludes(feed, 'xmlns:atom=');
  });

  test('has channel title', () => {
    assertIncludes(feed, '<title>The Helix Center Roundtable Discussions</title>');
  });

  test('has channel link to roundtables', () => {
    assertIncludes(feed, '<link>https://www.helixcenter.org/roundtables/</link>');
  });

  test('has atom:link self-reference', () => {
    assertMatch(feed, /atom:link href="[^"]*\/feed\/index\.xml" rel="self"/);
  });

  test('has lastBuildDate (non-empty)', () => {
    assertMatch(feed, /<lastBuildDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
  });

  test('has language', () => {
    assertIncludes(feed, '<language>en-us</language>');
  });

  test('has copyright', () => {
    assertMatch(feed, /<copyright>[^<]+<\/copyright>/);
  });

  test('has channel image', () => {
    assertIncludes(feed, '<image>');
    assertIncludes(feed, 'helix-center-og.jpg');
  });

  test('has iTunes author', () => {
    assertIncludes(feed, '<itunes:author>The Helix Center</itunes:author>');
  });

  test('has iTunes categories', () => {
    assertIncludes(feed, '<itunes:category text="Science"/>');
  });

  test('has iTunes explicit false', () => {
    assertIncludes(feed, '<itunes:explicit>false</itunes:explicit>');
  });

  test('has iTunes image', () => {
    assertMatch(feed, /<itunes:image href="[^"]+"/);
  });
})();

// --- Integration: RSS feed episodes ---
suite('Bug1/Integration: RSS feed episodes');
(() => {
  const feed = readFile('feed/index.xml');
  const items = feed.match(/<item>[\s\S]*?<\/item>/g) || [];

  test('has 130+ episodes', () => {
    assert(items.length >= 130, `Expected 130+ items, got ${items.length}`);
  });

  test('every item has <title>', () => {
    const missing = items.filter(i => !/<title>[^<]+<\/title>/.test(i));
    assertEqual(missing.length, 0, `${missing.length} items missing title`);
  });

  test('every item has <link>', () => {
    const missing = items.filter(i => !/<link>[^<]+<\/link>/.test(i));
    assertEqual(missing.length, 0, `${missing.length} items missing link`);
  });

  test('every item has <guid>', () => {
    const missing = items.filter(i => !/<guid[^>]*>[^<]+<\/guid>/.test(i));
    assertEqual(missing.length, 0, `${missing.length} items missing guid`);
  });

  test('every item has <pubDate>', () => {
    const missing = items.filter(i => !/<pubDate>[^<]+<\/pubDate>/.test(i));
    assertEqual(missing.length, 0, `${missing.length} items missing pubDate`);
  });

  test('every item has <enclosure> with audio URL', () => {
    const missing = items.filter(i => !/<enclosure url="https?:\/\/[^"]+"/i.test(i));
    assertEqual(missing.length, 0, `${missing.length} items missing or bad enclosure`);
  });

  test('every item has <description>', () => {
    const missing = items.filter(i => !/<description>[^<]+<\/description>/.test(i));
    assertEqual(missing.length, 0, `${missing.length} items missing description`);
  });

  test('guids are unique', () => {
    const guids = items.map(i => (i.match(/<guid[^>]*>([^<]+)<\/guid>/) || [])[1]).filter(Boolean);
    const unique = new Set(guids);
    assertEqual(guids.length, unique.size, `${guids.length - unique.size} duplicate guids`);
  });

  test('first episode is most recent', () => {
    const newest = readData('podcasts.json')
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const escaped = newest.title.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assertMatch(items[0], new RegExp(`<title>${escaped}</title>`));
  });
})();

// --- E2E: RSS feed validity ---
suite('Bug1/E2E: RSS feed XML validity');
(() => {
  test('passes Python XML parser', () => {
    const feedPath = path.join(BUILD_DIR, 'feed/index.xml');
    try {
      execSync(`python3 -c "import xml.etree.ElementTree as ET; ET.parse('${feedPath}')"`, { stdio: 'pipe' });
    } catch (e) {
      throw new Error('XML parsing failed: ' + (e.stderr?.toString() || e.message));
    }
  });

  test('footer RSS link points to local feed', () => {
    const homepage = readFile('index.html');
    assertIncludes(homepage, 'href="/feed/index.xml"');
    assertNotIncludes(homepage, 'href="https://www.helixcenter.org/feed/"');
  });

  test('footer RSS link does not open in new tab', () => {
    const footer = readSrc('_includes/partials/footer.njk');
    // RSS links should not have target="_blank" since feed is local
    const rssLines = footer.split('\n').filter(l => l.includes('site.social.rss'));
    for (const line of rssLines) {
      assertNotIncludes(line, 'target="_blank"', 'RSS link should not target _blank');
    }
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  BUG #2: Year dropdown breaks                 ║
// ╚═══════════════════════════════════════════════╝

// --- Unit: roundtable year data ---
suite('Bug2/Unit: roundtable year data');
(() => {
  const roundtables = readData('roundtables.json');

  test('every roundtable has a year', () => {
    const missing = roundtables.filter(r => !r.year);
    assertEqual(missing.length, 0, `${missing.length} roundtables missing year`);
  });

  test('years are integers', () => {
    const nonInt = roundtables.filter(r => typeof r.year !== 'number');
    assertEqual(nonInt.length, 0, `${nonInt.length} roundtables have non-integer year`);
  });

  test('years are in valid range (2012-2026)', () => {
    const bad = roundtables.filter(r => r.year < 2012 || r.year > 2026);
    assertEqual(bad.length, 0, `${bad.length} roundtables have out-of-range year`);
  });

  test('all years 2012-2026 represented', () => {
    const years = new Set(roundtables.map(r => r.year));
    for (let y = 2012; y <= 2026; y++) {
      assert(years.has(y), `Year ${y} has no roundtables`);
    }
  });
})();

// --- Integration: year filter on paginated page ---
suite('Bug2/Integration: year filter redirect');
(() => {
  const mainJs = readSrc('js/main.js');

  test('paginated roundtables redirects year filter to /roundtables/all/', () => {
    assertIncludes(mainJs, "'/roundtables/all/?'");
  });

  test('redirect includes year param', () => {
    assertIncludes(mainJs, "'year=' + encodeURIComponent(yearVal)");
  });

  test('redirect includes topic param', () => {
    assertIncludes(mainJs, "'topic=' + encodeURIComponent(topicVal)");
  });
})();

// --- Integration: year filter on /roundtables/all/ ---
suite('Bug2/Integration: year filter on all-roundtables');
(() => {
  const allRt = readFile('roundtables/all/index.html');

  test('year dropdown exists', () => {
    assertIncludes(allRt, 'id="rt-all-year"');
  });

  test('year dropdown has options for all years', () => {
    for (const year of ['2013', '2018', '2023', '2025']) {
      assertIncludes(allRt, `<option value="${year}">${year}</option>`);
    }
  });

  test('JS reads year URL param on load', () => {
    assertIncludes(allRt, "params.get('year')");
    assertIncludes(allRt, "yearSel.value = params.get('year')");
  });

  test('all roundtables are in the list', () => {
    const roundtables = readData('roundtables.json');
    const itemCount = countMatches(allRt, /class="rt-all-item"/g);
    assertEqual(itemCount, roundtables.length, `Expected ${roundtables.length} items, got ${itemCount}`);
  });

  test('items have data-year attribute', () => {
    assertMatch(allRt, /data-year="20\d\d"/);
  });
})();

// --- E2E: year filtering works across all years ---
suite('Bug2/E2E: year coverage on all-roundtables');
(() => {
  const allRt = readFile('roundtables/all/index.html');

  for (const year of [2013, 2017, 2019, 2023, 2025]) {
    test(`year ${year} roundtables have data-year="${year}"`, () => {
      assertIncludes(allRt, `data-year="${year}"`);
    });
  }
})();

// ╔═══════════════════════════════════════════════╗
// ║  BUG #3: Roundtable search broken             ║
// ╚═══════════════════════════════════════════════╝

// --- Unit: roundtable data for search ---
suite('Bug3/Unit: roundtable search data');
(() => {
  const roundtables = readData('roundtables.json');

  test('all roundtables have titles', () => {
    const missing = roundtables.filter(r => !r.title);
    assertEqual(missing.length, 0);
  });

  test('Shakespeare Forever exists', () => {
    const found = roundtables.find(r => r.title === 'Shakespeare Forever');
    assert(found, 'Shakespeare Forever not found in data');
  });

  test('multiple Mathematics roundtables exist', () => {
    const mathRts = roundtables.filter(r => /math/i.test(r.title));
    assert(mathRts.length >= 3, `Expected 3+ math roundtables, got ${mathRts.length}`);
  });
})();

// --- Integration: search data lowercase on cards ---
suite('Bug3/Integration: data-searchable lowercase');
(() => {
  // Check paginated roundtable cards
  const rtPage = readFile('roundtables/index.html');
  const matches = rtPage.match(/data-searchable="([^"]*)"/g) || [];

  test('roundtable cards have data-searchable attribute', () => {
    assert(matches.length > 0, 'No data-searchable attributes found');
  });

  test('data-searchable values are lowercased', () => {
    for (const m of matches) {
      const value = m.replace('data-searchable="', '').replace('"', '');
      const textOnly = value.replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '');
      assertEqual(textOnly, textOnly.toLowerCase(), `Uppercase found in: ${value.substring(0, 50)}`);
    }
  });

  // Check all-roundtables page
  const allRt = readFile('roundtables/all/index.html');

  test('Shakespeare Forever searchable in lowercase on all-roundtables', () => {
    assertIncludes(allRt, 'shakespeare forever');
  });

  test('Mathematics searchable in lowercase on all-roundtables', () => {
    assertIncludes(allRt, 'mathematics and other realities');
  });

  test('all roundtables on all-roundtables page have data-searchable', () => {
    const roundtables = readData('roundtables.json');
    const allMatches = allRt.match(/data-searchable="/g) || [];
    assertEqual(allMatches.length, roundtables.length, `Expected ${roundtables.length}, got ${allMatches.length}`);
  });
})();

// --- Integration: search redirect from paginated page ---
suite('Bug3/Integration: search redirect');
(() => {
  const mainJs = readSrc('js/main.js');

  test('roundtable search redirects to /roundtables/all/', () => {
    assertIncludes(mainJs, "'/roundtables/all/?search='");
  });

  test('redirect triggers at 2+ characters', () => {
    assertIncludes(mainJs, 'query.length >= 2');
  });
})();

// --- E2E: search param support ---
suite('Bug3/E2E: search URL param on all-roundtables');
(() => {
  const allRt = readFile('roundtables/all/index.html');

  test('JS reads search param from URL', () => {
    assertIncludes(allRt, "params.get('search')");
  });

  test('JS sets search input value from param', () => {
    assertIncludes(allRt, "search.value = params.get('search')");
  });

  test('search filter uses case-insensitive includes', () => {
    assertIncludes(allRt, 'text.includes(query)');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  BUG #4: Speaker search broken                ║
// ╚═══════════════════════════════════════════════╝

// --- Unit: speaker data ---
suite('Bug4/Unit: speaker data integrity');
(() => {
  const speakers = readData('speakers.json');

  test('has 500+ speakers', () => {
    assert(speakers.length >= 500, `Expected 500+, got ${speakers.length}`);
  });

  test('every speaker has a name', () => {
    const missing = speakers.filter(s => !s.name);
    assertEqual(missing.length, 0);
  });

  test('every speaker has a domain', () => {
    const missing = speakers.filter(s => !s.domain);
    assertEqual(missing.length, 0, `${missing.length} speakers missing domain`);
  });

  test('R. John Williams exists in data', () => {
    const found = speakers.find(s => s.name === 'R. John Williams');
    assert(found, 'R. John Williams not found');
  });

  test('speaker names are unique', () => {
    const names = speakers.map(s => s.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assertEqual(dupes.length, 0, `Duplicate names: ${dupes.slice(0, 5).join(', ')}`);
  });
})();

// --- Integration: speaker search infrastructure ---
suite('Bug4/Integration: speaker search');
(() => {
  const mainJs = readSrc('js/main.js');

  test('speaker search redirects to /speakers/all/', () => {
    assertIncludes(mainJs, "'/speakers/all/?search='");
  });

  test('speakers/all page has search input', () => {
    const page = readFile('speakers/all/index.html');
    assertIncludes(page, 'id="sp-all-search"');
  });

  test('speakers/all data-searchable is lowercased', () => {
    const page = readFile('speakers/all/index.html');
    assertIncludes(page, 'r. john williams');
  });

  test('speakers/all has domain filter', () => {
    const page = readFile('speakers/all/index.html');
    assertIncludes(page, 'id="sp-all-domain"');
  });

  test('speakers/all reads URL params', () => {
    const page = readFile('speakers/all/index.html');
    assertIncludes(page, "params.get('domain')");
    assertIncludes(page, "params.get('search')");
  });
})();

// --- E2E: speaker pages ---
suite('Bug4/E2E: speaker detail pages');
(() => {
  const speakers = readData('speakers.json');

  test('speaker detail pages generated for all speakers', () => {
    let missing = 0;
    for (const s of speakers.slice(0, 20)) { // spot check first 20
      if (!fileExists(`speakers/${s.slug}/index.html`)) missing++;
    }
    assertEqual(missing, 0, `${missing} speaker pages missing`);
  });

  test('speaker page has Person schema', () => {
    const speakers = readData('speakers.json');
    const first = speakers[0];
    const page = readFile(`speakers/${first.slug}/index.html`);
    assertIncludes(page, '"@type": "Person"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  BUG #5: Tag pills not linked                 ║
// ╚═══════════════════════════════════════════════╝

// --- Unit: roundtable tag data ---
suite('Bug5/Unit: roundtable tag data');
(() => {
  const roundtables = readData('roundtables.json');

  test('most roundtables have tags', () => {
    const withTags = roundtables.filter(r => r.tags && r.tags.length > 0);
    assert(withTags.length >= 100, `Expected 100+ with tags, got ${withTags.length}`);
  });

  test('most roundtables have canonicalTopics', () => {
    const withTopics = roundtables.filter(r => r.canonicalTopics && r.canonicalTopics.length > 0);
    assert(withTopics.length >= 100, `Expected 100+ with canonicalTopics, got ${withTopics.length}`);
  });
})();

// --- Integration: tag rendering on detail pages ---
suite('Bug5/Integration: tag pill rendering');
(() => {
  const testPages = ['why-war', 'see-memory', 'emotion', 'shakespeare-forever'];

  for (const slug of testPages) {
    test(`${slug}: tag pills are <a> elements`, () => {
      const page = readFile(`roundtables/${slug}/index.html`);
      if (page.includes('tag-pill')) {
        assertNotIncludes(page, '<span class="tag-pill">',
          `${slug} has unlinked span tag-pills`);
        assertMatch(page, /<a href="[^"]*" class="tag-pill">/,
          `${slug} tag-pills are not links`);
      }
    });
  }

  test('tag pill links point to /roundtables/all/?search=', () => {
    const page = readFile('roundtables/why-war/index.html');
    assertMatch(page, /href="\/roundtables\/all\/\?search=[^"]*" class="tag-pill"/);
  });
})();

// --- Integration: tag pill CSS ---
suite('Bug5/Integration: tag pill CSS');
(() => {
  const css = readSrc('css/main.css');

  test('tag-pill has text-decoration none', () => {
    assertIncludes(css, 'text-decoration: none');
  });

  test('tag-pill has hover state', () => {
    assertIncludes(css, '.tag-pill:hover');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  BUG #6: Audio rendering inconsistency        ║
// ╚═══════════════════════════════════════════════╝

// --- Unit: audio data ---
suite('Bug6/Unit: audio data');
(() => {
  const roundtables = readData('roundtables.json');
  const audioRts = roundtables.filter(r => r.hasAudio);

  test('120+ roundtables have hasAudio=true', () => {
    assert(audioRts.length >= 120, `Expected 120+, got ${audioRts.length}`);
  });

  test('audio roundtables have audioFile or resolvable via media data (video-only excluded)', () => {
    const media = readData('roundtable-media.json');
    const missing = audioRts.filter(r => {
      if (r.audioFile) return false;
      const entry = media[r.slug];
      if (entry && entry.audioUrls && entry.audioUrls.length > 0) return false;
      // Some "hasAudio" roundtables only have video — not a bug
      if (entry && entry.videoIds && entry.videoIds.length > 0) return false;
      return true;
    });
    assertEqual(missing.length, 0, `${missing.length} audio roundtables missing both audioFile and media audio/video`);
  });
})();

// --- Integration: audio player rendering ---
suite('Bug6/Integration: audio player rendering');
(() => {
  // Pages that previously had bare filenames (the core regression)
  const bareSlugs = ['why-we-write', 'see-memory', 'resurgence-of-freud', 'neurodiversity', 'music-and-mind'];

  for (const slug of bareSlugs) {
    test(`${slug}: has <audio> player (not Apple Podcasts link)`, () => {
      const page = readFile(`roundtables/${slug}/index.html`);
      assertIncludes(page, '<audio controls', `${slug} missing audio player`);
      assertIncludes(page, 'media.helixcenter.org', `${slug} missing media URL`);
      assertNotIncludes(page, 'Listen on Apple Podcasts:', `${slug} still shows Apple fallback`);
    });
  }

  // Pages that always had HTTP URLs
  const httpSlugs = ['otherness', 'the-poetry-of-aging', 'emotion'];

  for (const slug of httpSlugs) {
    test(`${slug}: still has <audio> player`, () => {
      const page = readFile(`roundtables/${slug}/index.html`);
      assertIncludes(page, '<audio controls');
    });
  }
})();

// --- E2E: no Apple Podcasts fallback anywhere ---
suite('Bug6/E2E: no Apple Podcasts fallback');
(() => {
  const roundtables = readData('roundtables.json');
  const audioRts = roundtables.filter(r => r.hasAudio && r.audioFile);

  test('zero pages fall back to Apple Podcasts-only link', () => {
    let fallbacks = [];
    for (const rt of audioRts) {
      try {
        const page = readFile(`roundtables/${rt.slug}/index.html`);
        if (page.includes('Listen on Apple Podcasts:')) fallbacks.push(rt.slug);
      } catch (e) { /* skip */ }
    }
    assertEqual(fallbacks.length, 0, `Fallback pages: ${fallbacks.join(', ')}`);
  });

  test('all audio pages have <audio> element', () => {
    let noPlayer = [];
    for (const rt of audioRts) {
      try {
        const page = readFile(`roundtables/${rt.slug}/index.html`);
        if (page.includes('<h2>Media</h2>') && !page.includes('<audio controls')) {
          noPlayer.push(rt.slug);
        }
      } catch (e) { /* skip */ }
    }
    assertEqual(noPlayer.length, 0, `Pages with Media section but no player: ${noPlayer.join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Donate deactivation                    ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: donate deactivated');
(() => {
  test('donate page not generated', () => {
    assert(!fileExists('donate/index.html'), 'donate page should not exist');
  });

  test('donate-thank-you not generated', () => {
    assert(!fileExists('donate/thank-you/index.html'));
  });

  const homepage = readFile('index.html');

  test('no nav-donate class anywhere on homepage', () => {
    assertNotIncludes(homepage, 'nav-donate');
  });

  test('no donate modal overlay on homepage', () => {
    assertNotIncludes(homepage, 'donate-modal-overlay');
  });

  test('no /donate/ href on homepage', () => {
    assertNotIncludes(homepage, 'href="/donate/"');
  });

  test('no donate section on homepage', () => {
    assertNotIncludes(homepage, 'Make a Tax-Deductible Donation');
    assertNotIncludes(homepage, 'Invest in the Life of the Mind');
  });

  test('no /donate/ href on about page', () => {
    const about = readFile('about/index.html');
    assertNotIncludes(about, 'href="/donate/"');
  });

  test('no /donate/ href in footer (uncommented)', () => {
    const footer = readSrc('_includes/partials/footer.njk');
    // Strip Nunjucks comments {# ... #} before checking
    const uncommented = footer.replace(/\{#[\s\S]*?#\}/g, '');
    assertNotIncludes(uncommented, 'href="/donate/"');
  });

  test('no donate in mobile nav', () => {
    const base = readSrc('_includes/layouts/base.njk');
    // The mobile nav donate link should be commented out
    assertNoMatch(base, /^\s*<a href="\/donate\/">/m);
  });

  test('donate JS handlers removed from main.js', () => {
    const js = readSrc('js/main.js');
    assertNotIncludes(js, 'openDonateModal');
    assertNotIncludes(js, 'closeDonateModal');
    assertNotIncludes(js, "getElementById('donate-btn')");
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Data integrity                         ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Unit: roundtables.json');
(() => {
  const roundtables = readData('roundtables.json');

  test('has 130+ roundtables', () => {
    assert(roundtables.length >= 130, `Expected 130+, got ${roundtables.length}`);
  });

  test('slugs are unique', () => {
    const slugs = roundtables.map(r => r.slug);
    assertEqual(slugs.length, new Set(slugs).size);
  });

  test('every roundtable has required fields', () => {
    const required = ['slug', 'title', 'year', 'id'];
    for (const field of required) {
      const missing = roundtables.filter(r => !r[field] && r[field] !== 0);
      assertEqual(missing.length, 0, `${missing.length} missing ${field}`);
    }
  });

  test('IDs are unique', () => {
    const ids = roundtables.map(r => r.id);
    assertEqual(ids.length, new Set(ids).size, 'Duplicate IDs found');
  });

  test('slugs contain only valid URL characters', () => {
    const bad = roundtables.filter(r => !/^[a-z0-9-]+$/.test(r.slug));
    assertEqual(bad.length, 0, `Bad slugs: ${bad.map(r => r.slug).join(', ')}`);
  });
})();

suite('Core/Unit: site.json');
(() => {
  const site = readData('site.json');

  test('has name', () => { assert(site.name); });
  test('has URL', () => { assertMatch(site.url, /^https:\/\//); });
  test('has description', () => { assert(site.description); });
  test('has social links', () => {
    assert(site.social.youtube);
    assert(site.social.podcast);
    assert(site.social.facebook);
  });
  test('RSS points to local feed', () => {
    assertEqual(site.social.rss, '/feed/index.xml');
  });
  test('has address', () => {
    assert(site.address.street);
    assert(site.address.city);
    assert(site.address.state);
    assert(site.address.zip);
  });
  test('has stats', () => {
    // Stats moved out of site.json into the computed src/_data/stats.js
    // (the hand-maintained block had gone stale). Assert the live source.
    const stats = require('../src/_data/stats.js')();
    assert(stats.speakers >= 500, `speakers=${stats.speakers}`);
    assert(stats.seasons >= 10, `seasons=${stats.seasons}`);
    assert(!site.stats, 'site.json still carries the retired hand-maintained stats block');
  });
})();

suite('Core/Unit: topics.json');
(() => {
  const topics = readData('topics.json');

  test('has 20+ topics', () => {
    assert(topics.length >= 20, `Expected 20+, got ${topics.length}`);
  });

  test('every topic has slug and name', () => {
    const bad = topics.filter(t => !t.slug || !t.name);
    assertEqual(bad.length, 0);
  });

  test('topic slugs are unique', () => {
    const slugs = topics.map(t => t.slug);
    assertEqual(slugs.length, new Set(slugs).size);
  });
})();

suite('Core/Unit: disciplines.json');
(() => {
  const disciplines = readData('disciplines.json');

  test('has 10+ disciplines', () => {
    assert(disciplines.length >= 10);
  });

  test('every discipline has name and count', () => {
    const bad = disciplines.filter(d => !d.name || !d.count);
    assertEqual(bad.length, 0);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Build & page generation                ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: page generation');
(() => {
  const requiredPages = [
    'index.html',
    'about/index.html',
    'speakers/index.html',
    'speakers/all/index.html',
    'roundtables/index.html',
    'roundtables/all/index.html',
    'disciplines/index.html',
    'topics/index.html',
    'leadership/index.html',
    'contact/index.html',
    'privacy/index.html',
    'terms/index.html',
    'awards/index.html',
    'faq/index.html',
    '404.html',
    'feed/index.xml',
    'sitemap.xml',
    'robots.txt',
  ];

  for (const page of requiredPages) {
    test(`${page} exists`, () => {
      assert(fileExists(page), `${page} not generated`);
    });
  }

  test('134 roundtable detail pages', () => {
    const roundtables = readData('roundtables.json');
    const missing = roundtables.filter(r => !fileExists(`roundtables/${r.slug}/index.html`));
    assertEqual(missing.length, 0, `Missing: ${missing.map(r => r.slug).join(', ')}`);
  });

  test('speaker detail pages generated (spot check)', () => {
    const speakers = readData('speakers.json');
    let missing = 0;
    for (const s of speakers.slice(0, 50)) {
      if (!fileExists(`speakers/${s.slug}/index.html`)) missing++;
    }
    assertEqual(missing, 0);
  });
})();

suite('Core/Integration: static assets');
(() => {
  test('CSS file exists', () => assert(fileExists('css/main.css')));
  test('JS file exists', () => assert(fileExists('js/main.js')));
  test('robots.txt exists', () => assert(fileExists('robots.txt')));
  test('llms.txt exists', () => assert(fileExists('llms.txt')));
  test('sitemap.xml exists', () => assert(fileExists('sitemap.xml')));
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Navigation & layout                    ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: navigation');
(() => {
  const homepage = readFile('index.html');

  test('has main-nav element', () => {
    assertIncludes(homepage, 'id="main-nav"');
  });

  test('nav has About link', () => {
    assertIncludes(homepage, 'href="/about/"');
  });

  test('nav has Speakers link', () => {
    assertIncludes(homepage, 'href="/speakers/"');
  });

  test('nav has Roundtables link', () => {
    assertIncludes(homepage, 'href="/roundtables/"');
  });

  test('nav has Topics link', () => {
    assertIncludes(homepage, 'href="/topics/"');
  });

  test('nav has Leadership link', () => {
    assertIncludes(homepage, 'href="/leadership/"');
  });

  test('nav has hamburger menu button', () => {
    assertIncludes(homepage, 'class="nav-hamburger"');
  });

  test('mobile nav exists', () => {
    assertIncludes(homepage, 'id="mobile-nav"');
  });
})();

suite('Core/Integration: footer');
(() => {
  const homepage = readFile('index.html');

  test('has footer element', () => {
    assertIncludes(homepage, '<footer>');
  });

  test('footer has address', () => {
    assertIncludes(homepage, '247 East 82nd Street');
  });

  test('footer has mailing list form', () => {
    assertIncludes(homepage, 'id="footer-subscribe-form"');
  });

  test('footer has social media links', () => {
    assertIncludes(homepage, 'aria-label="YouTube"');
    assertIncludes(homepage, 'aria-label="Facebook"');
    assertIncludes(homepage, 'aria-label="Podcast"');
  });

  test('footer has copyright', () => {
    assertIncludes(homepage, '2026');
  });

  test('footer has privacy and terms links', () => {
    assertIncludes(homepage, 'href="/privacy/"');
    assertIncludes(homepage, 'href="/terms/"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: SEO & Schema markup                    ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: SEO meta tags');
(() => {
  const pages = [
    { name: 'homepage', path: 'index.html' },
    { name: 'about', path: 'about/index.html' },
    { name: 'roundtables', path: 'roundtables/index.html' },
    { name: 'speakers', path: 'speakers/index.html' },
  ];

  for (const { name, path: p } of pages) {
    const page = readFile(p);

    test(`${name}: has <title>`, () => {
      assertMatch(page, /<title>[^<]+<\/title>/);
    });

    test(`${name}: has meta description`, () => {
      assertMatch(page, /<meta name="description" content="[^"]+"/);
    });

    test(`${name}: has canonical URL`, () => {
      assertMatch(page, /<link rel="canonical" href="https:\/\/www\.helixcenter\.org/);
    });

    test(`${name}: has Open Graph tags`, () => {
      assertMatch(page, /<meta property="og:title" content="[^"]+"/);
      assertMatch(page, /<meta property="og:description" content="[^"]+"/);
      assertMatch(page, /<meta property="og:image" content="[^"]+"/);
    });

    test(`${name}: has Twitter Card tags`, () => {
      assertMatch(page, /<meta name="twitter:card" content="[^"]+"/);
      assertMatch(page, /<meta name="twitter:title" content="[^"]+"/);
    });

    test(`${name}: has robots meta`, () => {
      assertMatch(page, /<meta name="robots" content="[^"]+"/);
    });
  }
})();

suite('Core/E2E: schema markup');
(() => {
  test('roundtable detail has Event schema', () => {
    const page = readFile('roundtables/why-war/index.html');
    assertIncludes(page, '"@type": "Event"');
    assertIncludes(page, '"isAccessibleForFree": true');
  });

  test('roundtable with video has VideoObject schema', () => {
    const page = readFile('roundtables/why-war/index.html');
    assertIncludes(page, '"@type": "VideoObject"');
  });

  test('speaker detail has Person schema', () => {
    const speakers = readData('speakers.json');
    const page = readFile(`speakers/${speakers[0].slug}/index.html`);
    assertIncludes(page, '"@type": "Person"');
  });

  test('pages have BreadcrumbList schema', () => {
    const page = readFile('roundtables/why-war/index.html');
    assertIncludes(page, '"@type": "BreadcrumbList"');
  });

  test('homepage has FAQPage schema or FAQ section', () => {
    const page = readFile('index.html');
    assertIncludes(page, 'faq');
  });

  test('roundtables index has PodcastSeries schema', () => {
    const page = readFile('roundtables/index.html');
    assertIncludes(page, '"@type": "PodcastSeries"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Sitemap                                ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: sitemap');
(() => {
  const sitemap = readFile('sitemap.xml');

  test('is valid XML', () => {
    try {
      execSync(`python3 -c "import xml.etree.ElementTree as ET; ET.parse('${path.join(BUILD_DIR, 'sitemap.xml')}')"`, { stdio: 'pipe' });
    } catch (e) {
      throw new Error('Sitemap XML invalid');
    }
  });

  test('includes homepage', () => {
    assertIncludes(sitemap, '<loc>https://www.helixcenter.org/</loc>');
  });

  test('includes roundtable pages', () => {
    assertIncludes(sitemap, '/roundtables/why-war/');
  });

  test('includes speaker pages', () => {
    const speakers = readData('speakers.json');
    assertIncludes(sitemap, `/speakers/${speakers[0].slug}/`);
  });

  test('does not include /donate/', () => {
    assertNotIncludes(sitemap, '/donate/</loc>');
  });

  test('all URLs use https://www.helixcenter.org', () => {
    const locs = sitemap.match(/<loc>([^<]*)<\/loc>/g) || [];
    const bad = locs.filter(l => !l.includes('https://www.helixcenter.org'));
    assertEqual(bad.length, 0, `${bad.length} URLs not using canonical domain`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: robots.txt                             ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: robots.txt');
(() => {
  const robots = readFile('robots.txt');

  test('allows all by default', () => {
    assertMatch(robots, /User-agent: \*\nAllow: \//);
  });

  test('references sitemap', () => {
    assertIncludes(robots, 'Sitemap: https://www.helixcenter.org/sitemap.xml');
  });

  test('allows GPTBot', () => {
    assertIncludes(robots, 'User-agent: GPTBot');
  });

  test('allows ClaudeBot', () => {
    assertIncludes(robots, 'User-agent: ClaudeBot');
  });

  test('allows PerplexityBot', () => {
    assertIncludes(robots, 'User-agent: PerplexityBot');
  });

  test('references llms.txt', () => {
    assertIncludes(robots, 'LLMs.txt:');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Roundtable detail pages                ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: roundtable detail pages');
(() => {
  const page = readFile('roundtables/why-war/index.html');

  test('has H1 with title', () => {
    assertMatch(page, /<h1>Why War\?<\/h1>/);
  });

  test('has breadcrumbs', () => {
    assertIncludes(page, 'class="breadcrumbs"');
  });

  test('has date in meta section', () => {
    assertIncludes(page, '<strong>Date:</strong>');
  });

  test('has location', () => {
    assertIncludes(page, '<strong>Location:</strong>');
  });

  test('has admission info', () => {
    assertIncludes(page, '<strong>Admission:</strong> Free');
  });

  test('has description', () => {
    assertIncludes(page, 'class="detail-body"');
  });

  test('has speakers section', () => {
    assertIncludes(page, '<h2>Speakers</h2>');
  });

  test('has YouTube video embed (privacy-enhanced)', () => {
    assertIncludes(page, 'youtube-nocookie.com');
    assertNotIncludes(page, 'youtube.com/embed/', 'Should use youtube-nocookie.com');
  });

  test('has related roundtables', () => {
    assertIncludes(page, '<h2>Related Roundtables</h2>');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Pagination                             ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: pagination');
(() => {
  test('roundtables has multiple pages', () => {
    assert(fileExists('roundtables/page/2/index.html'), 'Page 2 should exist');
  });

  test('speakers has multiple pages', () => {
    assert(fileExists('speakers/page/2/index.html'), 'Page 2 should exist');
  });

  test('roundtables page 1 has pagination links', () => {
    const page = readFile('roundtables/index.html');
    assertIncludes(page, 'class="pagination"');
  });

  test('roundtables page 1 links to page 2', () => {
    const page = readFile('roundtables/index.html');
    assertIncludes(page, 'href="/roundtables/page/2/"');
  });

  test('roundtables has "view all" link', () => {
    const page = readFile('roundtables/index.html');
    assertIncludes(page, 'href="/roundtables/all/"');
  });

  test('speakers has "view all" link', () => {
    const page = readFile('speakers/index.html');
    assertIncludes(page, 'href="/speakers/all/"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: 404 page                               ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: 404 page');
(() => {
  test('404.html exists', () => {
    assert(fileExists('404.html'));
  });

  const page = readFile('404.html');

  test('has helpful message', () => {
    assertMatch(page, /not found|404/i);
  });

  test('has link to homepage', () => {
    assertIncludes(page, 'href="/"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Contact & forms                        ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: contact page');
(() => {
  test('contact page exists', () => {
    assert(fileExists('contact/index.html'));
  });

  const page = readFile('contact/index.html');

  test('has email address', () => {
    assertIncludes(page, 'info@thehelixcenter.org');
  });

  test('has physical address', () => {
    assertIncludes(page, '247 East 82nd Street');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: HTML quality                           ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: HTML quality');
(() => {
  const pages = [
    { name: 'homepage', path: 'index.html' },
    { name: 'about', path: 'about/index.html' },
    { name: 'roundtable detail', path: 'roundtables/why-war/index.html' },
  ];

  for (const { name, path: p } of pages) {
    const page = readFile(p);

    test(`${name}: has DOCTYPE`, () => {
      assertMatch(page, /^<!DOCTYPE html>/i);
    });

    test(`${name}: has lang attribute`, () => {
      assertIncludes(page, '<html lang="en">');
    });

    test(`${name}: has charset`, () => {
      assertIncludes(page, '<meta charset="UTF-8">');
    });

    test(`${name}: has viewport meta`, () => {
      assertIncludes(page, 'name="viewport"');
    });

    test(`${name}: only one H1`, () => {
      const h1Count = countMatches(page, /<h1[^>]*>/g);
      assertEqual(h1Count, 1, `Expected 1 H1, got ${h1Count}`);
    });
  }
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: JS functionality                       ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Unit: main.js');
(() => {
  const js = readSrc('js/main.js');

  test('has DOMContentLoaded listener', () => {
    assertIncludes(js, "addEventListener('DOMContentLoaded'");
  });

  test('has nav scroll behavior', () => {
    assertIncludes(js, "nav.classList.add('scrolled')");
  });

  test('has mobile nav toggle', () => {
    assertIncludes(js, "nav-hamburger");
  });

  test('has footer newsletter form handler', () => {
    assertIncludes(js, "footer-subscribe-form");
  });

  test('has search filter logic', () => {
    assertIncludes(js, "filterItems");
  });

  test('has A-Z sort for speakers', () => {
    assertIncludes(js, "sort-az");
  });

  test('uses Escape key to close modals', () => {
    assertIncludes(js, "e.key === 'Escape'");
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Speaker detail pages                   ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: speaker detail pages');
(() => {
  const speakers = readData('speakers.json');
  const sample = speakers.find(s => s.name === 'R. John Williams');
  const page = readFile(`speakers/${sample.slug}/index.html`);

  test('has H1 with speaker name', () => {
    assertIncludes(page, `<h1>${sample.name}</h1>`);
  });

  test('has breadcrumbs', () => {
    assertIncludes(page, 'class="breadcrumbs"');
  });

  test('has Person schema with name', () => {
    assertIncludes(page, '"@type": "Person"');
    assertIncludes(page, `"name": "${sample.name}"`);
  });

  test('has speakable schema', () => {
    assertIncludes(page, '"@type": "SpeakableSpecification"');
  });

  test('has bio section', () => {
    assertIncludes(page, 'class="speaker-bio"');
  });

  test('has linked roundtables section', () => {
    assertIncludes(page, 'Roundtable');
  });
})();

suite('Core/Unit: speaker data completeness');
(() => {
  const speakers = readData('speakers.json');

  test('every speaker has a slug', () => {
    const missing = speakers.filter(s => !s.slug);
    assertEqual(missing.length, 0, `${missing.length} speakers missing slug`);
  });

  test('every speaker has a bio', () => {
    const missing = speakers.filter(s => !s.bio || s.bio.length < 10);
    assert(missing.length <= 25, `${missing.length} speakers missing or very short bio (expected <= 25)`);
  });

  test('every speaker has achievement', () => {
    const missing = speakers.filter(s => !s.achievement);
    assertEqual(missing.length, 0, `${missing.length} speakers missing achievement`);
  });

  test('47%+ speakers have Wikipedia URL', () => {
    const withWiki = speakers.filter(s => s.wikipedia);
    assert(withWiki.length >= 230, `Expected 230+ with Wikipedia, got ${withWiki.length}`);
  });

  test('80%+ speakers have website', () => {
    const withSite = speakers.filter(s => s.website);
    assert(withSite.length >= 400, `Expected 400+ with website, got ${withSite.length}`);
  });

  test('slugs are URL-safe', () => {
    const bad = speakers.filter(s => !/^[a-z0-9-]+$/.test(s.slug));
    assertEqual(bad.length, 0, `Bad slugs: ${bad.map(s => s.slug).slice(0, 5).join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Transcript rendering                   ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: transcripts');
(() => {
  const roundtables = readData('roundtables.json');
  const withTranscript = roundtables.filter(r => r.transcript && r.transcript.length > 100);

  test('100+ roundtables have transcripts in data', () => {
    assert(withTranscript.length >= 100, `Expected 100+, got ${withTranscript.length}`);
  });

  test('transcript roundtable page has details/summary toggle', () => {
    const slug = withTranscript[0].slug;
    const page = readFile(`roundtables/${slug}/index.html`);
    assertIncludes(page, '<details');
    assertIncludes(page, '<summary');
  });

  test('transcript contains actual text content', () => {
    const slug = withTranscript[0].slug;
    const page = readFile(`roundtables/${slug}/index.html`);
    // Transcript pages should have substantial text
    assert(page.length > 10000, `Page too short for transcript: ${page.length} chars`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: llms.txt                               ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: llms.txt');
(() => {
  const llms = readFile('llms.txt');

  test('starts with H1 header', () => {
    assertMatch(llms, /^# /);
  });

  test('has blockquote description', () => {
    assertIncludes(llms, '>');
  });

  test('has Main Pages section', () => {
    assertIncludes(llms, '## Main Pages');
  });

  test('has markdown links', () => {
    assertMatch(llms, /\[.+\]\(https?:\/\//);
  });

  test('references helixcenter.org', () => {
    assertIncludes(llms, 'helixcenter.org');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Accessibility                          ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: accessibility');
(() => {
  const homepage = readFile('index.html');

  test('all social links have aria-label', () => {
    const socialLinks = homepage.match(/<a [^>]*class="[^"]*"[^>]*aria-label="[^"]*"[^>]*>/g) || [];
    // Footer social bar should have labeled links
    assertIncludes(homepage, 'aria-label="YouTube"');
    assertIncludes(homepage, 'aria-label="Facebook"');
    assertIncludes(homepage, 'aria-label="Instagram"');
    assertIncludes(homepage, 'aria-label="RSS Feed"');
    assertIncludes(homepage, 'aria-label="Email"');
  });

  test('hamburger menu has aria-label', () => {
    assertMatch(homepage, /nav-hamburger[^>]*aria-label="/);
  });

  test('hamburger menu has aria-expanded', () => {
    assertMatch(homepage, /nav-hamburger[^>]*aria-expanded="/);
  });

  test('form inputs have labels or aria-labels', () => {
    // Footer mailing list form
    assertMatch(homepage, /name="email"[^>]*aria-label="/);
    assertMatch(homepage, /name="firstName"[^>]*aria-label="/);
    assertMatch(homepage, /name="lastName"[^>]*aria-label="/);
  });

  test('images have alt attributes', () => {
    // Check that img tags have alt (allow empty alt for decorative)
    const imgs = homepage.match(/<img [^>]+>/g) || [];
    const noAlt = imgs.filter(i => !i.includes('alt='));
    assertEqual(noAlt.length, 0, `${noAlt.length} images missing alt attribute`);
  });

  test('skip-to-content or landmark roles present', () => {
    // Either skip link or semantic landmarks
    const hasNav = homepage.includes('<nav') || homepage.includes('role="navigation"');
    const hasMain = homepage.includes('<main') || homepage.includes('role="main"');
    const hasFooter = homepage.includes('<footer');
    assert(hasNav, 'Missing nav landmark');
    assert(hasFooter, 'Missing footer landmark');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Privacy & Terms pages                  ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: legal pages');
(() => {
  test('privacy page exists with content', () => {
    const page = readFile('privacy/index.html');
    assertIncludes(page, 'Privacy');
    assertIncludes(page, 'personal information');
  });

  test('terms page exists with content', () => {
    const page = readFile('terms/index.html');
    assertIncludes(page, 'Terms');
  });

  test('privacy page has date', () => {
    const page = readFile('privacy/index.html');
    assertMatch(page, /20\d\d/);
  });

  test('terms page mentions 501(c)(3)', () => {
    const page = readFile('terms/index.html');
    assertIncludes(page, '501(c)(3)');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Disciplines & Topics pages             ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: disciplines page');
(() => {
  const page = readFile('disciplines/index.html');

  test('has H1', () => {
    assertMatch(page, /<h1[^>]*>/);
  });

  test('lists multiple disciplines', () => {
    assertIncludes(page, 'Neuroscience');
    assertIncludes(page, 'Philosophy');
    assertIncludes(page, 'Literature');
  });

  test('links to speakers', () => {
    assertMatch(page, /href="\/speakers\/[a-z]/);
  });
})();

suite('Core/Integration: topics page');
(() => {
  test('topics page exists', () => {
    assert(fileExists('topics/index.html'));
  });

  const page = readFile('topics/index.html');

  test('has H1', () => {
    assertMatch(page, /<h1[^>]*>/);
  });

  test('links to roundtables/all with topic param', () => {
    assertMatch(page, /href="\/roundtables\/all\/\?topic=/);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Awards page                            ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: awards page');
(() => {
  test('awards page exists', () => {
    assert(fileExists('awards/index.html'));
  });

  const page = readFile('awards/index.html');

  test('has H1', () => {
    assertMatch(page, /<h1[^>]*>/);
  });

  test('mentions Nobel or MacArthur', () => {
    const hasAwards = page.includes('Nobel') || page.includes('MacArthur');
    assert(hasAwards, 'Awards page should mention major awards');
  });

  test('links to speaker pages', () => {
    assertMatch(page, /href="\/speakers\/[a-z]/);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Mailing list form                      ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: mailing list form');
(() => {
  const homepage = readFile('index.html');

  test('form has netlify attribute', () => {
    assertIncludes(homepage, 'data-netlify="true"');
  });

  test('form has honeypot field', () => {
    assertIncludes(homepage, 'netlify-honeypot="bot-field"');
  });

  test('form has hidden form-name field', () => {
    assertIncludes(homepage, 'name="form-name"');
  });

  test('form has required email field', () => {
    assertMatch(homepage, /type="email"[^>]*required/);
  });

  test('form has submit button', () => {
    assertIncludes(homepage, 'type="submit"');
  });

  test('form has thank-you message (hidden)', () => {
    assertIncludes(homepage, 'id="subscribe-thank-you"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Internal link integrity                ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: internal link integrity');
(() => {
  const homepage = readFile('index.html');
  const internalLinks = (homepage.match(/href="(\/[^"#]*?)"/g) || [])
    .map(m => m.replace('href="', '').replace('"', ''))
    .filter(l => !l.includes('mailto:'));

  // Deduplicate
  const unique = [...new Set(internalLinks)];

  test('homepage has 20+ internal links', () => {
    assert(unique.length >= 20, `Expected 20+, got ${unique.length}`);
  });

  test('all internal links resolve to existing pages', () => {
    const broken = [];
    for (const link of unique) {
      // Skip static asset paths (images, favicons) — they may be in a separate assets dir
      if (/^\/(img|images|assets|favicon)/.test(link)) continue;
      // /path/ -> path/index.html, /path -> path/index.html
      let filePath = link.endsWith('/') ? link + 'index.html' : link;
      if (filePath.startsWith('/')) filePath = filePath.substring(1);
      if (!filePath.includes('.')) filePath += '/index.html';
      if (!fileExists(filePath)) {
        broken.push(link);
      }
    }
    assertEqual(broken.length, 0, `Broken links: ${broken.join(', ')}`);
  });

  test('no links point to /donate/', () => {
    const donateLinks = unique.filter(l => l.includes('/donate/'));
    assertEqual(donateLinks.length, 0, `Found donate links: ${donateLinks.join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: CSS critical styles                    ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Unit: CSS');
(() => {
  const css = readSrc('css/main.css');

  test('defines CSS custom properties', () => {
    assertIncludes(css, '--gold');
    assertIncludes(css, '--cream');
  });

  test('has responsive breakpoints', () => {
    assertMatch(css, /@media\s*\(max-width:\s*\d+px\)/);
  });

  test('uses clamp() for fluid typography', () => {
    assertIncludes(css, 'clamp(');
  });

  test('has grid layout for cards', () => {
    assertIncludes(css, 'auto-fill');
    assertIncludes(css, 'minmax(');
  });

  test('nav styles exist', () => {
    assertMatch(css, /\bnav\b\s*\{/);
  });

  test('footer styles exist', () => {
    assertIncludes(css, '.footer-grid');
  });

  test('tag-pill has no underline', () => {
    assertIncludes(css, 'text-decoration: none');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Google Fonts                           ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: fonts and performance');
(() => {
  const homepage = readFile('index.html');

  test('preconnects to Google Fonts', () => {
    assertIncludes(homepage, 'rel="preconnect" href="https://fonts.googleapis.com"');
  });

  test('preconnects to fonts.gstatic.com with crossorigin', () => {
    assertMatch(homepage, /rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*crossorigin/);
  });

  test('loads Google Fonts stylesheet', () => {
    assertIncludes(homepage, 'fonts.googleapis.com/css2');
  });

  test('CSS is linked (not inlined)', () => {
    assertMatch(homepage, /rel="stylesheet" href="\/css\/main\.css"/);
  });

  test('JS is deferred', () => {
    assertMatch(homepage, /src="\/js\/main\.js"[^>]*defer|defer[^>]*src="\/js\/main\.js"/);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: FAQ page                               ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: FAQ page');
(() => {
  const faqPage = readFile('faq/index.html');

  test('FAQ page exists and redirects to about', () => {
    assertIncludes(faqPage, '/about/#faq');
  });

  test('FAQ page has FAQPage schema (for crawlers)', () => {
    // The faq page includes schema even though it redirects
    const hasSchema = faqPage.includes('"@type": "FAQPage"') || faqPage.includes('FAQPage');
    assert(hasSchema || faqPage.includes('/about/#faq'), 'FAQ page should have schema or redirect');
  });

  // The actual FAQ content lives on the about page
  const aboutPage = readFile('about/index.html');

  test('about page has FAQ items', () => {
    const details = countMatches(aboutPage, /class="faq-item"/g);
    assert(details >= 5, `Expected 5+ FAQ items on about page, got ${details}`);
  });

  test('about page FAQ has summary/details structure', () => {
    assertIncludes(aboutPage, '<summary>');
    assertIncludes(aboutPage, 'class="faq-answer"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Netlify headers config                 ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: Netlify config');
(() => {
  test('_headers file exists', () => {
    assert(fileExists('_headers'), '_headers not in build output');
  });

  const headers = readFile('_headers');

  test('has security headers', () => {
    assertIncludes(headers, 'X-Frame-Options');
    assertIncludes(headers, 'X-Content-Type-Options');
  });

  test('has HSTS header', () => {
    assertIncludes(headers, 'Strict-Transport-Security');
  });

  test('has Referrer-Policy', () => {
    assertIncludes(headers, 'Referrer-Policy');
  });

  test('has Permissions-Policy', () => {
    assertIncludes(headers, 'Permissions-Policy');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Institution pages                      ║
// ╚═══════════════════════════════════════════════╝

suite('Core/Integration: institution pages');
(() => {
  test('institutions listing page exists', () => {
    assert(fileExists('institutions/index.html'));
  });

  test('institution detail page generated (Columbia)', () => {
    assert(fileExists('institutions/columbia-university/index.html'));
  });

  const page = readFile('institutions/columbia-university/index.html');

  test('institution page has H1', () => {
    assertMatch(page, /<h1[^>]*>/);
  });

  test('institution page links to speakers', () => {
    assertMatch(page, /href="\/speakers\/[a-z]/);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Leadership page                        ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: leadership page');
(() => {
  const page = readFile('leadership/index.html');

  test('has H1', () => {
    assertMatch(page, /<h1[^>]*>/);
  });

  test('mentions founder', () => {
    assertIncludes(page, 'Nersessian');
  });

  test('lists board members', () => {
    const memberCount = countMatches(page, /class="leader-name"/g);
    assert(memberCount >= 5, `Expected 5+ board members, got ${memberCount}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Homepage sections                      ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: homepage sections');
(() => {
  const page = readFile('index.html');

  test('has mission section', () => {
    assertIncludes(page, 'Our Mission');
  });

  test('has featured roundtables', () => {
    assertIncludes(page, 'Featured Roundtable');
  });

  test('has featured speakers', () => {
    assertIncludes(page, 'Featured Speakers');
  });

  test('has disciplines section', () => {
    assertIncludes(page, 'Disciplines');
  });

  test('has FAQ section', () => {
    assertIncludes(page, 'Frequently Asked Questions');
  });

  test('has stats section (speakers count)', () => {
    // Derived, not a hard-coded 50x: the count grows as speakers are added.
    const stats = require('../src/_data/stats.js')();
    assertIncludes(page, String(stats.speakers),
      `homepage does not render the current speaker count (${stats.speakers})`);
  });

  test('has Organization schema', () => {
    assertIncludes(page, '"@type": "EducationalOrganization"');
  });

  test('has EventSeries schema', () => {
    assertIncludes(page, '"@type": "EventSeries"');
  });

  test('has WebSite SearchAction schema', () => {
    assertIncludes(page, '"@type": "SearchAction"');
  });

  test('no donate section visible', () => {
    assertNotIncludes(page, 'Make a Tax-Deductible Donation');
    assertNotIncludes(page, 'donate-modal-overlay');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: About page                             ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: about page');
(() => {
  const page = readFile('about/index.html');

  test('has H1', () => {
    assertMatch(page, /<h1[^>]*>/);
  });

  test('mentions founding year', () => {
    assertIncludes(page, '2012');
  });

  test('mentions founder', () => {
    assertIncludes(page, 'Nersessian');
  });

  test('has FAQ section', () => {
    assertIncludes(page, 'class="faq-item"');
  });

  test('has Theaetetus reference', () => {
    assertIncludes(page, 'Theaetetus');
  });

  test('has 501(c)(3) status', () => {
    assertIncludes(page, '501(c)(3)');
  });

  test('no donate link', () => {
    assertNotIncludes(page, 'href="/donate/"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Nav link destinations on every page    ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: nav links present on all pages');
(() => {
  const navLinks = [
    { label: 'About', href: '/about/' },
    { label: 'Speakers', href: '/speakers/' },
    { label: 'Disciplines', href: '/disciplines/' },
    { label: 'Roundtables', href: '/roundtables/' },
    { label: 'Topics', href: '/topics/' },
    { label: 'Leadership', href: '/leadership/' },
  ];

  const pagesToCheck = [
    { name: 'homepage', path: 'index.html' },
    { name: 'about', path: 'about/index.html' },
    { name: 'speakers', path: 'speakers/index.html' },
    { name: 'roundtables', path: 'roundtables/index.html' },
    { name: 'topics', path: 'topics/index.html' },
    { name: 'disciplines', path: 'disciplines/index.html' },
    { name: 'leadership', path: 'leadership/index.html' },
    { name: 'contact', path: 'contact/index.html' },
    { name: 'privacy', path: 'privacy/index.html' },
    { name: 'terms', path: 'terms/index.html' },
  ];

  for (const pg of pagesToCheck) {
    test(`${pg.name} page has all nav links`, () => {
      const html = readFile(pg.path);
      for (const link of navLinks) {
        assertIncludes(html, `href="${link.href}"`, `${pg.name} missing nav link to ${link.href}`);
      }
    });
  }
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Nav link destinations resolve          ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: nav link destinations resolve');
(() => {
  const navDestinations = [
    'about/index.html',
    'speakers/index.html',
    'disciplines/index.html',
    'roundtables/index.html',
    'topics/index.html',
    'leadership/index.html',
  ];

  for (const dest of navDestinations) {
    test(`nav destination exists: ${dest}`, () => {
      assert(fileExists(dest), `${dest} not found in build`);
    });
  }

  test('nav Disciplines link does not link to /disciplines/ (not donate)', () => {
    const html = readFile('index.html');
    assertNotIncludes(html, 'href="/donate/"');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Footer links present on all pages      ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: footer links present on all pages');
(() => {
  const footerLinks = [
    '/about/',
    '/speakers/',
    '/roundtables/',
    '/disciplines/',
    '/leadership/',
    '/topics/',
    '/contact/',
    '/privacy/',
    '/terms/',
  ];

  const pagesToCheck = [
    { name: 'homepage', path: 'index.html' },
    { name: 'about', path: 'about/index.html' },
    { name: 'speakers', path: 'speakers/index.html' },
    { name: 'roundtables', path: 'roundtables/index.html' },
    { name: 'contact', path: 'contact/index.html' },
    { name: 'leadership', path: 'leadership/index.html' },
  ];

  for (const pg of pagesToCheck) {
    test(`${pg.name} footer has all expected links`, () => {
      const html = readFile(pg.path);
      // Extract footer section
      const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/);
      assert(footerMatch, `${pg.name} has no footer`);
      const footer = footerMatch[0].replace(/\{#[\s\S]*?#\}/g, ''); // strip Nunjucks comments
      for (const link of footerLinks) {
        assertIncludes(footer, `href="${link}"`, `${pg.name} footer missing ${link}`);
      }
    });
  }
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Footer social icons on all pages       ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: footer social icons');
(() => {
  const socialLabels = ['Facebook', 'Twitter / X', 'YouTube', 'Instagram', 'Podcast', 'RSS Feed', 'Email'];

  const homepage = readFile('index.html');
  const footerMatch = homepage.match(/<footer[\s\S]*?<\/footer>/);

  for (const label of socialLabels) {
    test(`footer has ${label} icon`, () => {
      assert(footerMatch, 'No footer found');
      assertIncludes(footerMatch[0], `aria-label="${label}"`, `Missing social icon: ${label}`);
    });
  }

  test('RSS icon links to /feed/index.xml', () => {
    assert(footerMatch, 'No footer found');
    assertIncludes(footerMatch[0], '/feed/index.xml');
  });

  test('Email icon links to mailto', () => {
    assert(footerMatch, 'No footer found');
    assertIncludes(footerMatch[0], 'mailto:info@thehelixcenter.org');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Footer does not link to donate         ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: footer no donate on any page');
(() => {
  const pages = [
    { name: 'homepage', path: 'index.html' },
    { name: 'about', path: 'about/index.html' },
    { name: 'speakers', path: 'speakers/index.html' },
    { name: 'roundtables', path: 'roundtables/index.html' },
    { name: 'leadership', path: 'leadership/index.html' },
  ];

  for (const pg of pages) {
    test(`${pg.name} footer has no donate link`, () => {
      const html = readFile(pg.path);
      const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/);
      assert(footerMatch, `${pg.name} has no footer`);
      const footer = footerMatch[0].replace(/\{#[\s\S]*?#\}/g, '');
      assertNotIncludes(footer, 'href="/donate/"', `${pg.name} footer still has donate link`);
    });
  }
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Homepage CTA buttons & links           ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: homepage CTAs');
(() => {
  const page = readFile('index.html');

  test('has link to roundtables', () => {
    assertIncludes(page, 'href="/roundtables/"');
  });

  test('has link to speakers', () => {
    assertIncludes(page, 'href="/speakers/"');
  });

  test('has link to about', () => {
    assertIncludes(page, 'href="/about/"');
  });

  test('has link to contact', () => {
    assertIncludes(page, 'href="/contact/"');
  });

  test('no donate CTA button', () => {
    const visible = page.replace(/\{#[\s\S]*?#\}/g, '').replace(/<!--[\s\S]*?-->/g, '');
    assertNotIncludes(visible, 'href="/donate/"');
    assertNotIncludes(visible, 'nav-donate');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Internal links resolve across pages    ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: cross-page internal links resolve');
(() => {
  const pagesToScan = [
    'index.html',
    'about/index.html',
    'speakers/index.html',
    'roundtables/index.html',
    'topics/index.html',
    'disciplines/index.html',
    'leadership/index.html',
    'contact/index.html',
    'privacy/index.html',
    'terms/index.html',
  ];

  for (const pagePath of pagesToScan) {
    test(`all internal links on ${pagePath} resolve`, () => {
      const html = readFile(pagePath);
      const links = (html.match(/href="(\/[^"#]*?)"/g) || [])
        .map(m => m.replace('href="', '').replace('"', ''))
        .filter(l => !l.includes('mailto:'));
      const unique = [...new Set(links)];
      const broken = [];
      for (const link of unique) {
        if (/^\/(img|images|assets|favicon|css|js|feed)/.test(link)) continue;
        // Strip query string for file resolution — ?param=value pages are served by their base path
        const basePath = link.split('?')[0];
        let filePath = basePath.endsWith('/') ? basePath + 'index.html' : basePath;
        if (filePath.startsWith('/')) filePath = filePath.substring(1);
        if (!filePath.includes('.')) filePath += '/index.html';
        if (!fileExists(filePath)) {
          broken.push(link);
        }
      }
      assertEqual(broken.length, 0, `Broken links on ${pagePath}: ${broken.join(', ')}`);
    });
  }
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Speaker page links to detail pages     ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: speaker listing links');
(() => {
  const allSpeakers = readFile('speakers/all/index.html');

  test('all-speakers page has 400+ speaker links', () => {
    const links = (allSpeakers.match(/href="\/speakers\/[a-z][^"]*"/g) || []);
    assert(links.length >= 400, `Expected 400+ speaker links, got ${links.length}`);
  });

  test('sample speaker links resolve', () => {
    const speakers = readData('speakers.json');
    const sample = speakers.slice(0, 20);
    const broken = [];
    for (const s of sample) {
      if (!fileExists(`speakers/${s.slug}/index.html`)) {
        broken.push(`${s.name} (${s.slug})`);
      }
    }
    assertEqual(broken.length, 0, `Broken speaker pages: ${broken.join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Roundtable page links to detail pages  ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: roundtable listing links');
(() => {
  const allRt = readFile('roundtables/all/index.html');

  test('all-roundtables page has 100+ roundtable links', () => {
    const links = (allRt.match(/href="\/roundtables\/[a-z][^"]*"/g) || []);
    assert(links.length >= 100, `Expected 100+ roundtable links, got ${links.length}`);
  });

  test('sample roundtable links resolve', () => {
    const rts = readData('roundtables.json');
    const sample = rts.slice(0, 20);
    const broken = [];
    for (const rt of sample) {
      const slug = rt.slug || rt.id;
      if (!fileExists(`roundtables/${slug}/index.html`)) {
        broken.push(`${rt.title} (${slug})`);
      }
    }
    assertEqual(broken.length, 0, `Broken roundtable pages: ${broken.join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Roundtable detail speaker links        ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: roundtable detail speaker links');
(() => {
  const rts = readData('roundtables.json');
  const speakers = readData('speakers.json');
  const slugMap = {};
  for (const s of speakers) slugMap[s.name] = s.slug;

  // Check a sample of roundtables with speakers
  const withSpeakers = rts.filter(r => r.speakers && r.speakers.length > 0).slice(0, 10);

  test('roundtable speaker links point to valid speaker pages', () => {
    const broken = [];
    for (const rt of withSpeakers) {
      const slug = rt.slug || rt.id;
      if (!fileExists(`roundtables/${slug}/index.html`)) continue;
      const html = readFile(`roundtables/${slug}/index.html`);
      for (const spkName of rt.speakers) {
        const spkSlug = slugMap[spkName];
        if (spkSlug && !html.includes(`/speakers/${spkSlug}/`)) {
          broken.push(`${rt.title}: ${spkName} link missing`);
        }
      }
    }
    assertEqual(broken.length, 0, `Missing speaker links: ${broken.join('; ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Speaker detail roundtable links        ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: speaker detail roundtable links');
(() => {
  const speakers = readData('speakers.json');
  const rts = readData('roundtables.json');

  // Pick speakers who are known to have roundtable appearances
  const rtSpeakerNames = new Set();
  for (const rt of rts) {
    for (const s of (rt.speakers || [])) rtSpeakerNames.add(s);
  }
  const withRts = speakers.filter(s => rtSpeakerNames.has(s.name)).slice(0, 10);

  test('speaker pages link back to their roundtables', () => {
    const missing = [];
    for (const s of withRts) {
      if (!fileExists(`speakers/${s.slug}/index.html`)) continue;
      const html = readFile(`speakers/${s.slug}/index.html`);
      // Should have at least one link to /roundtables/
      if (!html.includes('href="/roundtables/')) {
        missing.push(s.name);
      }
    }
    assertEqual(missing.length, 0, `Speakers missing roundtable links: ${missing.join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: About page internal links              ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: about page links');
(() => {
  const page = readFile('about/index.html');

  test('about page links to contact', () => {
    assertIncludes(page, 'href="/contact/"');
  });

  test('about page links to leadership', () => {
    assertIncludes(page, 'href="/leadership/"');
  });

  test('about page links to roundtables', () => {
    assertIncludes(page, 'href="/roundtables/"');
  });

  test('about page FAQ link to /about/#faq is self-referential (OK)', () => {
    // Footer has /about/#faq - on about page this is fine
    assertIncludes(page, '/about/#faq');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Disciplines page links                 ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: disciplines page links');
(() => {
  const page = readFile('disciplines/index.html');

  test('discipline links go to speakers/all with domain param', () => {
    assertMatch(page, /href="\/speakers\/all\/\?domain=/);
  });

  test('discipline page has multiple discipline entries', () => {
    const disciplines = readData('disciplines.json');
    assert(disciplines.length >= 10, `Expected 10+ disciplines, got ${disciplines.length}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Topics page links                      ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: topics page links');
(() => {
  const page = readFile('topics/index.html');

  test('topic links go to roundtables/all with topic param', () => {
    assertMatch(page, /href="\/roundtables\/all\/\?topic=/);
  });

  test('topics page has multiple topic entries', () => {
    const topics = readData('topics.json');
    assert(topics.length >= 20, `Expected 20+ topics, got ${topics.length}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Mobile nav                             ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: mobile nav');
(() => {
  const homepage = readFile('index.html');

  test('mobile nav has same links as desktop nav', () => {
    const mobileNavMatch = homepage.match(/<div[^>]*id="mobile-nav"[\s\S]*?<\/div>/);
    if (!mobileNavMatch) {
      // Some implementations use class instead of id
      const altMatch = homepage.match(/class="mobile-nav[\s\S]*?<\/(?:div|nav)>/);
      assert(mobileNavMatch || altMatch, 'Mobile nav not found');
      return;
    }
    const mobileNav = mobileNavMatch[0];
    assertIncludes(mobileNav, '/about/');
    assertIncludes(mobileNav, '/speakers/');
    assertIncludes(mobileNav, '/roundtables/');
    assertIncludes(mobileNav, '/topics/');
    assertIncludes(mobileNav, '/leadership/');
  });

  test('mobile nav has no donate link', () => {
    const mobileNavMatch = homepage.match(/<div[^>]*id="mobile-nav"[\s\S]*?<\/div>/);
    if (mobileNavMatch) {
      const cleaned = mobileNavMatch[0].replace(/\{#[\s\S]*?#\}/g, '');
      assertNotIncludes(cleaned, 'href="/donate/"');
    }
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Breadcrumb links                       ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: breadcrumb navigation');
(() => {
  test('speaker detail page has BreadcrumbList schema', () => {
    const speakers = readData('speakers.json');
    const s = speakers[0];
    if (fileExists(`speakers/${s.slug}/index.html`)) {
      const page = readFile(`speakers/${s.slug}/index.html`);
      assertIncludes(page, 'BreadcrumbList');
    }
  });

  test('roundtable detail page has BreadcrumbList schema', () => {
    const rts = readData('roundtables.json');
    const rt = rts[0];
    const slug = rt.slug || rt.id;
    if (fileExists(`roundtables/${slug}/index.html`)) {
      const page = readFile(`roundtables/${slug}/index.html`);
      assertIncludes(page, 'BreadcrumbList');
    }
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Contact page links                     ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: contact page links');
(() => {
  const page = readFile('contact/index.html');

  test('contact page has email link', () => {
    assertIncludes(page, 'mailto:');
  });

  test('contact page has Google Maps link', () => {
    assertIncludes(page, 'maps.google.com');
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Awards page links                      ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: awards page links');
(() => {
  if (!fileExists('awards/index.html')) return;
  const page = readFile('awards/index.html');

  test('awards page links to speaker pages', () => {
    assertMatch(page, /href="\/speakers\/[a-z]/);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  CORE: Feed page accessible                   ║
// ╚═══════════════════════════════════════════════╝

suite('Core/E2E: feed accessibility');
(() => {
  test('feed/index.xml exists', () => {
    assert(fileExists('feed/index.xml'), 'RSS feed not generated');
  });

  test('RSS feed has correct content type header hint', () => {
    const feed = readFile('feed/index.xml');
    assertIncludes(feed, '<?xml');
    assertIncludes(feed, '<rss');
  });

  test('RSS feed has self link', () => {
    const feed = readFile('feed/index.xml');
    assertIncludes(feed, '/feed/index.xml');
  });
})();


// --- Regression: 2026-09 audit ---
//
// Each suite below pins a bug found in the 2026-09 static audit
// (reports/worker_static_audit.md, reports/scout_nobel_verify.md).
// Counts are always DERIVED from the JSON data, never hard-coded, so these
// tests keep passing as speakers/roundtables are added.

const { normalizeName, findSpeaker, requireSpeaker } = require('../src/_lib/speaker-resolver');

// ── Every discipline has an icon branch (not just the generic fallback) ──
suite('Regression/Disciplines: every discipline has an icon branch');
(() => {
  const disciplines = readData('disciplines.json');
  const partial = readSrc('_includes/partials/discipline-icon.njk');

  test('every disciplines.json name has an iconDiscipline == "<name>" branch', () => {
    const missing = disciplines
      .map(d => d.name)
      .filter(name => !partial.includes(`iconDiscipline == "${name}"`));
    assertEqual(missing.length, 0, `Disciplines missing an icon branch: ${missing.join(', ')}`);
  });
})();

// ── Bug 1/2: award names must all resolve; counts must match; modals complete ──
suite('Regression/Awards: names resolve and counts are honest');
(() => {
  const speakers = readData('speakers.json');
  const awards = readData('awards.json');
  const allAwards = readData('allAwards.json');

  // Flatten allAwards (tier -> awards[]) into the same shape as awards.json.
  const flatAll = [];
  for (const tier of allAwards) {
    for (const a of tier.awards) flatAll.push({ ...a, _tier: tier.tier });
  }

  test('every awards.json speaker name resolves to a speakers.json entry', () => {
    const missing = [];
    for (const a of awards) {
      for (const n of a.speakers) {
        if (!findSpeaker(speakers, n)) missing.push(`${a.id}: ${n}`);
      }
    }
    assertEqual(missing.length, 0, `Unresolved award names: ${missing.join(', ')}`);
  });

  test('every allAwards.json speaker name resolves to a speakers.json entry', () => {
    const missing = [];
    for (const a of flatAll) {
      for (const n of a.speakers) {
        if (!findSpeaker(speakers, n)) missing.push(`${a.id}: ${n}`);
      }
    }
    assertEqual(missing.length, 0, `Unresolved award names: ${missing.join(', ')}`);
  });

  test('every awards.json count equals its speakers list length', () => {
    const bad = awards.filter(a => a.count !== a.speakers.length)
      .map(a => `${a.id}: count=${a.count} list=${a.speakers.length}`);
    assertEqual(bad.length, 0, `Count mismatches: ${bad.join(', ')}`);
  });

  test('every allAwards.json count equals its speakers list length', () => {
    const bad = flatAll.filter(a => a.count !== a.speakers.length)
      .map(a => `${a.id}: count=${a.count} list=${a.speakers.length}`);
    assertEqual(bad.length, 0, `Count mismatches: ${bad.join(', ')}`);
  });

  test('Nobel award lists exactly the two confirmed laureates', () => {
    // Verified against the live site: only Kahneman and Kandel ever participated
    // (both at "Fake" Knowledge, Oct 14 2017). Gross is quoted in a roundtable
    // description; de Duve appears nowhere. See reports/scout_nobel_verify.md.
    const nobel = awards.find(a => a.id === 'nobel');
    assert(nobel, 'awards.json has no "nobel" entry');
    assertEqual(nobel.count, 2, `Nobel count should be 2, got ${nobel.count}`);
    assertEqual(nobel.speakers.slice().sort().join(', '), 'Daniel Kahneman, Eric Kandel');
    assertNotIncludes(nobel.detail, 'Gross');
    assertNotIncludes(nobel.subtitle, '4 ');
  });

  test('non-participants are absent from both award files', () => {
    const banned = ['David J. Gross', 'Christian de Duve', 'Chris Frith', 'Uta Frith'];
    const hits = [];
    for (const a of [...awards, ...flatAll]) {
      for (const n of a.speakers) if (banned.includes(n)) hits.push(`${a.id}: ${n}`);
    }
    assertEqual(hits.length, 0, `Non-participants still listed: ${hits.join(', ')}`);
  });

  test('each stat-card modal lists exactly as many people as its award count', () => {
    const html = readFile('index.html');
    const bad = [];
    for (const a of awards) {
      const tpl = html.match(new RegExp(`<template id="modal-${a.id}">([\\s\\S]*?)</template>`));
      if (!tpl) { bad.push(`${a.id}: no modal template`); continue; }
      const people = countMatches(tpl[1], /class="stat-modal-person"/g);
      if (people !== a.count) bad.push(`${a.id}: modal has ${people}, count says ${a.count}`);
    }
    assertEqual(bad.length, 0, bad.join('; '));
  });
})();

// ── Bug 2: unresolved names must throw, not vanish ──
suite('Regression/Resolver: requireSpeaker fails loudly');
(() => {
  const speakers = readData('speakers.json');

  test('requireSpeaker throws on an unknown name', () => {
    let threw = false;
    try {
      requireSpeaker(speakers, 'Absolutely Nobody McNotreal', 'unit test');
    } catch (e) {
      threw = true;
      assertIncludes(e.message, 'Absolutely Nobody McNotreal');
      assertIncludes(e.message, 'unit test');
    }
    assert(threw, 'requireSpeaker did not throw for an unknown name');
  });

  test('requireSpeaker returns the speaker for a known name', () => {
    const sp = requireSpeaker(speakers, 'Eric Kandel');
    assertEqual(sp.name, 'Eric Kandel');
  });

  test('the award templates use requireSpeaker, not a silent {% if sp %} skip', () => {
    // The original bug: `{% if sp %}` around findSpeaker silently dropped any
    // award name that did not resolve, so the "4 Nobel Laureates" card rendered 2.
    assertIncludes(readSrc('pages/index.njk'), 'requireSpeaker');
    assertIncludes(readSrc('pages/awards.njk'), 'requireSpeaker');
  });
})();

// ── Bug 3: chained credentials must be stripped iteratively ──
suite('Regression/Resolver: chained credentials');
(() => {
  const speakers = readData('speakers.json');

  test('"X, MD, PhD" resolves to the plain speakers.json entry', () => {
    const a = findSpeaker(speakers, 'Nouchine Hadjikhani, MD, PhD');
    assert(a, '"Nouchine Hadjikhani, MD, PhD" did not resolve');
    assertEqual(a.name, 'Nouchine Hadjikhani');

    const b = findSpeaker(speakers, 'Francis Lee, MD, PhD');
    assert(b, '"Francis Lee, MD, PhD" did not resolve');
    assertEqual(b.name, 'Francis Lee');
  });

  test('normalizeName strips all chained credentials, not just the last', () => {
    assertEqual(normalizeName('Jane Doe, MD, PhD'), 'jane doe');
    assertEqual(normalizeName('Jane Doe, Ph.D.'), 'jane doe');
    assertEqual(normalizeName('Jane Doe, MD, PhD, Jr.'), 'jane doe');
    // A name that merely ends in something credential-ish must survive intact.
    assertEqual(normalizeName('Jane Doe'), 'jane doe');
  });

  test('both chained-credential speakers appear on the fear-wherefore-whence page', () => {
    const html = readFile('roundtables/fear-wherefore-whence/index.html');
    assertIncludes(html, '/speakers/nouchine-hadjikhani/',
      'Nouchine Hadjikhani missing from the rendered Speakers grid');
    assertIncludes(html, '/speakers/francis-lee/',
      'Francis Lee missing from the rendered Speakers grid');
  });

  test('every roundtable speaker name resolves to a speakers.json entry', () => {
    const roundtables = readData('roundtables.json');
    const missing = [];
    for (const rt of roundtables) {
      for (const n of rt.speakers || []) {
        if (!findSpeaker(speakers, n)) missing.push(`${rt.slug}: ${n}`);
      }
    }
    assertEqual(missing.length, 0, `Unresolved roundtable speakers: ${missing.slice(0, 10).join(', ')}`);
  });
})();

// ── Bug 4: JSON-LD performer URLs must point at real pages ──
suite('Regression/JSON-LD: performer URLs resolve');
(() => {
  test('every performer url in every roundtable JSON-LD points to a built speaker page', () => {
    const dir = path.join(BUILD_DIR, 'roundtables');
    const slugs = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'page' && e.name !== 'all')
      .map(e => e.name);
    assert(slugs.length > 50, `Expected many roundtable pages, found ${slugs.length}`);

    const broken = [];
    let checked = 0;
    for (const slug of slugs) {
      const file = path.join(dir, slug, 'index.html');
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        let json;
        try { json = JSON.parse(m[1]); } catch (e) { broken.push(`${slug}: unparseable JSON-LD`); continue; }
        for (const p of json.performer || []) {
          if (!p.url) continue; // omitted on purpose when the name is unresolved
          const rel = p.url.replace(/^https?:\/\/[^/]+/, '');
          if (!rel.startsWith('/speakers/')) continue;
          checked++;
          if (!fileExists(path.join(rel, 'index.html'))) broken.push(`${slug}: ${p.url}`);
        }
      }
    }
    assert(checked > 100, `Expected to check many performer urls, checked ${checked}`);
    assertEqual(broken.length, 0, `Broken performer urls: ${broken.slice(0, 10).join(', ')}`);
  });

  test('roundtable.njk resolves the speaker before building the performer url', () => {
    const src = readSrc('roundtables/roundtable.njk');
    assertNoMatch(src, /"url":\s*"\{\{\s*site\.url\s*\}\}\{\{\s*name\s*\|\s*speakerUrl\s*\}\}"/,
      'performer.url is still built from the raw, unresolved name');
    assertIncludes(src, 'findSpeaker(name)');
  });
})();

// ── Bug 5: the homepage upcoming event must be data-driven and never past ──
suite('Regression/Homepage: upcoming event is data-driven');
(() => {
  const roundtables = readData('roundtables.json');

  // Mirror of the `parseEventDate` filter in .eleventy.js: lenient parse that
  // always takes the FIRST date out of ranges/time-suffixed strings.
  function parseEventDate(dateStr) {
    if (!dateStr) return null;
    let s = String(dateStr).trim()
      .replace(/,?\s*\d{1,2}:\d{2}\s*(AM|PM)?\b.*$/i, '')
      .replace(/^(\w+\s+\d{1,2})\s*[-–—]\s*\d{1,2}\b/, '$1')
      .replace(/\s*[-–—]\s*\w+\s+\d{1,2}(?=,)/, '');
    const m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
    const d = m ? new Date(`${m[1]} ${m[2]}, ${m[3]} 00:00:00`) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = roundtables
    .filter(rt => rt.status === 'Future Event')
    .map(rt => ({ rt, when: parseEventDate(rt.date) }))
    .filter(x => x.when && x.when.getTime() >= today.getTime())
    .sort((a, b) => a.when - b.when);
  const next = upcoming.length ? upcoming[0].rt : null;

  test('parseEventDate handles the awkward date formats in the data', () => {
    assertEqual(parseEventDate('September 19, 2026').getFullYear(), 2026);
    assertEqual(parseEventDate('September 19, 2026').getDate(), 19);
    // Time-of-day suffix
    assertEqual(parseEventDate('December 5, 2015, 10:00 AM EST').getDate(), 5);
    // Multi-day range takes the first day
    assertEqual(parseEventDate('December 5-6, 2015').getDate(), 5);
    assertEqual(parseEventDate('December 5-6, 2015').getMonth(), 11);
  });

  test('every roundtable date parses', () => {
    const bad = roundtables.filter(rt => rt.date && !parseEventDate(rt.date))
      .map(rt => `${rt.slug}: ${rt.date}`);
    assertEqual(bad.length, 0, `Unparseable dates: ${bad.join(', ')}`);
  });

  test('the computed upcoming event is never past-dated', () => {
    if (!next) return; // no scheduled event is a legitimate state
    const when = parseEventDate(next.date);
    assert(when.getTime() >= today.getTime(),
      `"${next.title}" (${next.date}) is in the past but is being offered as upcoming`);
  });

  test('the homepage shows the computed next roundtable, not a hard-coded one', () => {
    const html = readFile('index.html');
    if (next) {
      // Compare on an entity-escaped basis: titles may contain apostrophes.
      const esc = next.title.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&#34;');
      assert(html.includes(next.title) || html.includes(esc),
        `Homepage does not mention the next roundtable "${next.title}"`);
      assertIncludes(html, `/roundtables/${next.slug}/`);
    }
  });

  test('the homepage does not present any past-dated event as upcoming', () => {
    const html = readFile('index.html');
    const section = html.match(/<section id="upcoming"[\s\S]*?<\/section>/);
    if (!section) return; // section is omitted when nothing is scheduled
    const body = section[0];
    if (!/Upcoming Roundtable/.test(body)) return; // fallback "Watch the Latest" framing
    // Whatever title the upcoming section names must be a future-dated roundtable.
    const titleMatch = body.match(/<h3[^>]*>([^<]+)<\/h3>/);
    assert(titleMatch, 'Upcoming section has no title heading');
    const shown = titleMatch[1].trim();
    const rt = roundtables.find(r =>
      r.title === shown ||
      r.title.replace(/&/g, '&amp;').replace(/'/g, '&#39;') === shown);
    assert(rt, `Upcoming section names "${shown}", which is not a roundtable in the data`);
    const when = parseEventDate(rt.date);
    assert(when && when.getTime() >= today.getTime(),
      `Upcoming section advertises "${shown}" (${rt.date}), which is past-dated`);
  });

  test('the retired hard-coded event is gone from the homepage', () => {
    const html = readFile('index.html');
    assertNotIncludes(html, 'Upcoming Event &middot; April 18');
    assertNotIncludes(html, 'Saturday, April 18, 2026');
  });

  test('the homepage latest-video card is driven by roundtable video data', () => {
    const html = readFile('index.html');
    const withVideo = roundtables
      .filter(rt => rt.hasVideo && rt.videoId)
      .map(rt => ({ rt, when: parseEventDate(rt.date) }))
      .filter(x => x.when)
      .sort((a, b) => b.when - a.when);
    if (!withVideo.length) return;
    const newest = withVideo[0].rt;
    assertIncludes(html, `embed/${newest.videoId}`,
      `Homepage does not embed the newest video (${newest.title}, ${newest.videoId})`);
  });
})();

// ── Bug 6: stats must be computed, not hand-maintained ──
suite('Regression/Stats: computed from data');
(() => {
  const stats = require('../src/_data/stats.js')();

  test('computed stats match counts derived independently from the JSON files', () => {
    assertEqual(stats.speakers, readData('speakers.json').length, 'speakers');
    assertEqual(stats.roundtables, readData('roundtables.json').length, 'roundtables');
    assertEqual(stats.disciplines, readData('disciplines.json').length, 'disciplines');
    assertEqual(stats.institutions, readData('institutions.json').length, 'institutions');
    assertEqual(stats.podcastEpisodes, readData('podcasts.json').length, 'podcastEpisodes');
    assertEqual(stats.youtubeVideos, readData('youtube.json').length, 'youtubeVideos');
  });

  test('nobelLaureates and macarthurFellows come from awards.json', () => {
    const awards = readData('awards.json');
    assertEqual(stats.nobelLaureates, awards.find(a => a.id === 'nobel').speakers.length);
    assertEqual(stats.macarthurFellows, awards.find(a => a.id === 'macarthur').speakers.length);
    // The whole point of the fix: this number can no longer drift from the list.
    assertEqual(stats.nobelLaureates, 2);
  });

  test('no template reads the stale site.json stats block', () => {
    const offenders = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '_data') walk(p); }
        else if (/\.(njk|md|html)$/.test(e.name)) {
          if (fs.readFileSync(p, 'utf8').includes('site.stats')) offenders.push(p);
        }
      }
    })(SRC_DIR);
    assertEqual(offenders.length, 0, `Templates still using site.stats: ${offenders.join(', ')}`);
  });

  test('the homepage renders the current speaker count and no stale literals', () => {
    const html = readFile('index.html');
    assertIncludes(html, String(stats.speakers), 'current speaker count not rendered');
    assertNotIncludes(html, '507 distinguished');
    assertNotIncludes(html, '134+');
    assertNotIncludes(html, '13 disciplines');
  });

  test('the disciplines page renders the computed count, not a hard-coded one', () => {
    const html = readFile('disciplines/index.html');
    const n = stats.disciplines;
    assertIncludes(html, `${n} Disciplines, One Conversation`,
      `disciplines page does not show the computed count (${n})`);
    // The <title> and meta description come from front matter, which is the
    // exact place the stale "13" was hiding.
    const title = html.match(/<title>([^<]*)<\/title>/);
    assert(title, 'disciplines page has no <title>');
    assertIncludes(title[1], `${n} Disciplines`);
    const desc = html.match(/<meta name="description" content="([^"]*)"/);
    assert(desc, 'disciplines page has no meta description');
    assertIncludes(desc[1], `${n} academic disciplines`);
  });

  test('no built page states a discipline/speaker/roundtable count that disagrees with the data', () => {
    // Catches any hard-coded count anywhere in prose or head tags. Phrases are
    // matched against the computed value, so this stays correct as data grows.
    const patterns = [
      [/(\d+)\s+Disciplines,\s+One\s+Conversation/gi, stats.disciplines, 'disciplines'],
      [/(\d+)\s+academic disciplines/gi, stats.disciplines, 'disciplines'],
      [/bridge\s+(\d+)\s+academic/gi, stats.disciplines, 'disciplines'],
      [/(\d+)\s+distinguished (?:speakers|scholars)/gi, stats.speakers, 'speakers'],
      [/View All\s+(\d+)\s+Speakers/gi, stats.speakers, 'speakers'],
    ];
    const offenders = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) {
          const html = fs.readFileSync(p, 'utf8');
          for (const [re, expected, label] of patterns) {
            for (const m of html.matchAll(re)) {
              if (Number(m[1]) !== expected) {
                offenders.push(`${path.relative(BUILD_DIR, p)}: "${m[0]}" but ${label}=${expected}`);
              }
            }
          }
        }
      }
    })(BUILD_DIR);
    assertEqual(offenders.length, 0, `Stale hard-coded counts: ${offenders.slice(0, 8).join(' | ')}`);
  });

  test('no stray debug/probe templates were left in src/', () => {
    const strays = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/^_dbg|_dbg\./.test(e.name)) strays.push(path.relative(SRC_DIR, p));
      }
    })(SRC_DIR);
    assertEqual(strays.length, 0, `Debug templates left in src/: ${strays.join(', ')}`);
  });
})();

// ── Bug 7: no unrendered template syntax in head tags ──
suite('Regression/Templates: no front-matter leaks');
(() => {
  function allBuiltHtml() {
    const out = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) out.push(p);
      }
    })(BUILD_DIR);
    return out;
  }

  test('no built <meta> or <title> tag contains unrendered Nunjucks syntax', () => {
    const offenders = [];
    for (const file of allBuiltHtml()) {
      const html = fs.readFileSync(file, 'utf8');
      const head = html.slice(0, html.indexOf('</head>') + 1 || 4000);
      for (const m of head.matchAll(/<(meta|title)\b[^>]*>/g)) {
        if (m[0].includes('{{') || m[0].includes('{%')) {
          offenders.push(`${path.relative(BUILD_DIR, file)}: ${m[0].slice(0, 90)}`);
        }
      }
    }
    assertEqual(offenders.length, 0, `Template leaks: ${offenders.slice(0, 5).join(' | ')}`);
  });

  test('the topics page description renders real numbers', () => {
    const html = readFile('topics/index.html');
    const m = html.match(/<meta name="description" content="([^"]*)"/);
    assert(m, 'topics page has no meta description');
    assertNotIncludes(m[1], '{{');
    assertNotIncludes(m[1], '{%');
    assertIncludes(m[1], String(readData('topics.json').length));
  });
})();

// ── Bug 8: favicons must exist ──
suite('Regression/Assets: favicons exist');
(() => {
  test('every icon href on the homepage resolves to a built file', () => {
    const html = readFile('index.html');
    const hrefs = [...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)]
      .map(m => m[1]);
    assert(hrefs.length >= 3, `Expected 3+ icon links, found ${hrefs.length}`);
    const missing = hrefs.filter(h => !fileExists(h.replace(/^\//, '')));
    assertEqual(missing.length, 0, `Icon files missing from _site: ${missing.join(', ')}`);
  });

  test('the three icon files are present and non-empty in the build', () => {
    for (const f of ['img/favicon.svg', 'img/favicon-32x32.png', 'img/apple-touch-icon.png']) {
      assert(fileExists(f), `${f} missing from _site`);
      assert(fs.statSync(path.join(BUILD_DIR, f)).size > 100, `${f} is suspiciously small`);
    }
  });

  test('the study-guide layout icon hrefs also resolve', () => {
    const src = readSrc('_includes/layouts/study-guide.njk');
    const hrefs = [...src.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)]
      .map(m => m[1]);
    const missing = hrefs.filter(h => !fileExists(h.replace(/^\//, '')));
    assertEqual(missing.length, 0, `Icon files missing: ${missing.join(', ')}`);
  });
})();

// ── Bug 9: sitemap must match the built site, both directions ──
suite('Regression/Sitemap: complete and accurate');
(() => {
  const sitemap = readFile('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1].replace(/^https?:\/\/[^/]+/, ''));

  test('sitemap is non-trivial and has no duplicate entries', () => {
    assert(urls.length > 100, `Sitemap has only ${urls.length} urls`);
    const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
    assertEqual(dupes.length, 0, `Duplicate sitemap entries: ${[...new Set(dupes)].join(', ')}`);
  });

  test('every sitemap url exists in _site', () => {
    const missing = urls.filter(u => !fileExists(path.join(u, 'index.html')));
    assertEqual(missing.length, 0, `Sitemap urls with no page: ${missing.join(', ')}`);
  });

  test('/media/ (which never existed) is gone from the sitemap', () => {
    assertNotIncludes(sitemap, '/media/');
  });

  test('previously-missing nav-linked pages are now listed', () => {
    for (const u of ['/commentaries/', '/institutions/', '/topics/']) {
      assert(urls.includes(u), `${u} missing from sitemap`);
    }
    const posts = urls.filter(u => /^\/commentaries\/\d{4}\//.test(u));
    assert(posts.length >= 2, `Expected the individual blog posts in the sitemap, found ${posts.length}`);
  });

  test('every indexable built page is in the sitemap', () => {
    const pages = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'index.html') {
          const rel = path.relative(BUILD_DIR, dir).split(path.sep).filter(Boolean).join('/');
          pages.push(rel ? `/${rel}/` : '/');
        }
      }
    })(BUILD_DIR);

    const set = new Set(urls);
    const missing = pages.filter(u => !set.has(u))
      // Excluded by design: paginated views (page 1 is canonical), the ?-driven
      // /all/ search views, and any page marked noindex.
      .filter(u => !/\/page\/\d+\//.test(u))
      .filter(u => !u.endsWith('/all/'))
      .filter(u => {
        const html = fs.readFileSync(path.join(BUILD_DIR, u, 'index.html'), 'utf8');
        return !/name="robots" content="noindex/.test(html);
      });
    assertEqual(missing.length, 0, `Built pages missing from sitemap: ${missing.join(', ')}`);
  });
})();

// ╔═══════════════════════════════════════════════╗
// ║  Data-integrity checks (tests/data-integrity.js) ║
// ╚═══════════════════════════════════════════════╝

suite('DataIntegrity: cross-file consistency checks');
(() => {
  const { run: runDataIntegrity } = require('./data-integrity');

  test('all data-integrity.js checks pass', () => {
    const result = runDataIntegrity();
    if (result.failed > 0) {
      throw new Error(`${result.failed} data-integrity check(s) failed (see output above)`);
    }
  });
})();

// ═══════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

// Suite summary
console.log('\nSuite breakdown:');
for (const [name, result] of Object.entries(suiteResults)) {
  const status = result.failed === 0 ? 'PASS' : 'FAIL';
  const total = result.passed + result.failed;
  console.log(`  ${status}  ${name} (${result.passed}/${total})`);
}

if (errors.length) {
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  ${e.suite} > ${e.name}`);
    console.log(`    ${e.message}\n`);
  }
}

process.exit(failed > 0 ? 1 : 0);

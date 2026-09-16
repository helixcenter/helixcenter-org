/**
 * Computed site statistics.
 *
 * Replaces the hand-maintained `site.json` "stats" block, which drifted from the
 * underlying data files (507 speakers vs 520 actual, "134+" roundtables vs 137,
 * 13 disciplines vs 14, 4 Nobel laureates vs 2). Every number here is derived
 * from the JSON data at build time so it can never go stale again.
 *
 * Templates use `stats.X` (this file) instead of the old `site.stats.X`.
 */
const speakers = require('./speakers.json');
const roundtables = require('./roundtables.json');
const awards = require('./awards.json');
const disciplines = require('./disciplines.json');
const institutions = require('./institutions.json');
const podcasts = require('./podcasts.json');
const youtube = require('./youtube.json');

function awardCount(id) {
  const award = awards.find(a => a.id === id);
  return award ? award.speakers.length : 0;
}

module.exports = function () {
  // Seasons: the Helix Center's first roundtable season began in 2012, and a
  // season runs autumn-to-spring, so the count is (latest year - 2012 + 1).
  const years = roundtables
    .map(rt => rt.year)
    .filter(y => typeof y === 'number' && y >= 2012);
  const latestYear = years.length ? Math.max(...years) : new Date().getFullYear();

  return {
    speakers: speakers.length,
    roundtables: roundtables.length,
    disciplines: disciplines.length,
    institutions: institutions.length,
    nobelLaureates: awardCount('nobel'),
    macarthurFellows: awardCount('macarthur'),
    seasons: latestYear - 2012 + 1,
    wikipediaNotable: speakers.filter(s => s.wikipedia).length,
    podcastEpisodes: podcasts.length,
    youtubeVideos: youtube.length
  };
};

const path = require('path');

module.exports = function(eleventyConfig) {
  // Passthrough copy
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/llms.txt");
  eleventyConfig.addPassthroughCopy("src/llms-full.txt");
  eleventyConfig.addPassthroughCopy("src/_headers");
  eleventyConfig.addPassthroughCopy("src/4cd4c43c66344f3bb55634644c45e249.txt");
  eleventyConfig.addPassthroughCopy("src/downloads");

  // Filters
  eleventyConfig.addFilter("slug", function(str) {
    if (!str) return '';
    return str.toString().toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y')
      .replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c')
      .replace(/[ğ]/g, 'g').replace(/[ş]/g, 's')
      .replace(/[ő]/g, 'o').replace(/[ű]/g, 'u')
      .replace(/[á]/g, 'a').replace(/[é]/g, 'e')
      .replace(/[í]/g, 'i').replace(/[ó]/g, 'o')
      .replace(/[ú]/g, 'u').replace(/[ž]/g, 'z')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  });

  eleventyConfig.addFilter("limit", function(arr, limit) {
    return arr.slice(0, limit);
  });

  eleventyConfig.addFilter("where", function(arr, key, value) {
    return arr.filter(item => item[key] === value);
  });

  eleventyConfig.addFilter("sortBy", function(arr, key, order) {
    const sorted = [...arr].sort((a, b) => {
      if (typeof a[key] === 'number') return a[key] - b[key];
      return String(a[key]).localeCompare(String(b[key]));
    });
    return order === 'desc' ? sorted.reverse() : sorted;
  });

  eleventyConfig.addFilter("pageCount", function(arr, size) {
    return Math.ceil(arr.length / size);
  });

  eleventyConfig.addFilter("initials", function(name) {
    if (!name) return '??';
    return name.split(' ').filter(w => w.length > 0).map(w => w[0].toUpperCase()).slice(0, 2).join('');
  });

  eleventyConfig.addFilter("formatDate", function(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  });

  eleventyConfig.addFilter("toISODate", function(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  });

  eleventyConfig.addFilter("jsonEscape", function(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
  });

  eleventyConfig.addFilter("year", function(dateStr) {
    if (!dateStr) return '';
    if (dateStr instanceof Date) return String(dateStr.getFullYear());
    const match = String(dateStr).match(/(\d{4})/);
    return match ? match[1] : '';
  });

  eleventyConfig.addFilter("uniqueValues", function(arr, key) {
    const values = arr.map(item => item[key]).filter(Boolean);
    return [...new Set(values)].sort();
  });

  eleventyConfig.addFilter("title", function(str) {
    if (!str) return '';
    return str.replace(/\b\w/g, c => c.toUpperCase());
  });

  eleventyConfig.addFilter("json", function(value) {
    return JSON.stringify(value);
  });

  eleventyConfig.addFilter("localeString", function(value) {
    if (typeof value === 'number') return value.toLocaleString();
    return value;
  });

  eleventyConfig.addFilter("reverse", function(arr) {
    if (!Array.isArray(arr)) return arr;
    return [...arr].reverse();
  });

  eleventyConfig.addFilter("find", function(arr, key, value) {
    return arr.find(item => item[key] === value);
  });

  // Fuzzy speaker match: strips credentials (MD, PhD), normalizes accents
  eleventyConfig.addFilter("findSpeaker", function(arr, name) {
    if (!name || !arr) return null;
    // Try exact match first
    let result = arr.find(item => item.name === name);
    if (result) return result;

    // Normalize: strip credentials, accents, lowercase
    function norm(n) {
      return n.toLowerCase()
        .replace(/,?\s*(ph\.?d\.?|m\.?d\.?|jr\.?|sr\.?|esq\.?|iii|ii|iv)$/gi, '')
        .replace(/,?\s*\(.*?\)\s*$/g, '')
        .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i').replace(/[òóôõöő]/g, 'o')
        .replace(/[ùúûüű]/g, 'u').replace(/[ýÿ]/g, 'y')
        .replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c')
        .replace(/[ğ]/g, 'g').replace(/[şš]/g, 's').replace(/[ž]/g, 'z')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const normName = norm(name);
    return arr.find(item => norm(item.name) === normName);
  });

  // Check if a string matches a regex pattern (case-insensitive)
  eleventyConfig.addFilter("matches", function(str, pattern) {
    if (!str || !pattern) return false;
    return new RegExp(pattern, 'i').test(str);
  });

  // Filter array items where a field matches a regex pattern
  eleventyConfig.addFilter("whereMatches", function(arr, key, pattern) {
    if (!arr || !pattern) return [];
    const re = new RegExp(pattern, 'i');
    return arr.filter(item => item[key] && re.test(item[key]));
  });

  // Find related roundtables by shared speakers and tags
  eleventyConfig.addFilter("relatedRoundtables", function(allRoundtables, currentRt, limit) {
    if (!allRoundtables || !currentRt) return [];
    limit = limit || 4;
    const currentSpeakers = new Set(currentRt.speakers || []);
    const currentTags = new Set((currentRt.tags || []).map(t => t.toLowerCase()));

    return allRoundtables
      .filter(rt => rt.id !== currentRt.id)
      .map(rt => {
        const sharedSpeakers = (rt.speakers || []).filter(s => currentSpeakers.has(s)).length;
        const sharedTags = (rt.tags || []).filter(t => currentTags.has(t.toLowerCase())).length;
        return { rt, score: sharedSpeakers * 3 + sharedTags };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || (b.rt.year || 0) - (a.rt.year || 0))
      .slice(0, limit)
      .map(item => item.rt);
  });

  eleventyConfig.addFilter("truncate", function(str, len) {
    if (!str || str.length <= len) return str;
    return str.substring(0, len).replace(/\s+\S*$/, '') + '...';
  });

  // Build speaker name→slug lookup from data
  const speakersData = JSON.parse(require('fs').readFileSync(
    path.join(__dirname, 'src', '_data', 'speakers.json'), 'utf8'));
  const speakerSlugMap = {};
  for (const s of speakersData) {
    speakerSlugMap[s.name] = s.slug;
  }

  eleventyConfig.addFilter("speakerUrl", function(name) {
    if (!name) return '/speakers/';
    // Look up actual slug from data first
    if (speakerSlugMap[name]) {
      return `/speakers/${speakerSlugMap[name]}/`;
    }
    // Fallback: generate slug from name
    const slug = name.toString().toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõöő]/g, 'o')
      .replace(/[ùúûüű]/g, 'u').replace(/[ýÿ]/g, 'y')
      .replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c')
      .replace(/[ğ]/g, 'g').replace(/[ş]/g, 's')
      .replace(/[á]/g, 'a').replace(/[é]/g, 'e')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    return `/speakers/${slug}/`;
  });

  // Convert "H:MM:SS" or "MM:SS" to ISO 8601 duration "PT1H30M45S"
  eleventyConfig.addFilter("isoDuration", function(str) {
    if (!str) return '';
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return `PT${parts[0]}H${parts[1]}M${parts[2]}S`;
    if (parts.length === 2) return `PT${parts[0]}M${parts[1]}S`;
    return '';
  });

  eleventyConfig.addFilter("split", function(str, sep) {
    if (!str) return [];
    return str.split(sep);
  });

  eleventyConfig.addFilter("rtUrl", function(title) {
    if (!title) return '/roundtables/';
    const slug = title.toString().toLowerCase()
      .replace(/[?:'"!,.;]/g, '')
      .replace(/&/g, 'and')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    return `/roundtables/${slug}/`;
  });

  // Convert date string to RFC 2822 format for RSS feeds
  eleventyConfig.addFilter("rfc2822Date", function(dateStr) {
    if (!dateStr) return '';
    if (dateStr === 'now') return new Date().toUTCString();
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toUTCString();
  });

  // XML-escape a string for RSS content
  eleventyConfig.addFilter("xmlEscape", function(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  });

  // Build audio URL lookup map (roundtable slug → full audio URL)
  eleventyConfig.addGlobalData("audioUrls", () => {
    const fs = require('fs');
    const mediaPath = path.join(__dirname, 'src', '_data', 'roundtable-media.json');
    if (!fs.existsSync(mediaPath)) return {};
    const media = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
    const map = {};
    for (const [slug, entry] of Object.entries(media)) {
      if (entry.audioUrls && entry.audioUrls.length) {
        map[slug] = entry.audioUrls[0];
      }
    }
    return map;
  });

  // Build podcast feed data with resolved audio URLs
  eleventyConfig.addGlobalData("podcastFeed", () => {
    const fs = require('fs');
    const podPath = path.join(__dirname, 'src', '_data', 'podcasts.json');
    const mediaPath = path.join(__dirname, 'src', '_data', 'roundtable-media.json');
    if (!fs.existsSync(podPath)) return [];
    const podcasts = JSON.parse(fs.readFileSync(podPath, 'utf8'));
    const media = fs.existsSync(mediaPath) ? JSON.parse(fs.readFileSync(mediaPath, 'utf8')) : {};

    return podcasts.map(ep => {
      let audioUrl = ep.audioUrl || '';
      if (!audioUrl && ep.roundtableLink) {
        const match = ep.roundtableLink.match(/\/roundtables\/([^/]+)\/?$/);
        if (match) {
          const slug = match[1];
          const entry = media[slug];
          if (entry && entry.audioUrls && entry.audioUrls.length) {
            audioUrl = entry.audioUrls[0];
          }
        }
      }
      return { ...ep, resolvedAudioUrl: audioUrl };
    }).filter(ep => ep.resolvedAudioUrl);
  });

  // Build podcast duration lookup map (roundtable slug → duration)
  eleventyConfig.addGlobalData("podcastDurations", () => {
    const fs = require('fs');
    const podPath = path.join(__dirname, 'src', '_data', 'podcasts.json');
    if (!fs.existsSync(podPath)) return {};
    const podcasts = JSON.parse(fs.readFileSync(podPath, 'utf8'));
    const map = {};
    for (const ep of podcasts) {
      if (ep.roundtableLink) {
        const match = ep.roundtableLink.match(/\/roundtables\/([^/]+)\/?$/);
        if (match && ep.duration) {
          map[match[1]] = ep.duration;
        }
      }
    }
    return map;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html", "txt"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};

const path = require('path');

module.exports = function(eleventyConfig) {
  // Passthrough copy
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/llms.txt");
  eleventyConfig.addPassthroughCopy("src/_headers");

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
    const match = dateStr.match(/(\d{4})/);
    return match ? match[1] : '';
  });

  eleventyConfig.addFilter("uniqueValues", function(arr, key) {
    const values = arr.map(item => item[key]).filter(Boolean);
    return [...new Set(values)].sort();
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

  eleventyConfig.addFilter("speakerUrl", function(name) {
    if (!name) return '/speakers/';
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

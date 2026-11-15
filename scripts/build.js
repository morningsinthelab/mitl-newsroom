#!/usr/bin/env node
// Generates the static, crawlable newsroom from data/releases.js:
//   index.html, releases/<slug>/index.html, sitemap.xml, robots.txt, llms.txt
// Usage: node scripts/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://newsroom.mitl.studio';
const releases = require('../data/releases.js');
const tpl = fs.readFileSync(path.join(__dirname, 'page-template.html'), 'utf8');

// "May 2026" -> "2026-05" (month precision only; the releases do not state a day)
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function isoMonth(label) {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(label).trim());
  if (!m) return null;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)) + '…');
const ld = (obj) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n  </script>`;

const PUBLISHER = {
  '@type': 'Organization',
  '@id': 'https://mitl.studio/#organization',
  name: 'MiTL Studio',
  url: 'https://mitl.studio',
  logo: { '@type': 'ImageObject', url: 'https://mitl.studio/apple-touch-icon.png' },
};
const AUTHOR = { '@type': 'Person', name: 'Keith Bilous', url: 'https://keithbilous.com' };

function page({ title, description, url, ogType, jsonld, app }) {
  let out = tpl;
  const swap = (re, val) => {
    if (!re.test(out)) throw new Error('template marker missing: ' + re);
    out = out.replace(re, val);
  };
  swap(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  swap(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  swap(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  swap(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  swap(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${ogType}">`);
  swap(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  swap(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">\n  <link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="llms.txt">`);
  swap(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, jsonld.map(ld).join('\n  '));
  swap(/<!--APP-->[\s\S]*?<!--\/APP-->/, `<!--APP-->\n  <main id="app">\n${app}\n  </main>\n  <!--/APP-->`);
  return out;
}

// ---- index ----
const indexDesc = 'Official press releases and news from MiTL Studio, the live conversation and community studio founded by Keith Bilous.';
const cards = releases.map((r) => `
      <article class="release-card">
        <div class="release-date"><time${isoMonth(r.date) ? ` datetime="${isoMonth(r.date)}"` : ''}>${esc(r.date)}</time></div>
        <h2><a href="/releases/${r.slug}/">${esc(r.title)}</a></h2>
        <p class="release-excerpt">${esc(r.excerpt)}</p>
        <a href="/releases/${r.slug}/" class="read-more">Read Full Release &rarr;</a>
      </article>`).join('');
const indexApp = `    <div class="hero">
      <div class="hero-label">MiTL Studio</div>
      <h1 class="font-sync">Newsroom</h1>
      <p>Official press releases and news from MiTL Studio and Mornings in the Lab.</p>
    </div>
    <div class="releases">${cards}
    </div>`;
const sameAs = [
  'https://youtube.com/@MorningsintheLab', 'https://youtube.com/@KeithIntheLab', 'https://linkedin.com/in/keithbilous',
  'https://morningsinthelab.com', 'https://insidethelab.live', 'https://universe.mitl.studio', 'https://lookinmymirror.com',
  'https://podcasts.apple.com/us/podcast/mornings-in-the-lab-with-keith-friends/id1735637203', 'https://keithbilous.com',
  'https://x.com/MorningsintheLab',
];
fs.writeFileSync(path.join(ROOT, 'index.html'), page({
  title: 'Newsroom — MiTL Studio',
  description: indexDesc,
  url: `${SITE}/`,
  ogType: 'website',
  jsonld: [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'MiTL Studio Newsroom',
    description: indexDesc,
    url: `${SITE}/`,
    publisher: { ...PUBLISHER, founder: AUTHOR, sameAs },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: releases.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/releases/${r.slug}/`, name: r.title })),
    },
  }],
  app: indexApp,
}));

// ---- release pages ----
for (const r of releases) {
  const url = `${SITE}/releases/${r.slug}/`;
  const desc = clip(strip(r.excerpt), 300);
  const shortTitle = clip(strip(r.title), 110);
  const date = isoMonth(r.date);
  const article = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: shortTitle,
    name: strip(r.title),
    description: desc,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: AUTHOR,
    publisher: PUBLISHER,
    image: ['https://mitl.studio/og-image.jpg'],
    isPartOf: { '@type': 'CollectionPage', '@id': `${SITE}/`, name: 'MiTL Studio Newsroom' },
  };
  if (date) { article.datePublished = date; }
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Newsroom', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: shortTitle, item: url },
    ],
  };
  const app = `    <article class="release-full">
      <a href="/" class="back-link">&larr; Back to Newsroom</a>
      <div class="release-date"><time${date ? ` datetime="${date}"` : ''}>${esc(r.date)}</time></div>
      <h1>${esc(r.title)}</h1>
      <div class="release-body">${r.body}</div>
    </article>`;
  const dir = path.join(ROOT, 'releases', r.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page({
    title: `${clip(strip(r.title), 70)} | MiTL Studio Newsroom`,
    description: desc,
    url,
    ogType: 'article',
    jsonld: [article, crumbs],
    app,
  }));
}

// ---- sitemap.xml ----
const urls = [{ loc: `${SITE}/` }].concat(releases.map((r) => ({ loc: `${SITE}/releases/${r.slug}/` })));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc></url>`).join('\n')}
</urlset>
`);

// ---- robots.txt ----
const bots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot', 'Googlebot'];
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `# MiTL Studio Newsroom — search engines and AI assistants are welcome.
User-agent: *
Allow: /

${bots.map((b) => `User-agent: ${b}\nAllow: /`).join('\n\n')}

Sitemap: ${SITE}/sitemap.xml
`);

// ---- llms.txt ----
fs.writeFileSync(path.join(ROOT, 'llms.txt'), `# MiTL Studio Newsroom

> Official press releases from MiTL Studio (https://mitl.studio), the live conversation and community studio founded by Keith Bilous. MiTL Studio produces Mornings in the Lab, a two-hour live show every Monday to Friday that has never missed a day: 800+ episodes and 300+ guests. "We're your morning accountability partner."

Each release below has its own page with the full text.

## Press releases

${releases.map((r) => `- [${strip(r.title)}](${SITE}/releases/${r.slug}/) (${r.date}): ${clip(strip(r.excerpt), 280)}`).join('\n')}

## Related

- [MiTL Studio](https://mitl.studio): the studio
- [Keith Bilous](https://keithbilous.com): founder
- [Mornings in the Lab on YouTube](https://youtube.com/@MorningsintheLab)

## Media contact

Keith Bilous, mornings@bapl.ai
`);

console.log(`Built index + ${releases.length} release pages, sitemap.xml, robots.txt, llms.txt`);

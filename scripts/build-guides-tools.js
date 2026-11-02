#!/usr/bin/env node
/* Writes the Guides & Tools cards into /guides.html from /assets/guides-tools.json.

   The public page keeps its cards in the markup so it reads with JS off and
   search engines see them. The markup between each pair of marker comments,
   <!-- gt:NAME --> ... <!-- /gt:NAME -->, is generated here with the same
   render functions the browser uses (/assets/guides-tools.js).

     node scripts/build-guides-tools.js          rewrite guides.html
     node scripts/build-guides-tools.js --check  exit 1 if guides.html is out of date */
'use strict';

const fs = require('fs');
const path = require('path');
const GT = require('../assets/guides-tools.js');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'guides.html');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/guides-tools.json'), 'utf8'));

const parts = {
  topics: GT.renderTopics(data),
  count: GT.renderCount(data, 'public'),
  library: GT.renderLibrary(data, 'public'),
  soon: GT.renderSoon(data, 'public')
};

const before = fs.readFileSync(PAGE, 'utf8');
let after = before;
for (const [name, html] of Object.entries(parts)) {
  const re = new RegExp('(<!-- gt:' + name + ' -->)[\\s\\S]*?(<!-- /gt:' + name + ' -->)');
  if (!re.test(after)) { console.error('guides.html: missing the gt:' + name + ' markers'); process.exit(2); }
  after = after.replace(re, (m, a, b) => a + html + b);
}

if (process.argv.includes('--check')) {
  if (after !== before) {
    console.error('guides.html is out of date with assets/guides-tools.json. Run: node scripts/build-guides-tools.js');
    process.exit(1);
  }
  console.log('guides.html matches assets/guides-tools.json');
} else if (after !== before) {
  fs.writeFileSync(PAGE, after);
  console.log('guides.html updated');
} else console.log('guides.html already up to date');

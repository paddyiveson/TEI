# Members' article checklist: thumbnails, tease and where things go

Every members' article ships with the full image set below. It is part of the
build, not a later pass (Paddy, 10 Nov 2026).

## 1. The image set (every members' article)

| File | Size | Used for |
|---|---|---|
| wide | 1600x900 | the members' card (Client Hub home, Research deep dives) |
| og | 1200x630 | link previews: `og:image` and `twitter:image` (PNG) |
| square | 1080x1080 | social, and the small square tiles in the Hub |
| homepage tease | 1600x900 | the homepage tease: headline over blurred summary rows with a "Members only" panel |

Each comes as PNG and WebP. The site uses WebP, except the og image, which is
PNG so every link preview can read it. Social posts use the PNGs.

An article with its own look (ONDS, NBIS) also gets an own-style set in its
own colours and type (`--own`, below), next to the TEI on-brand set. Its
tease is captured from the article itself. Use whichever set Paddy picks for
the card and og image in `hub/members-articles.json`.

## 2. Rules for every image

- Words only: headline, company names, kicker and date. No share price,
  return or other company figure readable on any image.
- Blurred rows on a tease are placeholders made by the renderer, never the
  article's figures, and sit under a 14px blur (15px on a captured tease).
- On-brand set: TEI dark ground (deep navy, glows, grain, champagne accents),
  Schibsted Grotesk words, Inter figures, no company colours or logos.
- Alt text for every image, e.g. "Members only: Four results, four
  questions, Q3 2026 earnings review".
- House style: no em dashes, no contractions, UK spelling.

## 3. Make the set

1. Add `scripts/members-art/sets/<slug>.json`: copy the nearest existing set
   and change the kicker, headline, dek, foot (tickers or company and date),
   lock line, row labels and alt text. Take all of them from the article.
2. Run from the repo root (Playwright's Chromium, fonts are in `fonts/`):

       node scripts/members-art/render.js <slug>
       node scripts/members-art/render.js <slug> --own     # optional own-style set

3. Look at every image at full size before going further.

The site files land in `assets/img/members/<slug>/` (`wide.webp`, `og.png`,
`og.webp`, `square.webp`, `tease.webp`, and `own-*` for an own-style set).
The full PNG and WebP set for Drive lands in
`scripts/members-art/out/<driveFolder>/` (not committed).

## 4. Put it on the site

- `hub/members/<slug>.html`: the article, with the Hub gate and header
  (copy the head and body opening of an existing members' article),
  `noindex`, and the og and twitter tags pointing at
  `https://www.theeverydayinvestor.uk/assets/img/members/<slug>/og.png`.
- `hub/members-articles.json`: the entry, with `images` (card, og, square,
  tease, alt, teaseAlt). The card shows the image; without one it falls back
  to the figure.
- `middleware.js` serves `/hub/members/<slug>.html` to signed-in members only.
  Signed-out visitors and link-preview robots get a stub page with the og
  tags, which sends people on to sign in. Nothing to add per article.
- `assets/home-teases.json`: add the tease as an option. Only change `live`
  when Paddy says so. The tease links to `/membership.html`, never to the
  article.

## 5. Put it in Drive

- The finished article: `02_Brand_and_Content / Members Articles`.
- The thumbnails and tease (PNG and WebP):
  `02_Brand_and_Content / Thumbnails_and_Teases / <Article_Name>`, for
  example `Earnings_Review_Q3_2026`, `Ondas_ONDS`, `Nebius_NBIS`.

## 6. Checks before sign-off

- Members' card, Hub article and homepage tease at 1440 and 390, light and dark.
- A link preview check of the og image (signed out, as a robot would see it).
- Switch `live` in `assets/home-teases.json` to the new tease and back: only
  the tease changes.
- Screenshots of each new tease and card in the PR.

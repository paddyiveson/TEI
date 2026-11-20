# Wealth OS "Quiet" mockup: notes for the real build

Mockup: `mock/wealth-os/index.html` on branch `mock/wealth-os-quiet` (never merged).
Preview: https://tei-website-git-mock-wealth-os-quiet-tei26.vercel.app/mock/wealth-os/
Review bar: page, Client / Adviser, Phone / Desktop. Example data only (John Doe, made-up figures).

Status (20 Nov 2026): phone and desktop signed off by Paddy. **Build on hold.** Light mode still to discuss.

The mockup is the visual and layout spec. The real build applies this look to the live Wealth OS
(`hub/wealth-os.html`, `hub/js/wealth-os/*.js`, `hub/css/wealth-os.css`, `hub/css/wos2-*.css`).
Live behaviour and data stay; nothing live is removed.

---

## 1. Rules (final)

### Genre and layout
- Quiet genre. Hierarchy by space, shared edges and size. No dividers between sections; thin lines only inside lists.
- Cards only for things you tap into or tools: Your plan (desktop Home), Next steps, inputs card (Forecast), What if, bento tiles. Never a box around a hero figure or hero chart.
- Desktop: invisible 12-column grid, 32px gutters, 56px side padding, about 64px between rows, full window width.
- Phone: 390 design, checked at 360. Safari's bottom bar is 112px; the tab bar and sheets sit above it.
- Desktop bottom sheets become a 440px right-hand panel with a close button.

### Navigation
- Phone bottom bar: Home, Wealth, Cashflow, Plan, More. Plan = Goals / Forecast text tabs.
- Desktop top bar: "The Everyday Investor · Wealth OS", Home, Wealth, Cashflow, Goals, Forecast, More ▾, initials. Active = gold underline. No Goals / Forecast toggle on desktop pages.
- More: Documents, Learning (external to Client Hub), Help, Account. Desktop More shows the four groups as four columns.
- Adviser only: "All clients" and "Manage this client" at the top of More's Account group (phone and desktop) and the top of the desktop More menu.

### Type
- Words: Schibsted Grotesk. Figures: Inter. Small labels: Inter small caps.
- Hero figures: **white** (#F2F5FA), Inter 300, proportional numerals, small £ and % at 0.44em in a muted tone. Same style on every page (Forecast once used Schibsted by mistake; fixed).
- Section headings 12.5px small caps (+0.12em). A £ figure in a heading is white Inter 14.5px regular.
- Dropdown / list headers are 15px normal-case rows with a summary on the right.
- "Wealth conversion" is the one name for the share of take-home going into wealth.

### Colour (one meaning per colour)
- Ground: navy, a step lighter than v42 (`--bg #101D33`, card `#18305A`).
- **Gold** (#E8D3A2) = you and your plan: Into wealth, sliders, primary actions, links, the current period, Free-at marker, "your number".
- **Sage** (#9CBDA6) = growth only: chart lines and fills, returns, On track, reinvesting, dividend growth.
- **Wealth types**: Property slate #8E98AC, Investments powder #8FA5C6, Pensions light powder #AFBDD4, Cash sand #C8B78F.
- **Spending** (Essentials, Lifestyle, Surplus): slate tones #7E899E, #66718A, #535D74 so Into wealth is the only bright part.
- **Status**: On track sage, Behind soft coral (#DDA594), Not yet slate outline.
- **Treemap exception**: solid ramp from deep green #1E5A3E to pale mint #CFE8D7 (largest to smallest), matching the live treemap. 1% move dots use the same ramp.
- Dividend details mostly white and grey; gold only for the received bar and this year; payer split stays in the year chart.

### Bars and controls
- Bars 12px, radius 6px. Hero conversion bar (Cashflow) and November bar (desktop Home) 24px.
- Sliders: 12px track, 26px thumb with a soft champagne ring.
- Text tabs with a gold underline for switches; a pill only for the Forecast growth rate.

### Motion
- Phone: figures count up and rings/bars fill on page open (as v42).
- Desktop: every chart grows once as it comes into view (lines and area charts reveal left to right, bars rise, donut sweeps, flow bands drop). Under a second each, once per page open.
- Reduced motion: nothing moves; end states show.

---

## 2. Decisions made during the build (19 to 20 Nov)
- Example data aligned across pages (made-up): take-home £2,450; £620 a month into wealth (25%); net worth £197,098; Forecast pot £36,103, £620 a month, retire 55, £20,000 a year spending, 5%, free at 50; safety net £3,254 of £9,540 (6 x £1,590).
- Desktop pages built by moving the phone page's DOM into the desktop frame and laying it out with CSS grid: one DOM, one model, behaviour identical on both.
- Palette trial (Gold vs Colour) won by Colour, then made quieter; hero figures trial (Gold vs White) won by White.
- Wealth donut centre: shows the hovered or opened type's share; empty otherwise.
- Coasting from: not shown on desktop Forecast.
- Last 12 months tile: no mini bars; carries the habits as bullets (phone and desktop). No separate habits row.
- Home desktop: Your plan is a card that shares the hero's top and bottom edges; wealth conversion folds into the November bar row (no separate block).

---

## 3. Page by page: blocks, data and interactions

### Home
| Block | Data | Interactions |
|---|---|---|
| Greeting | first name, today | none |
| Hero | net worth, change since last month, growth over 3 years, 12-month net worth series, mix by type (%) | opens Wealth |
| November (cashflow) | take-home, into wealth, essentials, lifestyle, surplus; wealth conversion %, change on last month, 6-month conversion series | opens Cashflow |
| Your plan (desktop card) | headline goal (name, saved, target, status, %), Wealth Plan date, safety net months (of 6), next session (date, time, label, questions saved) | each row opens its page |
| Next steps | up to three steps (title, one line, action link) | Mark as done / Undo; phone opens a sheet listing all three |

### Wealth
| Block | Data | Interactions |
|---|---|---|
| Top line | prices updated time | Update balances, refresh, hide values (eye) |
| Hero + chart | net worth, growth £ and %, annualised return; net worth and paid-in series by range | 1Y / 3Y / 5Y / All |
| Wealth by type (desktop) | gross by type, debts | donut segment or row opens that type's accounts full width below |
| Accounts (expanded) | per account: name, type, value, this month, return %; holding count | account opens its holdings |
| Holdings (fully open) | units, average price, current price, invested, value, return £ and %, share of account | none |
| Treemap | holdings (actively managed), value, share | hover or tap shows name, value, share, account; labels adapt to tile size; Set and forget / Earmarked chips |
| 1% move (desktop) | 1 / holding share | info tip |
| Dividends strip | p/a, received so far, p/m, months paid, next payment (amount, month, payer), yearly totals | Show / Hide details |
| Dividend details | reinvest projection, yield vs easy-access, dividend growth, year chart by payer (received, estimate), payers (frequency, amount) | Show if reinvested toggle |
| Portfolio checks (desktop) | priorities, talking points, on-track checks (concentration, cash drag, spread, pension) with values | rows open detail; On track expands |
| Phone | v42 layout: composition bar + legend, Accounts dropdown, treemap, dividends | legend opens its accounts group |

### Cashflow
| Block | Data | Interactions |
|---|---|---|
| Hero | month: conversion %, target, £ into wealth; 12 months: average %, 12 monthly % | This month / 12 months; Update month |
| Flow | take-home split into four groups | segment links; "Decide where the £240 goes" |
| What if | lifestyle to wealth amount (0 to £400) | slider redraws the flow, conversion bar and Free at, live |
| Safety net tile | months covered, stages (buffer, stage 2, full), to go | opens sheet / panel |
| Last 12 months tile | months on target; lifestyle change; total into wealth | opens sheet / panel |
| Debts row | debts summary | Add |
| Coach | note, author, date | Ask Paddy |

### Goals
| Block | Data | Interactions |
|---|---|---|
| Ring hero | headline goal name, saved, target, status, expected date | none |
| Milestones timeline | goals and Free-at by date, status | tap opens the goal |
| Goal rings | each goal's %, status, date | opens goal panel |
| Goal panel | status, figure, progress vs expected, gap line, linked account | Edit; What if (Monthly / One-off slider) |

### Forecast
| Block | Data | Interactions |
|---|---|---|
| Hero + chart | value at retirement age, vs your number, path by age, Free at | live from inputs |
| Inputs card | monthly saving, retire age, spending, growth 2/5/8% | sliders redraw everything; Save as my plan / Reset appear once changed; More settings |
| How it could go | Range (paths percentiles, your number) / Order (good vs bad years first) | Range / Order |
| What would move it | three levers with result at retirement | first lever applies to inputs |
| Assumptions | four assumptions | dropdown |
| Coach | coach forecast note | Ask Paddy |

### More
Documents (plan, meeting notes, all documents), Learning (lessons, guides, tools, external), Help (Ask Paddy, How we work), Account (adviser options, settings, profile, sign out). Phone keeps the full "Important" footer here; desktop has it under every page.

---

## 4. Live features to keep (not designed in the mockup)
Apply the rules in section 1; keep behaviour as live.
- Portfolio Lab (`06-portfolio-lab.js`); the mockup only links to it.
- Update balances flow (`07-update.js`) and price refresh.
- Onboarding (`12-onboarding.js`), wealth setup (`wealth-setup.js`).
- Settings and Library (`10-settings-library.js`), My details page.
- Adviser tools (`11-adviser.js`): client list, manage client, adviser view of each page.
- Feedback (`14-feedback.js`), document viewer (`18-doc-viewer.js`), forecast viewer (`17-forecast-viewer.js`), coach notes (`20-coach-notes.js`), wealth board (`15-wealth-board.js`).
- Households and joint accounts / joint expenses; discrepancy dismiss; last viewed; cash interest; emergency fund account link; auto monthly snapshots.
- Light theme (`wos2-light.css`); see open questions.
- Any live feature not listed here: keep it and restyle it.

---

## 5. Data to check before building (mockup shows, live may not store)
- Holdings: units, average price, current price, invested amount, for every holding.
- Home: 6-month wealth conversion series; growth over 3 years.
- Cashflow habits: lifestyle against last month, months on target, total into wealth over 12 months.
- Wealth by type on gross assets with debts separate; property value.
- Dividends: reinvest projection, yield vs easy-access, dividend growth per share, received vs estimate by year and payer.
- Portfolio checks: values for concentration, cash drag, spread, pension contribution.
- Next session: date, time, label, questions saved.
Where data is missing: flag it to Paddy, do not invent figures.

---

## 6. Open questions
1. **Light mode**: keep it and remap its colours to the new scale and meanings, or drop it. To discuss.
2. Order of the build (suggested, one session per stage, signed off each time): colours and shell; Home; Wealth (largest); Cashflow, Goals, Forecast.
3. Whether desktop keeps the phone tab-bar Plan grouping anywhere (currently Goals and Forecast are separate in the desktop top bar only).

## 7. How to check each stage
- Use the demo client (`scripts/wos-demo/demo-client.js`, `fake-supabase.js`); never real client data.
- Playwright at 390x844, 360x780, 1440x900, 1280x800; no console errors; no sideways scroll on phone; reduced motion shows end states; every control exercised.
- Send Paddy phone and desktop screenshots side by side with the preview link; wait for sign-off before the next stage.

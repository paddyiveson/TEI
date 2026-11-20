# Wealth OS notes

Working notes for Wealth OS builds. The Quiet redesign reads these.

## Next steps targets

Every next step on Home (and in the Library's Agreed next steps) can carry a
target that takes the client straight to the feature it is about. Built in
`hub/js/wealth-os/21-step-links.js` (master list item 9, Nov 2026).

### Target shape

```js
target: { page, section, open }   // open is optional; the whole field is nullable
```

- `page`: a Wealth OS page id (`TEI.app.PAGES`), or `book` / `lesson` for the two outside links.
- `section`: the block to scroll to (table below).
- `open`: a panel to open on arrival (table below).

A step with no target, or one that no longer resolves (unknown page or
section, a goal that has been deleted), shows no link: just the step and
Mark as done. Never a dead link.

### Sections

| `section` | `page` | Element id | What it is |
|---|---|---|---|
| `safety-net` | `cashflow` | `#safety-net` | Safety net tile |
| `what-if` | `cashflow` | `#what-if` | Scenario corner ("What if you moved more into wealth?") |
| `month-update` | `cashflow` | `#month-update` | Wealth conversion rate tile, which holds Update this month |
| `accounts` | `progress` (Wealth) | `#accounts` | Accounts and debts ("Where it is") |
| `forecast-inputs` | `planning` (Forecast) | `#forecast-inputs` | Forecast hero, which holds Adjust |
| `goals` | `goals` | `#glCards` | Goal cards; each card is `#goal-<goal id>` |
| `settings` | `mydetails` | none | Settings; needs an `open` value |

### Open values

| `open` | Use with `section` | What it opens |
|---|---|---|
| `month-update` | `month-update` | Update this month (drop-down on desktop, sheet on phones) |
| `what-if` | `what-if` | Unfolds Scenario corner on phones (always open on desktop) |
| `update-balances` | `accounts` | Update balances panel |
| `accounts` | `accounts` | Opens the Accounts and debts list |
| `forecast-inputs` | `forecast-inputs` | Adjust forecast |
| `goal:<goal id>` | `goals` | Scrolls to that goal's card and glows it |
| `settings-accounts` | `settings` | Settings > Accounts |
| `settings-plan` | `settings` | Settings > Plan (where the safety net account is chosen) |

Outside links (new tab, nothing to scroll to):

| Target | Goes to |
|---|---|
| `{page:'book'}` | The Cal.com Plan & Review booking page |
| `{page:'lesson', open:'<url>'}` | That lesson (a site path starting `/` or an `https://` URL) |

### Link labels

Generated from the target, never typed. Gold `.hm-link.hm-step-go`, 44px tall, ending in ` ›`.

| Target | Label |
|---|---|
| `safety-net` | Open safety net › |
| `what-if` | Try it in What if › |
| `goal:<id>` | See your goal › |
| `forecast-inputs` | Update your forecast › |
| `update-balances` | Update your balances › |
| `accounts` (open) | See your accounts › |
| `month-update` with open | Log this month › |
| `month-update` without open | See this month › |
| `settings-accounts` | Add an account › |
| `settings-plan` | Choose the account › |
| `book` | Book a session › |
| `lesson` | Read the lesson › |

### Behaviour

- The link is `?focus=<section>[&open=<value>]`, pushed onto history. Back
  returns to Home with whatever the link opened closed; a reload or shared
  link on `?focus=` lands in the same place.
- On arrival: show the page, open the panel if set, and scroll the section
  to 24px below anything pinned at the top. A soft gold glow fades over
  1.2s (`.wos-focus-glow`); with reduced motion there is no glow, just the jump.
- Same on phone and desktop.
- Tapping the link never marks the step done. Mark as done is unchanged.

### Automatic steps today

| Step | Target |
|---|---|
| Add your first account | `{page:'mydetails', section:'settings', open:'settings-accounts'}` |
| Update this month's balances | `{page:'progress', section:'accounts', open:'update-balances'}` |
| Log this month's cashflow | `{page:'cashflow', section:'month-update', open:'month-update'}` |
| Choose where your safety net is kept | `{page:'mydetails', section:'settings', open:'settings-plan'}` |
| Build your safety net | `{page:'cashflow', section:'safety-net'}` |
| Look at your [goal] goal | `{page:'goals', section:'goals', open:'goal:<id>'}` |
| Review your spending | `{page:'cashflow', section:'month-update'}` |

### Coach steps (next PR)

The coach's own step (`client.insights.nextBestAction`) already honours a
`target` field, but nothing saves a coach step yet. The follow-up adds where
it is stored and the adviser editor, with a "Links to" dropdown: Safety net,
What if, A goal… (then that client's goals), Forecast inputs, Update balances,
Log this month, A lesson… (then the lessons list), Book a session, None.
Each option maps to one target above. No free text.

# TEI Task Capture Sweep — Cowork Brief

Status: **spec only** — this document records the workflow so it's version-controlled
and reusable. The workflow itself runs in a claude.ai / Cowork chat with access to
project conversation history and Google Drive, not in this repository or in a Claude
Code coding session (see "Known limitation" below).

## Purpose

Surface open commitments, decisions, and next steps that currently live scattered
across chats (mostly the TEI Claude project, some outside it), so they stop relying on
memory and become reviewable in one place. This is the anchor workstream that
everything else (BusinessHQ task list, content pipeline visibility, client follow-ups)
will eventually feed from.

## Trigger

- Weekly, automatically
- Plus on-demand, whenever Paddy asks for a sweep

## Scope

- Primary source: the TEI Claude project's chats
- Secondary source: other claude.ai chats, checked for anything TEI-relevant
- Anything sourced from outside the project must be clearly flagged, with the source
  chat named, so Paddy knows to consider moving that context into the project

## What counts as a task

- Firm commitments ("I'll draft article 3 next," "need to chase the OBI conversation")
- Decisions with an implied next step ("once JotForm is wired, revisit welcome
  sequence")
- Explicit "come back to this later" or "next step is X" statements
- **Not included**: pure brainstorming, hypothetical musings, or ideas explicitly
  discarded in the conversation

Each item is tagged with a confidence level:

- **Firm** — clearly stated as something Paddy is going to do
- **Tentative** — mentioned, implied, or discussed but not committed to

## Output format

A single structured document, organised by category:

- Content (articles, newsletter, social)
- Client management
- Build / product (Wealth OS, Cortex, BusinessHQ)
- Compliance
- Funnel / marketing
- Uncategorised

Each item includes:

- Task description (plain, one line where possible)
- Source chat (name/link)
- Date mentioned
- Confidence flag (Firm / Tentative)
- Out-of-project flag, where relevant

## Storage

- Google Drive folder: `TEI/Task Sweep`
- Single running document, overwritten/updated on each sweep — not a new file per run

## Review step

Paddy reviews the doc after each sweep: confirms, edits, or discards items. Confirmed
items are the input for BusinessHQ's task list — that connection is a separate future
workstream, not part of this one.

## Instruction to give Cowork

> Run a task capture sweep for TEI (The Everyday Investor). Search this project's
> chats first for anything that reads as a firm commitment, decision, or open next
> step I've mentioned — not brainstorming or hypothetical ideas. Then check my other
> claude.ai chats for anything TEI-relevant and flag those items clearly as "found
> outside project," naming the source chat.
>
> For each item, capture: a short plain-language description, the source chat
> (name/link), the date it was mentioned, and whether it's a firm commitment or just
> tentative/mentioned.
>
> Organise the results into a single document with these categories: Content, Client
> management, Build/product, Compliance, Funnel/marketing, Uncategorised.
>
> Save this to a new Google Drive folder called "TEI/Task Sweep." If this document
> already exists from a previous sweep, update it in place rather than creating a new
> file. I'll review the document myself afterward — don't take any further action on
> the items.

## Notes for Paddy

- First run will likely surface the most items, since nothing has been swept yet
- Review promptly after each sweep while source context is fresh
- Once this is running reliably for a few weeks, revisit connecting confirmed items
  into BusinessHQ

## Known limitation

Searching claude.ai project/chat history is a Cowork/claude.ai capability, not
something a Claude Code coding session (like the one that authored this doc and the
Drive folder below) has access to. This spec, and the Drive folder + template
document, were set up from Claude Code; the actual weekly/on-demand sweep — searching
chats and updating the running document — needs to be run from a claude.ai/Cowork
chat using the "Instruction to give Cowork" above. If Cowork's own scheduling is
available, that's the natural place to automate the weekly trigger; a Claude Code
Routine has no path to project chat history to do the search itself.

## Current storage location

- Folder: `TEI/Task Sweep` — <https://drive.google.com/drive/folders/1QVZLHNkIP0ArRubQkqMRLnDEexTk_4-j>
- Running document: `TEI Task Capture Sweep` — <https://docs.google.com/document/d/1Wts9H6nQMAtkptxazFzEOurGsSZrOW4mMi27ZztH7-0/edit>

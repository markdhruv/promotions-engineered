# Architecture

## Files

| File | Role |
|---|---|
| `app/engine.js` | Planning engine. Pure functions, no DOM, no network, no randomness. UMD module: `window.PromotionsEngine` in the browser, `require()` in Node. |
| `app/presets.js` | Configuration: channel library, industry presets, made-up demo catalogs, tone presets, example brand profile. |
| `app/app.js` | Dashboard: state, rendering, drafting, file import and export. No framework. |
| `app/index.html` | Page shell and all styles. |
| `tools/build.py` | Copies the dashboard into the plugin and writes the artifact version of the page. |
| `plugins/promotions-engineered/` | Claude Code plugin with the `promotions-engineered` skill and its own copy of the dashboard. |

Everything is plain scripts loaded with `<script src>`, so `index.html` also works when opened straight from disk. ES modules would not load over `file://`.

## Engine pipeline

```
CSV rows ─ guessMapping / normalize ─▶ items
items ─ buildPool ─▶ pool: eligibility, signal, score, tier
pool + channels ─ placeAll ─▶ entries: one per post, per channel, per slot
entries + manual edits ─ applyEdits ─▶ entries
entries ─ audit ─▶ checks (open slots, gaps, tier mismatches, missing heroes)
entries + drafts ─ sheetModel ─▶ rows for the Excel master sheet
```

`purposeOf` labels each post Launch, Discover or Re-engage from its tier and signal. `needsBrief`, `briefBasics` and `templateBrief` build creative briefs for visual formats.

Copy helpers sit beside the pipeline: `mergeRules` (global plus channel), `checkText` (rule violations), `fixText` and `templateDraft` (rule-safe template copy), and the prompt builders `buildDraftPrompt`, `buildRetryPrompt` and `buildVoicePrompt`.

The engine is deterministic: the same catalog, settings and month always produce the same plan. Ties break on title.

## Where it runs

| Where | Drafting | Saving files |
|---|---|---|
| Inside Claude, as a published artifact | Claude, on the viewer's own account (the `sample` capability) | Viewer's download prompt (the `downloads` capability) |
| Any browser: GitHub Pages or a local file | Built-in templates | Normal browser download |
| Future hosted app | A server endpoint calling the Claude API | Normal browser download |

The page checks for `window.claude` at start-up and turns features on when the capabilities resolve. Without them nothing breaks; the Claude buttons simply don't show.

To host it as a web app, keep `engine.js` and `presets.js` as they are, put the prompt builders behind an API route, and replace `Cap.sample.json(prompt)` in `app.js` with a `fetch` to that route. The rest of the page stays the same.

## Calls to Claude

| Call | When | Size |
|---|---|---|
| Draft copy and briefs | The planner clicks Draft copy, or Draft with Claude on one post | Batches of 14 posts from one channel, one call each |
| Retry | Only when drafts in a batch break a hard rule | One call per failing batch, listing each violation |
| Read voice document | The planner clicks Read with Claude | One call, document trimmed to 60,000 characters |

Selection and placement never call Claude. Judgement that can be written as a rule is written as a rule. Claude writes copy and reads prose, which is what code can't do well.

Rules are checked in code after every Claude reply, because a prompt can only ask, while code can verify. A 24-character push header either fits or it doesn't.

## State

All state lives in the browser (`localStorage` key `promotions-engineered.v1`): month, industry, uploaded rows, column mapping, overrides, settings, channels, brand profile, manual edits and drafts. Uploads over about 3 MB are not saved between visits. Export setup writes everything except catalog data to a JSON file that can be shared or imported.

Template drafts that nobody has edited are regenerated whenever titles or rules change, so they always match the current plan. Claude drafts and hand-edited drafts are kept; if the title under one changes, it is marked out of date.

## Excel export

Built in the browser with ExcelJS (loaded from cdnjs when first needed).

1. **Master calendar.** Date and Day, then a block per channel: Time, Slot, Title, Purpose, Plan, Tier, Format and one column per copy field, labelled (Draft). Each date gets as many rows as its busiest channel, and a channel's second post that day sits on the date's second row. Title cells are filled by tier colour. Mirrored channels are named in a note at the top.
2. **Creative briefs.** One row per visual post: purpose, format, spec, visual idea, key message and asset needed.
3. **All posts.** One row per post, mirrors included, with purpose, angle, theme and copy status.
4. **Title pool.** Every title with its signal, tier, the reason it landed there, and its numbers.
5. **Rules.** Voice, global rules, channel limits, selection settings and overrides used for this plan.

## Libraries

All loaded from cdnjs only when needed, pinned to exact versions:

- ExcelJS 4.4.0 for the export
- PapaParse 5.4.1 for CSV upload
- pdf.js 3.11.174 and mammoth 1.8.0 for reading voice documents (PDF and DOCX)

## Decisions

- **Pool first, channels second.** Choosing titles once and letting each channel take from the pool keeps one story across channels, and lets anyone add or remove a channel without touching selection.
- **Channels as configuration.** Accepted tiers, caps, gaps and slots are data. A music service with no push and a strong email programme is a configuration change, not a code change.
- **Hard rules in code, voice in prompts.** Anything checkable is a structured rule; prose guidance goes to the writer.
- **Templates as the fallback.** The tool is useful with no AI at all, and drafting with Claude is an upgrade rather than a requirement.
- **No framework, no build step for the page.** Anyone can read the source, fork it, or open it from disk.

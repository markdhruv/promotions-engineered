---
name: promotions-engineered
description: Plan a month of marketing programming for a subscription catalog (games, shows, films, music) across push notifications, Instagram, Facebook, YouTube Shorts, Reddit, Discord, X, LinkedIn, email and WhatsApp. Use when someone wants a monthly content or push calendar built from catalog data, wants to decide which titles to feature, needs draft copy that follows brand rules, or wants an Excel programming calendar.
---

# Promotions, Engineered

Promotions, Engineered turns a catalog file into a month of programming. It picks which titles to promote, gives every post a purpose (launch, discover or re-engage), places it into the right channel's slots, drafts copy that follows the brand's rules, writes creative briefs for visual posts, and exports one Excel calendar for the team.

The work happens in an interactive dashboard that ships with this skill in `assets/app/`. Your job is to get the person's data into shape, open the dashboard for them, and explain what it decided.

## 1. Get the catalog ready

The dashboard reads one CSV, one row per title, numbers for the last 30 days. Only `title` and `release_date` are required. A blank template with example rows is in `assets/catalog-template.csv`.

| Column | Meaning |
|---|---|
| `title` | Name as it should appear in copy |
| `release_date` | Date it went live, or will go live (YYYY-MM-DD) |
| `volume` | Minutes of play, watch or listening time |
| `volume_trend` | Percent change in volume against the previous 30 days |
| `sessions` | Number of sessions |
| `users` | Unique users |
| `avg_session` | Average session length in minutes |
| `plan` | Which plan can access it, or `both` |
| `designation` | `hero` or `featured` to lead with an upcoming launch; otherwise blank |
| `genre` | Optional label |

Upcoming releases go in the same file with a future `release_date` and empty numbers. Column names do not have to match: the dashboard matches common names (Players, Viewers, Watch Time, Launch Date and so on) and lets the person fix the mapping.

If the person has raw exports instead, write a short script to reshape them into these columns. Never invent numbers to fill gaps; leave the cell empty.

## 2. Open the dashboard

**If you have an Artifact tool** (Claude Code with artifacts, or claude.ai): publish `assets/app/artifact.html` as the page, with `engine.js`, `presets.js` and `app.js` from the same folder as supporting files, and declare `capabilities: {"sample": {}, "downloads": true}`. Use the icon `calendar`. Inside Claude the dashboard drafts copy with Claude on the viewer's own account and reads brand voice documents.

**Otherwise:** open `assets/app/index.html` in the person's browser. Everything works except Claude drafting: drafts come from built-in templates that still follow the brand's rules. The CSV reader and Excel writer load from cdnjs, so it needs a connection.

The catalog stays in the person's browser. Nothing is uploaded anywhere.

## 3. Walk them through it

1. **Data**: upload the CSV and check the column mapping.
2. **Brand voice**: pick a tone, upload a voice document if they have one, and set the rules. Global rules apply everywhere; channel rules add character limits and extra bans per channel. Rules are checked in code on every draft.
3. **Channels**: switch channels on or off, choose which tiers each one takes, and adjust caps, gaps and slots.
4. **Title pool**: review which titles became hero, featured, reactivation, pre-launch and discovery, and why. Use the Hero, Featured and Off overrides. Add themed weeks if they want them.
5. **Calendar**: click any post to change its title or edit its draft.
6. **Draft copy**: this also drafts a creative brief (visual idea and key message) for every visual post. Then **Export Excel**; the Creative briefs sheet is the design team's working list.

## How it decides, in brief

Use this to answer "why is X here?" questions. The full method is in the repository's `docs/methodology.md`.

- **Eligibility**: a title needs a minimum audience for its plan. Just under the floor makes it a one-exposure discovery title.
- **Signals**: new (released in the last 45 days), declining (negative trend), performing (top 30% by volume with above-median sessions per user), upcoming, or long tail.
- **Score**: 60% volume rank plus 40% stickiness rank. Volume gets a title in; stickiness moves it up.
- **Tiers**: overrides first, then designated launches, then data. Default sizes: 2 heroes, 6 featured, 4 reactivation, 4 pre-launch, 10 discovery.
- **Placement**: each channel fills its own slots from the pool. Slots prefer certain tiers and session lengths (short on weekdays, long at weekends). Caps per title, a minimum gap between repeats, and no title twice in a row. Angles rotate between discovery, social proof and pick-up-where-you-left-off.
- **Cascade**: channels are planned in order, and later channels favour titles that earlier channels used that week, so a launch lands everywhere at once.
- **Purpose**: pre-launch titles and new or upcoming heroes and featured titles are Launch; reactivation titles are Re-engage; everything else that features a title is Discover. Brand posts have no purpose label.
- **Mirrors**: Facebook copies Instagram; YouTube Shorts reposts Instagram Reels a day later.

## Things to avoid

- Do not present the demo catalogs as real. Every title and number in them is made up, and the dashboard says so.
- Do not promise Claude drafting outside Claude. Outside it, drafts come from templates.
- Drafts are drafts. They are labelled that way in the dashboard and the export, and the team reviews them before publishing.

# Promotions, Engineered

**Every title has a purpose. Every promotion has a plan.**

Purpose-led marketing programming for subscription catalogs: from catalog data to a month of channel-ready launches, discoveries and comebacks, with copy and creative briefs.

A subscription service with a catalog (games, shows, films, music) has to decide every month which titles to push, where and when: a few dozen push notifications, forty-odd social posts, community moments and the odd LinkedIn carousel. Done by hand, that is 100 to 150 decisions a month, repeated across channels that should be telling one story.

Promotions, Engineered makes those decisions from the catalog data. It gives every post a purpose (launch, discover or re-engage), places it in the right channel's slot, drafts copy that follows the brand's rules, writes a creative brief for the design team, and hands everyone one Excel calendar.

https://github.com/user-attachments/assets/ba10cb5c-70b5-4eac-bdb7-a11f6481f61c

## Try it

- **Live demo:** [markdhruv.github.io/promotions-engineered/app](https://markdhruv.github.io/promotions-engineered/app/). Opens on a filled month from a made-up catalog. No sign-in.
- **Inside Claude:** install the plugin below. Same dashboard, plus Claude writing the copy and creative briefs in your brand voice.
- **Locally:** open `app/index.html` in a browser.

## What it does

1. **Builds a title pool.** Every title is checked against an audience floor, tagged as new, performing, declining, upcoming or long tail, and scored on volume and stickiness. The pool is then split into tiers: heroes, featured, reactivation, pre-launch and discovery. Manual overrides always win.
2. **Places titles channel by channel.** Each channel has its own slots, the tiers it accepts, exposure caps, and a minimum gap between repeats. Short titles go on weekdays, long ones at the weekend. Channels are planned in order, and later channels favour what earlier ones used that week, so a launch lands everywhere at once.
3. **Gives every post a purpose.** Launch for new and upcoming releases, Discover for performing titles and hidden gems, Re-engage for winning back lapsed users. The dashboard shows the month's mix, and the purpose goes into every draft.
4. **Drafts copy within the rules.** Hard rules (character limits, banned characters and words, no all-caps, no emoji) are set globally and per channel and are checked in code on every draft. Voice comes from a tone preset, an uploaded brand voice document and examples of copy that worked. Inside Claude, Claude writes the drafts; elsewhere, templates do. Every draft is labelled as one.
5. **Briefs the creatives.** Every visual post (Reels, statics, carousels, event cards, emails) gets a brief: format and spec, the visual idea, the key message and the asset needed from the publisher, studio or label.
6. **Exports one Excel file.** A master calendar with a column block per channel and tier colours, a creative briefs sheet for the design team, a list of every post, the title pool with the reason each title landed where it did, and the rules used.

## Channels

| Channel | Default role |
|---|---|
| Push notifications | Daily freshness. 17 sends a week, weighted to the weekend |
| Instagram | Awareness and the source of every social asset. 10 feed posts a week |
| Facebook | Mirrors Instagram through Meta cross-posting |
| YouTube Shorts | Reposts Instagram Reels a day later |
| Reddit | Owned subreddit. Release of the week, hidden gem, weekly round-up |
| Discord | Community moments: weekly challenge, team pick, voice hangout, recap |
| X | Light presence, two or three posts a week |
| LinkedIn | Case-study carousels and launch milestones for the industry |
| Email, WhatsApp | Off by default. Switch on in Channels |

Every channel can be switched off, and its tiers, caps, gaps and slots changed. Industry presets for cloud gaming, video streaming and music change the vocabulary, plan names and session-length bands.

## Use it in Claude

The repository is also a Claude Code plugin marketplace. The plugin's skill gets a catalog into shape, opens the dashboard and explains its decisions.

```
/plugin marketplace add markdhruv/promotions-engineered
/plugin install promotions-engineered@promotions-engineered
```

Then ask Claude to plan next month from your catalog. On claude.ai, upload the `plugins/promotions-engineered/skills/promotions-engineered` folder as a skill.

## Data format

One CSV row per title, numbers for the last 30 days. Only `title` and `release_date` are required, and column names are matched loosely (Players, Viewers, Watch Time and Launch Date all work). See [`examples/demo-catalog-gaming.csv`](examples/demo-catalog-gaming.csv).

| Column | Meaning |
|---|---|
| `title` | Name as it should appear in copy |
| `release_date` | When it went live, or will (YYYY-MM-DD) |
| `volume` | Minutes of play, watch or listening time |
| `volume_trend` | Percent change against the previous 30 days |
| `sessions`, `users` | Sessions and unique users |
| `avg_session` | Average session length in minutes |
| `plan` | Which plan can access it, or `both` |
| `designation` | `hero` or `featured` to lead with an upcoming launch |
| `genre` | Optional label |

The catalog never leaves the browser. Setup files (channels, rules, brand voice, overrides) can be exported and shared without any catalog data in them.

## How it is built

- [`app/engine.js`](app/engine.js): the planning engine. Pure functions with no DOM, network or randomness, so the same file runs in the browser, in Node and in a serverless function.
- [`app/presets.js`](app/presets.js): channel library, industry presets with made-up demo catalogs, tone presets and an example brand profile.
- [`app/app.js`](app/app.js) and [`app/index.html`](app/index.html): the dashboard. No framework and no build step.
- [`tools/build.py`](tools/build.py): copies the dashboard into the plugin and writes the artifact version of the page.

The reasoning behind the method is in [docs/methodology.md](docs/methodology.md), and the technical design in [docs/architecture.md](docs/architecture.md).

## Roadmap

- A hosted web app with its own drafting endpoint, so Claude drafting works for anyone with the link.
- Approval tracking and owner columns in the dashboard.
- KPI read-back: import last month's results and feed them into next month's scores.

## License

MIT. See [LICENSE](LICENSE).

# Methodology

How Promotions, Engineered decides what to promote, where and when. Every number below is a default that can be changed in the dashboard.

## Principles

**Always-on beats episodic.** Daily owned channels, push above all, keep the service feeling fresh. Monthly moments such as a big launch or a pricing push are spikes on top of that rhythm. Each layer does its own job: freshness can't be loaded onto monthly channels, and events get lost in the daily routine.

**Predictable drumbeats.** People don't browse a catalog; they follow recommendations they trust. A fixed weekly rhythm (Friday weekend tease, Saturday main event, Sunday wind-down) teaches them when to look, and the same slots every week make the plan easy to run.

**Catch the start of free time.** Send times sit at the start of play, watch or listening windows: morning commute, post-lunch at weekends, Friday afternoon, after dinner. Weekends get more sends than weekdays because that is when people have time.

**Two messages, not ten.** Every post points to one of two ideas: here is something new and worth your time, or pick up where you left off. The angles below are variations on those two.

**One story across channels.** When a title launches, it should show up on push, Instagram, Reddit and Discord in the same week. Channels are not planned in isolation.

## Step 1: build the title pool

The pool is built before any channel is considered. "What is worth promoting this month" is a separate question from "where does it go".

### Eligibility

A live title needs a minimum audience in the last 30 days so the numbers mean something. The floor depends on the plan: a premium-only title needs more users (default 50) than one on the basic plan (default 30), because the basic audience is usually smaller. A title within 60% of its floor is **borderline**: it can take one discovery exposure and no more. Anything further below is left out for the month.

Upcoming titles skip the floor. They qualify if they release this month or within the tease window (14 days) after it.

### Signals

Each eligible title gets one signal:

| Signal | Rule |
|---|---|
| New | Released in the last 45 days |
| Declining | Volume trend below 0% |
| Performing | Top 30% by volume, with above-median sessions per user |
| Upcoming | Releases after the first of the month |
| Long tail | Everything else |

A new title can also be declining, which flags a launch that is struggling.

### Score

Score = 60% volume percentile + 40% stickiness percentile, where stickiness is sessions per user.

Volume gets a title included: if a lot of people use it, the audience is real. Stickiness moves it up: a smaller title that people return to again and again is worth more slots than its size suggests. Ranking on stickiness alone fails on small numbers, and ranking on volume alone misses titles that punch above their audience.

### Tiers

Tiers are filled in this order, and an earlier assignment always wins:

1. **Overrides.** Titles the planner marked Hero or Featured. Suppressed titles are removed before anything else.
2. **Designated launches.** Upcoming titles marked `hero` or `featured` in the catalog that release this month.
3. **Data.**

| Tier | Default size | Drawn from |
|---|---|---|
| Hero | 2 | Highest-scoring new or performing titles |
| Featured | 6 | Next best new or performing titles, then the best long tail |
| Reactivation | 4 | Declining titles with the largest past volume, the biggest audience to win back |
| Pre-launch | 4 | Upcoming titles, earliest first |
| Discovery | 10 | The best of the rest, borderline titles included |

Whatever is left sits on the bench for the month. When an override pushes a data pick out of the hero tier, that title usually lands in featured, because it still has the next-best score.

## Step 2: place titles into channels

Each channel has a weekly slot template. A slot has a day, a time, a name, and preferences: which tiers it wants first, and optionally which signals or session lengths suit it.

For every slot in the month, in time order, the engine scores every title that is allowed there and picks the best one.

**A title is allowed when:**
- the channel accepts its tier on that date (an upcoming hero is pre-launch until its release date and a hero after it);
- it is under the channel's cap for that tier (push defaults: hero 8, featured 4, reactivation 3, pre-launch 3, discovery 2) and the channel's overall cap per title;
- the channel's minimum gap since its last appearance has passed (push: 36 hours);
- it did not fill the previous slot.

**The score favours:**
- the slot's preferred tiers, in order;
- matching session length: short sessions on weekday mornings, long ones on weekend evenings;
- titles furthest below their exposure budget;
- the title's own score;
- the lead title of a themed week;
- a hero in its first five days after launch;
- titles that earlier channels used the same week (the cascade);
- plan balance: if basic-plan titles fall behind their target share (default 25%), they get a boost, and at the weekend a plan that has not appeared yet that week gets a strong boost.

Slots that only prefer certain tiers can fall back to any tier the channel accepts. A slot marked strict, such as a hidden gem, only takes its own tier.

### Angles

Each time a title appears on a channel, its angle rotates so the audience doesn't see the same pitch twice:

- Heroes and featured titles: discovery, then social proof, then personal progress.
- Reactivation: personal progress, then social proof.
- Pre-launch: tease.

### Slot types

| Type | What it holds |
|---|---|
| Title | One title |
| Set | Several titles, such as a three-title mood pack or a weekly picks email |
| Round-up | Everything releasing in the coming week, listed |
| Brand post | Not about one title: a meme, a cultural moment, a platform feature, a case study |

### Mirrors

Some channels repost another channel instead of having slots of their own. Facebook copies Instagram the same day. YouTube Shorts reposts Instagram Reels a day later, since YouTube favours content that doesn't look recycled. Mirrors are listed in the export but get no columns in the master calendar.

### Which tiers go where

Reactivation stays on owned, one-to-one channels such as push by default. Broadcasting "this title is fading" on public social sends the wrong signal to people who have never tried it. On Instagram and Reddit, discovery titles appear only in hidden-gem slots. All of this can be changed per channel.

## Step 3: give every post a purpose

Every post that features a title has one business job, worked out from its tier and signal:

| Purpose | Posts | Job |
|---|---|---|
| Launch | Pre-launch teases; heroes and featured titles that are new or upcoming | Build excitement for a new release |
| Discover | Performing heroes and featured titles; discovery titles | Get people to try something worth their time |
| Re-engage | Reactivation titles | Bring lapsed users back to something they started |

The dashboard shows the month's mix. A month with almost no launches, or with re-engagement crowding out discovery, is worth a second look before it goes out. The purpose is also passed to the copywriter with every post.

## Step 4: draft copy and creative briefs

Copy has two kinds of input, handled differently.

**Hard rules** are things code can check: character limits per field, banned characters, banned words, no all-caps words, no emoji. They are set globally and per channel, stored as data, and every draft is checked against them. Claude drafts that break a rule are sent back once with the specific violations; anything still failing is flagged. Template drafts are fixed mechanically so they always pass.

**Voice** guides the writer and is not checked: a tone preset, voice notes, examples of copy that worked, and an optional brand voice document. When a document is uploaded, Claude reads it once, summarises the voice, and suggests any firm rules it states. The planner chooses which suggestions become hard rules.

**Creative briefs** go with every visual post: Reels, statics, carousels, challenge and event cards, and emails. The format sets the spec (a Reel is 9:16, 7 to 15 seconds, hook in the first second) and the asset needed (key art and footage from the publisher, studio or label, or made in-house for brand posts). The visual idea and key message are drafted with the copy and follow the post's purpose.

Every draft is labelled a draft, in the dashboard and in the export.

## What stays with people

- Final copy and publishing.
- Reactive posts, such as news or a viral moment.
- Brand posts get a starting idea, not finished copy.
- Approvals and asset production.

## Measuring it

Suggested checks after each month:

- **Push:** open rate by slot, tier and angle.
- **Reactivation:** did the declining trend stop within 30 days, and how many lapsed users came back twice?
- **Social:** saves and shares rather than reach.
- **Discovery health:** how many different titles each user played, watched or listened to.
- **The goal underneath all of it:** free-to-paid conversion and renewal.

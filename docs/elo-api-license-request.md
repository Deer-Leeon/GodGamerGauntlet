# Elo / speedrun.com commercial API license request

Send this from a domain mailbox (not a throwaway). To: **support@elo.io**  
Subject: **Read-only API v1 permission for godgamergauntlet.com (commercial, attributed)**

Do not bulk-import SRC leaderboards until you have a written yes. Follow up on day 7–10 if silent; after day 21 treat silence as no bulk import and keep claim-gated import only.

---

Hello,

My name is Leon Buchmiller. I run [godgamergauntlet.com](https://godgamergauntlet.com): players draft a set of games and try to survive a timed gauntlet, usually on stream.

I am not building another speedrun.com. speedrun.com is already the place people go to see who is first and whether a time is real. What I need is **read-only access** so a drafted game can show a verified baseline (world-class / personal-best context), and so a runner who proves they own their speedrun.com account can show **their own** times on their Gauntlet profile. Every imported row would link back to its speedrun.com page.

Your API marks original content CC-BY-NC 4.0 and asks people to write when that license does not fit. Gauntlet is a commercial product, so I am asking for a **written commercial license** to use **API v1, read-only**, on godgamergauntlet.com.

**Phase 1 — named full-game boards, live verified personal bests only** (no individual levels, no obsolete history):

- Player names and speedrun.com user ids
- Primary times, run dates, emulator/platform flags
- Category and subcategory labels
- Public YouTube / Twitch URLs already on the run (embed only; we do not rehost)
- Run ids, so each row can open the original `weblink`

These 19 games are the **entire catalog on the site** — there is nothing else to draft and nothing else to import: Super Mario 64, Super Mario World, Super Mario Odyssey, Super Mario Bros., The Legend of Zelda: Ocarina of Time, The Legend of Zelda: Breath of the Wild, Super Metroid, Celeste, Hollow Knight, Elden Ring, Dark Souls, Minecraft, Portal, Portal 2, Pokémon Red/Blue, Undertale, Cuphead, Getting Over It, Super Meat Boy.

The roster is a fixed list in our source, and the importer can only read boards on it, so the scope of this request cannot quietly widen. If a game is added later I would like the **same read-only fields** for it — still attributed, still linked back, and only with your written OK.

I will not scrape the website (API only, within your documented rate limit), use your trademarks or medals, hotlink your images, rehost videos, or present anything as an official speedrun.com board. I will attribute the source, keep a public note that imported times came via the API under the terms you grant, and honor a written revocation. I am not asking for write access or moderator powers. I do not need to copy category rules text.

If a license needs limits (this game list, no ads, a fee, or revenue share), tell me the conditions and I will follow them.

Thank you for documenting the API so other tools can integrate with credit. I would rather have your written permission than guess.

Leon Buchmiller  
godgamergauntlet.com

---

## Follow-ups (keep in the same thread)

**Day 7–10 bump, if no reply**

Hello — following up on the read-only API v1 request for godgamergauntlet.com. Short version: we run timed gauntlets, not a competing leaderboard; we want verified full-game PBs on a named list as baselines, with every row linking back to speedrun.com. Happy to take any conditions you need. Thanks.

**Day 21**

If still silent: do not bulk-fill. Keep reserved usernames and claim-gated import of a runner’s own PBs. Leave the door open if they reply later.

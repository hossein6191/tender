# Demo bot plan

A tender needs a buyer and several rival bidders. A visitor usually arrives alone. The demo bot plays the other
parts from a server-side key, so the visitor can walk the whole flow, as a bidder or as the buyer, with no help
from the author.

## The bot

- **Three server-side accounts**, generated once and kept in the site's environment (never in the repository):
  `DEMO_BUYER`, `DEMO_RIVAL_A` and `DEMO_RIVAL_B`. A single `DEMO_KEY` derives all three, so there is
  one secret to set. `/api/demo/status` reports each account's balance and whether the bot is online. A
  submission is not final until this reports `online`.
- **One fixed demonstration tender** with real content, not placeholders: "Repaint Elm Street Primary
  classrooms", with the three requirements from the smoke run. The windows are short so a visit fits in about an
  hour: bidding 25 minutes, reveals 20, review 30.
- **Two rival proposals that differ on exactly one requirement.** Rival A is cheap and silent on low-VOC paint, so it
  will read `MEETS,MISSES,MEETS`. Rival B is dearer and meets every requirement. The visitor can see what a
  missing commitment costs, and that the cheapest bid does not win just by being cheap.

## Visitor as bidder (the main path)

1. The visitor presses "Start a demo tender". The server opens a tender as `DEMO_BUYER` and immediately commits
   both rivals' sealed bids. Their salts stay on the server until the reveal window opens.
2. The visitor writes a proposal and a price. The page computes the commitment and the salt in the browser, keeps
   them in local storage, offers a "save my salt" download, and sends `bid()` from the visitor's own wallet with
   the bond attached.
3. When bidding closes on the chain's clock, the server reveals both rivals. The page prompts the visitor to
   reveal, using the salt it kept.
4. Once reveals close, the server calls `assess()` on every revealed bid, including the visitor's, so the
   visitor never has to work out what to do next. The visitor can also press "Assess my bid" themselves.
5. If the visitor's bid reads short of all `MEETS`, the page offers the one appeal, with the window counting
   down. If a rival's bid reads all `MEETS`, the page offers one challenge of it in that rival's window. The
   server places every compliant bid with the hint it reads from `bids_of()`, so the visitor never has to.
6. When `tender().award_ready` is true, the server calls `award()`. If the visitor wins, the server waits a short
   moment and calls `complete()` as the buyer, so the visitor sees the payment arrive. Then it calls `reclaim()`
   on every held bond, the visitor's included.

## Visitor as buyer

The visitor opens a tender with their own small budget. The server has both rivals bid on it, reveal, and assess.
The visitor watches the award go to the cheapest compliant rival and the remainder come back, and can then call
`complete()` or `dispute()` themselves.

## Limits on the bot

- At most one demo tender per visitor address at a time, and a small daily cap per client address, because
  addresses cost nothing to make.
- The bot only ever signs these calls: `open_tender`, `bid`, `reveal`, `assess`, `place`, `award`, `complete`
  and `reclaim`, on tenders it opened or bid on. It never challenges or appeals: a second look is the visitor's
  to choose. It never calls `dispute`, `waive` or `withdraw` on a visitor's behalf.
- The bot's budget is small (about 1.5 GEN per demo tender). When its balance is low, `/api/demo/status` reports
  `offline` and the page says so, rather than failing halfway through.

## Waiting states

Every wait gets a panel answering five questions: what is happening and who it waits for, how long, whether the
visitor must act now, whether they can leave, and where their money is. One pure helper (state + role + chain
clock → lines), unit-tested for each phase and role, covers:

| phase (`tender().phase`) | visitor as bidder sees |
|---|---|
| `bidding` | your bid is sealed; nobody can see your price; bidding closes in mm:ss; you can leave; your bond is held by the contract |
| `revealing` | reveal now, or your bond goes to the buyer; closes in mm:ss; your salt is saved in this browser |
| `reviewing` | the network is reading each proposal; about a minute per bid; nothing needed from you; your bond is held until the award |
| appeal window open | your bid read short on requirement k; you may appeal once within mm:ss; the appeal bond comes from your credit |
| challenge window open | a rival's bid reads all MEETS; you may challenge it once within mm:ss; a knockout pays you its bond, an upheld challenge pays yours to it |
| your bid is challenged | a rival asked the network to look again; about a minute; nothing needed from you; your bond is held until the award |
| `ready_to_award` | anyone can now award; the bot will do it within a minute |
| `awarded` | the winner's price is held; the buyer releases it, or the winner can claim it from a date shown |
| `paid` / `no_award` / `waived` | closed; where every atto went |

Each pending transaction also says "validators are reading this; it usually takes under two minutes; you can
leave; nothing moves until it is final".

# Tender

The cheapest bid that meets every requirement wins, and the buyer does not get to decide which bids those are.

## The problem

A small public buyer, such as a primary school or a village hall, usually has to give work to the cheapest bid that
meets every requirement. The buyer is also the one who reads the bids. So a buyer who wants a friend to win can
call the cheaper bid "non-compliant" ("they didn't really promise low-VOC paint"), and nobody outside can easily
check. The rule is fair. The person applying it may not be.

Tender takes that judgement away from the buyer. The network reads each proposal against the published
requirements, and the award follows from a fixed rule.

## What it is

An Intelligent Contract on GenLayer, `contracts/tender.py`. One deployment holds any number of tenders.

1. **The buyer opens a tender.** It has a title, a plain-text scope, one to six requirements (for example
   "Paints all 12 classrooms", "Uses low-VOC paint", "Finishes within the summer break"), a bid bond, and three
   deadlines: bidding, reveal and review. The call carries the maximum budget, and the contract holds it in escrow.
2. **Bidders commit sealed bids.** Before the bidding deadline, a bidder sends
   `sha256(price_atto + "|" + proposal + "|" + salt)` and stakes the bid bond. The bond can go with the call or
   come from credit deposited earlier. Nobody can see a price or a proposal yet.
3. **Bidders reveal.** Between the bidding and reveal deadlines, each bidder sends the price, the proposal and the
   salt. The code checks them against the commitment and checks the price against the budget. The bond goes back
   to the bidder's credit. A price over the budget is recorded as `over_budget` and cannot win. If a bid is never
   revealed, its bond goes to the buyer.
4. **Anyone assesses each bid, one bid per transaction.** The network decides, requirement by requirement,
   whether the proposal commits to it: `MEETS`, `MISSES` or `UNCLEAR`. That result is final.
5. **A bidder whose bid fell short may appeal once**, within twenty minutes, with a short reason and a bond.
6. **Anyone awards the tender once it is ready.** The cheapest bid with every requirement `MEETS` wins. If two
   bids have the same price, the one committed first wins. The winner's price stays in escrow and the rest of
   the budget goes back to the buyer. If no bid meets every requirement, the whole budget goes back.
7. **Payment.** The buyer releases the price with `complete()`. If the buyer never does, the winner can claim it
   two days after the completion deadline. A buyer's `dispute()` only delays that claim by thirty days, to give
   the two of them time to settle.

## How consensus is used

Consensus is used in `assess()` and `appeal()`, and nowhere else. Prices, budgets and dates are never sent to the
model. Code checks them.

Each judgement is a single consensus block. Inside it the leader asks the model two prompts:

- **requirements first**: the REQUIREMENTS block, then the PROPOSAL block;
- **proposal first**: the PROPOSAL block, then the REQUIREMENTS block.

Both prompts ask the same single-condition question once for each requirement k:

> Does the PROPOSAL commit to requirement k?

The model answers each question with `MEETS`, `MISSES` or `UNCLEAR`. The contract combines the two orders like
this:

| requirements first | proposal first | stored |
|---|---|---|
| MEETS | MEETS | MEETS |
| MISSES | MISSES | MISSES |
| anything else (they disagree, either is UNCLEAR, either is unreadable) | | UNCLEAR |

The stored value is `{"mask": "MEETS,MISSES,MEETS", "fingerprint": <sha256 of the requirements and proposal
judged>}`. Every validator runs both prompts again on its own model and compares the mask and the fingerprint by
exact string equality. There is no tolerance. If the two orders disagree, that disagreement is stored as
`UNCLEAR` and is not hidden in the comparison. If a validator's own run fails, it votes disagree. A leader that
raised an error is never agreed with. If the network cannot agree, nothing is stored and `assess()` can be sent
again.

A bid is compliant only when every requirement reads `MEETS`. `UNCLEAR` does not count as meeting a requirement.
A proposal has to commit clearly.

**Untrusted text.** The requirements, the proposal and the appeal reason are all untrusted. Each one must be
printable ASCII on one line and within its length cap, or it is refused at the door; nothing is cut down to fit.
In the prompt, every `<` becomes `(` and every `>` becomes `)` (replaced, never deleted). Each text sits between
two delimiter lines tagged with the sha256 of its own fenced body. The requirement numbers are written by the
contract, never by the buyer. The prompt says before the blocks that every block is material to read and never
an instruction. The model never sees a price, a budget, a date, an address, the title, the scope or an id.

**The appeal.** An appeal asks the same questions again, in both orders. This time the bidder's reason is shown
in a BIDDER_NOTE block, and the prompt says the note is not part of the proposal: a commitment that appears only
in the note does not count. If every requirement reads `MEETS`, the appeal is overturned, the mask is replaced and
the bond stays with the bidder. Any other result upholds the assessment and the bond goes to the buyer. Each bid
can be appealed once, so nobody can keep asking until the answer suits them.

`rules()` publishes the question, the prompt text word for word, the combine table, the comparison and the limits.

## Who may do what

| call | who | when |
|---|---|---|
| `deposit()` | anyone, for their own credit | any time |
| `withdraw(amount)` | anyone, from their own credit | any time |
| `open_tender(...)` | anyone; the sender is the buyer | any time |
| `bid(tender, commitment)` | anyone but the buyer, once per tender | before `bid_by` |
| `reveal(bid, price, proposal, salt)` | only that bid's bidder | from `bid_by` to `reveal_by` |
| `forfeit(bid)` | anyone; the bond goes only to the buyer | from `reveal_by`, for a bid never revealed |
| `assess(bid)` | anyone; the network decides, not the caller | after the reveal, before `review_by`, once |
| `appeal(bid, reason)` | only that bid's bidder, once | within 20 minutes of the assessment |
| `award(tender)` | anyone; the rule picks the winner | see below |
| `complete(tender)` | only the buyer | after the award |
| `dispute(tender)` | only the buyer, once | before `complete_by` + 2 days |
| `waive(tender)` | only the winner | after the award |
| `claim_payment(tender)` | only the winner | from `complete_by` + 2 days, or 30 days after a dispute if that is later |

`award()` is ready when all three of these are true:
- the reveal deadline has passed;
- every appeal window has closed;
- every bid revealed within budget has been assessed, or the review deadline has passed.

After the review deadline, a bid nobody assessed cannot win. Anyone can assess any bid, including the bidder, so
no party can keep a bid out by refusing to ask.

The buyer has no call that touches a mask, the current leader or the winner. A test lists every write that does
not check its sender, with the reason it is open. Any write added later that is not on that list fails the test.

## The money

- **Budget:** 0.1 to 1000 GEN, sent with `open_tender()` and held in escrow. At the award, the winner's price
  stays and the rest goes back to the buyer in the same call.
- **Bid bond:** set by the buyer, 0.01 to 10 GEN. It goes back to the bidder's credit when the bid is revealed,
  even when the price is over budget. A bid that is never revealed gives its bond to the buyer. So a bidder who
  commits several prices and reveals only the useful one pays a bond for each one hidden.
- **Appeal bond:** equal to the bid bond, taken from credit. Overturned: it stays. Upheld: it goes to the buyer.
- **Payment:** the price goes to the winner through `complete()` or `claim_payment()`, or back to the buyer
  through `waive()`.
- **Refusals:** a refused `deposit()`, `open_tender()` or `bid()` sends back everything that came with it and
  records the refusal. Every other refusal raises, and a refused call took nothing.
- **Constant work:** every call settles one bid or one tender and makes at most one transfer. No call loops over
  the bids. The leader is updated each time a bid is judged, so `award()` reads no list. Views page at 20 rows.
- No floats anywhere. Amounts are integers in atto.

## Limits, stated plainly

- **The contract makes the award fair. It does not judge the work.** Whether the classrooms were painted well is
  between the buyer and the winner. A dispute only buys thirty days to settle. It cannot take the money back.
- It judges what a proposal **commits to**, not whether the bidder will keep that promise.
- The buyer writes the requirements, so a buyer could write them to suit one bidder. They are public from the
  moment the tender opens, so anyone can see that happening.
- Nobody can challenge a lenient `MEETS` on a rival's bid. Only the bidder can appeal, and only a bid that fell
  short of all `MEETS`.
- A bid nobody assesses before the review deadline cannot win.
- The buyer could bid through another address. The rule still gives the award to the cheapest compliant bid.
- After an appeal is decided, the award still waits for that bid's twenty-minute window to close.
- English, in printable ASCII, one line per text. A requirement is 5 to 160 characters, a proposal 40 to 1200,
  and a reason 20 to 400.

## What is in this repository

- `contracts/tender.py`: the contract.
- `tests/test_pure.py`: the offline suite. A stub stands in for the runtime, and a small simulator gives the
  leader and each validator its own scripted model.
- `tools/mutate.py` and `tests/MUTATIONS.md`: every defence removed in turn, and the test that caught it.
- `tests/on_chain/smoke.mjs`: the on-chain walk of the classroom tender on Studio (chain 61999). It ends by
  checking that the deployed code is byte for byte `contracts/tender.py`.
- `DECISIONS.md`: why the contract is shaped this way.
- `docs/DEMO.md`: the plan for a demo bot, so a visitor bidding alone can walk the whole flow on the site.

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                       # 181 passed, no network
genvm-lint check contracts/tender.py   # Lint passed (3 checks), Validation passed
python tools/mutate.py                 # 140 / 140 killed, rewrites tests/MUTATIONS.md
npm ci && node tests/on_chain/smoke.mjs   # the on-chain walk; deploys its own copy
```

The smoke walks a three-requirement tender for repainting a school's classrooms. There are three bids. The
cheapest, at 0.6 GEN, never commits to low-VOC paint and reads `MEETS,MISSES,MEETS`. The middle one, at 0.8 GEN,
meets every requirement and wins. The dearest, at 1.0 GEN, also meets every requirement. Along the way it sends
the refusals and checks that each one is refused: a tender under the budget floor, the buyer bidding on its own
tender, a late bid, a reveal with the wrong salt, a price over the budget, and an award before any assessment.
The cheapest bidder also appeals once, and the appeal is upheld.

## Evidence

The on-chain run is recorded here once it has run.

## Licence

MIT. See `LICENSE`.

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

An Intelligent Contract on GenLayer, `contracts/tender.py`, written for GenVM v0.4. One deployment holds any
number of tenders.

1. **The buyer opens a tender.** It has a title, a plain-text scope, one to six requirements (for example
   "Paints all 12 classrooms", "Uses low-VOC paint", "Finishes within the summer break"), a bid bond, and three
   deadlines: bidding, reveal and review. The call carries the maximum budget, and the contract holds it in escrow.
2. **Bidders commit sealed bids.** Before the bidding deadline, a bidder sends
   `sha256(price_atto + "|" + proposal + "|" + salt)` and stakes the bid bond. The bond can go with the call or
   come from credit deposited earlier. Nobody can see a price or a proposal yet.
3. **Bidders reveal.** Between the bidding and reveal deadlines, each bidder sends the price, the proposal and the
   salt. The code checks them against the commitment and checks the price against the budget. A price over the
   budget is recorded as `over_budget`, cannot win, and its bond goes back to credit at once. A bid within budget
   keeps its bond held until the tender is decided. If a bid is never revealed, its bond goes to the buyer.
4. **Anyone assesses each bid, one bid per transaction.** The network decides, requirement by requirement,
   whether the proposal commits to it: `MEETS`, `MISSES` or `UNCLEAR`. That result is final.
5. **Each assessment opens a twenty-minute window for a second look, from either side.** A bidder whose bid
   fell short may appeal once. A bid that meets every requirement may be challenged once, by the buyer or by
   another bidder with a bid revealed within budget. Both stake a bond and give a short reason.
6. **Anyone awards the tender once it is ready.** The cheapest bid with every requirement `MEETS` wins. If two
   bids have the same price, the one committed first wins. Compliant bids are kept in a list ordered by price,
   so the award only reads the first one. The winner's price stays in escrow and the rest of
   the budget goes back to the buyer. If no bid meets every requirement, the whole budget goes back.
7. **Payment.** The buyer releases the price with `complete()`. If the buyer never does, the winner can claim it
   two days after the completion deadline. A buyer's `dispute()` only delays that claim by thirty days, to give
   the two of them time to settle.

## How consensus is used

Consensus is used in `assess()`, `appeal()` and `challenge()`, and nowhere else. Prices, budgets and dates are never sent to the
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

**The challenge.** A challenge is the same pair of askings with the challenger's reason in a CHALLENGER_NOTE
block. The prompt says this note is not part of the proposal and is not evidence. If at least one requirement
reads `MISSES` (that is, `MISSES` in both orders), the bid is knocked out. Its mask is replaced, the old mask is
kept on the record as `replaced_mask`, the bid leaves the ordered list (so the next compliant bid leads), and the
challenger keeps its own bond and also takes the bid's bond. Any other result, including `UNCLEAR`, upholds the
bid, and the challenger's bond goes to the challenged bidder. Doubt favours the bid that was already judged
compliant. Each bid can be challenged once, and a bid that was knocked out cannot then be appealed.

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
| `challenge(bid, reason)` | the buyer, or another bidder with a bid revealed within budget; once per bid | within 20 minutes of the bid becoming compliant, before the award |
| `place(bid, after)` | anyone; the contract checks the order | a compliant bid not yet in the list, before the award |
| `reclaim(bid)` | anyone; the bond goes only to its bidder's credit | after the award |
| `award(tender)` | anyone; the rule picks the winner | see below |
| `complete(tender)` | only the buyer | after the award |
| `dispute(tender)` | only the buyer, once | before `complete_by` + 2 days |
| `waive(tender)` | only the winner | after the award |
| `claim_payment(tender)` | only the winner | from `complete_by` + 2 days, or 30 days after a dispute if that is later |

`award()` is ready when all three of these are true:
- the reveal deadline has passed;
- every appeal and challenge window has closed;
- every bid revealed within budget has been assessed, or the review deadline has passed;
- every compliant bid has been placed in the ordered list.

A compliant bid that beats the current leader goes to the head of the list as soon as it is judged. Any other
compliant bid is placed with `place(bid, after)`, where `after` is the placed bid it follows. The site reads that
from `bids_of()`. The contract checks the bid against both neighbours, so a wrong hint is refused.

After the review deadline, a bid nobody assessed cannot win. Anyone can assess any bid, including the bidder, so
no party can keep a bid out by refusing to ask.

Apart from a challenge, which is judged by the network like any other assessment, the buyer has no call that
touches a mask, the current leader or the winner. A test lists every write that does
not check its sender, with the reason it is open. Any write added later that is not on that list fails the test.

## The money

- **Budget:** 0.1 to 1000 GEN, sent with `open_tender()` and held in escrow. At the award, the winner's price
  stays and the rest goes back to the buyer in the same call.
- **Bid bond:** set by the buyer, 0.01 to 10 GEN. A bid over budget gets it back in credit at the reveal. A bid
  within budget keeps it held until the tender is decided, then anyone can `reclaim()` it to the bidder's credit.
  A bid knocked out by a challenge loses it to the challenger. A bid that is never revealed loses it to the buyer,
  so a bidder who commits several prices and reveals only the useful one pays a bond for each one hidden.
- **Appeal bond:** equal to the bid bond, taken from credit. Overturned: it stays. Upheld: it goes to the buyer.
- **Challenge bond:** equal to the bid bond, taken from credit. Knockout: it stays, and the challenged bid's bond
  is added to it. Upheld: it goes to the challenged bidder's credit. A challenge makes no transfer.
- **Payment:** the price goes to the winner through `complete()` or `claim_payment()`, or back to the buyer
  through `waive()`.
- **Refusals:** a refused `deposit()`, `open_tender()` or `bid()` sends back everything that came with it and
  records the refusal. Every other refusal raises, and a refused call took nothing.
- **Constant work:** every call settles one bid or one tender and makes at most one transfer. No call loops over
  the bids. Compliant bids sit in a linked list ordered by price: each insertion is checked against its two
  neighbours, each knockout joins them, and `award()` reads only the head. There is no cap on the number of bids. Views page at 20 rows.
- No floats anywhere. Amounts are integers in atto.

## Limits, stated plainly

- **The contract makes the award fair. It does not judge the work.** Whether the classrooms were painted well is
  between the buyer and the winner. A dispute only buys thirty days to settle. It cannot take the money back.
- It judges what a proposal **commits to**, not whether the bidder will keep that promise.
- The buyer writes the requirements, so a buyer could write them to suit one bidder. They are public from the
  moment the tender opens, so anyone can see that happening.
- Each bid gets at most two second looks: its bidder's appeal, then one challenge if that appeal made it
  compliant. A bid that was knocked out cannot be appealed. Otherwise the two sides could take turns forever.
- A challenge has to show a requirement `MISSES` in both orders. An `UNCLEAR` result does not knock a bid out.
- A revealed bid's bond is locked until the award, so that a knockout can pay the challenger from it.
- Each compliant bid that is not the cheapest so far needs its own `place()` call before the award. Anyone can
  send it.
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
- `tests/on_chain/smoke.mjs`: the on-chain walk of the classroom tender on Studio (chain 61999, v0.123), with
  quoted fees on every transaction. It ends by checking that the deployed code is byte for byte
  `contracts/tender.py`.
- `DECISIONS.md`: why the contract is shaped this way.
- `docs/DEMO.md`: the plan for a demo bot, so a visitor bidding alone can walk the whole flow on the site.

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                       # 208 passed, no network
genvm-lint check contracts/tender.py   # Validation passed; two E014 warnings, a known false positive on v0.4
python tools/mutate.py                 # 190 / 190 killed, rewrites tests/MUTATIONS.md
npm ci && node tests/on_chain/smoke.mjs   # the on-chain walk with genlayer-js 2.0 and fees; deploys its own copy
```

The smoke walks a three-requirement tender for repainting a school's classrooms. There are three bids. The
cheapest, at 0.6 GEN, never commits to low-VOC paint and reads `MEETS,MISSES,MEETS`. The middle one, at 0.8 GEN,
meets every requirement and wins. The dearest, at 1.0 GEN, also meets every requirement. Along the way it sends
the refusals and checks that each one is refused: a tender under the budget floor, the buyer bidding on its own
tender, a late bid, a reveal with the wrong salt, a price over the budget, and an award before any assessment.
The cheapest bidder appeals once, and the appeal is upheld. The dearest bidder challenges the winner once, and
the challenge is upheld: no requirement reads `MISSES`, the winner keeps the lead, and the challenger's bond goes
to the winner. A wrong placement hint is refused, and the held bonds are reclaimed after the award.

## Evidence

Tender moved to GenVM v0.4 and Studio v0.123, where every deploy and write pays a fee, before it was submitted.
The contract's behaviour did not change; the earlier register on the v0.2 runner is no longer used, and its
evidence is replaced by this run.

Run on 25 Nov 2026 on GenLayer Studio v0.123 (chain 61999) by `tests/on_chain/smoke.mjs` with genlayer-js 2.0.0,
from generated accounts funded from the Studio faucet, none of them anybody's wallet: BUYER, CHEAP, MIDDLE, DEAR
and STRANGER are fresh accounts funded for this run. **46 passed, 0 failed**; one deployment and 35 transactions in
36 steps; sent a second time: none. Every transaction carried the fee quoted by `estimateTransactionFees()`, and
every one ended `FINALIZED` with an execution result of `FINISHED_WITH_RETURN` or `FINISHED_WITH_ERROR`. The whole
log is `tests/on_chain/smoke-run.log`.

Three sealed bids on a classroom-painting tender: the cheapest never commits to low-VOC paint and reads MISSES
(its appeal is upheld), the middle bid meets all three requirements, survives a rival's challenge and wins at
0.8 GEN, and 0.4 GEN of the budget goes back to the buyer in the same call.

- `deploy` deployed at [`0x746592c85bb3005484d49e9A6A0fbBc8363a6C13`](https://explorer-studio.genlayer.com/address/0x746592c85bb3005484d49e9A6A0fbBc8363a6C13), on the v0.4 runner
- the code deployed at 0x746592c85bb3005484d49e9A6A0fbBc8363a6C13 is byte for byte contracts/tender.py: 87478 bytes, sha256 1bc56ba8e72ab2f91a9a8e7d8dc9fd6e45fe20fe56a08c3f7ed678839a906c6d
- fees, read from each transaction's own fee accounting (paid less refunded): 0.00339 GEN for the whole run.
  A plain write cost about 0.000079 GEN, a write that sends value back about 0.000126 GEN, an assessment (one
  consensus round, six model calls) about 0.000079 GEN, the appeal 0.000127 GEN and the challenge 0.000158 GEN.
  Each quote deposits about 0.1 GEN; the unused part came back when the transaction was final.
- every account ended exactly where the receipts say, less exactly the fees its own transactions paid: MIDDLE
  0.85 GEN up, CHEAP and DEAR 0.05 GEN down, BUYER 0.75 GEN down, STRANGER even, and the contract holds nothing.

| step | by | transactions | status, execution result | votes | fee paid (atto) |
|---|---|---|---|---|---|
| BUYER deploys contracts/tender.py on GenVM v0.4 with quoted fees: FINALIZED, FINISHED_WITH_RETURN, fee 79315000003529 atto | BUYER | [0x7e79d9d4…](https://explorer-studio.genlayer.com/tx/0x7e79d9d421a14310668053223a57898b3ab78717414bc37692862b8bb51d7908) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 79315000003529 |
| BUYER opens with 0.05 GEN, under the 0.1 GEN floor: refused and every atto returned | BUYER | [0xc0213bad…](https://explorer-studio.genlayer.com/tx/0xc0213badb526da1f6a91458d91762c759b50d4858caae7fad98bf83016f45701) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126304250002823 |
| BUYER opens T1 with a 1.2 GEN budget held in escrow and three requirements; no model runs | BUYER | [0x44d30c2d…](https://explorer-studio.genlayer.com/tx/0x44d30c2d0871f8ec355fc013e6d2c798a90d0ba75e6209c73b7c0a49dc1ab5ad) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78636250002823 |
| CHEAP commits a sealed bid, B1, staking the 0.05 GEN bond with the call | CHEAP | [0xdbf1d317…](https://explorer-studio.genlayer.com/tx/0xdbf1d31770e8016a6b6103ce8c3e9978071652e43c8165e6669ac9c3155d5d7f) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78638000003529 |
| MIDDLE deposits 0.05 GEN of credit | MIDDLE | [0xf9626b1f…](https://explorer-studio.genlayer.com/tx/0xf9626b1f8d4c5b3199b469f3afc6cb1e316652e84e941001c300a9452a91d756) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78629750002823 |
| MIDDLE commits B2 with the bond taken from credit | MIDDLE | [0xa5605af9…](https://explorer-studio.genlayer.com/tx/0xa5605af9d0984b8c1e325564baba96c00b29c48547101da1f9998ce88e570fb0) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78640000002823 |
| DEAR commits B3 | DEAR | [0xbaafbaf5…](https://explorer-studio.genlayer.com/tx/0xbaafbaf59316ec0579503dcb9e4364ccffbd4e57bef8dcaaf2695aaf44936d45) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78639750003529 |
| STRANGER commits B4; its price is sealed, so nobody can tell yet that it is over the budget | STRANGER | [0x7f643070…](https://explorer-studio.genlayer.com/tx/0x7f64307052ac69c26d775f75707b58b0cbdf994d7bca01efd23a5763ab55b424) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78639750003529 |
| CHEAP deposits 0.05 GEN of credit, ready for an appeal or a challenge bond | CHEAP | [0x47a5d1d4…](https://explorer-studio.genlayer.com/tx/0x47a5d1d438e497820c1a084242b41de2c1deba51d9f6c4b3cc9baf18b7880716) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78629750003529 |
| DEAR deposits 0.05 GEN of credit, ready for an appeal or a challenge bond | DEAR | [0xe2e131fc…](https://explorer-studio.genlayer.com/tx/0xe2e131fcbfb8baf56d0ac2f2637140adb6a98af055b1f18950f399ecd55fe7f9) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78630250002823 |
| BUYER tries to bid on its own tender: refused, recorded, and the bond returned | BUYER | [0x842a0eeb…](https://explorer-studio.genlayer.com/tx/0x842a0eebd678c19237e65d962267397d9e86715922152004d9fdf78b17baf5f6) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126304250002823 |
| STRANGER bids after the bidding deadline: refused and the bond returned | STRANGER | [0x04c7de8b…](https://explorer-studio.genlayer.com/tx/0x04c7de8b0ab411962a2f64c7c0a81261500a3bcf8d9f43f9a1c3409c82dcec86) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 126304250003529 |
| CHEAP reveals with the wrong salt: refused, nothing stored | CHEAP | [0x48eac63d…](https://explorer-studio.genlayer.com/tx/0x48eac63d68a6ecc5d7331c419981f0a503fcca6b691a1fdb5099ae656659c0d4) | FINALIZED, FINISHED_WITH_ERROR | 3 agree, 0 disagree, 2 idle | 78628000002823 |
| CHEAP reveals B1 at 0.6 GEN; its bond stays held until the award | CHEAP | [0x4cb8b1f6…](https://explorer-studio.genlayer.com/tx/0x4cb8b1f63f9c45a207d9a9e96c9edf6721299e906ef92017c8bcc0c59dfe027c) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78630750002823 |
| MIDDLE reveals B2 at 0.8 GEN; its bond stays held until the award | MIDDLE | [0x37d7ea70…](https://explorer-studio.genlayer.com/tx/0x37d7ea704ceeacfe7e047b97c7f364e1c739876545ccabf14e16601b23b77a2f) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78630500003529 |
| DEAR reveals B3 at 1 GEN; its bond stays held until the award | DEAR | [0xcdf09afa…](https://explorer-studio.genlayer.com/tx/0xcdf09afa648744eb5a1f306ed4b5fdb0ff8187423ce6182e30d75c50df036582) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78630500002823 |
| STRANGER reveals B4 at 1.5 GEN: recorded as over_budget, so it cannot win | STRANGER | [0xf04e811e…](https://explorer-studio.genlayer.com/tx/0xf04e811ed25e49e70f869c903bc387316f835c0eb4b17f087bb2512ae5493360) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78633500003529 |
| STRANGER tries to award T1 before any bid is assessed: refused | STRANGER | [0x09172161…](https://explorer-studio.genlayer.com/tx/0x09172161e909fd2508ecd34592489f5197e82f709a337165928b4c5646772fb6) | FINALIZED, FINISHED_WITH_ERROR | 3 agree, 0 disagree, 2 idle | 78628000002823 |
| CHEAP reads MEETS,MISSES,MEETS: it never commits to low-VOC paint | STRANGER | [0x04cea39c…](https://explorer-studio.genlayer.com/tx/0x04cea39c00589837daafefbd59e85d174747c5b09ff186711e52e0070715c8f3) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 79061500002823 |
| CHEAP's appeal is upheld: the reason is not part of the proposal, and the 0.05 GEN appeal bond reaches BUYER from CHEAP's credit | CHEAP | [0xf4c49644…](https://explorer-studio.genlayer.com/tx/0xf4c496445f0b9f34a641785cf3d79a5c371f7f59b2b94564be0c13207a89f797) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126740500002823 |
| MIDDLE reads MEETS,MEETS,MEETS and goes to the head of the ordered list | STRANGER | [0xc0564243…](https://explorer-studio.genlayer.com/tx/0xc05642430d805aa90c06252743bf22bb849072bef59cbd5f1c1d7f253671cc20) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 79058500002823 |
| DEAR's challenge of MIDDLE is upheld: no requirement reads MISSES, MIDDLE keeps the lead, and DEAR's 0.05 GEN bond goes to MIDDLE's credit | DEAR | [0x346c8bc4…](https://explorer-studio.genlayer.com/tx/0x346c8bc42894d6e0596eb10a4a003d67abebd681a13bd282e453f2401595b214) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 157740500004588 |
| DEAR reads MEETS,MEETS,MEETS; dearer than the leader, it waits to be placed | STRANGER | [0xea682a15…](https://explorer-studio.genlayer.com/tx/0xea682a158a1192487f1e285d27f1bf07846594224beea9b2eb7cd1bcae222f3a) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 79057750002823 |
| STRANGER tries to place DEAR at the head, ahead of the cheaper MIDDLE: refused | STRANGER | [0x25db44cf…](https://explorer-studio.genlayer.com/tx/0x25db44cffdb1de0d6991ccd7dd2a07876fc6685c2beaddcdb5fd30c0ac7e8645) | FINALIZED, FINISHED_WITH_ERROR | 3 agree, 0 disagree, 2 idle | 78628000002823 |
| STRANGER places DEAR after MIDDLE; the contract checks both neighbours; MIDDLE leads | STRANGER | [0x5bf7cb72…](https://explorer-studio.genlayer.com/tx/0x5bf7cb729c8fd43f2c21af7ea9c605cf20170b2976462e6315c4c6f28f6b3f7b) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78629250003529 |
| STRANGER awards T1: MIDDLE's B2 wins at 0.8 GEN and 0.4 GEN goes back to BUYER in the same call | STRANGER | [0xca6c727b…](https://explorer-studio.genlayer.com/tx/0xca6c727b05e95f8603cf95f575667d38e4e267ebc4b4df19e180f592b2f0d525) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126306750002823 |
| STRANGER tries to release the payment: refused, only the buyer | STRANGER | [0x9d2c66c5…](https://explorer-studio.genlayer.com/tx/0x9d2c66c5ba9c90c4e828ebb1c477b5e6c38d38d5b23904a8329911bf60b0be1f) | FINALIZED, FINISHED_WITH_ERROR | 3 agree, 0 disagree, 2 idle | 78628000002823 |
| BUYER releases the 0.8 GEN to MIDDLE | BUYER | [0xefbbb994…](https://explorer-studio.genlayer.com/tx/0xefbbb99425b44a1c8f5f2e812ab43751a863d2fb2e91a05d3f49137efa01414d) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126306000002823 |
| STRANGER tries to reclaim its over-budget bid's bond again: refused, it went back to credit at the reveal | STRANGER | [0x54f8907c…](https://explorer-studio.genlayer.com/tx/0x54f8907cd156f930c939289a39171ba15f9cb98edfd7c8611053c1555bcb0c3b) | FINALIZED, FINISHED_WITH_ERROR | 3 agree, 0 disagree, 2 idle | 78628000002823 |
| STRANGER reclaims B1: its 0.05 GEN bond goes to CHEAP's credit | STRANGER | [0x469ff561…](https://explorer-studio.genlayer.com/tx/0x469ff56147cc9dabf55dc9926d663ff19d3489e62e03eee854ba1fee07ff7fd8) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78630000002823 |
| STRANGER reclaims B2: its 0.05 GEN bond goes to MIDDLE's credit | STRANGER | [0x2af2e655…](https://explorer-studio.genlayer.com/tx/0x2af2e6556527ad1409b0ddf6be9acf5501caba5b707dd4cf3feab20b34b47d2e) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 78630000003529 |
| STRANGER reclaims B3: its 0.05 GEN bond goes to DEAR's credit | STRANGER | [0x71cc113e…](https://explorer-studio.genlayer.com/tx/0x71cc113ed0e6f8f5f5d8115a91aaa17069765079b4d1f7ddcbf7bc4904036e94) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 78630000002823 |
| CHEAP withdraws 0.05 GEN of credit | CHEAP | [0xe4c7247d…](https://explorer-studio.genlayer.com/tx/0xe4c7247df25537a294c635303111a4f708895ec4e94dc3cfff3e7bd68a75c361) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126305000002823 |
| MIDDLE withdraws 0.1 GEN of credit | MIDDLE | [0xdf7e46fa…](https://explorer-studio.genlayer.com/tx/0xdf7e46fa9cec759e2690ee6212281a4408e603f79796c0cfe211dafdd90a90b9) | FINALIZED, FINISHED_WITH_RETURN | 4 agree, 0 disagree, 1 idle | 126305000003529 |
| DEAR withdraws 0.05 GEN of credit | DEAR | [0x7004bd4d…](https://explorer-studio.genlayer.com/tx/0x7004bd4da69e9d978efa109e7505bcd3ecae5498baebbbe0a8a94b3b5d214583) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126305000002823 |
| STRANGER withdraws 0.05 GEN of credit | STRANGER | [0xe536df82…](https://explorer-studio.genlayer.com/tx/0xe536df82bd1efcaa682cff9133bc4a3bd34fb957c977818a7bb00585a057c5fe) | FINALIZED, FINISHED_WITH_RETURN | 3 agree, 0 disagree, 2 idle | 126305000002823 |

## Licence

MIT. See `LICENSE`.

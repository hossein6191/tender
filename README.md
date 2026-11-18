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
- `tests/on_chain/smoke.mjs`: the on-chain walk of the classroom tender on Studio (chain 61999). It ends by
  checking that the deployed code is byte for byte `contracts/tender.py`.
- `DECISIONS.md`: why the contract is shaped this way.
- `docs/DEMO.md`: the plan for a demo bot, so a visitor bidding alone can walk the whole flow on the site.

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                       # 207 passed, no network
genvm-lint check contracts/tender.py   # Lint passed (3 checks), Validation passed
python tools/mutate.py                 # 190 / 190 killed, rewrites tests/MUTATIONS.md
npm ci && node tests/on_chain/smoke.mjs   # the on-chain walk; deploys its own copy
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

Run on 19 Nov 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, from generated accounts funded from the
Studio faucet, none of them anybody's wallet: BUYER, CHEAP, MIDDLE, DEAR and STRANGER are fresh accounts funded for this run.. **44 passed, 0 failed**; transactions: 36 in 36 steps; sent a second time: none.
The whole log is `tests/on_chain/smoke-run.log`. Three sealed bids on a classroom-painting tender: the cheapest never commits to low-VOC paint and reads MISSES (its appeal is upheld), the middle bid meets all three requirements, survives a rival's challenge and wins at 0.8 GEN, and 0.4 GEN of the budget goes back to the buyer in the same call.

- `deploy` deployed at [`0xcb8446a72832Bb88DFD531D531f938269E0E06dB`](https://explorer-studio.genlayer.com/address/0xcb8446a72832Bb88DFD531D531f938269E0E06dB)

- the code deployed at 0xcb8446a72832Bb88DFD531D531f938269E0E06dB is byte for byte contracts/tender.py: 88108 bytes, sha256 db5e1d1389ccba43dfe588f965bf17628a9a6ce188227cdf4ef04d6f1e4609d6

| step | by | transactions | votes |
|---|---|---|---|
| Tender is deployed and holds nothing yet | BUYER | [0x83526039…](https://explorer-studio.genlayer.com/tx/0x83526039a111783f232a94d15be7e73978c4cd47f18aedb91dbbd38a75a01e0a) | 3 agree, 0 disagree, 2 idle |
| BUYER opens with 0.05 GEN, under the 0.1 GEN floor: refused and every atto returned | BUYER | [0x816f0986…](https://explorer-studio.genlayer.com/tx/0x816f09865f25a6c5d0031543741ef636889ce69f8460cac9db272f436b030a68) | 5 agree, 0 disagree, 0 idle |
| BUYER opens T1 with a 1.2 GEN budget held in escrow and three requirements; no model runs | BUYER | [0xfb4d377c…](https://explorer-studio.genlayer.com/tx/0xfb4d377c1adcfda055754335b11db425daf1e464627e69dc8e68e2c8dfd46472) | 5 agree, 0 disagree, 0 idle |
| CHEAP commits a sealed bid, B1, staking the 0.05 GEN bond with the call | CHEAP | [0x3a748234…](https://explorer-studio.genlayer.com/tx/0x3a7482346f6a30043517a9352f7313fc363ab6a61a2b29c4e44e3f5cb45a7319) | 3 agree, 0 disagree, 2 idle |
| MIDDLE deposits 0.05 GEN of credit | MIDDLE | [0xae3f3c61…](https://explorer-studio.genlayer.com/tx/0xae3f3c618fff5ed1ec9f418e76d9baf5536ce57a23c5379f6b80d0b3d7ec9006) | 4 agree, 0 disagree, 1 idle |
| MIDDLE commits B2 with the bond taken from credit | MIDDLE | [0xc1ebc5e5…](https://explorer-studio.genlayer.com/tx/0xc1ebc5e57df4c7e1c7c74157f34b797cfe4478e35919062d098eb0b507f69af3) | 3 agree, 0 disagree, 2 idle |
| DEAR commits B3 | DEAR | [0x06a3546c…](https://explorer-studio.genlayer.com/tx/0x06a3546c2f70562633bb0211428481ae095ff5b649db108becf252b0e4da2ad4) | 4 agree, 0 disagree, 1 idle |
| STRANGER commits B4; its price is sealed, so nobody can tell yet that it is over the budget | STRANGER | [0x4187217a…](https://explorer-studio.genlayer.com/tx/0x4187217ae7512412ebaafc1d722cc5bb446bf2172e7c68d995281203ad9679d9) | 5 agree, 0 disagree, 0 idle |
| CHEAP deposits 0.05 GEN of credit, ready for an appeal or a challenge bond | CHEAP | [0x8700dbdc…](https://explorer-studio.genlayer.com/tx/0x8700dbdcc79ba2ee3ad8688f78c6bf9b409db06283cd34d589733d9f0881e62b) | 3 agree, 0 disagree, 2 idle |
| DEAR deposits 0.05 GEN of credit, ready for an appeal or a challenge bond | DEAR | [0xc4032000…](https://explorer-studio.genlayer.com/tx/0xc4032000d56e7e98742c6d6ebf0f80e001a3f3c1bf582611cb4d4ea1a8a6fea7) | 5 agree, 0 disagree, 0 idle |
| BUYER tries to bid on its own tender: refused, recorded, and the bond returned | BUYER | [0x2e5df41b…](https://explorer-studio.genlayer.com/tx/0x2e5df41b5ed748d8f3c078ebbfdf038ca8e4f49bed10df6a2dc382535f35a957) | 3 agree, 0 disagree, 2 idle |
| STRANGER bids after the bidding deadline: refused and the bond returned | STRANGER | [0x539ea0c8…](https://explorer-studio.genlayer.com/tx/0x539ea0c8ecca1bf9ac9dc95943175f1211c964bb65730543176b18b800c394c6) | 3 agree, 0 disagree, 2 idle |
| CHEAP reveals with the wrong salt: refused, nothing stored | CHEAP | [0x77e83288…](https://explorer-studio.genlayer.com/tx/0x77e832881abca2b9ce3d0cf0236bcbd281d7a70920175b3aa99a70eae0e4427a) | 3 agree, 0 disagree, 2 idle |
| CHEAP reveals B1 at 0.6 GEN; its bond stays held until the award | CHEAP | [0xc1c22803…](https://explorer-studio.genlayer.com/tx/0xc1c2280378eb359b9c02f48194f7d35d7ab35923a6c79a0e3569d666de0cec6c) | 3 agree, 0 disagree, 2 idle |
| MIDDLE reveals B2 at 0.8 GEN; its bond stays held until the award | MIDDLE | [0x86a62afe…](https://explorer-studio.genlayer.com/tx/0x86a62afe9f266a720c6df08e315d3b93c868525055273c5dce1de732fed8811b) | 5 agree, 0 disagree, 0 idle |
| DEAR reveals B3 at 1 GEN; its bond stays held until the award | DEAR | [0xf02c649d…](https://explorer-studio.genlayer.com/tx/0xf02c649db5669248030703bd07d75a4a7355b894059e5b66d123191acbff945f) | 3 agree, 0 disagree, 2 idle |
| STRANGER reveals B4 at 1.5 GEN: recorded as over_budget, so it cannot win | STRANGER | [0xac2fab58…](https://explorer-studio.genlayer.com/tx/0xac2fab583bdedc00fe93101fd8edee7df981338d180f9c1f749b1ab954146dd8) | 3 agree, 0 disagree, 2 idle |
| STRANGER tries to award T1 before any bid is assessed: refused | STRANGER | [0x72251cb8…](https://explorer-studio.genlayer.com/tx/0x72251cb80ffc7d09507fe358e7a05f0f9f6efecdd2d837447336b4dc68cb5508) | 5 agree, 0 disagree, 0 idle |
| CHEAP reads MEETS,MISSES,MEETS: it never commits to low-VOC paint | STRANGER | [0x76059784…](https://explorer-studio.genlayer.com/tx/0x76059784598b5c3b3e8201be6bdf8240c29d1a5e233cb6228579817061433058) | 3 agree, 1 disagree, 1 idle |
| CHEAP's appeal is upheld: the reason is not part of the proposal, and the 0.05 GEN appeal bond reaches BUYER from CHEAP's credit | CHEAP | [0x657695fe…](https://explorer-studio.genlayer.com/tx/0x657695fe9046973d5ef6917e764d1f0beccc0d34219f840be807ef61dc81193a) | 3 agree, 0 disagree, 2 idle |
| MIDDLE reads MEETS,MEETS,MEETS and goes to the head of the ordered list | STRANGER | [0xd1d2d663…](https://explorer-studio.genlayer.com/tx/0xd1d2d663ae53f92e8a610caf2edecac3d680a8d4e75de1710afdd167482edfeb) | 3 agree, 0 disagree, 2 idle |
| DEAR's challenge of MIDDLE is upheld: no requirement reads MISSES, MIDDLE keeps the lead, and DEAR's 0.05 GEN bond goes to MIDDLE's credit | DEAR | [0x2e437005…](https://explorer-studio.genlayer.com/tx/0x2e4370055bf645390c6b0abd818c465b9e3ae7e2561a40a469bd8c8e5da15153) | 3 agree, 0 disagree, 2 idle |
| DEAR reads MEETS,MEETS,MEETS; dearer than the leader, it waits to be placed | STRANGER | [0xd39fe5d3…](https://explorer-studio.genlayer.com/tx/0xd39fe5d338cfa1baf4c0449f3e7612ee52865991f093fa82e33da400599123a0) | 3 agree, 0 disagree, 2 idle |
| STRANGER tries to place DEAR at the head, ahead of the cheaper MIDDLE: refused | STRANGER | [0x284c8704…](https://explorer-studio.genlayer.com/tx/0x284c87046228060141e20b52ea3deb2ba8bfee275bcc744a74f6d90b14cacba2) | 3 agree, 0 disagree, 2 idle |
| STRANGER places DEAR after MIDDLE; the contract checks both neighbours; MIDDLE leads | STRANGER | [0x22ac3864…](https://explorer-studio.genlayer.com/tx/0x22ac386429253b57206ee84c5816de72db5c8b909670dc42fb92198449d29daa) | 3 agree, 0 disagree, 2 idle |
| STRANGER awards T1: MIDDLE's B2 wins at 0.8 GEN and 0.4 GEN goes back to BUYER in the same call | STRANGER | [0x5677b3cb…](https://explorer-studio.genlayer.com/tx/0x5677b3cbde099900e55dc8f2a5922831f293238cbb36206146389341d1058693) | 4 agree, 0 disagree, 1 idle |
| STRANGER tries to release the payment: refused, only the buyer | STRANGER | [0xb64b1bfc…](https://explorer-studio.genlayer.com/tx/0xb64b1bfced2f4d4306acc15348a70a921c605dd04f9d52d709af113ec05da4d9) | 3 agree, 0 disagree, 2 idle |
| BUYER releases the 0.8 GEN to MIDDLE | BUYER | [0x0f21129b…](https://explorer-studio.genlayer.com/tx/0x0f21129bfddca8e1affa71ddffddb6838b968c9cf0a249b2889fe60bb2a1bbdf) | 5 agree, 0 disagree, 0 idle |
| STRANGER tries to reclaim its over-budget bid's bond again: refused, it went back to credit at the reveal | STRANGER | [0x597ae2bf…](https://explorer-studio.genlayer.com/tx/0x597ae2bfd8c16a5c5bba662344f73d8e29ce978a6f5c84585eed2a97876d824e) | 3 agree, 0 disagree, 2 idle |
| STRANGER reclaims B1: its 0.05 GEN bond goes to CHEAP's credit | STRANGER | [0xde08e627…](https://explorer-studio.genlayer.com/tx/0xde08e627cd6482dc2976eceeded2e6d72fa6744f511c713125da05279d035eab) | 3 agree, 0 disagree, 2 idle |
| STRANGER reclaims B2: its 0.05 GEN bond goes to MIDDLE's credit | STRANGER | [0x7eef36e7…](https://explorer-studio.genlayer.com/tx/0x7eef36e70db6f7019eac002b50462c447baf66cf47635f0f2da57ec5a7e2ab18) | 3 agree, 0 disagree, 2 idle |
| STRANGER reclaims B3: its 0.05 GEN bond goes to DEAR's credit | STRANGER | [0xd3ac2d4a…](https://explorer-studio.genlayer.com/tx/0xd3ac2d4ab1be4a5c129d201c9c35696c2520220220281a47e743558ac27de058) | 3 agree, 0 disagree, 2 idle |
| CHEAP withdraws 0.05 GEN of credit | CHEAP | [0x09eaba3b…](https://explorer-studio.genlayer.com/tx/0x09eaba3b926c0d653f10b67fc5c2b813c4458905fa0fd1fab54b287d17b408d0) | 5 agree, 0 disagree, 0 idle |
| MIDDLE withdraws 0.1 GEN of credit | MIDDLE | [0x4f367099…](https://explorer-studio.genlayer.com/tx/0x4f3670997e238705b22cbf7b06cc3c7cb951997c278b98df06ac15efe1236a60) | 3 agree, 0 disagree, 2 idle |
| DEAR withdraws 0.05 GEN of credit | DEAR | [0x53dc411a…](https://explorer-studio.genlayer.com/tx/0x53dc411a02efb3b85d7c2eadcbc0ad991eec5ea923cc9867e92f58d177c80827) | 3 agree, 0 disagree, 2 idle |
| STRANGER withdraws 0.05 GEN of credit | STRANGER | [0x10500937…](https://explorer-studio.genlayer.com/tx/0x10500937e628cfbcf25eb4997a43cc0cc6b15c5dd813e2d285bc092795e83f32) | 3 agree, 0 disagree, 2 idle |

## Licence

MIT. See `LICENSE`.

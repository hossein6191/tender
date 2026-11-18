# Decisions

Why Tender is shaped the way it is. Each entry names the choice, the reason, and what was given up.

## The question is one condition per requirement, and the answer is a closed token

The model is asked one thing per requirement, "Does the PROPOSAL commit to requirement k?", and may answer only
`MEETS`, `MISSES` or `UNCLEAR`. The value the network agrees on is a short vector of those tokens, not prose or a
score. A question that joins two conditions ("commits to it, at a fair price") gives honest nodes room to weigh
the two differently. A free-text answer cannot be compared exactly. A score would need a tolerance, and a
tolerance hides a disagreement.

Prices and dates are never asked. The code can check `price <= budget` and the deadlines exactly, so the model is
not asked to do it.

## Both orders, one block, and disagreement stored as UNCLEAR

Every validator builds the prompt the same way. A model that favours whichever block comes first would lean the
same way on every node, and consensus would never notice. Asking requirements-first and proposal-first inside the
same block, and storing `UNCLEAR` whenever the two disagree, puts any such bias into the stored value instead of
hiding it. `UNCLEAR` is not compliant, so a bias can only stop a bid from winning. It can never make a bid win.

## Validators rerun and compare the whole value exactly

Each validator reruns both prompts and compares the mask and the fingerprint as strings. There is no
"close enough". The fingerprint is the sha256 of exactly the requirements, proposal and note that were judged,
so a reader can tie a mask to bytes rather than to a bid id. If the agreed fingerprint is not the one the
contract computes for the text it sent, the contract stores every requirement as `UNCLEAR`.

## The assessment is final. The appeal is once, bonded, and adds a reason

An assessment that could be run again could be rolled until it suited somebody: a rival hoping for a `MISSES`, or
a bidder hoping for a `MEETS`. So `assess()` runs once per bid. A bidder who believes the network misread the
proposal gets one appeal. It costs a bond and runs within a fixed twenty-minute window. The reason is shown in a
separate block that the prompt says does not count as part of the proposal. All `MEETS` overturns. Anything else
upholds, and the bond goes to the buyer, who is the one party the appeal delays. The window is fixed, starts at
the assessment, and the award waits for it. So the appeal can always be reached before the award, which is the
gap other tender designs have been rejected for.

## Anyone may assess and anyone may award

If only the buyer could call `assess()`, the buyer could refuse to assess the cheaper bid. If only the buyer
could call `award()`, the buyer could hold the result back. Both calls are open. The caller chooses nothing: the
network sets the mask, the rule picks the winner, and the money goes only to the buyer or the held price. The
static sender test lists both calls as deliberately open, with this reason.

## No cap on bids, and an award that reads no list

A cap on bids is an entry door that a stranger with spare addresses could fill and shut on everybody else. Tender
has no cap. Instead, the leader (the cheapest bid judged all `MEETS` so far, with ties going to the earlier
commitment) is updated each time a bid is assessed or an appeal is overturned. `award()` only compares counters
and the clock, then reads that one leader. Masks only ever move toward compliance (an overturned appeal), so
keeping a running minimum is exact. Bonds go back to credit when a bid is revealed, and unrevealed bonds are
forfeited one bid at a time. So no call refunds a list. The cost is that each bid needs its own `assess()`
transaction, which anyone can send.

## The award does not wait forever

The award waits for the reveal deadline, then for the last appeal window, and then for one of two things: every
revealed bid assessed, or the review deadline. If a bid's round never reaches agreement, or nobody bothers to
assess it, that cannot hold the tender hostage. After `review_by`, an unassessed bid simply cannot win. The buyer
sets that deadline in public when the tender opens.

## Over-budget reveals are recorded, not refused

A price over the budget can never win. If it raised, the bid would stay unrevealed and the bidder would lose the
bond for an honest reveal. Instead the reveal is stored as `over_budget`, the bond goes back, and the record shows
a refusal the code made. Revealing an over-budget price gives no option value: committing several valid prices
and hiding the ones not needed still costs a bond for each one hidden.

## Payment: the simplest rule that does not pretend to judge the work

The contract cannot see whether the classrooms were painted. Every payment rule therefore has to pick a default
for when the two parties disagree. Tender's default is **the winner is paid**:

- the buyer releases the price with `complete()` whenever satisfied;
- otherwise the winner may `claim_payment()` from the completion deadline plus two days;
- the buyer may `dispute()` once before then, which holds the claim until thirty days after the dispute. It
  moves no money and decides nothing. During the hold the buyer may still complete, and the winner may `waive()`
  the price back to the buyer;
- after the hold, the winner may claim.

Why not let a dispute return the money to the buyer? A buyer who could get the price back by disputing would
have a free way to never pay a fairly chosen winner. That would undo the one thing the contract does: making the
award neutral. Why not split the price on a dispute? A split is an arbitrary judgement presented as neutral, and
it would hand the buyer a discount on any job just for disputing it. Why not freeze the money until both agree?
That can strand value forever. The chosen rule never strands value, never judges the work, and says so: the
buyer's remedy for a bad job is the written contract and the courts, as it already is for any public buyer.

## No model in a call that carries value

`deposit()`, `open_tender()` and `bid()` carry value. They ask no model and never raise. Every refusal sends back
what was sent and records why. If a payable call raised after a model call, the value could be stranded or the
refusal lost. A test walks everything a payable call can reach and checks that none of it raises or judges.

## Untrusted text is fenced, and refused rather than trimmed

Each untrusted text is printable ASCII on one line and must fit its cap, or it is refused. The contract never
judges part of a text and treats that as the whole. In the prompt, angle brackets are replaced with parentheses,
so the length is kept. Each block's delimiter lines carry the sha256 of its own fenced body, and the requirement
numbers are the contract's own. Static tests check that every value placed in a prompt is either fenced or owned
by the contract, and that the delimiter is written in exactly one place.

## Credit as well as value for bonds

A bidder can send the bond with the bid, or deposit once and bid from credit. Bonds that come back go to credit,
so they can be reused for the next bid or for an appeal without another payable call. The appeal has to run the
model, so it cannot carry value. Its bond can only come from credit.

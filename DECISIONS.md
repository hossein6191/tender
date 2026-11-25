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

## Anyone may assess, place and award

If only the buyer could call `assess()`, the buyer could refuse to assess the cheaper bid. If only the buyer
could call `award()`, the buyer could hold the result back. The same goes for `place()` and `reclaim()`. All
four calls are open. The caller chooses nothing: the network sets the mask, the contract checks every placement,
the rule picks the winner, and the money goes only to the buyer, the held price or the bid's own bidder. The
static sender test lists each of these calls as deliberately open, with its reason.

## A second look from either side

An appeal only helps a bidder that the network read too harshly. A bid read too leniently would be safe from
everyone, and the cheapest lenient `MEETS` would win. So the same twenty-minute window that every assessment
opens can be used in either direction. The bidder may appeal a mask short of all `MEETS`. The buyer, or another
bidder with a bid revealed within budget, may challenge a mask of all `MEETS`. Both take a bond equal to the bid
bond, both give a reason the prompt says is not part of the proposal, and both are asked as the same pair of
orders.

The bars are deliberately different. An appeal overturns only on all `MEETS`. A challenge knocks a bid out only
when some requirement reads `MISSES` in both orders; an `UNCLEAR` result does not. Either way the burden is on
the side asking for the change, and doubt favours the result already stored. Only a bidder with something to
lose can challenge (a revealed bid within budget, or the buyer), so a stranger cannot challenge every compliant
bid for free. Each bid can be challenged once.

A knockout pays the challenger the bid's whole bond as well as returning its own. That is what makes a correct
challenge worth sending. To make that payment possible, a bid within budget keeps its bond held until the tender
is decided, and `reclaim()` returns it afterwards. An upheld challenge pays the challenger's bond to the
challenged bidder, who is the one the challenge put at risk. No challenge makes a transfer; both bonds move
between credits.

A bid that was knocked out cannot be appealed. Its bidder already had the assessment, and possibly an appeal,
and the knockout needed `MISSES` in both orders. Allowing an appeal after a knockout would let the two sides take
turns until the tender's clock ran out. The cost is that a bidder whose bid was compliant from the start never
answers a challenge. That is stated as a limit.

An overturned appeal makes a bid compliant, so it opens its own twenty-minute challenge window, and the award
waits for that as well. The longest chain is assessment, then appeal, then challenge. That is bounded: an
assessment comes before `review_by`, so every window has closed by `review_by` plus forty minutes.

## The leader is a checked, ordered list: no cap, no recompute

Once a challenge can knock out the leader, a running minimum is not enough: knowing who led tells you nothing
about who comes next. I looked at the two options suggested:

- **A bounded "best two or three".** If more bids are knocked out than the list holds, the true next leader is
  lost. That is only honest with a cap on knockouts, which strangers would decide.
- **Recomputing over a bounded list of bids.** That needs a cap on bids, and a cap is an entry door that a
  stranger with spare addresses could fill and shut on everybody else, which is exactly what other submissions
  were rejected for.

Instead, the compliant bids form a doubly linked list ordered by price, then commitment. A bid judged compliant
that beats the head is linked at the head inside the same call. Any other compliant bid is linked by
`place(bid, after)`. The caller supplies the neighbour, and the contract checks that `after` ranks ahead of the
bid and that `after`'s current next ranks behind it. A wrong hint is refused, so the list can never be out of
order. A knockout unlinks the bid in constant time and the next bid leads. `award()` waits until every compliant
bid is placed and then reads only the head. Placement asks no model and is open to anyone, so nobody can stall
the award by refusing to place. The cost is one extra cheap transaction for each compliant bid that is not the
cheapest so far.

## No cap on bids

A cap on bids is an entry door that a stranger with spare addresses could fill. Tender has none: no call loops
over the bids, unrevealed bonds are forfeited one bid at a time, and held bonds are reclaimed one bid at a time.
The cost is that each bid needs its own `assess()` transaction, which anyone can send.

## The award does not wait forever

The award waits for the reveal deadline, then for the last appeal or challenge window, then for every compliant
bid to be placed (anyone can do that, without the model), and then for one of two things: every revealed bid
assessed, or the review deadline. If a bid's round never reaches agreement, or nobody bothers to
assess it, that cannot hold the tender hostage. After `review_by`, an unassessed bid simply cannot win. The buyer
sets that deadline in public when the tender opens.

## Over-budget reveals are recorded, not refused

A price over the budget can never win. If it raised, the bid would stay unrevealed and the bidder would lose the
bond for an honest reveal. Instead the reveal is stored as `over_budget`, the bond goes back at once (such a bid
cannot be challenged, so nothing needs it held), and the record shows
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

## GenVM v0.4 and Studio v0.123 fees

Studio (chain 61999) moved to v0.123 on 25 Nov 2026: every deploy and write must carry fees, and new contracts
run on GenVM v0.4. Tender was moved to both before it was submitted, with the same behaviour; the earlier v0.2
register is no longer used. What changed, and nothing else:

- The header pins the v0.4 runner (`# v0.4.0`, `py-genlayer:kzybg95x…`), and the contract is written to the v0.4
  API: `import genlayer as gl`, `gl.contract.Contract`, `@gl.storage.allow`, plain ints instead of `u256(...)`
  wrappers, `gl.vm.run_nondet` in place of `run_nondet_unsafe`, the clock read from `gl.message.raw["datetime"]`.
- Value leaves the contract in one place, `_send()`, through `gl.chain.Account(address).emit_transfer(amount)`,
  in place of the old empty EVM interface. A static test checks that `emit_transfer` appears there and nowhere
  else, and that each settlement still makes at most one transfer.
- The smoke, the demo tool and the site use genlayer-js 2.0.0. Every deploy and write carries the distribution
  and fee value quoted by `estimateTransactionFees()`, with the leader and validator time-unit allocations at the
  policy's maximum (600) so an assessment's six model calls fit. The per-write estimate
  (`estimateTransactionFeesForWrite`) fails on Studio with "fee below_minimum", so it is not used.
- A transaction counts as done when its status is `FINALIZED` and its execution result
  (`txExecutionResultName`) is `FINISHED_WITH_RETURN`, or `FINISHED_WITH_ERROR` for a raised refusal. The site
  reads the execution result from the transaction and falls back to the leader's receipt only when it is absent.
- What a transaction cost its sender is `fee_accounting.paid_fee_value - total_refunded`. The smoke subtracts
  each account's own fees from its money table, so every balance is still checked to the atto.
- `genvm-lint` 0.11.1rc2 reports E014 ("needs @allow_storage decorator") for `Tender` and `Bid`. That is a false
  positive on the v0.4 runner, where the decorator is `@gl.storage.allow` and `allow_storage` does not exist; it is
  the only finding, and validation passes.

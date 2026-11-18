// A tender() row and bid rows in the contract's own JSON: the demonstration after its reveals.
export const M = 10n ** 15n;
export const BUYER = "0x00000000000000000000000000000000000e1a51";
export const A = "0x000000000000000000000000000000000000b21a";
export const B = "0x000000000000000000000000000000000000c1ea";
export const ME = "0x0000000000000000000000000000000000000a11";
export const REQS = ["Paints all 12 classrooms", "Uses low-VOC paint", "Finishes within the summer break"];

export function tenderRow(over = {}) {
  return {
    tender: "T4", buyer: BUYER, title: "Repaint Elm Street Primary classrooms", scope: "Repaint the walls and ceilings of the twelve classrooms at Elm Street Primary School.",
    requirements: REQS, budget: String(1200n * M), bid_bond: String(50n * M), opened_at: 1000, bid_by: 1780, reveal_by: 2380, review_by: 2980, complete_by: 4780,
    status: "open", phase: "reviewing", bids: 3, eligible: 3, over_budget: 0, forfeited: 0, assessed: 0, compliant: 0, appeals: 0, challenges: 0, appeal_until: 0,
    leader: "", leader_price: "0", placed: 0, winner: null, price: "0", returned: "0", awarded_at: 0, disputed_at: 0, claimable_at: 0, closed_at: 0, now: 2400, award_ready: false,
    ...over,
  };
}

export function bidRow(id, number, bidder, priceMilli, over = {}) {
  return {
    bid: id, tender: "T4", bidder, number, commitment: "ab".repeat(32), at: 1100 + number, bond: String(50n * M), status: "revealed", price: String(BigInt(priceMilli) * M),
    proposal: "x".repeat(40), salt: "s".repeat(32), revealed_at: 1800, mask: "", fingerprint: "", assessed_at: 0, compliant: false, appeal_until: 0, appeal: "", appeal_reason: "",
    appeal_mask: "", appeal_fingerprint: "", appeal_bond_to: "", bond_to: "", placed: false, prev: "", next: "", challenge: "", challenger: "", challenge_reason: "",
    challenge_mask: "", replaced_mask: "", challenge_fingerprint: "", challenge_bond_to: "",
    ...over,
  };
}

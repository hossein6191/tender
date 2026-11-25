// Studio v0.123 fees, the one place the site asks for them. Every write (a wallet's or the demo clerk's) carries
// the distribution and fee value quoted by estimateTransactionFees(); a write without them is refused with
// FeesDistributionMissing. The per-write estimate (estimateTransactionFeesForWrite) fails on Studio with
// "fee below_minimum", so the generic quote is used, with the leader and validator time-unit allocations raised
// to the policy's maximum so a round of six model calls fits. The quote is a deposit of about 0.1 GEN; what the
// transaction does not use comes back to the sender when it is final.

export type Fees = { distribution: unknown; feeValue: bigint };

type Quoting = {
  estimateTransactionFees: (o: { leaderTimeunitsAllocation: bigint; validatorTimeunitsAllocation: bigint }) => Promise<{
    policy?: { enabled?: boolean };
    distribution?: unknown;
    feeValue?: bigint;
  }>;
};

export const TIMEUNITS = 600n;

export async function quoteFees(client: unknown, tries = 3): Promise<Fees> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const q = await (client as Quoting).estimateTransactionFees({ leaderTimeunitsAllocation: TIMEUNITS, validatorTimeunitsAllocation: TIMEUNITS });
      if (q?.policy?.enabled && q.distribution && typeof q.feeValue === "bigint" && q.feeValue > 0n) return { distribution: q.distribution, feeValue: q.feeValue };
      last = new Error("Studio gave no usable fee quote");
    } catch (e) {
      last = e;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 3000));
  }
  throw last instanceof Error ? last : new Error("Studio gave no usable fee quote");
}

/** What a final transaction cost its sender: paid less refunded, or null until the fee accounting is settled. */
export function feePaid(tx: { data?: { fee_accounting?: { status?: string; paid_fee_value?: string | number; total_refunded?: string | number } } } | null | undefined): bigint | null {
  const fa = tx?.data?.fee_accounting;
  if (!fa || fa.status !== "settled" || fa.paid_fee_value === undefined) return null;
  return BigInt(fa.paid_fee_value) - BigInt(fa.total_refunded ?? 0);
}

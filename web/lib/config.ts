// Site settings: the register address, the name and lines the site is introduced with, the repository.
//
// DEMO_CONTRACT is the deployed Tender register the site reads when NEXT_PUBLIC_CONTRACT is unset. It is
// filled in once the contract is deployed; while both are empty every page says the contract is not
// deployed yet, and the whole site still works with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "";

export const SITE_NAME = "Tender";
export const SITE_TAGLINE = "The cheapest bid that meets every requirement wins, and the buyer does not decide which bids those are.";
export const SITE_LINE =
  "A public tender noticeboard on GenLayer: sealed bids, every proposal read against the published requirements by the network's validators, and an award that follows a fixed rule instead of the buyer's say-so.";

/**
 * The public source repository. NEXT_PUBLIC_REPO_URL names it; on Vercel the repository the site was
 * built from names it by itself. The footer's Source link is hidden while neither names one.
 */
const builtFrom =
  process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER === "github" && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER}/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG}`
    : "";
export const REPO_URL: string = process.env.NEXT_PUBLIC_REPO_URL || builtFrom || "";

/** The register in use: the deploy's environment first, then the committed address. */
export const contractAddress = (): string => (process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "").trim();

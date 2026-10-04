// CRANK=off: the oracle never calls settle_expired (disputes are still resolved).
// Used on stage so the buyer can press "Odbierz środki" on a staged Paid deal.
export const crankEnabled = (env: Record<string, string | undefined>) => env.CRANK?.trim().toLowerCase() !== "off";

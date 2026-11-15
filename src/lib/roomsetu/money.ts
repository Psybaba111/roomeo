/** Default per-side success fee base in rupees (same as SUCCESS_FEE_INR). Only charged while ROOMEO_FEE_ENABLED is on. */
export const FEE_INR = 499;

// The public fee line now lives in `fee-copy.ts` (`feeLine(fee)`), built from the fee setting.

export type RentQuote = {
  rent: number;
  deposit: number;
  seekerFee: number;
  hostFee: number;
  seekerPays: number;
  hostReceives: number;
};

/**
 * First-month rent quote. The Roomeo fee is added (seeker) and taken (host) only when the success
 * fee is switched on: pass `feeOn = pricingConfig().successFeeEnabled`. Defaults to OFF so a caller
 * that forgets can never charge a fee that isn't live.
 */
export function rentQuote(rent: number, deposit: number, firstMonth = true, feeOn = false, feeInr = FEE_INR): RentQuote {
  const safeRent = Math.round(rent);
  const safeDeposit = Math.round(deposit);
  const fee = firstMonth && feeOn ? feeInr : 0;
  return {
    rent: safeRent,
    deposit: safeDeposit,
    seekerFee: fee,
    hostFee: fee,
    seekerPays: safeRent + fee,
    hostReceives: safeRent - fee,
  };
}

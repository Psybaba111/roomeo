/** ₹499 once per person, per stay. Not every month. Not a percent of the rent. */
export const FEE_INR = 499;

export type RentQuote = {
  rent: number;
  deposit: number;
  seekerFee: number;
  hostFee: number;
  seekerPays: number;
  hostReceives: number;
};

export function rentQuote(rent: number, deposit: number, firstMonth = true): RentQuote {
  const safeRent = Math.round(rent);
  const safeDeposit = Math.round(deposit);
  const fee = firstMonth ? FEE_INR : 0;
  return {
    rent: safeRent,
    deposit: safeDeposit,
    seekerFee: fee,
    hostFee: fee,
    seekerPays: safeRent + fee,
    hostReceives: safeRent - fee,
  };
}

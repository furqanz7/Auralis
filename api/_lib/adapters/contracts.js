/**
 * Provider adapters expose domain-shaped methods and must never leak provider
 * credentials, raw error bodies, or card data across this boundary.
 */
export const HIRING_ADAPTER_CONTRACT_VERSION = 1;
export const VERIFICATION_PAYMENT = Object.freeze({
  amountMinor: 299,
  currency: "EUR",
  preAuth: true,
  saveCard: false
});

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

/** ₦150,000 */
export const formatNaira = (amount: number) => naira.format(amount);

import type { Carrier } from "../types/index";

interface CarrierRule {
  carrier: Carrier;
  pattern: RegExp;
  trackingUrl: (tn: string) => string;
  name: string;
}

const CARRIER_RULES: CarrierRule[] = [
  {
    carrier: "ups",
    name: "UPS",
    // 1Z followed by 16 alphanumeric characters
    pattern: /^1Z[A-Z0-9]{16}$/i,
    trackingUrl: tn => `https://www.ups.com/track?tracknum=${tn}`,
  },
  {
    carrier: "usps",
    name: "USPS",
    // USPS tracking: 20-22 digits starting with 92, 93, 94, or 95
    pattern: /^9[2-5]\d{18,20}$/,
    trackingUrl: tn => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`,
  },
  {
    carrier: "fedex",
    name: "FedEx",
    // FedEx: 12 or 15 digit numbers (not matching USPS pattern above)
    pattern: /^\d{12}(\d{3})?$/,
    trackingUrl: tn => `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
  },
  {
    carrier: "dhl",
    name: "DHL",
    // DHL Express AWB: 10 digits
    pattern: /^\d{10}$/,
    trackingUrl: tn => `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`,
  },
];

export const CARRIER_NAMES: Record<Carrier, string> = {
  ups:   "UPS",
  usps:  "USPS",
  fedex: "FedEx",
  dhl:   "DHL",
  other: "Other",
};

/** Normalise a tracking number: strip whitespace and dashes for pattern matching. */
function normalise(trackingNumber: string): string {
  return trackingNumber.trim().replace(/[\s-]/g, "");
}

/** Auto-detect carrier from a tracking number. Returns "other" if unknown. */
export function detectCarrier(trackingNumber: string): Carrier {
  const tn = normalise(trackingNumber);
  if (!tn) return "other";
  for (const rule of CARRIER_RULES) {
    if (rule.pattern.test(tn)) return rule.carrier;
  }
  return "other";
}

/** Return the deep-link tracking URL for a given tracking number + carrier. */
export function getTrackingUrl(trackingNumber: string, carrier: Carrier): string {
  const tn = normalise(trackingNumber);
  const rule = CARRIER_RULES.find(r => r.carrier === carrier);
  if (rule) return rule.trackingUrl(tn);
  // Fallback: Google search for the tracking number
  return `https://www.google.com/search?q=${encodeURIComponent(tn)}+tracking`;
}

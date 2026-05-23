import { describe, it, expect } from "vitest";
import { detectCarrier, getTrackingUrl, CARRIER_NAMES } from "../carrier";

describe("detectCarrier", () => {
  it("detects UPS tracking numbers (1Z + 16 alphanumeric)", () => {
    expect(detectCarrier("1Z999AA10123456784")).toBe("ups");
    expect(detectCarrier("1ZABC1230123456789")).toBe("ups");
  });

  it("detects USPS tracking numbers (22 digits starting with 9[2-5])", () => {
    expect(detectCarrier("9400111899223463505108")).toBe("usps");
    expect(detectCarrier("9261290100830368848875")).toBe("usps");
  });

  it("detects FedEx tracking numbers (12 digits)", () => {
    expect(detectCarrier("771999751338")).toBe("fedex");
  });

  it("detects FedEx tracking numbers (15 digits)", () => {
    expect(detectCarrier("772608438495711")).toBe("fedex");
  });

  it("detects DHL tracking numbers (10 digits)", () => {
    expect(detectCarrier("1234567890")).toBe("dhl");
  });

  it("returns 'other' for unrecognised formats", () => {
    expect(detectCarrier("UNKNOWN123")).toBe("other");
    expect(detectCarrier("")).toBe("other");
    expect(detectCarrier("ABC")).toBe("other");
  });

  it("normalises whitespace before matching", () => {
    expect(detectCarrier("  1Z999AA10123456784  ")).toBe("ups");
  });

  it("normalises dashes before matching", () => {
    expect(detectCarrier("1Z999AA1-0123456784")).toBe("ups");
  });
});

describe("getTrackingUrl", () => {
  it("returns a UPS tracking URL", () => {
    const url = getTrackingUrl("1Z999AA10123456784", "ups");
    expect(url).toContain("ups.com");
    expect(url).toContain("1Z999AA10123456784");
  });

  it("returns a USPS tracking URL", () => {
    const url = getTrackingUrl("9400111899223463505108", "usps");
    expect(url).toContain("usps.com");
  });

  it("returns a FedEx tracking URL", () => {
    const url = getTrackingUrl("771999751338", "fedex");
    expect(url).toContain("fedex.com");
  });

  it("returns a DHL tracking URL", () => {
    const url = getTrackingUrl("1234567890", "dhl");
    expect(url).toContain("dhl.com");
  });

  it("returns a Google search fallback for 'other' carrier", () => {
    const url = getTrackingUrl("MYTRACKINGNUM", "other");
    expect(url).toContain("google.com");
    expect(url).toContain("MYTRACKINGNUM");
  });
});

describe("CARRIER_NAMES", () => {
  it("has a display name for every carrier including other", () => {
    expect(CARRIER_NAMES.ups).toBe("UPS");
    expect(CARRIER_NAMES.usps).toBe("USPS");
    expect(CARRIER_NAMES.fedex).toBe("FedEx");
    expect(CARRIER_NAMES.dhl).toBe("DHL");
    expect(CARRIER_NAMES.other).toBe("Other");
  });
});

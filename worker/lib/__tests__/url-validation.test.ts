import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateExternalUrl, safeFetch, SsrfError } from "../url-validation";

describe("validateExternalUrl", () => {
  describe("valid URLs", () => {
    it("accepts HTTPS URLs", () => {
      const result = validateExternalUrl("https://example.com/path");
      expect(result).toBeInstanceOf(URL);
      expect(result.href).toBe("https://example.com/path");
    });

    it("accepts HTTP URLs", () => {
      const result = validateExternalUrl("http://example.com");
      expect(result).toBeInstanceOf(URL);
    });

    it("accepts standard ports 80 and 443", () => {
      expect(validateExternalUrl("https://example.com:443/path")).toBeInstanceOf(URL);
      expect(validateExternalUrl("http://example.com:80/path")).toBeInstanceOf(URL);
    });
  });

  describe("private IPs blocked", () => {
    const blockedIPs = [
      "127.0.0.1",
      "127.0.0.2",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "192.168.1.100",
      "0.0.0.0",
    ];

    for (const ip of blockedIPs) {
      it(`blocks ${ip}`, () => {
        expect(() => validateExternalUrl(`http://${ip}/`)).toThrow(SsrfError);
      });
    }
  });

  describe("link-local / metadata IPs blocked", () => {
    it("blocks 169.254.169.254 (AWS metadata)", () => {
      expect(() => validateExternalUrl("http://169.254.169.254/latest/meta-data/")).toThrow(SsrfError);
    });

    it("blocks 169.254.0.1", () => {
      expect(() => validateExternalUrl("http://169.254.0.1/")).toThrow(SsrfError);
    });
  });

  describe("IPv6 loopback blocked", () => {
    it("blocks [::1]", () => {
      expect(() => validateExternalUrl("http://[::1]/")).toThrow(SsrfError);
    });

    it("blocks fc00: ULA", () => {
      expect(() => validateExternalUrl("http://[fc00::1]/")).toThrow(SsrfError);
    });

    it("blocks fe80: link-local", () => {
      expect(() => validateExternalUrl("http://[fe80::1]/")).toThrow(SsrfError);
    });

    it("blocks fd prefix ULA", () => {
      expect(() => validateExternalUrl("http://[fd12::1]/")).toThrow(SsrfError);
    });
  });

  describe("non-HTTP schemes blocked", () => {
    const schemes = ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)"];

    for (const url of schemes) {
      it(`blocks ${url.split(":")[0]}://`, () => {
        expect(() => validateExternalUrl(url)).toThrow(SsrfError);
      });
    }
  });

  describe("blocked hostnames", () => {
    it("blocks localhost", () => {
      expect(() => validateExternalUrl("http://localhost/")).toThrow(SsrfError);
    });

    it("blocks metadata.google.internal", () => {
      expect(() => validateExternalUrl("http://metadata.google.internal/")).toThrow(SsrfError);
    });

    it("blocks metadata.google", () => {
      expect(() => validateExternalUrl("http://metadata.google/")).toThrow(SsrfError);
    });
  });

  describe("non-standard ports blocked", () => {
    it("blocks port 8080", () => {
      expect(() => validateExternalUrl("http://example.com:8080/")).toThrow(SsrfError);
    });

    it("blocks port 3000", () => {
      expect(() => validateExternalUrl("https://example.com:3000/")).toThrow(SsrfError);
    });
  });

  describe("invalid URLs", () => {
    it("throws SsrfError for garbage input", () => {
      expect(() => validateExternalUrl("not-a-url")).toThrow(SsrfError);
    });

    it("throws SsrfError for empty string", () => {
      expect(() => validateExternalUrl("")).toThrow(SsrfError);
    });
  });
});

describe("safeFetch", () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockClear();
  });

  it("calls fetch for valid URLs", async () => {
    await safeFetch("https://example.com/api");
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/api", undefined);
  });

  it("passes init options to fetch", async () => {
    const init = { method: "POST", body: "data" };
    await safeFetch("https://example.com/api", init);
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/api", init);
  });

  it("throws SsrfError for blocked URLs without calling fetch", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(SsrfError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws SsrfError for localhost without calling fetch", async () => {
    await expect(safeFetch("http://localhost/admin")).rejects.toThrow(SsrfError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

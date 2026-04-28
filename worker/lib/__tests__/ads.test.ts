import { describe, it, expect } from "vitest";
import { adsAllowedForPath, adsScriptTag, adsTxtBody } from "../ads";
import type { Env } from "../../types";

function envWith(overrides: Partial<Env>): Env {
  return {
    ENVIRONMENT: "test",
    ALLOWED_ORIGINS: "https://test",
    ...overrides,
  } as Env;
}

describe("adsAllowedForPath", () => {
  it("returns false when ADS_ENABLED is missing", () => {
    expect(
      adsAllowedForPath(
        envWith({ ADS_ROUTES: "/p", ADSENSE_PUBLISHER_ID: "pub-1" }),
        "/p/show/episode"
      )
    ).toBe(false);
  });

  it("returns false when ADS_ENABLED is the literal string 'false'", () => {
    expect(
      adsAllowedForPath(
        envWith({ ADS_ENABLED: "false", ADS_ROUTES: "/p", ADSENSE_PUBLISHER_ID: "pub-1" }),
        "/p/show/episode"
      )
    ).toBe(false);
  });

  it("returns false when no publisher ID is configured", () => {
    expect(
      adsAllowedForPath(
        envWith({ ADS_ENABLED: "true", ADS_ROUTES: "/p" }),
        "/p/show/episode"
      )
    ).toBe(false);
  });

  it("returns false when ADS_ROUTES is empty", () => {
    expect(
      adsAllowedForPath(
        envWith({ ADS_ENABLED: "true", ADS_ROUTES: "", ADSENSE_PUBLISHER_ID: "pub-1" }),
        "/p/show/episode"
      )
    ).toBe(false);
  });

  it("matches exact prefix and nested paths", () => {
    const env = envWith({ ADS_ENABLED: "true", ADS_ROUTES: "/p", ADSENSE_PUBLISHER_ID: "pub-1" });
    expect(adsAllowedForPath(env, "/p")).toBe(true);
    expect(adsAllowedForPath(env, "/p/show")).toBe(true);
    expect(adsAllowedForPath(env, "/p/show/episode")).toBe(true);
  });

  it("does not allow ads on /api or /admin even when '/' is in ADS_ROUTES", () => {
    const env = envWith({ ADS_ENABLED: "true", ADS_ROUTES: "/", ADSENSE_PUBLISHER_ID: "pub-1" });
    expect(adsAllowedForPath(env, "/api/me")).toBe(false);
    expect(adsAllowedForPath(env, "/admin/users")).toBe(false);
    expect(adsAllowedForPath(env, "/__clerk/foo")).toBe(false);
    expect(adsAllowedForPath(env, "/")).toBe(true);
    expect(adsAllowedForPath(env, "/about")).toBe(true);
  });

  it("supports multi-prefix allowlists", () => {
    const env = envWith({
      ADS_ENABLED: "true",
      ADS_ROUTES: "/p,/pulse",
      ADSENSE_PUBLISHER_ID: "pub-1",
    });
    expect(adsAllowedForPath(env, "/p/foo")).toBe(true);
    expect(adsAllowedForPath(env, "/pulse/post-slug")).toBe(true);
    expect(adsAllowedForPath(env, "/about")).toBe(false);
  });
});

describe("adsScriptTag", () => {
  it("returns the script with the configured publisher ID when allowed", () => {
    const tag = adsScriptTag(
      envWith({ ADS_ENABLED: "true", ADS_ROUTES: "/p", ADSENSE_PUBLISHER_ID: "pub-1234" }),
      "/p/show/episode"
    );
    expect(tag).toContain("pagead2.googlesyndication.com");
    expect(tag).toContain("client=ca-pub-1234");
    expect(tag).toContain("async");
  });

  it("returns empty string when ads are not allowed", () => {
    const tag = adsScriptTag(
      envWith({ ADS_ENABLED: "true", ADS_ROUTES: "/p", ADSENSE_PUBLISHER_ID: "pub-1234" }),
      "/admin/users"
    );
    expect(tag).toBe("");
  });
});

describe("adsTxtBody", () => {
  it("returns a placeholder when no publisher ID is configured", () => {
    const body = adsTxtBody(envWith({}));
    expect(body).toContain("not yet configured");
  });

  it("returns the AdSense authorization line when publisher ID is set", () => {
    const body = adsTxtBody(envWith({ ADSENSE_PUBLISHER_ID: "pub-1234567890" }));
    expect(body).toBe("google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n");
  });
});

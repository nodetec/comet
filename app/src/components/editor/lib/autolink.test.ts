import { describe, expect, it } from "vitest";

import { EMAIL_LINK_MATCHER, URL_LINK_MATCHER } from "./autolink";

describe("URL_LINK_MATCHER", () => {
  it("matches full http urls", () => {
    expect(URL_LINK_MATCHER("https://example.com/path?x=1")).toEqual({
      index: 0,
      length: "https://example.com/path?x=1".length,
      text: "https://example.com/path?x=1",
      url: "https://example.com/path?x=1",
    });
  });

  it("normalizes www urls to https", () => {
    expect(URL_LINK_MATCHER("www.example.com/docs")).toEqual({
      index: 0,
      length: "www.example.com/docs".length,
      text: "www.example.com/docs",
      url: "https://www.example.com/docs",
    });
  });

  it("excludes trailing punctuation", () => {
    expect(URL_LINK_MATCHER("https://example.com.")).toEqual({
      index: 0,
      length: "https://example.com".length,
      text: "https://example.com",
      url: "https://example.com",
    });
  });

  it("does not match urls with incomplete hostnames", () => {
    expect(URL_LINK_MATCHER("https://example")).toBeNull();
    expect(URL_LINK_MATCHER("www.example")).toBeNull();
  });

  it("keeps localhost urls valid", () => {
    expect(URL_LINK_MATCHER("http://localhost:3000/docs")).toEqual({
      index: 0,
      length: "http://localhost:3000/docs".length,
      text: "http://localhost:3000/docs",
      url: "http://localhost:3000/docs",
    });
  });
});

describe("EMAIL_LINK_MATCHER", () => {
  it("matches email addresses", () => {
    expect(EMAIL_LINK_MATCHER("user@example.com")).toEqual({
      index: 0,
      length: "user@example.com".length,
      text: "user@example.com",
      url: "mailto:user@example.com",
    });
  });
});

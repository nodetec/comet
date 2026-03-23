import { createLinkMatcherWithRegExp, type LinkMatcher } from "@lexical/link";

const URL_REG_EXP = /((https?:\/\/)|(www\.))[^\s<]+[^<.,:;"')\]\s]/i;
const EMAIL_REG_EXP =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/; // eslint-disable-line sonarjs/slow-regex -- bounded user text
const IPV4_REG_EXP = /^(\d{1,3}\.){3}\d{1,3}$/;

type LinkMatcherResult = NonNullable<ReturnType<LinkMatcher>>;

function normalizeAutolinkUrl(text: string) {
  return text.startsWith("http://") || text.startsWith("https://")
    ? text
    : `https://${text}`;
}

function isValidIpv4(hostname: string) {
  return (
    IPV4_REG_EXP.test(hostname) &&
    hostname.split(".").every((segment) => Number(segment) <= 255)
  );
}

function isValidAutolinkHostname(hostname: string) {
  if (
    hostname.startsWith("www.") &&
    !hostname.slice("www.".length).includes(".")
  ) {
    return false;
  }

  return (
    hostname === "localhost" ||
    hostname.includes(".") ||
    hostname.includes(":") ||
    isValidIpv4(hostname)
  );
}

function isValidAutolinkUrl(urlText: string) {
  try {
    const url = new URL(urlText);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      isValidAutolinkHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateUrlMatch(text: string): LinkMatcherResult | null {
  const match = URL_REG_EXP.exec(text);
  if (!match) {
    return null;
  }

  const matchedText = match[0];
  const normalizedUrl = normalizeAutolinkUrl(matchedText);
  if (!isValidAutolinkUrl(normalizedUrl)) {
    return null;
  }

  return {
    index: match.index,
    length: matchedText.length,
    text: matchedText,
    url: normalizedUrl,
  };
}

export const URL_LINK_MATCHER: LinkMatcher = validateUrlMatch;

export const EMAIL_LINK_MATCHER = createLinkMatcherWithRegExp(
  EMAIL_REG_EXP,
  (text) => `mailto:${text}`,
);

export const AUTOLINK_MATCHERS = [URL_LINK_MATCHER, EMAIL_LINK_MATCHER];

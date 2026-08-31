import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { MAX_SEGMENT_LENGTH, splitIntoReadableChunks, toReadableProse } from "../prose";
import { type SourceDocument, SourceInsufficientContentError } from "../types";
import { publishedAtFromDocument } from "../published-at";

const BLOCKED_DOMAINS = ["naver.com", "coupang.com"];
const MAX_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "FixupImageAgent/1.0 (+content-import)";

export class WebUrlError extends Error {
  constructor(message = "올바른 웹주소를 넣어 주세요.") { super(message); this.name = "WebUrlError"; }
}

export class WebSourceBlockedError extends Error {
  constructor(message = "이 사이트는 글을 가져올 수 없습니다. 내용을 직접 붙여 넣어 주세요.") { super(message); this.name = "WebSourceBlockedError"; }
}

type AddressLookup = (hostname: string) => Promise<string[]>;

function blockedHostname(hostname: string): boolean {
  return BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 100 && b! >= 64 && b! <= 127) || (a === 198 && (b === 18 || b === 19)) || a! >= 224;
}

const defaultLookup: AddressLookup = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

export async function validateWebUrl(input: string, resolveAddresses: AddressLookup = defaultLookup): Promise<URL> {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new WebUrlError(); }
  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) throw new WebUrlError();
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || blockedHostname(hostname)) throw new WebSourceBlockedError();
  const addresses = isIP(hostname) ? [hostname] : await resolveAddresses(hostname);
  if (addresses.length === 0 || addresses.some(privateAddress)) throw new WebSourceBlockedError("내부망 주소에서는 글을 가져올 수 없습니다.");
  return url;
}

function robotsAllows(text: string, pathname: string): boolean {
  let applies = false;
  const disallowed: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") applies = value === "*" || value.toLowerCase() === "fixupimageagent";
    else if (field === "disallow" && applies && value) disallowed.push(value);
  }
  return !disallowed.some((rule) => pathname.startsWith(rule));
}

async function safeFetch(url: URL, fetcher: typeof fetch, resolveAddresses: AddressLookup): Promise<Response> {
  let current = url;
  for (let redirect = 0; redirect <= 5; redirect++) {
    await validateWebUrl(current.href, resolveAddresses);
    const response = await fetcher(current, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new WebUrlError("이동할 웹주소가 올바르지 않습니다.");
    current = new URL(location, current);
  }
  throw new WebUrlError("웹주소가 너무 많이 이동되어 글을 가져오지 못했습니다.");
}

async function limitedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new WebUrlError("페이지가 너무 커서 글을 가져오지 못했습니다.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new WebUrlError("페이지가 너무 커서 글을 가져오지 못했습니다.");
  return new TextDecoder().decode(buffer);
}

export async function ingestWeb(input: { id: string; url: string; fetcher?: typeof fetch; resolveAddresses?: AddressLookup }): Promise<SourceDocument> {
  const page = await fetchPublicHtml(input);
  const dom = new JSDOM(page.html, { url: page.url.href });
  const document = dom.window.document;
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
  const metadataTitle = meta('meta[property="og:title"]') ?? meta('meta[name="twitter:title"]');
  const author = meta('meta[property="og:site_name"]') ?? meta('meta[name="author"]') ?? meta('meta[property="article:author"]');
  const publishedAt = publishedAtFromDocument(document);
  const rawThumbnail = meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]');
  let thumbnailUrl: string | undefined;
  try { thumbnailUrl = rawThumbnail ? new URL(rawThumbnail, page.url).href : undefined; } catch { thumbnailUrl = undefined; }
  const semanticBody = document.querySelector('[itemprop="articleBody"]')?.textContent ?? "";
  const article = new Readability(document).parse();
  if (!article?.textContent) throw new SourceInsufficientContentError();
  // Readability 의 textContent 는 문단 사이를 줄바꿈 하나로만 구분한다. 웹 글에서 줄바꿈은
  // 문단 경계이므로 빈 줄로 바꿔 문단을 살린 뒤, 문장 경계를 지켜 나눈다.
  const readabilityText = toReadableProse(article.textContent.replace(/[ \t]*\n[ \t\n]*/g, "\n\n"));
  const semanticText = toReadableProse(semanticBody.replace(/[ \t]*\n[ \t\n]*/g, "\n\n"));
  const clean = readabilityText.length >= semanticText.length ? readabilityText : semanticText;
  if (!clean) throw new SourceInsufficientContentError();
  const segments = splitIntoReadableChunks(clean, MAX_SEGMENT_LENGTH).map((text, index) => ({
    id: `src_${input.id}#part=${index + 1}`,
    text,
    sourceUrl: page.url.href,
  }));
  const title = (JSDOM.fragment(metadataTitle || article.title || page.url.hostname).textContent ?? "").trim();
  return { id: input.id, kind: "web", title, originalInput: input.url, segments, author, publishedAt, thumbnailUrl };
}

/** 공개 HTML 목록 어댑터도 본문 수집과 동일한 SSRF·robots·크기 제한을 쓰게 한다. */
export async function fetchPublicHtml(input: { url: string; fetcher?: typeof fetch; resolveAddresses?: AddressLookup }): Promise<{ url: URL; html: string }> {
  const fetcher = input.fetcher ?? fetch;
  const resolveAddresses = input.resolveAddresses ?? defaultLookup;
  const url = await validateWebUrl(input.url, resolveAddresses);
  const robotsUrl = new URL("/robots.txt", url.origin);
  try {
    const robots = await safeFetch(robotsUrl, fetcher, resolveAddresses);
    if (robots.status === 401 || robots.status === 403) throw new WebSourceBlockedError();
    if (robots.ok && !robotsAllows(await limitedText(robots), url.pathname)) throw new WebSourceBlockedError();
  } catch (error) {
    if (error instanceof WebSourceBlockedError) throw error;
  }

  const response = await safeFetch(url, fetcher, resolveAddresses);
  if (!response.ok) throw new WebUrlError(`웹페이지를 읽지 못했습니다. (${response.status})`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new WebUrlError("글이 있는 웹페이지가 아닙니다.");
  return { url, html: await limitedText(response) };
}

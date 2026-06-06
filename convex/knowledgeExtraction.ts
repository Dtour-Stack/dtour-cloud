const SCRIPT_STYLE_RE = /<(script|style|noscript|svg|canvas)[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const ENTITY_RE: Record<string, string> = {
	amp: "&",
	apos: "'",
	gt: ">",
	lt: "<",
	nbsp: " ",
	quot: '"',
};

function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCodePoint(Number(code)),
		)
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
			String.fromCodePoint(Number.parseInt(code, 16)),
		)
		.replace(
			/&([a-z]+);/gi,
			(match, key: string) => ENTITY_RE[key.toLowerCase()] ?? match,
		);
}

export function webPageTitle(html: string, fallbackUrl: string): string {
	const title = TITLE_RE.exec(html)?.[1];
	const text = title ? normalizeWebPageText(title).slice(0, 120) : "";
	if (text) return text;
	return fallbackUrl;
}

export function normalizeWebPageText(value: string): string {
	return decodeEntities(value)
		.replace(/\r/g, "\n")
		.replace(/\t/g, " ")
		.replace(/[ ]{2,}/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function htmlToKnowledgeText(html: string, maxChars = 120_000): string {
	const blockSeparated = html
		.replace(SCRIPT_STYLE_RE, " ")
		.replace(
			/<\/(p|div|section|article|main|header|footer|li|h[1-6]|tr)>/gi,
			"\n",
		)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(TAG_RE, " ");
	return normalizeWebPageText(blockSeparated)
		.replace(/\n{2,}/g, "\n")
		.slice(0, maxChars);
}

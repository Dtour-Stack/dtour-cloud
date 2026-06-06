import { describe, expect, it } from "vitest";
import {
	htmlToKnowledgeText,
	normalizeWebPageText,
	webPageTitle,
} from "./knowledgeExtraction";

describe("knowledgeExtraction", () => {
	it("extracts readable web page text without scripts or markup", () => {
		const html = `
      <html>
        <head><title>DigitalOcean Knowledge Bases</title><script>window.x = 1</script></head>
        <body>
          <main><h1>Knowledge Bases</h1><p>Store &amp; retrieve content.</p></main>
        </body>
      </html>
    `;

		expect(htmlToKnowledgeText(html)).toBe(
			"DigitalOcean Knowledge Bases\nKnowledge Bases\nStore & retrieve content.",
		);
	});

	it("normalizes whitespace and common HTML entities", () => {
		expect(normalizeWebPageText("Alpha&nbsp;&amp;&nbsp;Beta\n\n\nGamma")).toBe(
			"Alpha & Beta\n\nGamma",
		);
	});

	it("uses the title when present and falls back to the URL when absent", () => {
		expect(
			webPageTitle("<title> Agent Docs </title>", "https://example.com/docs"),
		).toBe("Agent Docs");
		expect(
			webPageTitle("<main>No title</main>", "https://example.com/docs"),
		).toBe("https://example.com/docs");
	});
});

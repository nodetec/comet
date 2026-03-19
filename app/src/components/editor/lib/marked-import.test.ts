import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/attachments", () => ({
  resolveImageSrc: (src: string) => src,
}));

import { renderMarkdownToHTML } from "./marked-import";

describe("renderMarkdownToHTML", () => {
  it("renders mixed markdown code fences as bare pre blocks during paste", () => {
    const markdown = `Here are some useful commands when debugging error handling:

\`\`\`bash
# Run with backtrace enabled
RUST_BACKTRACE=1 cargo run

# Run tests with output
cargo test -- --nocapture
\`\`\`

## Next`;

    const html = renderMarkdownToHTML(markdown, { paste: true });

    expect(html).toContain(
      "<p>Here are some useful commands when debugging error handling:</p>",
    );
    expect(html).toContain('<pre data-language="bash">');
    expect(html).toContain("RUST_BACKTRACE=1 cargo run");
    expect(html).not.toContain("<pre><code");
    expect(html).not.toContain("</code></pre>");
    expect(html.match(/<pre data-language="bash">/g)).toHaveLength(1);
  });

  it("renders stored markdown code fences as bare pre blocks", () => {
    const markdown = `\`\`\`rust
fn main() {}
\`\`\``;

    const html = renderMarkdownToHTML(markdown);

    expect(html).toContain('<pre data-language="rust">');
    expect(html).toContain("fn main() {}");
    expect(html).not.toContain("<code>");
    expect(html).not.toContain("</code>");
  });

  it("renders plain fenced code blocks without nested code tags", () => {
    const markdown = `\`\`\`
plain text
\`\`\``;

    const html = renderMarkdownToHTML(markdown, { paste: true });

    expect(html).toContain("<pre>plain text</pre>");
    expect(html).not.toContain("<code>");
    expect(html).not.toContain("</code>");
  });

  it("uses different blank-line handling for stored markdown and paste", () => {
    const markdown = ["alpha", "", "", "beta"].join("\n");

    const storedHtml = renderMarkdownToHTML(markdown);
    const pastedHtml = renderMarkdownToHTML(markdown, { paste: true });

    expect(storedHtml.match(/<p><br><\/p>/g)).toHaveLength(1);
    expect(pastedHtml.match(/<p><br><\/p>/g)).toHaveLength(2);
  });

  it("adds checklist classes for task lists", () => {
    const html = renderMarkdownToHTML("- [x] done\n- [ ] todo");

    expect(html).toContain('class="contains-task-list"');
    expect(html.match(/class="task-list-item"/g)).toHaveLength(2);
  });
});

# Edge Cases Test Note

## Empty Lines Between Content

Paragraph one.


Two blank lines above (should create one empty paragraph).



Three blank lines above (should create two empty paragraphs).

## Code Block With Special Characters

```html
<div class="container" data-theme="dark">
  <h1>Hello & "World"</h1>
  <p>x < y && y > z</p>
  <img src="attachment://abc123.png" alt="test" />
</div>
```

## Code Block Without Language

```
This is a plain code block
with no language specified
  and some indentation
```

## Inline Code With Special Chars

Use `<div class="foo">` for the container. The expression `x && y || z` is truthy. Access the value with `map["key"]`.

## Nested Formatting

This has **bold with *italic inside* it** and *italic with **bold inside** it*.

Here's ~~strikethrough with **bold** inside~~ and **bold with ~~strikethrough~~ inside**.

## Links and Images

Here's a [regular link](https://example.com) and a [link with title](https://example.com "Example Site").

![A test image](attachment://abc123def456.png)

## Blockquote

> This is a blockquote.
> It spans multiple lines.
>
> And has a second paragraph.

## Horizontal Rule

Content above the rule.

---

Content below the rule.

## Hashtags

Regular #hashtag in a paragraph.

Don't create hashtags in `#inline-code` or in code blocks:

```css
.color { background: #default; }
#header { color: #333; }
```

## Numbers and Special Patterns

Phone: 555-0123
Price: $49.99
Percentage: 85%
Email-like: user@example.com
Path: /usr/local/bin

## Long Paragraph

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.

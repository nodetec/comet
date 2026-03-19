# Markdown Fixture Expectations

These are manual fixture expectations for Comet's markdown editor when the
same note goes through different editor paths.

## `05-edge-cases`

There are two valid expected outputs for this fixture:

1. Immediate paste/copy round-trip

   Use [05-edge-cases.immediate-paste.expected.md](/Users/chris/Repos/project/comet/docs/markdown-fixtures/05-edge-cases.immediate-paste.expected.md).

   This covers:
   - paste markdown into Comet
   - copy it back out without navigating away from the note

   Expectation:
   - bare email text copies back out as plain text
   - the editor may render the email as a link immediately on paste
   - current paste path uses frontend `marked` import rules

2. After reload / navigate away and back

   Use [05-edge-cases.after-reload.expected.md](/Users/chris/Repos/project/comet/docs/markdown-fixtures/05-edge-cases.after-reload.expected.md).

   This covers:
   - save note state
   - leave the note
   - reopen the note
   - copy/export again

   Expectation:
   - bare email text still copies back out as plain text
   - the in-editor note may render the email as a link after reload because the
     current load path uses Rust `comrak` with autolink enabled

## UI-only expectation

For the blockquote in `05-edge-cases`, the editor must allow the caret to land
on the blank quoted line between the two paragraphs. This is an editor-structure
expectation, not a markdown diff expectation.

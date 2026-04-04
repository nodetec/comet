# Editor List Fixture

Use this file to exercise list behavior in the editor.

## Unordered Lists

- First bullet
- Second bullet
- Third bullet

* Alternate marker with nested children
  - Nested dash
  - Nested dash with deeper content
    - Third level item
    - Another third level item
  - Back to second level

- Plus marker
- Plus marker sibling

## Ordered Lists

1. First item
2. Second item
3. Third item

4. Ordered list starting from a custom number
5. Next custom-number item
6. Another custom-number item

## Ordered List Breaks

1. Start of an ordered list
2. Second item
3. Third item

This paragraph should break the ordered list.

1. This should start a new ordered list after the paragraph
2. Second item in the restarted list

3. First item with an indented continuation paragraph

   This paragraph should stay attached to the first item.

4. Second item after a continuation paragraph

5. First item
6. Second item

   Still part of the second item.

   Another continuation paragraph in the same item.

7. Third item after multiple continuation paragraphs

## Nested Ordered and Unordered Mix

1. Ordered parent
   - Unordered child
   - Another unordered child
     1. Ordered grandchild
     2. Ordered grandchild
   - Back to unordered child level
2. Second ordered parent
   1. Nested ordered child
   2. Nested ordered child
      - Nested unordered grandchild
      - Another nested unordered grandchild
3. Third ordered parent

## Task Lists

- [ ] Top-level unchecked task
- [x] Top-level checked task
- [ ] Top-level unchecked task with nested tasks
  - [ ] Nested unchecked task
  - [x] Nested checked task
  - [ ] Nested unchecked task with children
    - [ ] Third-level unchecked task
    - [x] Third-level checked task

1. Ordered list with task children
   - [ ] Ordered parent nested task
   - [x] Ordered parent nested checked task
2. Another ordered parent

## Loose vs Tight Lists

- Tight item one
- Tight item two
- Tight item three

- Loose item one

  Continuation paragraph for loose item one.

- Loose item two

  Continuation paragraph for loose item two.

## Blockquotes With Lists

> - Quoted bullet one
> - Quoted bullet two
>   1. Quoted nested ordered item
>   2. Quoted nested ordered item
> - Quoted bullet three

> 1. Quoted ordered item
> 2. Quoted ordered item
>
> This paragraph should break the quoted ordered list.
>
> 1. Restarted quoted ordered list
> 2. Second restarted quoted ordered list item

## List Items Around Other Blocks

- Bullet before a code fence

  ```ts
  const listFixture = true;
  console.log("code fence inside list item");
  ```

- Bullet after a code fence

1. Ordered item before a blockquote

   > Nested quote inside ordered item
   > Still inside the ordered item

2. Ordered item after a nested blockquote

## Empty Items and Editing Targets

-
- Empty bullet above
- Bullet below an empty bullet

1.
2. Empty ordered item above
3. Ordered item below an empty ordered item

- [ ]
- [x]
- [ ] Empty task items for toggle testing

## Deep Nesting

- Level 1
  - Level 2
    - Level 3
      - Level 4
        - Level 5
          1. Deep ordered item
          2. Deep ordered item
          - Deep mixed unordered item
          - Another deep mixed unordered item

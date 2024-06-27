import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export default HighlightStyle.define([
  { tag: t.heading1, fontWeight: 'bold', fontFamily: 'monospace', fontSize: '32px', textDecoration: 'none' },
  { tag: t.heading2, fontWeight: 'bold', fontFamily: 'monospace', fontSize: '28px', textDecoration: 'none' },
  { tag: t.heading3, fontWeight: 'bold', fontFamily: 'monospace', fontSize: '24px', textDecoration: 'none' },
  { tag: t.heading4, fontWeight: 'bold', fontFamily: 'monospace', fontSize: '22px', textDecoration: 'none' },
  { tag: t.link, fontFamily: 'monospace', textDecoration: 'underline', color: 'blue' },
  { tag: t.emphasis, fontFamily: 'monospace', fontStyle: 'italic' },
  { tag: t.strong, fontFamily: 'monospace', fontWeight: 'bold' },
  { tag: t.monospace, fontFamily: 'monospace' },
  { tag: t.content, fontFamily: 'monospace' },
  { tag: t.meta, color: 'darkgrey' },
]);

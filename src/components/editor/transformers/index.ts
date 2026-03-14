import {
  ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
} from "@lexical/markdown";

import { LINK } from "./link-transformer";
import { CODE_BLOCK } from "./code-transformer";
import { IMAGE } from "./image-transformer";
import { YOUTUBE } from "./youtube-transformer";

/**
 * Shared transformer array for the Comet editor.
 *
 * Ordering matches the notestack pattern: YOUTUBE first (element transformer
 * that matches bare YouTube URLs before they become paragraphs), then IMAGE
 * and custom LINK replace the defaults from TEXT_MATCH_TRANSFORMERS, and
 * CODE_BLOCK replaces the default CODE from ELEMENT_TRANSFORMERS. We
 * deliberately exclude TEXT_MATCH_TRANSFORMERS because it contains the default
 * link transformer that conflicts with our custom LINK.
 */
export const TRANSFORMERS = [
  YOUTUBE,
  IMAGE,
  LINK,
  ...ELEMENT_TRANSFORMERS,
  CODE_BLOCK,
  ...TEXT_FORMAT_TRANSFORMERS,
];

import { prioritizedFontFamilies } from "./constants";

export function initialUserSelectedFontFamily(fontFamilies: string) {
  return fontFamilies.split(", ")[0];
}

export function prioritizeUserFontFamilies(value: string) {
  let userPrioritizedFontFamilies = prioritizedFontFamilies.split(", ");
  userPrioritizedFontFamilies = userPrioritizedFontFamilies.filter(
    (fontFamily) => fontFamily !== value,
  );
  userPrioritizedFontFamilies.unshift(value);
  return userPrioritizedFontFamilies.join(", ");
}

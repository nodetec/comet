export const shortNpub = (npub: string, length = 4) => {
  return `npub...${npub.substring(npub.length - length)}`;
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortNpub = void 0;
const shortNpub = (npub, length = 4) => {
    return `npub...${npub.substring(npub.length - length)}`;
};
exports.shortNpub = shortNpub;
//# sourceMappingURL=shortNpub.js.map
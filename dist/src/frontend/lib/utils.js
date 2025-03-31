"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignRef = void 0;
exports.cn = cn;
exports.fromNow = fromNow;
const clsx_1 = require("clsx");
const dayjs_1 = __importDefault(require("dayjs"));
const relativeTime_1 = __importDefault(require("dayjs/plugin/relativeTime"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
const assignRef = (lastNoteRef, pageIndex, noteIndex, 
// TODO: Replace any with a proper type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
data) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isLastNote = (pageIndex, noteIndex, data) => 
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    pageIndex === data.pages.length - 1 &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        noteIndex === data.pages[pageIndex].data.length - 1;
    if (isLastNote(pageIndex, noteIndex, data)) {
        return lastNoteRef;
    }
    return undefined;
};
exports.assignRef = assignRef;
function fromNow(createdAt) {
    if (!createdAt) {
        return undefined;
    }
    dayjs_1.default.extend(relativeTime_1.default);
    dayjs_1.default.extend(utc_1.default);
    dayjs_1.default.extend(timezone_1.default);
    const time = dayjs_1.default.utc(createdAt).tz(dayjs_1.default.tz.guess()).fromNow();
    return time;
}
//# sourceMappingURL=utils.js.map
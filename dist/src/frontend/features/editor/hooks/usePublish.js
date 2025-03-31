"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePublish = usePublish;
const react_query_1 = require("@tanstack/react-query");
const markdown_1 = require("~/lib/markdown");
const store_1 = require("~/store");
const nostr_tools_1 = require("nostr-tools");
const sonner_1 = require("sonner");
const uuid_1 = require("uuid");
function randomId() {
    return (0, uuid_1.v4)().replace(/-/g, "").substring(0, 10);
}
function usePublish() {
    const queryClient = (0, react_query_1.useQueryClient)();
    const relays = (0, store_1.useAppState)((state) => state.relays);
    const handlePublish = (e, note, keys, image, onClose) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        if (!note) {
            (0, sonner_1.toast)("Note failed to post", {
                description: "There was an error posting your note.",
            });
            return;
        }
        if (!keys) {
            (0, sonner_1.toast)("Note failed to post", {
                description: "There was an error posting your note.",
            });
            return;
        }
        const nsec = keys.nsec;
        const npub = keys.npub;
        const pool = new nostr_tools_1.SimplePool();
        const secretKey = nostr_tools_1.nip19.decode(nsec).data;
        let identifier;
        if (note.identifier && note.author === npub) {
            identifier = note.identifier;
        }
        else {
            identifier = randomId();
        }
        const eventTags = [
            ["d", identifier],
            ["title", note.title],
        ];
        if (image) {
            eventTags.push(["image", image]);
        }
        if (note.tags) {
            note.tags.forEach((tag) => {
                eventTags.push(["t", tag]);
            });
        }
        const event = (0, nostr_tools_1.finalizeEvent)({
            kind: 30023,
            created_at: Math.floor(Date.now() / 1000),
            tags: eventTags,
            content: (0, markdown_1.removeTitle)(note.content),
        }, secretKey);
        try {
            // create list of relay urls
            if (!relays) {
                (0, sonner_1.toast)("Note failed to post", {
                    description: "There was an error posting your note.",
                });
                return;
            }
            const relayUrls = relays.map((relay) => relay.url);
            yield Promise.all(pool.publish(relayUrls, event));
            pool.close(relayUrls);
            // TODO: update note to published
            // TODO: add event address to note
            note.publishedAt = new Date().toISOString();
            note.identifier = identifier;
            yield window.api.addPublishDetailsToNote(note);
            yield queryClient.invalidateQueries({ queryKey: ["notes"] });
            yield queryClient.invalidateQueries({ queryKey: ["note", note._id] });
            (0, sonner_1.toast)("Note posted", {
                description: "Your note was posted successfully.",
            });
            onClose();
        }
        catch (error) {
            console.error("Error posting note", error);
            (0, sonner_1.toast)("Note failed to post", {
                description: "There was an error posting your note.",
            });
        }
    });
    return { handlePublish };
}
//# sourceMappingURL=usePublish.js.map
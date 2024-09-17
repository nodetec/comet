// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import {Create as $Create} from "@wailsio/runtime";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as sql$0 from "../../../../database/sql/models.js";

export class NostrKey {
    "ID": number;
    "Nsec": string;
    "Npub": string;
    "Active": boolean;

    /** Creates a new NostrKey instance. */
    constructor($$source: Partial<NostrKey> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("Nsec" in $$source)) {
            this["Nsec"] = "";
        }
        if (!("Npub" in $$source)) {
            this["Npub"] = "";
        }
        if (!("Active" in $$source)) {
            this["Active"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new NostrKey instance from a string or object.
     */
    static createFrom($$source: any = {}): NostrKey {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new NostrKey($$parsedSource as Partial<NostrKey>);
    }
}

export class Relay {
    "ID": number;
    "Url": string;
    "Read": boolean;
    "Write": boolean;
    "Sync": boolean;

    /** Creates a new Relay instance. */
    constructor($$source: Partial<Relay> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("Url" in $$source)) {
            this["Url"] = "";
        }
        if (!("Read" in $$source)) {
            this["Read"] = false;
        }
        if (!("Write" in $$source)) {
            this["Write"] = false;
        }
        if (!("Sync" in $$source)) {
            this["Sync"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Relay instance from a string or object.
     */
    static createFrom($$source: any = {}): Relay {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Relay($$parsedSource as Partial<Relay>);
    }
}

export class Settings {
    /**
     * theme
     */
    "Theme": string;

    /**
     * editor
     */
    "Vim": string;
    "LineNumbers": string;
    "HighlightActiveLine": string;
    "LineWrapping": string;
    "IndentSpaces": string;
    "FontSize": string;
    "FontFamily": string;
    "LineHeight": string;

    /**
     * profile
     */
    "Npub": string;
    "Nsec": string;

    /**
     * relays
     */
    "Relays": string;

    /** Creates a new Settings instance. */
    constructor($$source: Partial<Settings> = {}) {
        if (!("Theme" in $$source)) {
            this["Theme"] = "";
        }
        if (!("Vim" in $$source)) {
            this["Vim"] = "";
        }
        if (!("LineNumbers" in $$source)) {
            this["LineNumbers"] = "";
        }
        if (!("HighlightActiveLine" in $$source)) {
            this["HighlightActiveLine"] = "";
        }
        if (!("LineWrapping" in $$source)) {
            this["LineWrapping"] = "";
        }
        if (!("IndentSpaces" in $$source)) {
            this["IndentSpaces"] = "";
        }
        if (!("FontSize" in $$source)) {
            this["FontSize"] = "";
        }
        if (!("FontFamily" in $$source)) {
            this["FontFamily"] = "";
        }
        if (!("LineHeight" in $$source)) {
            this["LineHeight"] = "";
        }
        if (!("Npub" in $$source)) {
            this["Npub"] = "";
        }
        if (!("Nsec" in $$source)) {
            this["Nsec"] = "";
        }
        if (!("Relays" in $$source)) {
            this["Relays"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Settings instance from a string or object.
     */
    static createFrom($$source: any = {}): Settings {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Settings($$parsedSource as Partial<Settings>);
    }
}

export class Tag {
    "ID": number;
    "Name": string;
    "Color": sql$0.NullString;
    "Icon": sql$0.NullString;
    "CreatedAt": string;

    /** Creates a new Tag instance. */
    constructor($$source: Partial<Tag> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("Name" in $$source)) {
            this["Name"] = "";
        }
        if (!("Color" in $$source)) {
            this["Color"] = (new sql$0.NullString());
        }
        if (!("Icon" in $$source)) {
            this["Icon"] = (new sql$0.NullString());
        }
        if (!("CreatedAt" in $$source)) {
            this["CreatedAt"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Tag instance from a string or object.
     */
    static createFrom($$source: any = {}): Tag {
        const $$createField2_0 = $$createType0;
        const $$createField3_0 = $$createType0;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("Color" in $$parsedSource) {
            $$parsedSource["Color"] = $$createField2_0($$parsedSource["Color"]);
        }
        if ("Icon" in $$parsedSource) {
            $$parsedSource["Icon"] = $$createField3_0($$parsedSource["Icon"]);
        }
        return new Tag($$parsedSource as Partial<Tag>);
    }
}

// Private type creation functions
const $$createType0 = sql$0.NullString.createFrom;
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import {Create as $Create} from "@wailsio/runtime";

/**
 * Note represents a note in the application
 */
export class Note {
    "ID": number;
    "NotebookID": number | null;
    "Content": string;
    "Title": string;
    "CreatedAt": string;
    "ModifiedAt": string;
    "ContentModifiedAt": string;
    "PublishedAt": string | null;
    "EventAddress": string | null;
    "Identifier": string | null;
    "PinnedAt": string | null;
    "TrashedAt": string | null;
    "ArchivedAt": string | null;
    "Active": boolean;
    "Author": string | null;

    /** Creates a new Note instance. */
    constructor($$source: Partial<Note> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("NotebookID" in $$source)) {
            this["NotebookID"] = null;
        }
        if (!("Content" in $$source)) {
            this["Content"] = "";
        }
        if (!("Title" in $$source)) {
            this["Title"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            this["ModifiedAt"] = "";
        }
        if (!("ContentModifiedAt" in $$source)) {
            this["ContentModifiedAt"] = "";
        }
        if (!("PublishedAt" in $$source)) {
            this["PublishedAt"] = null;
        }
        if (!("EventAddress" in $$source)) {
            this["EventAddress"] = null;
        }
        if (!("Identifier" in $$source)) {
            this["Identifier"] = null;
        }
        if (!("PinnedAt" in $$source)) {
            this["PinnedAt"] = null;
        }
        if (!("TrashedAt" in $$source)) {
            this["TrashedAt"] = null;
        }
        if (!("ArchivedAt" in $$source)) {
            this["ArchivedAt"] = null;
        }
        if (!("Active" in $$source)) {
            this["Active"] = false;
        }
        if (!("Author" in $$source)) {
            this["Author"] = null;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Note instance from a string or object.
     */
    static createFrom($$source: any = {}): Note {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Note($$parsedSource as Partial<Note>);
    }
}

/**
 * Notebook represents a notebook in the application
 */
export class Notebook {
    "ID": number;
    "Name": string;
    "CreatedAt": string;
    "ModifiedAt": string;
    "PinnedAt": string | null;
    "DisplayOrder": number;
    "Active": boolean;

    /** Creates a new Notebook instance. */
    constructor($$source: Partial<Notebook> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("Name" in $$source)) {
            this["Name"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            this["ModifiedAt"] = "";
        }
        if (!("PinnedAt" in $$source)) {
            this["PinnedAt"] = null;
        }
        if (!("DisplayOrder" in $$source)) {
            this["DisplayOrder"] = 0;
        }
        if (!("Active" in $$source)) {
            this["Active"] = false;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Notebook instance from a string or object.
     */
    static createFrom($$source: any = {}): Notebook {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Notebook($$parsedSource as Partial<Notebook>);
    }
}

/**
 * Relay represents a row in the relays table
 */
export class Relay {
    "ID": number;
    "URL": string;
    "Read": boolean;
    "Write": boolean;
    "Sync": boolean;
    "CreatedAt": string;
    "ModifiedAt": string;

    /** Creates a new Relay instance. */
    constructor($$source: Partial<Relay> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("URL" in $$source)) {
            this["URL"] = "";
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
        if (!("CreatedAt" in $$source)) {
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            this["ModifiedAt"] = "";
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

/**
 * Tag represents a tag in the application
 */
export class Tag {
    "ID": number;
    "Name": string;
    "Color": string | null;
    "Icon": string | null;
    "Active": boolean;
    "Inactive": boolean;
    "CreatedAt": string;
    "ModifiedAt": string;

    /** Creates a new Tag instance. */
    constructor($$source: Partial<Tag> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("Name" in $$source)) {
            this["Name"] = "";
        }
        if (!("Color" in $$source)) {
            this["Color"] = null;
        }
        if (!("Icon" in $$source)) {
            this["Icon"] = null;
        }
        if (!("Active" in $$source)) {
            this["Active"] = false;
        }
        if (!("Inactive" in $$source)) {
            this["Inactive"] = false;
        }
        if (!("CreatedAt" in $$source)) {
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            this["ModifiedAt"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Tag instance from a string or object.
     */
    static createFrom($$source: any = {}): Tag {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Tag($$parsedSource as Partial<Tag>);
    }
}

/**
 * User represents a row in the users table
 */
export class User {
    "ID": number;
    "Nsec": string;
    "Npub": string;
    "Active": boolean;
    "CreatedAt": string;
    "ModifiedAt": string;
    "Name": string;
    "About": string;
    "Picture": string;
    "Nip05": string;
    "Website": string;
    "Lud16": string;

    /** Creates a new User instance. */
    constructor($$source: Partial<User> = {}) {
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
        if (!("CreatedAt" in $$source)) {
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            this["ModifiedAt"] = "";
        }
        if (!("Name" in $$source)) {
            this["Name"] = "";
        }
        if (!("About" in $$source)) {
            this["About"] = "";
        }
        if (!("Picture" in $$source)) {
            this["Picture"] = "";
        }
        if (!("Nip05" in $$source)) {
            this["Nip05"] = "";
        }
        if (!("Website" in $$source)) {
            this["Website"] = "";
        }
        if (!("Lud16" in $$source)) {
            this["Lud16"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new User instance from a string or object.
     */
    static createFrom($$source: any = {}): User {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new User($$parsedSource as Partial<User>);
    }
}

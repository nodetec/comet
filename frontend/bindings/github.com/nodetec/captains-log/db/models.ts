// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import {Create as $Create} from "@wailsio/runtime";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as sql$0 from "../../../../database/sql/models.js";

export class Note {
    "ID": number;
    "StatusID": sql$0.NullInt64;
    "NotebookID": sql$0.NullInt64;
    "Content": string;
    "Title": string;
    "CreatedAt": string;
    "ModifiedAt": string;
    "PublishedAt": sql$0.NullString;
    "EventID": sql$0.NullString;

    /** Creates a new Note instance. */
    constructor($$source: Partial<Note> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("StatusID" in $$source)) {
            this["StatusID"] = (new sql$0.NullInt64());
        }
        if (!("NotebookID" in $$source)) {
            this["NotebookID"] = (new sql$0.NullInt64());
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
        if (!("PublishedAt" in $$source)) {
            this["PublishedAt"] = (new sql$0.NullString());
        }
        if (!("EventID" in $$source)) {
            this["EventID"] = (new sql$0.NullString());
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Note instance from a string or object.
     */
    static createFrom($$source: any = {}): Note {
        const $$createField1_0 = $$createType0;
        const $$createField2_0 = $$createType0;
        const $$createField7_0 = $$createType1;
        const $$createField8_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("StatusID" in $$parsedSource) {
            $$parsedSource["StatusID"] = $$createField1_0($$parsedSource["StatusID"]);
        }
        if ("NotebookID" in $$parsedSource) {
            $$parsedSource["NotebookID"] = $$createField2_0($$parsedSource["NotebookID"]);
        }
        if ("PublishedAt" in $$parsedSource) {
            $$parsedSource["PublishedAt"] = $$createField7_0($$parsedSource["PublishedAt"]);
        }
        if ("EventID" in $$parsedSource) {
            $$parsedSource["EventID"] = $$createField8_0($$parsedSource["EventID"]);
        }
        return new Note($$parsedSource as Partial<Note>);
    }
}

export class Notebook {
    "ID": number;
    "Name": string;
    "CreatedAt": string;

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
        const $$createField2_0 = $$createType1;
        const $$createField3_0 = $$createType1;
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

export class Trash {
    "ID": number;
    "NoteID": number;
    "Content": string;
    "Title": string;
    "CreatedAt": string;
    "TrashedAt": string;
    "Tags": sql$0.NullString;

    /** Creates a new Trash instance. */
    constructor($$source: Partial<Trash> = {}) {
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }
        if (!("NoteID" in $$source)) {
            this["NoteID"] = 0;
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
        if (!("TrashedAt" in $$source)) {
            this["TrashedAt"] = "";
        }
        if (!("Tags" in $$source)) {
            this["Tags"] = (new sql$0.NullString());
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Trash instance from a string or object.
     */
    static createFrom($$source: any = {}): Trash {
        const $$createField6_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("Tags" in $$parsedSource) {
            $$parsedSource["Tags"] = $$createField6_0($$parsedSource["Tags"]);
        }
        return new Trash($$parsedSource as Partial<Trash>);
    }
}

export class UpdateNoteParams {
    "StatusID": sql$0.NullInt64;
    "NotebookID": sql$0.NullInt64;
    "Content": string;
    "Title": string;
    "ModifiedAt": string;
    "PublishedAt": sql$0.NullString;
    "EventID": sql$0.NullString;
    "ID": number;

    /** Creates a new UpdateNoteParams instance. */
    constructor($$source: Partial<UpdateNoteParams> = {}) {
        if (!("StatusID" in $$source)) {
            this["StatusID"] = (new sql$0.NullInt64());
        }
        if (!("NotebookID" in $$source)) {
            this["NotebookID"] = (new sql$0.NullInt64());
        }
        if (!("Content" in $$source)) {
            this["Content"] = "";
        }
        if (!("Title" in $$source)) {
            this["Title"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            this["ModifiedAt"] = "";
        }
        if (!("PublishedAt" in $$source)) {
            this["PublishedAt"] = (new sql$0.NullString());
        }
        if (!("EventID" in $$source)) {
            this["EventID"] = (new sql$0.NullString());
        }
        if (!("ID" in $$source)) {
            this["ID"] = 0;
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new UpdateNoteParams instance from a string or object.
     */
    static createFrom($$source: any = {}): UpdateNoteParams {
        const $$createField0_0 = $$createType0;
        const $$createField1_0 = $$createType0;
        const $$createField5_0 = $$createType1;
        const $$createField6_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("StatusID" in $$parsedSource) {
            $$parsedSource["StatusID"] = $$createField0_0($$parsedSource["StatusID"]);
        }
        if ("NotebookID" in $$parsedSource) {
            $$parsedSource["NotebookID"] = $$createField1_0($$parsedSource["NotebookID"]);
        }
        if ("PublishedAt" in $$parsedSource) {
            $$parsedSource["PublishedAt"] = $$createField5_0($$parsedSource["PublishedAt"]);
        }
        if ("EventID" in $$parsedSource) {
            $$parsedSource["EventID"] = $$createField6_0($$parsedSource["EventID"]);
        }
        return new UpdateNoteParams($$parsedSource as Partial<UpdateNoteParams>);
    }
}

// Private type creation functions
const $$createType0 = sql$0.NullInt64.createFrom;
const $$createType1 = sql$0.NullString.createFrom;

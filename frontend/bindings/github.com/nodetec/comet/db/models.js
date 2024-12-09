// @ts-check
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import {Create as $Create} from "@wailsio/runtime";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as sql$0 from "../../../../database/sql/models.js";

export class CreateNoteFromTrashRow {
    /**
     * Creates a new CreateNoteFromTrashRow instance.
     * @param {Partial<CreateNoteFromTrashRow>} [$$source = {}] - The source object to create the CreateNoteFromTrashRow.
     */
    constructor($$source = {}) {
        if (!("ID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID"] = 0;
        }
        if (!("ID_2" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID_2"] = 0;
        }
        if (!("StatusID" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullInt64}
             */
            this["StatusID"] = (new sql$0.NullInt64());
        }
        if (!("NotebookID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["NotebookID"] = 0;
        }
        if (!("Content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Content"] = "";
        }
        if (!("Title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Title"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["ModifiedAt"] = "";
        }
        if (!("PublishedAt" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["PublishedAt"] = (new sql$0.NullString());
        }
        if (!("EventID" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["EventID"] = (new sql$0.NullString());
        }
        if (!("Pinned" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["Pinned"] = false;
        }
        if (!("Notetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Notetype"] = "";
        }
        if (!("Filetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Filetype"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new CreateNoteFromTrashRow instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {CreateNoteFromTrashRow}
     */
    static createFrom($$source = {}) {
        const $$createField2_0 = $$createType0;
        const $$createField8_0 = $$createType1;
        const $$createField9_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("StatusID" in $$parsedSource) {
            $$parsedSource["StatusID"] = $$createField2_0($$parsedSource["StatusID"]);
        }
        if ("PublishedAt" in $$parsedSource) {
            $$parsedSource["PublishedAt"] = $$createField8_0($$parsedSource["PublishedAt"]);
        }
        if ("EventID" in $$parsedSource) {
            $$parsedSource["EventID"] = $$createField9_0($$parsedSource["EventID"]);
        }
        return new CreateNoteFromTrashRow(/** @type {Partial<CreateNoteFromTrashRow>} */($$parsedSource));
    }
}

export class GetNoteFromTrashRow {
    /**
     * Creates a new GetNoteFromTrashRow instance.
     * @param {Partial<GetNoteFromTrashRow>} [$$source = {}] - The source object to create the GetNoteFromTrashRow.
     */
    constructor($$source = {}) {
        if (!("ID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID"] = 0;
        }
        if (!("NoteID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["NoteID"] = 0;
        }
        if (!("Content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Content"] = "";
        }
        if (!("Title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Title"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["ModifiedAt"] = "";
        }
        if (!("Tags" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["Tags"] = (new sql$0.NullString());
        }
        if (!("NotebookID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["NotebookID"] = 0;
        }
        if (!("PublishedAt" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["PublishedAt"] = (new sql$0.NullString());
        }
        if (!("EventID" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["EventID"] = (new sql$0.NullString());
        }
        if (!("Notetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Notetype"] = "";
        }
        if (!("Filetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Filetype"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new GetNoteFromTrashRow instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {GetNoteFromTrashRow}
     */
    static createFrom($$source = {}) {
        const $$createField6_0 = $$createType1;
        const $$createField8_0 = $$createType1;
        const $$createField9_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("Tags" in $$parsedSource) {
            $$parsedSource["Tags"] = $$createField6_0($$parsedSource["Tags"]);
        }
        if ("PublishedAt" in $$parsedSource) {
            $$parsedSource["PublishedAt"] = $$createField8_0($$parsedSource["PublishedAt"]);
        }
        if ("EventID" in $$parsedSource) {
            $$parsedSource["EventID"] = $$createField9_0($$parsedSource["EventID"]);
        }
        return new GetNoteFromTrashRow(/** @type {Partial<GetNoteFromTrashRow>} */($$parsedSource));
    }
}

export class Note {
    /**
     * Creates a new Note instance.
     * @param {Partial<Note>} [$$source = {}] - The source object to create the Note.
     */
    constructor($$source = {}) {
        if (!("ID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID"] = 0;
        }
        if (!("StatusID" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullInt64}
             */
            this["StatusID"] = (new sql$0.NullInt64());
        }
        if (!("NotebookID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["NotebookID"] = 0;
        }
        if (!("Content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Content"] = "";
        }
        if (!("Title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Title"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["ModifiedAt"] = "";
        }
        if (!("PublishedAt" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["PublishedAt"] = (new sql$0.NullString());
        }
        if (!("EventID" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["EventID"] = (new sql$0.NullString());
        }
        if (!("Pinned" in $$source)) {
            /**
             * @member
             * @type {boolean}
             */
            this["Pinned"] = false;
        }
        if (!("Notetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Notetype"] = "";
        }
        if (!("Filetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Filetype"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Note instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Note}
     */
    static createFrom($$source = {}) {
        const $$createField1_0 = $$createType0;
        const $$createField7_0 = $$createType1;
        const $$createField8_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("StatusID" in $$parsedSource) {
            $$parsedSource["StatusID"] = $$createField1_0($$parsedSource["StatusID"]);
        }
        if ("PublishedAt" in $$parsedSource) {
            $$parsedSource["PublishedAt"] = $$createField7_0($$parsedSource["PublishedAt"]);
        }
        if ("EventID" in $$parsedSource) {
            $$parsedSource["EventID"] = $$createField8_0($$parsedSource["EventID"]);
        }
        return new Note(/** @type {Partial<Note>} */($$parsedSource));
    }
}

export class Notebook {
    /**
     * Creates a new Notebook instance.
     * @param {Partial<Notebook>} [$$source = {}] - The source object to create the Notebook.
     */
    constructor($$source = {}) {
        if (!("ID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID"] = 0;
        }
        if (!("Name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Name"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["CreatedAt"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Notebook instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Notebook}
     */
    static createFrom($$source = {}) {
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        return new Notebook(/** @type {Partial<Notebook>} */($$parsedSource));
    }
}

export class Tag {
    /**
     * Creates a new Tag instance.
     * @param {Partial<Tag>} [$$source = {}] - The source object to create the Tag.
     */
    constructor($$source = {}) {
        if (!("ID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID"] = 0;
        }
        if (!("Name" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Name"] = "";
        }
        if (!("Color" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["Color"] = (new sql$0.NullString());
        }
        if (!("Icon" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["Icon"] = (new sql$0.NullString());
        }
        if (!("CreatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["CreatedAt"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Tag instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Tag}
     */
    static createFrom($$source = {}) {
        const $$createField2_0 = $$createType1;
        const $$createField3_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("Color" in $$parsedSource) {
            $$parsedSource["Color"] = $$createField2_0($$parsedSource["Color"]);
        }
        if ("Icon" in $$parsedSource) {
            $$parsedSource["Icon"] = $$createField3_0($$parsedSource["Icon"]);
        }
        return new Tag(/** @type {Partial<Tag>} */($$parsedSource));
    }
}

export class Trash {
    /**
     * Creates a new Trash instance.
     * @param {Partial<Trash>} [$$source = {}] - The source object to create the Trash.
     */
    constructor($$source = {}) {
        if (!("ID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["ID"] = 0;
        }
        if (!("NoteID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["NoteID"] = 0;
        }
        if (!("NotebookID" in $$source)) {
            /**
             * @member
             * @type {number}
             */
            this["NotebookID"] = 0;
        }
        if (!("Content" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Content"] = "";
        }
        if (!("Title" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Title"] = "";
        }
        if (!("CreatedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["CreatedAt"] = "";
        }
        if (!("ModifiedAt" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["ModifiedAt"] = "";
        }
        if (!("Tags" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["Tags"] = (new sql$0.NullString());
        }
        if (!("PublishedAt" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["PublishedAt"] = (new sql$0.NullString());
        }
        if (!("EventID" in $$source)) {
            /**
             * @member
             * @type {sql$0.NullString}
             */
            this["EventID"] = (new sql$0.NullString());
        }
        if (!("Notetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Notetype"] = "";
        }
        if (!("Filetype" in $$source)) {
            /**
             * @member
             * @type {string}
             */
            this["Filetype"] = "";
        }

        Object.assign(this, $$source);
    }

    /**
     * Creates a new Trash instance from a string or object.
     * @param {any} [$$source = {}]
     * @returns {Trash}
     */
    static createFrom($$source = {}) {
        const $$createField7_0 = $$createType1;
        const $$createField8_0 = $$createType1;
        const $$createField9_0 = $$createType1;
        let $$parsedSource = typeof $$source === 'string' ? JSON.parse($$source) : $$source;
        if ("Tags" in $$parsedSource) {
            $$parsedSource["Tags"] = $$createField7_0($$parsedSource["Tags"]);
        }
        if ("PublishedAt" in $$parsedSource) {
            $$parsedSource["PublishedAt"] = $$createField8_0($$parsedSource["PublishedAt"]);
        }
        if ("EventID" in $$parsedSource) {
            $$parsedSource["EventID"] = $$createField9_0($$parsedSource["EventID"]);
        }
        return new Trash(/** @type {Partial<Trash>} */($$parsedSource));
    }
}

// Private type creation functions
const $$createType0 = sql$0.NullInt64.createFrom;
const $$createType1 = sql$0.NullString.createFrom;

// @ts-check
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import {Call as $Call, Create as $Create} from "@wailsio/runtime";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as sql$0 from "../../../../database/sql/models.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import * as $models from "./models.js";

/**
 * @param {string} name
 * @param {sql$0.NullString} color
 * @param {sql$0.NullString} icon
 * @param {string} createdAt
 * @returns {Promise<$models.Tag> & { cancel(): void }}
 */
export function CreateTag(name, color, icon, createdAt) {
    let $resultPromise = /** @type {any} */($Call.ByID(4191103332, name, color, icon, createdAt));
    let $typingPromise = /** @type {any} */($resultPromise.then(($result) => {
        return $$createType0($result);
    }));
    $typingPromise.cancel = $resultPromise.cancel.bind($resultPromise);
    return $typingPromise;
}

/**
 * @param {number} id
 * @returns {Promise<void> & { cancel(): void }}
 */
export function DeleteTag(id) {
    let $resultPromise = /** @type {any} */($Call.ByID(1411090129, id));
    return $resultPromise;
}

/**
 * @param {number} id
 * @returns {Promise<$models.Tag> & { cancel(): void }}
 */
export function GetTag(id) {
    let $resultPromise = /** @type {any} */($Call.ByID(2029176156, id));
    let $typingPromise = /** @type {any} */($resultPromise.then(($result) => {
        return $$createType0($result);
    }));
    $typingPromise.cancel = $resultPromise.cancel.bind($resultPromise);
    return $typingPromise;
}

/**
 * @param {string} name
 * @returns {Promise<$models.Tag> & { cancel(): void }}
 */
export function GetTagByName(name) {
    let $resultPromise = /** @type {any} */($Call.ByID(1160743666, name));
    let $typingPromise = /** @type {any} */($resultPromise.then(($result) => {
        return $$createType0($result);
    }));
    $typingPromise.cancel = $resultPromise.cancel.bind($resultPromise);
    return $typingPromise;
}

/**
 * @param {string[]} names
 * @returns {Promise<$models.Tag[]> & { cancel(): void }}
 */
export function GetTagsByNames(names) {
    let $resultPromise = /** @type {any} */($Call.ByID(1226187244, names));
    let $typingPromise = /** @type {any} */($resultPromise.then(($result) => {
        return $$createType1($result);
    }));
    $typingPromise.cancel = $resultPromise.cancel.bind($resultPromise);
    return $typingPromise;
}

/**
 * @returns {Promise<$models.Tag[]> & { cancel(): void }}
 */
export function ListTags() {
    let $resultPromise = /** @type {any} */($Call.ByID(342385689));
    let $typingPromise = /** @type {any} */($resultPromise.then(($result) => {
        return $$createType1($result);
    }));
    $typingPromise.cancel = $resultPromise.cancel.bind($resultPromise);
    return $typingPromise;
}

/**
 * @param {number} id
 * @param {string} name
 * @param {sql$0.NullString} color
 * @param {sql$0.NullString} icon
 * @param {string} createdAt
 * @returns {Promise<void> & { cancel(): void }}
 */
export function UpdateTag(id, name, color, icon, createdAt) {
    let $resultPromise = /** @type {any} */($Call.ByID(3312250639, id, name, color, icon, createdAt));
    return $resultPromise;
}

// Private type creation functions
const $$createType0 = $models.Tag.createFrom;
const $$createType1 = $Create.Array($$createType0);

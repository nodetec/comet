import { invoke } from "@tauri-apps/api/core";
import {
  contextMenuRequest,
  type APIResponse,
  type CreateNoteRequest,
  type CreateTagRequest,
  type GetTagRequest,
  type ListNotesRequest,
  type Note,
  type Tag,
  type TagNoteRequest,
  type UpdateNoteRequest,
} from "~/types";

export const createNote = async (createNoteRequest: CreateNoteRequest) => {
  // TODO: error handling
  const response: APIResponse<Note> = await invoke("create_note", {
    createNoteRequest,
  });
  return response;
};

export const updateNote = async (updateNoteRequest: UpdateNoteRequest) => {
  // TODO: error handling
  const response: APIResponse<Note> = await invoke("update_note", {
    updateNoteRequest,
  });
  return response;
};

export const listNotes = async (listNotesRequest: ListNotesRequest) => {
  // TODO: error handling
  const response: APIResponse<Note[]> = await invoke("list_notes", {
    listNotesRequest,
  });
  return response;
};

export const listTags = async () => {
  // TODO: error handling
  const response: APIResponse<Tag[]> = await invoke("list_tags");
  console.log(response, "tags");
  return response;
};

export const createTag = async (createTagRequest: CreateTagRequest) => {
  // TODO: error handling
  const response: APIResponse<Tag> = await invoke("create_tag", {
    createTagRequest,
  });
  return response;
};

export const getTag = async (getTagRequest: GetTagRequest) => {
  const response: APIResponse<Tag> = await invoke("get_tag", {
    getTagRequest,
  });
  return response;
};

export const tagNote = async (tagNoteRequest: TagNoteRequest) => {
  // TODO: error handling
  const response: APIResponse<undefined> = await invoke("tag_note", {
    tagNoteRequest,
  });
  return response;
};

export const createContextMenu = async (contextMenuRequest: contextMenuRequest ) => {
  void (await invoke("create_context_menu"), {contextMenuRequest});
};

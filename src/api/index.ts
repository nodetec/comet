import { invoke } from "@tauri-apps/api/core";
import { APIResponse, CreateNoteRequest, Note, Tag } from "~/types";

export const createNote = async (createNoteRequest: CreateNoteRequest) => {
  // TODO: error handling
  const response: APIResponse<Note> = await invoke("create_note", {
    createNoteRequest,
  });
  return response;
};

export const listNotes = async () => {
  // TODO: error handling
  const response: APIResponse<Note[]> = await invoke("list_notes");
  return response;
};

export const listTags = async () => {
  // TODO: error handling
  const response: APIResponse<Tag[]> = await invoke("list_tags");
  console.log(response, "tags");
  return response;
};


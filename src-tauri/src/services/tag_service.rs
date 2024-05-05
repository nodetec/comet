use crate::{
    db,
    models::{APIResponse, CreateTagRequest, DBConn, GetTagRequest, ListTagsRequest, Tag, TagNoteRequest},
};
use std::sync::Arc;

pub struct TagService {
    db_conn: Arc<DBConn>,
}

impl TagService {
    pub fn new(db_conn: Arc<DBConn>) -> Self {
        TagService { db_conn }
    }

    pub fn create_tag(&self, create_tag_request: CreateTagRequest) -> APIResponse<Tag> {
        let conn = self.db_conn.0.lock().unwrap();
        match db::create_tag(&conn, &create_tag_request) {
            Ok(tag_id) => {
                match create_tag_request.note_id {
                    Some(note_id) => {
                        let tag_note_request = TagNoteRequest {
                            tag_id: tag_id,
                            note_id: note_id,
                        };
                        db::tag_note(&conn, &tag_note_request).unwrap();
                    }
                    None => (),
                }

                match db::get_tag_by_id(&conn, tag_id) {
                    // Ensure type matches your ID field
                    Ok(tag) => APIResponse::Data(Some(tag)),
                    Err(e) => APIResponse::Error(format!("Failed to retrieve created tag: {}", e)),
                }
            }
            Err(e) => APIResponse::Error(format!("Failed to create tag: {}", e)),
        }
    }

    pub fn get_tag(&self, get_tag_request: GetTagRequest) -> APIResponse<Tag> {
        let conn = self.db_conn.0.lock().unwrap();
        println!("{:?}", get_tag_request);

        match get_tag_request {
            GetTagRequest { id: Some(id), .. } => match db::get_tag_by_id(&conn, id) {
                Ok(tag) => APIResponse::Data(Some(tag)),
                Err(e) => APIResponse::Error(format!("Failed to retrieve tag by ID: {}", e)),
            },
            GetTagRequest {
                name: Some(name), ..
            } => match db::get_tag_by_name(&conn, &name) {
                // APIResponse::Success(Some(tag)) => APIResponse::Success(Some(tag)),
                Ok(tag) => APIResponse::Data(Some(tag)),
                Err(e) => APIResponse::Error(format!("Failed to retrieve tag by name: {}", e)),
            },
            _ => APIResponse::Error("Failed to retrieve tag: no ID or name provided".to_string()),
        }
    }

    pub fn list_tags(&self, list_tags_request: &ListTagsRequest) -> APIResponse<Vec<Tag>> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::list_all_tags(&conn, &list_tags_request) {
            Ok(tags) => APIResponse::Data(Some(tags)),
            Err(e) => APIResponse::Error(format!("Failed to retrieve tags: {}", e)),
        }
    }

    pub fn delete_tag(&self, tag_id: &i64) -> () {
        let conn = self.db_conn.0.lock().unwrap();
        db::delete_tag(&conn, &tag_id);
    }
}

use crate::{
    db,
    models::{APIResponse, CreateTagRequest, DBConn, Tag},
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
                match db::get_tag_by_id(&conn, tag_id as i64) {
                    // Ensure type matches your ID field
                    Ok(tag) => APIResponse {
                        success: true,
                        message: Some("Tag created successfully".to_string()),
                        data: Some(tag),
                    },
                    Err(e) => APIResponse {
                        success: false,
                        message: Some(format!("Failed to retrieve created tag: {}", e)),
                        data: None,
                    },
                }
            }
            Err(e) => APIResponse {
                success: false,
                message: Some(format!("Failed to create tag: {}", e)),
                data: None,
            },
        }
    }

    pub fn list_tags(&self) -> APIResponse<Vec<Tag>> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::list_all_tags(&conn) {
            Ok(tags) => APIResponse {
                success: true,
                message: Some("Tags retrieved successfully".to_string()),
                data: Some(tags),
            },
            Err(e) => APIResponse {
                success: false,
                message: Some(format!("Failed to retrieve tags: {}", e)),
                data: None,
            },
        }
    }
}

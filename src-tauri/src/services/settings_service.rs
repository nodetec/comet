use crate::{
    db,
    models::{APIResponse, DBConn},
};
use std::{collections::HashMap, sync::Arc};

pub struct SettingsService {
    db_conn: Arc<DBConn>,
}

impl SettingsService {
    pub fn new(db_conn: Arc<DBConn>) -> Self {
        SettingsService { db_conn }
    }

    pub fn get_all_settings(&self) -> APIResponse<HashMap<String, String>> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::get_all_settings(&conn) {
            Ok(settings) => APIResponse::Data(Some(settings)),
            Err(e) => APIResponse::Error(format!("Failed to retrieve settings: {}", e)),
        }
    }

    pub fn get_setting(&self, key: &String) -> APIResponse<String> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::get_setting(&conn, key) {
            Ok(setting) => APIResponse::Data(Some(setting)),
            Err(e) => APIResponse::Error(format!("Failed to retrieve setting: {}", e)),
        }
    }

    pub fn set_setting(&self, key: &String, value: &String) -> APIResponse<()> {
        let conn = self.db_conn.0.lock().unwrap();

        match db::set_setting(&conn, key, value) {
            Ok(_) => APIResponse::Data(None),
            Err(e) => APIResponse::Error(format!("Failed to set setting: {}", e)),
        }
    }
}

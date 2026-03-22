use std::collections::HashMap;
use std::sync::Mutex;

const RENDERED_HTML_CACHE_MAX_BYTES: usize = 8 * 1024 * 1024;
const RENDERED_HTML_CACHE_MAX_ENTRY_BYTES: usize = 256 * 1024;

#[derive(Default)]
pub struct RenderedHtmlCache {
    state: Mutex<RenderedHtmlCacheState>,
}

#[derive(Clone)]
struct RenderedHtmlCacheEntry {
    html: String,
    modified_at: i64,
    size_bytes: usize,
    last_access_tick: u64,
}

#[derive(Default)]
struct RenderedHtmlCacheState {
    entries: HashMap<String, RenderedHtmlCacheEntry>,
    next_access_tick: u64,
    total_bytes: usize,
}

// ---------------------------------------------------------------------------
// Public API on the outer (Mutex-wrapped) type
// ---------------------------------------------------------------------------

impl RenderedHtmlCache {
    pub fn get(&self, note_id: &str, modified_at: i64) -> Option<String> {
        let mut state = self.state.lock().ok()?;
        state.get(note_id, modified_at)
    }

    pub fn insert(&self, note_id: String, modified_at: i64, html: String) {
        if let Ok(mut state) = self.state.lock() {
            state.insert(note_id, modified_at, html);
        }
    }

    pub fn invalidate(&self, note_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.remove(note_id);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut state) = self.state.lock() {
            *state = RenderedHtmlCacheState::default();
        }
    }
}

// ---------------------------------------------------------------------------
// Inner state implementation
// ---------------------------------------------------------------------------

impl RenderedHtmlCacheState {
    fn get(&mut self, note_id: &str, modified_at: i64) -> Option<String> {
        let access_tick = self.bump_access_tick();
        let entry = self.entries.get_mut(note_id)?;
        if entry.modified_at != modified_at {
            return None;
        }
        entry.last_access_tick = access_tick;
        Some(entry.html.clone())
    }

    fn insert(&mut self, note_id: String, modified_at: i64, html: String) {
        self.insert_with_limits(
            note_id,
            modified_at,
            html,
            RENDERED_HTML_CACHE_MAX_BYTES,
            RENDERED_HTML_CACHE_MAX_ENTRY_BYTES,
        );
    }

    fn insert_with_limits(
        &mut self,
        note_id: String,
        modified_at: i64,
        html: String,
        max_total_bytes: usize,
        max_entry_bytes: usize,
    ) {
        let size_bytes = html.len();
        self.remove(&note_id);

        if size_bytes > max_entry_bytes || size_bytes > max_total_bytes {
            return;
        }

        self.evict_until_fits(size_bytes, max_total_bytes);

        let access_tick = self.bump_access_tick();
        self.total_bytes = self.total_bytes.saturating_add(size_bytes);
        self.entries.insert(
            note_id,
            RenderedHtmlCacheEntry {
                html,
                modified_at,
                size_bytes,
                last_access_tick: access_tick,
            },
        );
    }

    fn remove(&mut self, note_id: &str) {
        if let Some(entry) = self.entries.remove(note_id) {
            self.total_bytes = self.total_bytes.saturating_sub(entry.size_bytes);
        }
    }

    fn evict_until_fits(&mut self, incoming_size_bytes: usize, max_total_bytes: usize) {
        while !self.entries.is_empty()
            && self.total_bytes.saturating_add(incoming_size_bytes) > max_total_bytes
        {
            let lru_note_id = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_access_tick)
                .map(|(note_id, _)| note_id.clone());

            match lru_note_id {
                Some(note_id) => self.remove(&note_id),
                None => break,
            }
        }
    }

    fn bump_access_tick(&mut self) -> u64 {
        self.next_access_tick = self.next_access_tick.wrapping_add(1);
        self.next_access_tick
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::RenderedHtmlCacheState;

    #[test]
    fn skips_entries_above_size_limit() {
        let mut cache = RenderedHtmlCacheState::default();
        cache.insert_with_limits("note-1".into(), 1, "abcdef".into(), 10, 5);
        assert!(cache.entries.is_empty());
        assert_eq!(cache.total_bytes, 0);
    }

    #[test]
    fn evicts_lru_entries_by_total_bytes() {
        let mut cache = RenderedHtmlCacheState::default();
        cache.insert_with_limits("note-1".into(), 1, "aaaa".into(), 8, 8);
        cache.insert_with_limits("note-2".into(), 1, "bbbb".into(), 8, 8);
        // Touch note-1 so note-2 becomes LRU
        assert_eq!(cache.get("note-1", 1).as_deref(), Some("aaaa"));

        cache.insert_with_limits("note-3".into(), 1, "cccc".into(), 8, 8);

        assert_eq!(cache.get("note-1", 1).as_deref(), Some("aaaa"));
        assert_eq!(cache.get("note-2", 1), None);
        assert_eq!(cache.get("note-3", 1).as_deref(), Some("cccc"));
        assert_eq!(cache.total_bytes, 8);
    }

    #[test]
    fn public_api_get_returns_none_for_stale_modified_at() {
        let cache = super::RenderedHtmlCache::default();
        cache.insert("note-1".into(), 100, "<p>hi</p>".into());
        assert!(cache.get("note-1", 100).is_some());
        assert!(cache.get("note-1", 200).is_none());
    }

    #[test]
    fn public_api_invalidate_removes_entry() {
        let cache = super::RenderedHtmlCache::default();
        cache.insert("note-1".into(), 100, "<p>hi</p>".into());
        cache.invalidate("note-1");
        assert!(cache.get("note-1", 100).is_none());
    }

    #[test]
    fn public_api_clear_empties_all_entries() {
        let cache = super::RenderedHtmlCache::default();
        cache.insert("note-1".into(), 1, "a".into());
        cache.insert("note-2".into(), 1, "b".into());
        cache.clear();
        assert!(cache.get("note-1", 1).is_none());
        assert!(cache.get("note-2", 1).is_none());
    }
}

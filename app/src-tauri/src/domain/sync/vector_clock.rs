use std::collections::BTreeMap;

pub type VectorClock = BTreeMap<String, u64>;
pub const MAX_SAFE_VECTOR_CLOCK_COUNTER: u64 = 9_007_199_254_740_991;
pub const MAX_VECTOR_CLOCK_ENTRIES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VectorClockComparison {
    Dominates,
    Dominated,
    Equal,
    Concurrent,
}

pub fn canonicalize_vector_clock(clock: &VectorClock) -> Result<VectorClock, String> {
    if clock.len() > MAX_VECTOR_CLOCK_ENTRIES {
        return Err(format!(
            "Vector clock must contain at most {MAX_VECTOR_CLOCK_ENTRIES} entries"
        ));
    }

    let mut canonical = BTreeMap::new();

    for (device_id, counter) in clock {
        if device_id.trim().is_empty() {
            return Err("Vector clock device ids must be non-empty".to_string());
        }

        if *counter == 0 {
            return Err("Vector clock counters must be positive integers".to_string());
        }

        if *counter > MAX_SAFE_VECTOR_CLOCK_COUNTER {
            return Err(format!(
                "Vector clock counters must be <= {MAX_SAFE_VECTOR_CLOCK_COUNTER}"
            ));
        }

        canonical.insert(device_id.clone(), *counter);
    }

    Ok(canonical)
}

pub fn parse_vector_clock(json: &str) -> Result<VectorClock, String> {
    let clock: VectorClock =
        serde_json::from_str(json).map_err(|e| format!("Invalid vector clock JSON: {e}"))?;
    canonicalize_vector_clock(&clock)
}

pub fn serialize_vector_clock(clock: &VectorClock) -> Result<String, String> {
    serde_json::to_string(&canonicalize_vector_clock(clock)?)
        .map_err(|e| format!("Failed to serialize vector clock: {e}"))
}

pub fn increment_vector_clock(clock: &VectorClock, device_id: &str) -> Result<VectorClock, String> {
    if device_id.trim().is_empty() {
        return Err("Device id must be non-empty".to_string());
    }

    let mut next = canonicalize_vector_clock(clock)?;
    if !next.contains_key(device_id) && next.len() >= MAX_VECTOR_CLOCK_ENTRIES {
        return Err(format!(
            "Vector clock must contain at most {MAX_VECTOR_CLOCK_ENTRIES} entries"
        ));
    }
    let counter = next.entry(device_id.to_string()).or_insert(0);
    *counter += 1;
    Ok(next)
}

pub fn compare_vector_clocks(
    left: &VectorClock,
    right: &VectorClock,
) -> Result<VectorClockComparison, String> {
    let left = canonicalize_vector_clock(left)?;
    let right = canonicalize_vector_clock(right)?;

    let mut left_greater = false;
    let mut right_greater = false;

    for key in left.keys().chain(right.keys()) {
        let lhs = left.get(key).copied().unwrap_or(0);
        let rhs = right.get(key).copied().unwrap_or(0);
        if lhs > rhs {
            left_greater = true;
        } else if rhs > lhs {
            right_greater = true;
        }
    }

    let comparison = match (left_greater, right_greater) {
        (false, false) => VectorClockComparison::Equal,
        (true, false) => VectorClockComparison::Dominates,
        (false, true) => VectorClockComparison::Dominated,
        (true, true) => VectorClockComparison::Concurrent,
    };

    Ok(comparison)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_dominated_clocks() {
        let left = BTreeMap::from([("A".to_string(), 5), ("B".to_string(), 2)]);
        let right = BTreeMap::from([("A".to_string(), 6), ("B".to_string(), 2)]);

        assert_eq!(
            compare_vector_clocks(&left, &right).unwrap(),
            VectorClockComparison::Dominated
        );
    }

    #[test]
    fn compares_concurrent_clocks() {
        let left = BTreeMap::from([("A".to_string(), 5), ("B".to_string(), 2)]);
        let right = BTreeMap::from([("A".to_string(), 4), ("B".to_string(), 3)]);

        assert_eq!(
            compare_vector_clocks(&left, &right).unwrap(),
            VectorClockComparison::Concurrent
        );
    }

    #[test]
    fn increments_device_counter() {
        let clock = BTreeMap::from([("A".to_string(), 2)]);
        let next = increment_vector_clock(&clock, "A").unwrap();
        assert_eq!(next.get("A"), Some(&3));
    }

    #[test]
    fn rejects_zero_counter() {
        let clock = BTreeMap::from([("A".to_string(), 0)]);
        assert!(canonicalize_vector_clock(&clock)
            .unwrap_err()
            .contains("positive integers"));
    }

    #[test]
    fn rejects_counter_above_js_safe_integer_max() {
        let clock = BTreeMap::from([(
            "A".to_string(),
            MAX_SAFE_VECTOR_CLOCK_COUNTER + 1,
        )]);
        assert!(canonicalize_vector_clock(&clock)
            .unwrap_err()
            .contains(&MAX_SAFE_VECTOR_CLOCK_COUNTER.to_string()));
    }

    #[test]
    fn rejects_more_than_max_entries() {
        let clock = (0..=MAX_VECTOR_CLOCK_ENTRIES)
            .map(|index| (format!("DEVICE-{index:02}"), 1_u64))
            .collect::<BTreeMap<_, _>>();
        assert!(canonicalize_vector_clock(&clock)
            .unwrap_err()
            .contains(&MAX_VECTOR_CLOCK_ENTRIES.to_string()));
    }
}

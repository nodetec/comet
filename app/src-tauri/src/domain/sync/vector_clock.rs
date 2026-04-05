use std::collections::BTreeMap;

pub type VectorClock = BTreeMap<String, u64>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VectorClockComparison {
    Dominates,
    Dominated,
    Equal,
    Concurrent,
}

pub fn canonicalize_vector_clock(clock: &VectorClock) -> Result<VectorClock, String> {
    let mut canonical = BTreeMap::new();

    for (device_id, counter) in clock {
        if device_id.trim().is_empty() {
            return Err("Vector clock device ids must be non-empty".to_string());
        }

        if *counter == 0 {
            continue;
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
}

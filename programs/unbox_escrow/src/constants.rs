pub const DEAL_SEED: &[u8] = b"deal";
pub const MAX_METADATA_URI_LEN: usize = 200;
pub const MAX_TRACKING_LEN: usize = 32;

// Seconds. `test-timeouts` wins over `demo`; with neither, production values apply.
#[cfg(feature = "test-timeouts")]
mod timeouts {
    pub const PROFILE: &str = "test";
    pub const SHIP: i64 = 5;
    pub const UNBOX: i64 = 5;
    pub const ORACLE: i64 = 5;
    pub const RETURN_SHIP: i64 = 5;
    pub const RETURN_CONFIRM: i64 = 5;
}

#[cfg(all(feature = "demo", not(feature = "test-timeouts")))]
mod timeouts {
    pub const PROFILE: &str = "demo";
    pub const SHIP: i64 = 10 * 60;
    pub const UNBOX: i64 = 60 * 60;
    pub const ORACLE: i64 = 10 * 60;
    pub const RETURN_SHIP: i64 = 10 * 60;
    pub const RETURN_CONFIRM: i64 = 10 * 60;
}

#[cfg(not(any(feature = "demo", feature = "test-timeouts")))]
mod timeouts {
    const DAY: i64 = 24 * 60 * 60;
    pub const PROFILE: &str = "prod";
    pub const SHIP: i64 = 3 * DAY;
    pub const UNBOX: i64 = 7 * DAY;
    pub const ORACLE: i64 = DAY;
    pub const RETURN_SHIP: i64 = 3 * DAY;
    pub const RETURN_CONFIRM: i64 = 7 * DAY;
}

pub const TIMEOUT_PROFILE: &str = timeouts::PROFILE;
pub const SHIP_TIMEOUT: i64 = timeouts::SHIP;
pub const UNBOX_TIMEOUT: i64 = timeouts::UNBOX;
pub const ORACLE_TIMEOUT: i64 = timeouts::ORACLE;
pub const RETURN_SHIP_TIMEOUT: i64 = timeouts::RETURN_SHIP;
pub const RETURN_CONFIRM_TIMEOUT: i64 = timeouts::RETURN_CONFIRM;

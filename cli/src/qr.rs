use std::str::FromStr;

use anchor_client::anchor_lang::prelude::Pubkey;
use anyhow::{anyhow, bail, Result};

const SHIP_PREFIX: &str = "UNBOX1";
const RETURN_PREFIX: &str = "UNBOX1R";

/// `UNBOX1:<deal_base58>:<secret_base58>`; 32 bytes in base58 is the pubkey encoding.
pub fn ship_payload(deal: &Pubkey, secret: &[u8; 32]) -> String {
    format!("{SHIP_PREFIX}:{deal}:{}", Pubkey::new_from_array(*secret))
}

pub fn parse_ship(payload: &str) -> Result<(Pubkey, [u8; 32])> {
    let mut parts = payload.trim().split(':');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(SHIP_PREFIX), Some(deal), Some(secret), None) => {
            Ok((Pubkey::from_str(deal)?, Pubkey::from_str(secret)?.to_bytes()))
        }
        (Some(RETURN_PREFIX), ..) => bail!("this is a return QR, not a shipping QR"),
        _ => Err(anyhow!("not an UNBOX1 QR payload")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEAL: &str = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
    const PAYLOAD: &str =
        "UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t";

    #[test]
    fn payload_matches_the_shared_vector() {
        assert_eq!(ship_payload(&Pubkey::from_str(DEAL).unwrap(), &[0xab; 32]), PAYLOAD);
    }

    #[test]
    fn parse_round_trip_and_whitespace() {
        let (deal, secret) = parse_ship(&format!("  {PAYLOAD}\n")).unwrap();
        assert_eq!(deal.to_string(), DEAL);
        assert_eq!(secret, [0xab; 32]);
    }

    #[test]
    fn rejects_return_qr_and_garbage() {
        assert!(parse_ship(&PAYLOAD.replacen("UNBOX1", "UNBOX1R", 1)).unwrap_err().to_string().contains("return"));
        assert!(parse_ship("hello").is_err());
        assert!(parse_ship("UNBOX1:abc:def").is_err());
        assert!(parse_ship(&format!("{PAYLOAD}:extra")).is_err());
    }
}

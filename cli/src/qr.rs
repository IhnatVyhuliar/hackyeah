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

/// `UNBOX1R:<deal_base58>:<secret_base58>`, printed on the return card.
pub fn return_payload(deal: &Pubkey, secret: &[u8; 32]) -> String {
    format!("{RETURN_PREFIX}:{deal}:{}", Pubkey::new_from_array(*secret))
}

pub fn parse_return(payload: &str) -> Result<(Pubkey, [u8; 32])> {
    let mut parts = payload.trim().split(':');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(RETURN_PREFIX), Some(deal), Some(secret), None) => {
            Ok((Pubkey::from_str(deal)?, Pubkey::from_str(secret)?.to_bytes()))
        }
        (Some(SHIP_PREFIX), ..) => bail!("this is a shipping QR, not a return QR"),
        _ => Err(anyhow!("not an UNBOX1R QR payload")),
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

    const RETURN_PAYLOAD: &str =
        "UNBOX1R:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t";
    const RETURN_COMMITMENT: &str = "5e5f3dfadff170096733860b3fb82e2ce226c81a8103a67fc0bb850fff1b649d";

    #[test]
    fn return_payload_and_commitment_match_the_shared_vector() {
        let deal = Pubkey::from_str(DEAL).unwrap();
        assert_eq!(return_payload(&deal, &[0xab; 32]), RETURN_PAYLOAD);
        assert_eq!(hex::encode(unbox_escrow::logic::return_commitment(&deal, &[0xab; 32])), RETURN_COMMITMENT);
    }

    #[test]
    fn parse_return_round_trip_and_rejects_shipping_qr() {
        let (deal, secret) = parse_return(&format!("  {RETURN_PAYLOAD}\n")).unwrap();
        assert_eq!(deal.to_string(), DEAL);
        assert_eq!(secret, [0xab; 32]);
        assert!(parse_return(PAYLOAD).unwrap_err().to_string().contains("shipping"));
        assert!(parse_return("hello").is_err());
        assert!(parse_return(&format!("{RETURN_PAYLOAD}:extra")).is_err());
    }

    #[test]
    fn rejects_return_qr_and_garbage() {
        assert!(parse_ship(&PAYLOAD.replacen("UNBOX1", "UNBOX1R", 1)).unwrap_err().to_string().contains("return"));
        assert!(parse_ship("hello").is_err());
        assert!(parse_ship("UNBOX1:abc:def").is_err());
        assert!(parse_ship(&format!("{PAYLOAD}:extra")).is_err());
    }
}

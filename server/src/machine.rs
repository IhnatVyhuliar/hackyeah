//! Maszyna stanów transakcji, `decide()`, commitmenty QR i hasze dokumentów.
//! Port 1:1 z `@unbox/shared` (dealMachine.ts, helpers.ts). Backend jest źródłem prawdy.

use crate::model::*;
use serde::Serialize;
use sha2::{Digest, Sha256};

// ---------- terminy ----------

#[derive(Clone, Copy, Debug)]
pub struct Timeouts {
    pub paid: i64,
    pub shipped: i64,
    pub disputed: i64,
    pub return_requested: i64,
    pub returning: i64,
}

pub const TIMEOUTS_DEMO: Timeouts =
    Timeouts { paid: 10 * 60, shipped: 60 * 60, disputed: 10 * 60, return_requested: 10 * 60, returning: 10 * 60 };
pub const TIMEOUTS_PROD: Timeouts = Timeouts {
    paid: 3 * 86400,
    shipped: 7 * 86400,
    disputed: 86400,
    return_requested: 3 * 86400,
    returning: 7 * 86400,
};

impl Timeouts {
    pub fn for_status(&self, s: DealStatus) -> Option<i64> {
        match s {
            DealStatus::Paid => Some(self.paid),
            DealStatus::Shipped => Some(self.shipped),
            DealStatus::Disputed => Some(self.disputed),
            DealStatus::ReturnRequested => Some(self.return_requested),
            DealStatus::Returning => Some(self.returning),
            DealStatus::Completed | DealStatus::Refunded => None,
        }
    }
}

pub fn deadline_for(s: DealStatus, changed_at: Unix, t: &Timeouts) -> Option<Unix> {
    t.for_status(s).map(|secs| changed_at + secs)
}

pub fn status_label(s: DealStatus) -> &'static str {
    match s {
        DealStatus::Paid => "Opłacone – czeka na wysyłkę",
        DealStatus::Shipped => "W drodze",
        DealStatus::Disputed => "Reklamacja – trwa ocena",
        DealStatus::ReturnRequested => "Reklamacja uznana – odeślij paczkę",
        DealStatus::Returning => "Zwrot w drodze",
        DealStatus::Completed => "Zakończone – środki u sprzedającego",
        DealStatus::Refunded => "Środki zwrócone kupującemu",
    }
}

// ---------- hasze ----------

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// JSON z kluczami posortowanymi rekurencyjnie, bez spacji (jak `canonicalJson` w shared).
/// serde_json bez `preserve_order` trzyma obiekty w BTreeMap, więc klucze są posortowane.
pub fn canonical_json<T: Serialize>(v: &T) -> String {
    let value = serde_json::to_value(v).expect("serializacja dokumentu");
    serde_json::to_string(&value).expect("serializacja dokumentu")
}

pub fn hash_document<T: Serialize>(v: &T) -> String {
    sha256_hex(canonical_json(v).as_bytes())
}

pub fn is_hex32(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

// ---------- QR ----------
// Sekret: 32 bajty (hex). Commitment wysyłki = sha256(utf8(dealId) || secret),
// zwrotu = sha256(utf8("return") || utf8(dealId) || secret).

fn secret_bytes(secret: &str) -> Option<Vec<u8>> {
    if is_hex32(secret) {
        hex::decode(secret).ok()
    } else {
        None
    }
}

pub fn ship_commitment(deal_id: &str, secret: &str) -> Option<String> {
    let s = secret_bytes(secret)?;
    let mut h = Sha256::new();
    h.update(deal_id.as_bytes());
    h.update(&s);
    Some(hex::encode(h.finalize()))
}

pub fn return_commitment(deal_id: &str, secret: &str) -> Option<String> {
    let s = secret_bytes(secret)?;
    let mut h = Sha256::new();
    h.update(b"return");
    h.update(deal_id.as_bytes());
    h.update(&s);
    Some(hex::encode(h.finalize()))
}

pub fn new_qr_secret() -> String {
    hex::encode(rand::random::<[u8; 32]>())
}

pub fn qr_payload(kind_return: bool, deal_id: &str, secret: &str) -> String {
    format!("{}:{}:{}", if kind_return { "UNBOX1R" } else { "UNBOX1" }, deal_id, secret)
}

// ---------- werdykt (CLAUDE.md §5) ----------

/// Deterministyczny werdykt z raportu. Model AI tylko wypełnia raport.
pub fn decide(r: &OracleReport) -> Verdict {
    let b = &r.buyer_recording;
    let s = &r.seller_recording;
    let buyer_ok =
        b.continuous && b.starts_with_sealed_package && b.qr_revealed_on_opening && b.quality == Quality::Good;
    if !buyer_ok {
        return Verdict::Seller;
    }
    let seller_ok = s.quality == Quality::Good && s.item_clearly_visible && s.qr_card_packed;
    if seller_ok && !r.package_matches_shipping_recording {
        return Verdict::Seller;
    }
    if !r.item_matches_listing || r.undisclosed_damage.present {
        return Verdict::Buyer;
    }
    Verdict::Seller
}

// ---------- maszyna stanów ----------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DealErrorCode {
    Forbidden,
    InvalidState,
    DeadlinePassed,
    DeadlineNotReached,
    QrMismatch,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DealError {
    pub code: DealErrorCode,
    pub message: String,
}

fn fail<T>(code: DealErrorCode, msg: impl Into<String>) -> Result<T, DealError> {
    Err(DealError { code, message: msg.into() })
}

#[derive(Clone, Debug)]
pub enum DealAction {
    Ship {
        actor_id: String,
        qr_commitment: String,
        packing_video_sha256: String,
        tracking_number: String,
    },
    Accept {
        actor_id: String,
        qr_secret: String,
    },
    Dispute {
        actor_id: String,
        qr_secret: String,
        unboxing_video_sha256: String,
        complaint: Complaint,
        complaint_hash: String,
    },
    /// System: wynik `decide()` po analizie.
    Resolve {
        verdict: Verdict,
    },
    Return {
        actor_id: String,
        return_qr_commitment: String,
        return_video_sha256: String,
        return_tracking_number: String,
    },
    ConfirmReturn {
        actor_id: String,
        return_qr_secret: String,
    },
    /// Po terminie; może wywołać każda strona, backend robi to też sam.
    Expire,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaymentEffect {
    Release,
    Refund,
}

pub struct TransitionResult {
    pub deal: Deal,
    pub effect: Option<PaymentEffect>,
    pub event: TimelineEvent,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    Buyer,
    Seller,
}

fn require_status(d: &Deal, ok: &[DealStatus]) -> Result<(), DealError> {
    if ok.contains(&d.status) {
        Ok(())
    } else {
        fail(
            DealErrorCode::InvalidState,
            format!("Transakcja jest w stanie {:?} ({})", d.status, status_label(d.status)),
        )
    }
}

fn require_actor(d: &Deal, actor: &str, role: Role) -> Result<(), DealError> {
    let expected = if role == Role::Buyer { &d.buyer_id } else { &d.seller_id };
    if expected == actor {
        Ok(())
    } else if role == Role::Buyer {
        fail(DealErrorCode::Forbidden, "Tę akcję wykonuje kupujący")
    } else {
        fail(DealErrorCode::Forbidden, "Tę akcję wykonuje sprzedający")
    }
}

fn require_before_deadline(d: &Deal, now: Unix) -> Result<(), DealError> {
    match d.deadline_at {
        Some(dl) if now >= dl => fail(DealErrorCode::DeadlinePassed, "Termin na tę akcję minął"),
        _ => Ok(()),
    }
}

fn move_to(mut d: Deal, status: DealStatus, now: Unix, t: &Timeouts, reason: Option<CloseReason>) -> Deal {
    d.status = status;
    d.status_changed_at = now;
    d.deadline_at = deadline_for(status, now, t);
    if reason.is_some() {
        d.close_reason = reason;
    }
    d
}

/// Ochrona przed podwójnym rozliczeniem: środki można zwolnić albo zwrócić tylko raz.
fn settle(mut d: Deal, effect: PaymentEffect, now: Unix) -> Result<Deal, DealError> {
    if d.payment.status != PaymentStatus::Secured {
        return fail(DealErrorCode::InvalidState, "Płatność jest już rozliczona");
    }
    d.payment.status = match effect {
        PaymentEffect::Release => PaymentStatus::Released,
        PaymentEffect::Refund => PaymentStatus::Refunded,
    };
    d.payment.settled_at = Some(now);
    Ok(d)
}

fn check_ship_qr(d: &Deal, secret: &str) -> Result<(), DealError> {
    match (ship_commitment(&d.id, secret), &d.qr_commitment) {
        (Some(c), Some(expected)) if &c == expected => Ok(()),
        _ => fail(DealErrorCode::QrMismatch, "Kod QR nie pasuje do tej przesyłki"),
    }
}

pub fn transition(deal: &Deal, a: DealAction, now: Unix, t: &Timeouts) -> Result<TransitionResult, DealError> {
    let ev = |kind: &str, label: String| TimelineEvent { at: now, kind: kind.into(), label };
    let d = deal.clone();
    match a {
        DealAction::Ship { actor_id, qr_commitment, packing_video_sha256, tracking_number } => {
            require_actor(&d, &actor_id, Role::Seller)?;
            require_status(&d, &[DealStatus::Paid])?;
            require_before_deadline(&d, now)?;
            let label = format!("Sprzedający nadał paczkę ({tracking_number})");
            let mut d = d;
            d.qr_commitment = Some(qr_commitment);
            d.packing_video_sha256 = Some(packing_video_sha256);
            d.tracking_number = Some(tracking_number);
            let d = move_to(d, DealStatus::Shipped, now, t, None);
            Ok(TransitionResult { deal: d, effect: None, event: ev("shipped", label) })
        }
        DealAction::Accept { actor_id, qr_secret } => {
            require_actor(&d, &actor_id, Role::Buyer)?;
            require_status(&d, &[DealStatus::Shipped])?;
            require_before_deadline(&d, now)?;
            check_ship_qr(&d, &qr_secret)?;
            let d = settle(
                move_to(d, DealStatus::Completed, now, t, Some(CloseReason::Accepted)),
                PaymentEffect::Release,
                now,
            )?;
            Ok(TransitionResult {
                deal: d,
                effect: Some(PaymentEffect::Release),
                event: ev("accepted", "Kupujący potwierdził: wszystko OK. Środki trafiły do sprzedającego".into()),
            })
        }
        DealAction::Dispute { actor_id, qr_secret, unboxing_video_sha256, complaint, complaint_hash } => {
            require_actor(&d, &actor_id, Role::Buyer)?;
            require_status(&d, &[DealStatus::Shipped])?;
            require_before_deadline(&d, now)?;
            check_ship_qr(&d, &qr_secret)?;
            let mut d = d;
            d.unboxing_video_sha256 = Some(unboxing_video_sha256);
            d.complaint = Some(complaint);
            d.complaint_hash = Some(complaint_hash);
            let d = move_to(d, DealStatus::Disputed, now, t, None);
            Ok(TransitionResult {
                deal: d,
                effect: None,
                event: ev("disputed", "Kupujący złożył reklamację z nagraniem otwarcia".into()),
            })
        }
        DealAction::Resolve { verdict } => {
            require_status(&d, &[DealStatus::Disputed])?;
            require_before_deadline(&d, now)?;
            let mut d = d;
            d.verdict = Some(verdict);
            if verdict == Verdict::Seller {
                let d = settle(
                    move_to(d, DealStatus::Completed, now, t, Some(CloseReason::VerdictSeller)),
                    PaymentEffect::Release,
                    now,
                )?;
                return Ok(TransitionResult {
                    deal: d,
                    effect: Some(PaymentEffect::Release),
                    event: ev("resolved_seller", "Reklamacja odrzucona: środki trafiły do sprzedającego".into()),
                });
            }
            let d = move_to(d, DealStatus::ReturnRequested, now, t, None);
            Ok(TransitionResult {
                deal: d,
                effect: None,
                event: ev("resolved_buyer", "Reklamacja uznana: kupujący odsyła paczkę".into()),
            })
        }
        DealAction::Return { actor_id, return_qr_commitment, return_video_sha256, return_tracking_number } => {
            require_actor(&d, &actor_id, Role::Buyer)?;
            require_status(&d, &[DealStatus::ReturnRequested])?;
            require_before_deadline(&d, now)?;
            let label = format!("Kupujący nadał zwrot ({return_tracking_number})");
            let mut d = d;
            d.return_qr_commitment = Some(return_qr_commitment);
            d.return_video_sha256 = Some(return_video_sha256);
            d.return_tracking_number = Some(return_tracking_number);
            let d = move_to(d, DealStatus::Returning, now, t, None);
            Ok(TransitionResult { deal: d, effect: None, event: ev("returned", label) })
        }
        DealAction::ConfirmReturn { actor_id, return_qr_secret } => {
            require_actor(&d, &actor_id, Role::Seller)?;
            require_status(&d, &[DealStatus::Returning])?;
            require_before_deadline(&d, now)?;
            match (return_commitment(&d.id, &return_qr_secret), &d.return_qr_commitment) {
                (Some(c), Some(expected)) if &c == expected => {}
                _ => return fail(DealErrorCode::QrMismatch, "Kod QR zwrotu nie pasuje"),
            }
            let d = settle(
                move_to(d, DealStatus::Refunded, now, t, Some(CloseReason::ReturnConfirmed)),
                PaymentEffect::Refund,
                now,
            )?;
            Ok(TransitionResult {
                deal: d,
                effect: Some(PaymentEffect::Refund),
                event: ev("return_confirmed", "Sprzedający potwierdził zwrot: środki wróciły do kupującego".into()),
            })
        }
        DealAction::Expire => {
            let (to, effect, reason, label) = match d.status {
                DealStatus::Paid => (
                    DealStatus::Refunded,
                    Some(PaymentEffect::Refund),
                    Some(CloseReason::ShipTimeout),
                    "Sprzedający nie nadał paczki w terminie: środki wróciły do kupującego",
                ),
                DealStatus::Shipped => (
                    DealStatus::Completed,
                    Some(PaymentEffect::Release),
                    Some(CloseReason::UnboxTimeout),
                    "Brak decyzji kupującego w terminie: środki trafiły do sprzedającego",
                ),
                DealStatus::Disputed => (
                    DealStatus::ReturnRequested,
                    None,
                    None,
                    "Brak oceny reklamacji w terminie: neutralny zwrot towaru za pieniądze",
                ),
                DealStatus::ReturnRequested => (
                    DealStatus::Completed,
                    Some(PaymentEffect::Release),
                    Some(CloseReason::ReturnShipTimeout),
                    "Kupujący nie odesłał paczki w terminie: środki trafiły do sprzedającego",
                ),
                DealStatus::Returning => (
                    DealStatus::Refunded,
                    Some(PaymentEffect::Refund),
                    Some(CloseReason::ReturnConfirmTimeout),
                    "Sprzedający nie potwierdził zwrotu w terminie: środki wróciły do kupującego",
                ),
                DealStatus::Completed | DealStatus::Refunded => {
                    return fail(DealErrorCode::InvalidState, "Transakcja jest zakończona")
                }
            };
            match d.deadline_at {
                Some(dl) if now >= dl => {}
                _ => return fail(DealErrorCode::DeadlineNotReached, "Termin jeszcze nie minął"),
            }
            let kind = format!("expired_{:?}", deal.status);
            let mut d = move_to(d, to, now, t, reason);
            if let Some(e) = effect {
                d = settle(d, e, now)?;
            }
            Ok(TransitionResult { deal: d, effect, event: ev(&kind, label.into()) })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEAL: &str = "d-kurtka-levis";
    fn secret() -> String {
        "ab".repeat(32)
    }

    #[test]
    fn qr_vectors_match_shared() {
        // Te same wektory co w packages/shared (policzone niezależnie przez node:crypto).
        assert_eq!(
            ship_commitment(DEAL, &secret()).unwrap(),
            "a080df4ce1bcc2666d4739386680f9800d7ddf174132315fdceea3926ce7f8d3"
        );
        assert_eq!(
            return_commitment(DEAL, &secret()).unwrap(),
            "b7b9609665ba619c3f68f4771997f96fc624a6b83b547655cf46e80152d93bd0"
        );
        assert_eq!(qr_payload(false, DEAL, &secret()), format!("UNBOX1:{DEAL}:{}", secret()));
        assert!(ship_commitment(DEAL, "AB").is_none());
        let s = new_qr_secret();
        assert!(is_hex32(&s));
        assert_ne!(ship_commitment(DEAL, &s), return_commitment(DEAL, &s));
    }

    #[test]
    fn canonical_json_sorts_keys() {
        let v = serde_json::json!({"b":1,"a":{"d":[2,{"y":1,"x":0}],"c":"ł"}});
        assert_eq!(canonical_json(&v), r#"{"a":{"c":"ł","d":[2,{"x":0,"y":1}]},"b":1}"#);
    }

    fn good() -> OracleReport {
        OracleReport {
            buyer_recording: BuyerRecording {
                continuous: true,
                starts_with_sealed_package: true,
                qr_revealed_on_opening: true,
                quality: Quality::Good,
                notes: String::new(),
            },
            seller_recording: SellerRecording {
                item_clearly_visible: true,
                qr_card_packed: true,
                package_sealed_and_labeled: true,
                quality: Quality::Good,
                notes: String::new(),
            },
            package_matches_shipping_recording: true,
            item_matches_listing: true,
            undisclosed_damage: UndisclosedDamage { present: false, description: String::new(), timestamps: vec![] },
            reasoning: String::new(),
        }
    }

    #[test]
    fn decide_cases() {
        assert_eq!(decide(&good()), Verdict::Seller);
        let mut r = good();
        r.undisclosed_damage.present = true;
        assert_eq!(decide(&r), Verdict::Buyer);
        let mut r = good();
        r.item_matches_listing = false;
        assert_eq!(decide(&r), Verdict::Buyer);
        let mut r = good();
        r.package_matches_shipping_recording = false;
        r.item_matches_listing = false;
        assert_eq!(decide(&r), Verdict::Seller);
        let mut r = good();
        r.buyer_recording.continuous = false;
        r.undisclosed_damage.present = true;
        assert_eq!(decide(&r), Verdict::Seller);
        let mut r = good();
        r.seller_recording.quality = Quality::Poor;
        r.package_matches_shipping_recording = false;
        r.item_matches_listing = false;
        assert_eq!(decide(&r), Verdict::Buyer);
    }

    const T0: i64 = 1_000_000;
    fn paid() -> Deal {
        Deal {
            id: DEAL.into(),
            listing: ListingMetadata {
                v: 1,
                title: "Kurtka".into(),
                description: String::new(),
                brand: String::new(),
                size: "M".into(),
                condition: Condition::Dobry,
                defects: vec![],
                photos: vec![],
                price_minor: 12000,
                currency: "PLN".into(),
            },
            listing_hash: "0".repeat(64),
            seller_id: "S".into(),
            seller: Party { id: "S".into(), name: "S".into() },
            buyer_id: "B".into(),
            buyer: Party { id: "B".into(), name: "B".into() },
            status: DealStatus::Paid,
            status_changed_at: T0,
            deadline_at: Some(T0 + TIMEOUTS_DEMO.paid),
            payment: Payment {
                status: PaymentStatus::Secured,
                amount_minor: 12000,
                currency: "PLN".into(),
                secured_at: T0,
                settled_at: None,
            },
            qr_commitment: None,
            packing_video_sha256: None,
            tracking_number: None,
            unboxing_video_sha256: None,
            complaint: None,
            complaint_hash: None,
            analysis: None,
            verdict: None,
            return_qr_commitment: None,
            return_video_sha256: None,
            return_tracking_number: None,
            close_reason: None,
            timeline: vec![],
            created_at: T0,
            onchain: None,
        }
    }
    fn run(d: &Deal, a: DealAction, now: i64) -> Result<TransitionResult, DealError> {
        transition(d, a, now, &TIMEOUTS_DEMO)
    }
    fn ship(actor: &str) -> DealAction {
        DealAction::Ship {
            actor_id: actor.into(),
            qr_commitment: ship_commitment(DEAL, &secret()).unwrap(),
            packing_video_sha256: "c".repeat(64),
            tracking_number: "INP123".into(),
        }
    }
    fn code(r: Result<TransitionResult, DealError>) -> Option<DealErrorCode> {
        r.err().map(|e| e.code)
    }

    #[test]
    fn happy_path_and_negatives() {
        let s = run(&paid(), ship("S"), T0 + 1).unwrap().deal;
        assert_eq!(s.status, DealStatus::Shipped);
        assert_eq!(s.deadline_at, Some(T0 + 1 + TIMEOUTS_DEMO.shipped));
        assert_eq!(code(run(&paid(), ship("B"), T0)), Some(DealErrorCode::Forbidden));
        assert_eq!(code(run(&paid(), ship("S"), T0 + TIMEOUTS_DEMO.paid)), Some(DealErrorCode::DeadlinePassed));
        let bad = DealAction::Accept { actor_id: "B".into(), qr_secret: "ff".repeat(32) };
        assert_eq!(code(run(&s, bad, T0)), Some(DealErrorCode::QrMismatch));
        assert_eq!(
            code(run(&s, DealAction::Resolve { verdict: Verdict::Seller }, T0)),
            Some(DealErrorCode::InvalidState)
        );
        assert_eq!(
            code(run(&s, DealAction::Expire, T0 + 1 + TIMEOUTS_DEMO.shipped - 1)),
            Some(DealErrorCode::DeadlineNotReached)
        );
        let ok = DealAction::Accept { actor_id: "B".into(), qr_secret: secret() };
        let done = run(&s, ok.clone(), T0 + 2).unwrap();
        assert_eq!(done.effect, Some(PaymentEffect::Release));
        assert_eq!(done.deal.status, DealStatus::Completed);
        assert_eq!(done.deal.payment.status, PaymentStatus::Released);
        assert_eq!(code(run(&done.deal, ok, T0 + 3)), Some(DealErrorCode::InvalidState));
        assert_eq!(code(run(&done.deal, DealAction::Expire, T0 + 1_000_000)), Some(DealErrorCode::InvalidState));
        // nawet przy niespójnym statusie płatności nie da się rozliczyć drugi raz
        let mut broken = done.deal.clone();
        broken.status = DealStatus::Shipped;
        broken.deadline_at = Some(T0);
        assert_eq!(code(run(&broken, DealAction::Expire, T0)), Some(DealErrorCode::InvalidState));
    }

    #[test]
    fn dispute_return_and_timeouts() {
        let s = run(&paid(), ship("S"), T0).unwrap().deal;
        let complaint =
            Complaint { v: 1, category: ComplaintCategory::Damaged, description: "plama".into(), created_at: T0 };
        let dispute = DealAction::Dispute {
            actor_id: "B".into(),
            qr_secret: secret(),
            unboxing_video_sha256: "c".repeat(64),
            complaint,
            complaint_hash: "c".repeat(64),
        };
        let d = run(&s, dispute, T0).unwrap().deal;
        assert_eq!(d.status, DealStatus::Disputed);
        let exp = |d: &Deal| run(d, DealAction::Expire, d.deadline_at.unwrap()).unwrap().deal;
        let rr = exp(&d);
        assert_eq!((rr.status, rr.payment.status), (DealStatus::ReturnRequested, PaymentStatus::Secured));
        assert_eq!(exp(&rr).close_reason, Some(CloseReason::ReturnShipTimeout));
        assert_eq!(exp(&paid()).close_reason, Some(CloseReason::ShipTimeout));
        assert_eq!(exp(&s).close_reason, Some(CloseReason::UnboxTimeout));
        let b = run(&d, DealAction::Resolve { verdict: Verdict::Buyer }, T0 + 1).unwrap().deal;
        let ret = DealAction::Return {
            actor_id: "B".into(),
            return_qr_commitment: return_commitment(DEAL, &secret()).unwrap(),
            return_video_sha256: "c".repeat(64),
            return_tracking_number: "INP9".into(),
        };
        let returning = run(&b, ret, T0 + 2).unwrap().deal;
        assert_eq!(exp(&returning).close_reason, Some(CloseReason::ReturnConfirmTimeout));
        let confirm = DealAction::ConfirmReturn { actor_id: "S".into(), return_qr_secret: secret() };
        let r = run(&returning, confirm, T0 + 3).unwrap();
        assert_eq!((r.deal.status, r.effect), (DealStatus::Refunded, Some(PaymentEffect::Refund)));
    }
}

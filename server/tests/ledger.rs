//! Księga płatności: niezmienniki sum i odporność na równoległe żądania.
mod common;

use common::*;
use serde_json::json;
use unbox_server::machine::TIMEOUTS_DEMO;
use unbox_server::model::{CloseReason, DealStatus, PaymentStatus};

/// Suma środków w systemie (salda + zabezpieczone) jest stała, held = suma aktywnych zakupów, brak debetu.
async fn assert_invariant(parties: &[&Api]) {
    let mut total = 0;
    let mut held = 0;
    let mut secured = 0;
    for p in parties {
        let w = p.wallet().await;
        let bal = w["balanceMinor"].as_i64().unwrap();
        assert!(bal >= 0, "ujemne saldo");
        total += bal + w["heldMinor"].as_i64().unwrap();
        held += w["heldMinor"].as_i64().unwrap();
        secured += p
            .deals("buyer")
            .await
            .iter()
            .filter(|d| d.payment.status == PaymentStatus::Secured)
            .map(|d| d.payment.amount_minor)
            .sum::<i64>();
    }
    assert_eq!(total, parties.len() as i64 * DEMO_START, "środki nie znikają i nie powstają");
    assert_eq!(held, secured, "held = suma cen aktywnych zakupów");
}

#[tokio::test(flavor = "multi_thread")]
async fn invariants_across_full_flows() {
    let be = Backend::start(&[]).await;
    let (s, b, c) =
        (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await, be.login("celina@demo.pl").await);
    let all = [&s, &b, &c];
    assert_invariant(&all).await;
    let b0 = b.balance().await;

    // happy path; zakup blokuje dokładnie cenę
    let (deal, secret) = shipped(&s, &b, 1234).await;
    let w = b.wallet().await;
    assert_eq!((w["balanceMinor"].as_i64(), w["heldMinor"].as_i64()), (Some(b0 - 1234), Some(1234)));
    assert_invariant(&all).await;
    assert_eq!(accept(&b, &deal.id, &secret).await.0.as_u16(), 200);
    assert_invariant(&all).await;

    // spór → BUYER → zwrot → Refunded
    let (d2, secret2) = shipped(&s, &b, 2000).await;
    assert_eq!(dispute(&b, &d2.id, &secret2, "plama", Some("defect")).await.0.as_u16(), 200);
    assert_invariant(&all).await;
    wait_deal(&b, &d2.id, |d| d.status == DealStatus::ReturnRequested).await;
    let ret = mark_returned(&b, &d2.id).await;
    assert_eq!(confirm_return(&s, &d2.id, &ret).await.0.as_u16(), 200);
    assert_invariant(&all).await;

    // timeout nadania → zwrot
    let l = listing(&s, 777).await;
    let d3 = purchase(&c, &l).await;
    assert_invariant(&all).await;
    be.advance(TIMEOUTS_DEMO.paid).await;
    let d3 = c.deal(&d3.id).await;
    assert_eq!((d3.status, d3.payment.status), (DealStatus::Refunded, PaymentStatus::Refunded));
    assert_eq!(d3.close_reason, Some(CloseReason::ShipTimeout));
    assert_invariant(&all).await;
    assert_eq!(b.balance().await, b0 - 1234, "zapłacił tylko za przyjęty przedmiot");
}

#[tokio::test(flavor = "multi_thread")]
async fn no_overdraft_even_concurrently() {
    let be = Backend::start(&[]).await;
    let (s, c) = (be.login("ania@demo.pl").await, be.login("celina@demo.pl").await);
    let free = c.balance().await;
    let big = free * 6 / 10;
    let (l1, l2) = (listing(&s, big).await, listing(&s, big).await);
    let (p1, p2) = (format!("/api/listings/{l1}/purchase"), format!("/api/listings/{l2}/purchase"));
    let (r1, r2) = tokio::join!(c.post(&p1, json!({})), c.post(&p2, json!({})));
    let mut codes = vec![ok_code(&r1), ok_code(&r2)];
    codes.sort();
    assert_eq!(codes, ["INSUFFICIENT_FUNDS", "OK"]);
    assert_eq!(c.balance().await, free - big);
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_purchase_of_same_listing() {
    let be = Backend::start(&[]).await;
    let (s, b, c) =
        (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await, be.login("celina@demo.pl").await);
    let l = listing(&s, 500).await;
    let (bw, cw) = (b.balance().await, c.balance().await);
    let path = format!("/api/listings/{l}/purchase");
    let (r1, r2, r3) = tokio::join!(b.post(&path, json!({})), c.post(&path, json!({})), b.post(&path, json!({})));
    let codes = [ok_code(&r1), ok_code(&r2), ok_code(&r3)];
    assert_eq!(codes.iter().filter(|x| *x == "OK").count(), 1, "{codes:?}");
    assert!(codes.iter().filter(|x| *x != "OK").all(|x| x == "INVALID_STATE"), "{codes:?}");
    let spent = (bw - b.balance().await) + (cw - c.balance().await);
    assert_eq!(spent, 500);
    assert_invariant(&[&s, &b, &c]).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_settlements_happen_once() {
    let be = Backend::start(&[]).await;
    let (s, b, c) =
        (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await, be.login("celina@demo.pl").await);
    let s0 = s.balance().await;

    // accept ×2
    let (d, secret) = shipped(&s, &b, 300).await;
    let (r1, r2) = tokio::join!(accept(&b, &d.id, &secret), accept(&b, &d.id, &secret));
    let mut codes = vec![ok_code(&r1), ok_code(&r2)];
    codes.sort();
    assert_eq!(codes, ["INVALID_STATE", "OK"]);

    // settle ×2 po terminie
    let (d, _) = shipped(&s, &b, 400).await;
    be.advance(TIMEOUTS_DEMO.shipped).await;
    let path = format!("/api/deals/{}/settle", d.id);
    let (r1, r2) = tokio::join!(b.post(&path, json!({})), s.post(&path, json!({})));
    let mut codes = vec![ok_code(&r1), ok_code(&r2)];
    codes.sort();
    assert_eq!(codes, ["INVALID_STATE", "OK"]);

    // termin minął dokładnie teraz: „Wszystko OK” i domknięcie naraz → jeden wynik
    let (d, secret) = shipped(&s, &b, 500).await;
    be.advance(TIMEOUTS_DEMO.shipped).await;
    let settle_path = format!("/api/deals/{}/settle", d.id);
    let (r1, r2) = tokio::join!(accept(&b, &d.id, &secret), s.post(&settle_path, json!({})));
    // Po terminie każde żądanie najpierw domyka transakcję (settle_expired), więc może się zdarzyć, że oba
    // dostaną 409; niezmiennik to co najwyżej jedno OK i dokładnie jedno rozliczenie (asercje niżej).
    assert!([ok_code(&r1), ok_code(&r2)].iter().filter(|x| *x == "OK").count() <= 1);
    let fin = b.deal(&d.id).await;
    assert_eq!((fin.status, fin.payment.status), (DealStatus::Completed, PaymentStatus::Released));
    assert_eq!(s.balance().await, s0 + 300 + 400 + 500, "każda wypłata dokładnie raz");

    // confirm-return ×2
    let (d, secret) = shipped(&s, &b, 600).await;
    assert_eq!(dispute(&b, &d.id, &secret, "plama", Some("defect")).await.0.as_u16(), 200);
    wait_deal(&b, &d.id, |x| x.status == DealStatus::ReturnRequested).await;
    let ret = mark_returned(&b, &d.id).await;
    let b0 = b.balance().await;
    let (r1, r2) = tokio::join!(confirm_return(&s, &d.id, &ret), confirm_return(&s, &d.id, &ret));
    let mut codes = vec![ok_code(&r1), ok_code(&r2)];
    codes.sort();
    assert_eq!(codes, ["INVALID_STATE", "OK"]);
    assert_eq!(b.balance().await, b0 + 600, "zwrot dokładnie raz");
    assert_invariant(&[&s, &b, &c]).await;
}

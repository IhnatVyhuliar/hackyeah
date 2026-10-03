//! Typy API. Kształt JSON 1:1 z `@unbox/shared` (types.ts / schemas.ts).

use serde::{Deserialize, Serialize};

pub type Unix = i64;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub created_at: Unix,
    /// Solana wallet (base58) linked by the app; PAYMENTS=solana maps on-chain parties to users with it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_address: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Category {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub icon: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Condition {
    Nowy,
    JakNowy,
    Dobry,
    WidoczneSlady,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Photo {
    pub url: String,
    pub sha256: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Party {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListingStatus {
    Listed,
    Sold,
    Cancelled,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub id: String,
    pub seller_id: String,
    pub seller: Party,
    pub title: String,
    pub description: String,
    pub category_id: String,
    pub condition: Condition,
    pub brand: String,
    pub size: String,
    pub defects: Vec<String>,
    pub photos: Vec<Photo>,
    pub price_minor: i64,
    pub currency: String,
    pub status: ListingStatus,
    pub created_at: Unix,
    pub updated_at: Unix,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onchain: Option<OnChainListing>,
}

/// Treść ogłoszenia zamrożona przy zakupie; `listingHash` = sha256(canonicalJson(ListingMetadata)).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListingMetadata {
    pub v: u8,
    pub title: String,
    pub description: String,
    pub brand: String,
    pub size: String,
    pub condition: Condition,
    pub defects: Vec<String>,
    pub photos: Vec<Photo>,
    pub price_minor: i64,
    pub currency: String,
}

impl ListingMetadata {
    pub fn of(l: &Listing) -> Self {
        Self {
            v: 1,
            title: l.title.clone(),
            description: l.description.clone(),
            brand: l.brand.clone(),
            size: l.size.clone(),
            condition: l.condition,
            defects: l.defects.clone(),
            photos: l.photos.clone(),
            price_minor: l.price_minor,
            currency: l.currency.clone(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum DealStatus {
    Paid,
    Shipped,
    Disputed,
    ReturnRequested,
    Returning,
    Completed,
    Refunded,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PaymentStatus {
    Secured,
    Released,
    Refunded,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub status: PaymentStatus,
    pub amount_minor: i64,
    pub currency: String,
    pub secured_at: Unix,
    pub settled_at: Option<Unix>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ComplaintCategory {
    Damaged,
    NotAsDescribed,
    WrongItem,
    MissingItem,
    Other,
}

/// `complaint.json` — pola snake_case jak w kontrakcie.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Complaint {
    pub v: u8,
    pub category: ComplaintCategory,
    pub description: String,
    pub created_at: Unix,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    Good,
    Poor,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BuyerRecording {
    pub continuous: bool,
    pub starts_with_sealed_package: bool,
    pub qr_revealed_on_opening: bool,
    pub quality: Quality,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SellerRecording {
    pub item_clearly_visible: bool,
    pub qr_card_packed: bool,
    pub package_sealed_and_labeled: bool,
    pub quality: Quality,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct UndisclosedDamage {
    pub present: bool,
    pub description: String,
    pub timestamps: Vec<String>,
}

/// Raport wyroczni (CLAUDE.md §5). Model wypełnia pola; werdykt liczy `decide()`.
/// Nieznane pola (np. podsunięty "verdict") są ignorowane.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OracleReport {
    pub buyer_recording: BuyerRecording,
    pub seller_recording: SellerRecording,
    pub package_matches_shipping_recording: bool,
    pub item_matches_listing: bool,
    pub undisclosed_damage: UndisclosedDamage,
    pub reasoning: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Verdict {
    Seller,
    Buyer,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisStatus {
    Pending,
    Done,
    Failed,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub status: AnalysisStatus,
    pub attempts: u32,
    pub error: Option<String>,
    pub report: Option<OracleReport>,
    pub report_hash: Option<String>,
    pub model: Option<String>,
    pub prompt_version: Option<String>,
    pub verdict: Option<Verdict>,
    pub updated_at: Unix,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseReason {
    Accepted,
    VerdictSeller,
    ReturnConfirmed,
    ShipTimeout,
    UnboxTimeout,
    ReturnShipTimeout,
    ReturnConfirmTimeout,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TimelineEvent {
    pub at: Unix,
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Deal {
    pub id: String,
    pub listing: ListingMetadata,
    pub listing_hash: String,
    pub seller_id: String,
    pub seller: Party,
    pub buyer_id: String,
    pub buyer: Party,
    pub status: DealStatus,
    pub status_changed_at: Unix,
    pub deadline_at: Option<Unix>,
    pub payment: Payment,
    pub qr_commitment: Option<String>,
    pub packing_video_sha256: Option<String>,
    pub tracking_number: Option<String>,
    pub unboxing_video_sha256: Option<String>,
    pub complaint: Option<Complaint>,
    pub complaint_hash: Option<String>,
    pub analysis: Option<Analysis>,
    pub verdict: Option<Verdict>,
    pub return_qr_commitment: Option<String>,
    pub return_video_sha256: Option<String>,
    pub return_tracking_number: Option<String>,
    pub close_reason: Option<CloseReason>,
    pub timeline: Vec<TimelineEvent>,
    pub created_at: Unix,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onchain: Option<OnChainDeal>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaUpload {
    pub sha256: String,
    pub url: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LedgerType {
    Topup,
    Secure,
    Release,
    Refund,
}

impl LedgerType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Topup => "topup",
            Self::Secure => "secure",
            Self::Release => "release",
            Self::Refund => "refund",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "topup" => Self::Topup,
            "secure" => Self::Secure,
            "release" => Self::Release,
            "refund" => Self::Refund,
            _ => return None,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub id: String,
    pub deal_id: Option<String>,
    #[serde(rename = "type")]
    pub kind: LedgerType,
    pub amount_minor: i64,
    pub at: Unix,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    pub balance_minor: i64,
    pub currency: String,
    pub held_minor: i64,
    pub ledger: Vec<LedgerEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}

/// Odpowiedź wyroczni: raport + metadane + hasze ocenionych plików. Bez werdyktu.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OracleResponse {
    pub report: OracleReport,
    pub model: String,
    pub prompt_version: String,
    pub evidence: OracleEvidence,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OracleEvidence {
    pub packing_video_sha256: String,
    pub unboxing_video_sha256: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EvidenceFile {
    pub url: String,
    pub sha256: String,
}

/// Żądanie do wyroczni: `POST {AI_URL}/v1/disputes/analyze`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OracleRequest {
    pub deal_id: String,
    pub listing: ListingMetadata,
    pub listing_hash: String,
    pub tracking_number: Option<String>,
    pub packing_video: EvidenceFile,
    pub unboxing_video: EvidenceFile,
    pub complaint: Complaint,
}

/// A listing published to the unbox_escrow program (PAYMENTS=solana). From here on its content is frozen.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OnChainListing {
    /// Deal PDA (base58) = ["deal", seller_wallet, deal_id.to_le_bytes()].
    pub deal: String,
    pub deal_id: u64,
    pub seller_wallet: String,
    /// sha256(canonicalJson(ListingMetadata)), the same bytes as served at `metadata_uri`.
    pub listing_hash: String,
    pub metadata_uri: String,
    /// The Deal account exists on-chain with this hash (seen by the webhook or the poller).
    pub published: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OnChainDeal {
    pub deal: String,
    pub seller_wallet: String,
    pub buyer_wallet: String,
    pub price_lamports: u64,
    /// One entry per observed status change, with the Explorer link.
    pub transactions: Vec<ChainTx>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChainTx {
    pub status: DealStatus,
    pub at: Unix,
    pub signature: Option<String>,
    pub explorer_url: Option<String>,
}

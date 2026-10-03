use anchor_lang::prelude::*;

#[error_code]
pub enum UnboxError {
    #[msg("Action not allowed in the current status")]
    InvalidStatus,
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Buyer and seller must be different")]
    SameParty,
    #[msg("Listing hash does not match")]
    ListingHashMismatch,
    #[msg("Arbiter does not match")]
    ArbiterMismatch,
    #[msg("QR secret does not match the commitment")]
    QrMismatch,
    #[msg("Verdict must be Seller or Buyer")]
    InvalidVerdict,
    #[msg("Text is too long")]
    StringTooLong,
    #[msg("Text must not be empty")]
    EmptyText,
    #[msg("Hash must not be empty")]
    EmptyHash,
    #[msg("Not implemented yet")]
    NotImplemented,
}

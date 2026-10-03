mod qr;

use std::rc::Rc;
use std::str::FromStr;

use anchor_client::anchor_lang::prelude::Pubkey;
use anchor_client::anchor_lang::system_program;
use anchor_client::{Client, Cluster, CommitmentConfig, Program, Signer};
use anyhow::{anyhow, ensure, Context, Result};
use clap::{Parser, Subcommand};
use reqwest::blocking::{Client as Http, RequestBuilder};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use solana_keypair::{read_keypair_file, Keypair};
use unbox_escrow::logic::ship_commitment;
use unbox_escrow::state::Deal;
use unbox_escrow::{accounts, instruction};

#[derive(Parser)]
#[command(name = "unbox-cli", about = "Drive the SOL escrow flow without a phone (devnet/localnet only)")]
struct Cli {
    #[arg(long, env = "RPC_URL", default_value = "https://api.devnet.solana.com")]
    rpc: String,
    #[arg(long, env = "API_URL", default_value = "http://localhost:4000")]
    api: String,
    /// Keypair file of whoever signs: the seller, the buyer, or anyone for `settle`.
    #[arg(long, env = "KEYPAIR")]
    keypair: String,
    /// Account in server/ (demo: ania@demo.pl sells, bartek@demo.pl buys).
    #[arg(long, env = "EMAIL")]
    email: String,
    #[arg(long, env = "PASSWORD", default_value = "demo1234")]
    password: String,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Link this keypair's address to the account (PUT /api/me/wallet-address).
    Link,
    /// Seller: publish a listing and sign create_listing.
    Publish {
        #[arg(long)]
        listing: String,
    },
    /// Buyer: verify the description hash, then pay into escrow (purchase).
    Buy {
        #[arg(long)]
        listing: String,
    },
    /// Seller: mark shipped; prints the QR payload for the card. Hashes the video, does not upload it.
    Ship {
        #[arg(long)]
        listing: String,
        #[arg(long)]
        tracking: String,
        #[arg(long)]
        video: String,
    },
    /// Buyer: "Wszystko OK" with the scanned QR payload (accept_delivery).
    Accept {
        #[arg(long)]
        qr: String,
    },
    /// Anyone: close a deal after its deadline (settle_expired).
    Settle {
        #[arg(long)]
        listing: String,
    },
    /// Print the server's view of a deal (you must be a party).
    Show {
        #[arg(long)]
        listing: String,
    },
}

type Prog = Program<Rc<Keypair>>;

struct Api {
    http: Http,
    base: String,
    token: String,
}

fn send(req: RequestBuilder) -> Result<Value> {
    let res = req.send()?;
    let status = res.status();
    let body: Value = res.json().unwrap_or(Value::Null);
    ensure!(status.is_success(), "HTTP {status}: {body}");
    Ok(body)
}

impl Api {
    fn login(base: &str, email: &str, password: &str) -> Result<Api> {
        let http = Http::new();
        let v =
            send(http.post(format!("{base}/api/auth/login")).json(&json!({ "email": email, "password": password })))?;
        let token = v["token"].as_str().context("login without token")?.to_string();
        Ok(Api { http, base: base.to_string(), token })
    }

    fn get(&self, path: &str) -> Result<Value> {
        send(self.http.get(format!("{}{path}", self.base)).bearer_auth(&self.token))
    }

    fn post(&self, path: &str) -> Result<Value> {
        send(self.http.post(format!("{}{path}", self.base)).bearer_auth(&self.token))
    }

    fn put(&self, path: &str, body: Value) -> Result<Value> {
        send(self.http.put(format!("{}{path}", self.base)).bearer_auth(&self.token).json(&body))
    }

    fn deal_of(&self, listing: &str) -> Result<Pubkey> {
        let l = self.get(&format!("/api/listings/{listing}"))?;
        let deal = l["onchain"]["deal"].as_str().context("listing is not published on-chain (run publish first)")?;
        Ok(Pubkey::from_str(deal)?)
    }
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

fn ws_url(rpc: &str) -> String {
    rpc.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1)
}

/// Fetches metadata.json and checks it against the on-chain hash; the server is not trusted for this.
fn verified_metadata(http: &Http, uri: &str, expected: &[u8; 32]) -> Result<String> {
    let bytes = http.get(uri).send()?.error_for_status()?.bytes()?;
    ensure!(sha256(&bytes) == *expected, "metadata.json at {uri} does not match listing_hash");
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn report(cli: &Cli, api: &Api, deal: &Pubkey, signature: &str) -> Result<()> {
    let cluster =
        if cli.rpc.contains("devnet") { "devnet".to_string() } else { format!("custom&customUrl={}", cli.rpc) };
    println!("deal:     {deal}");
    println!("tx:       https://explorer.solana.com/tx/{signature}?cluster={cluster}");
    match api.post(&format!("/api/chain/sync/{deal}")) {
        Ok(v) => println!("server:   {v}"),
        Err(e) => eprintln!("warning: server sync failed ({e}); the transaction is confirmed anyway"),
    }
    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let payer =
        Rc::new(read_keypair_file(&cli.keypair).map_err(|e| anyhow!("cannot read keypair {}: {e}", cli.keypair))?);
    let me = payer.pubkey();
    let client = Client::new_with_options(
        Cluster::Custom(cli.rpc.clone(), ws_url(&cli.rpc)),
        payer,
        CommitmentConfig::confirmed(),
    );
    let program: Prog = client.program(unbox_escrow::ID)?;
    let api = Api::login(&cli.api, &cli.email, &cli.password)?;

    match &cli.cmd {
        Cmd::Link => {
            let user = api.put("/api/me/wallet-address", json!({ "address": me.to_string() }))?;
            println!("linked {} to {}", me, user["email"]);
            Ok(())
        }
        Cmd::Publish { listing } => {
            let p = api.post(&format!("/api/listings/{listing}/publish"))?;
            let deal = Pubkey::from_str(p["deal"].as_str().context("deal")?)?;
            let listing_hash: [u8; 32] = hex::decode(p["listingHash"].as_str().context("listingHash")?)?
                .try_into()
                .map_err(|_| anyhow!("listingHash is not 32 bytes"))?;
            let metadata_uri = p["metadataUri"].as_str().context("metadataUri")?.to_string();
            verified_metadata(&api.http, &metadata_uri, &listing_hash)?;
            let signature = program
                .request()
                .accounts(accounts::CreateListing { seller: me, deal, system_program: system_program::ID })
                .args(instruction::CreateListing {
                    deal_id: p["dealId"].as_u64().context("dealId")?,
                    price_lamports: p["priceLamports"].as_u64().context("priceLamports")?,
                    listing_hash,
                    metadata_uri,
                    arbiter: Pubkey::from_str(p["arbiter"].as_str().context("arbiter")?)?,
                })
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Buy { listing } => {
            let deal = api.deal_of(listing)?;
            let account: Deal = program.account(deal)?;
            println!("{}", verified_metadata(&api.http, &account.metadata_uri, &account.listing_hash)?);
            println!("price:    {} lamports, arbiter {}", account.price_lamports, account.arbiter);
            let signature = program
                .request()
                .accounts(accounts::Purchase { buyer: me, deal, system_program: system_program::ID })
                .args(instruction::Purchase {
                    expected_listing_hash: account.listing_hash,
                    expected_arbiter: account.arbiter,
                })
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Ship { listing, tracking, video } => {
            let deal = api.deal_of(listing)?;
            let mut secret = [0u8; 32];
            getrandom::fill(&mut secret).map_err(|e| anyhow!("random: {e}"))?;
            let video_hash = sha256(&std::fs::read(video).with_context(|| format!("read {video}"))?);
            let signature = program
                .request()
                .accounts(accounts::MarkShipped { seller: me, deal })
                .args(instruction::MarkShipped {
                    qr_commitment: ship_commitment(&deal, &secret),
                    packing_video_hash: video_hash,
                    tracking_number: tracking.clone(),
                })
                .send()?;
            println!("QR:       {}", qr::ship_payload(&deal, &secret));
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Accept { qr } => {
            let (deal, secret) = qr::parse_ship(qr)?;
            let account: Deal = program.account(deal)?;
            let signature = program
                .request()
                .accounts(accounts::AcceptDelivery { buyer: me, deal, seller: account.seller })
                .args(instruction::AcceptDelivery { qr_secret: secret })
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Settle { listing } => {
            let deal = api.deal_of(listing)?;
            let account: Deal = program.account(deal)?;
            let signature = program
                .request()
                .accounts(accounts::SettleExpired { caller: me, deal, seller: account.seller, buyer: account.buyer })
                .args(instruction::SettleExpired {})
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Show { listing } => {
            println!("{}", serde_json::to_string_pretty(&api.get(&format!("/api/deals/{listing}"))?)?);
            Ok(())
        }
    }
}

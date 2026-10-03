# Devnet: klucze, adresy, zużyte plomby

Klucze prywatne leżą w `scripts/keys/` (gitignored). Tutaj tylko adresy publiczne.

```bash
mkdir -p scripts/keys
for k in verifier treasury fee-wallet demo-buyer demo-seller; do
  solana-keygen new --no-bip39-passphrase -o scripts/keys/$k.json
done
for k in scripts/keys/*.json; do echo "$k $(solana-keygen pubkey $k)"; done
```

| Rola | Plik | Pubkey | Komu przekazać |
|---|---|---|---|
| weryfikator (`VERIFIER_SECRET_KEY`) | `verifier.json` | _do uzupełnienia_ | O2 (`initialize_config`) |
| skarbiec (`TREASURY_SECRET_KEY`) | `treasury.json` | _do uzupełnienia_ | — |
| `fee_wallet` | `fee-wallet.json` | _do uzupełnienia_ | O2 (`initialize_config`) |
| kupujący demo (Bartek) | `demo-buyer.json` | _do uzupełnienia_ | O1 (`users.json`) |
| sprzedająca demo (Ania) | `demo-seller.json` | _do uzupełnienia_ | O1 (`users.json`) |

`PROGRAM_ID`: _z KONTRAKT §5_ · `RPC_URL`: _Helius/QuickNode, przekazany na kanale zespołu_

Zasilanie: faucet.solana.com (logowanie GitHub) → skarbiec, potem `solana transfer --allow-unfunded-recipient <adres> 1`.
Nie robimy airdropów w czasie demo.

## Zużyte plomby (escrow dla danego `orderId` można założyć tylko raz)

| # | orderId | użyta (kiedy, do czego) |
|---|---|---|
| 01 | `5e115e11-de00-4000-8000-000000000001` | |
| 02 | `5e115e11-de00-4000-8000-000000000002` | |
| 03 | `5e115e11-de00-4000-8000-000000000003` | |
| 04 | `5e115e11-de00-4000-8000-000000000004` | |
| 05 | `5e115e11-de00-4000-8000-000000000005` | |
| 06 | `5e115e11-de00-4000-8000-000000000006` | |
| 07 | `5e115e11-de00-4000-8000-000000000007` | |
| 08 | `5e115e11-de00-4000-8000-000000000008` | |
| 09 | `5e115e11-de00-4000-8000-000000000009` | |
| 10 | `5e115e11-de00-4000-8000-000000000010` | |

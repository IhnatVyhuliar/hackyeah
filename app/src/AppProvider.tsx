// @ts-nocheck
// View engine: server data (app/src/api) → view models for the screens; every money action goes through
// Escrow (DemoEscrow or SolanaEscrow) with perform(): upload → contract → chain sync → refresh (CLAUDE.md §6).
// The engine only hides buttons; the server (demo) or the program (solana) decides.
import React from 'react';
import { Platform } from 'react-native';
import { TIMEOUTS_DEMO, type TxResult } from '@unbox/shared';
import {
  ApiError, api, cancelListingRest, categories, chainSync, createListing, deals as fetchDeals, devClock, listings, myListings,
  publishListing, wallet as fetchWallet,
} from './api';
import { canBuy, fromDeal, fromListing, money, parsePrice, toUnits } from './data/fromServer';
import { verdictView } from './data/verdict';
import { PAYMENTS, demoScenario, escrow, setDemoScenario } from './escrow';
import { explain, perform } from './flow';
import { kv } from './kv';
import { printCard } from './media/qrCard';
import { uploadJson, uploadPhoto, uploadRecording } from './media/upload';
import { restore, signIn, signOut } from './session';
import { importWalletJson } from './solana';

export const Ctx = React.createContext(null);
export const useP = () => React.useContext(Ctx).phones[0];

const WEB = Platform.OS === 'web';
const GRACE = 2;   // ui.md §7.2: the button unlocks at network time ≥ deadline + 2 s
const BENEF = { Paid: 'buyer', Shipped: 'seller', Disputed: null, ReturnRequested: 'seller', Returning: 'buyer' };
const SETTLE_TO = { Paid: 'Refunded', Shipped: 'Completed', Disputed: 'ReturnRequested', ReturnRequested: 'Completed', Returning: 'Refunded' };
const OUTCOME = { Paid: 'Środki wrócą do kupującego.', Returning: 'Środki wrócą do kupującego.', Shipped: 'Środki trafią do sprzedającego.', ReturnRequested: 'Środki trafią do sprzedającego.', Disputed: 'Kupujący odeśle paczkę za zwrot środków.' };
const STATUS = { Listed: ['Wystawione', 'var(--fg-3)'], Paid: ['Opłacone – czeka na wysyłkę', 'var(--info)'], Shipped: ['W drodze', 'var(--info)'], Disputed: ['Reklamacja – trwa ocena', 'var(--warning)'], ReturnRequested: ['Reklamacja uznana – odeślij paczkę', 'var(--warning)'], Returning: ['Zwrot w drodze', 'var(--info)'], Completed: ['Zakończone – środki u sprzedającego', 'var(--success)'], Refunded: ['Środki zwrócone kupującemu', 'var(--success)'], Cancelled: ['Anulowane', 'var(--fg-3)'] };
const FUT = { Listed: ['Paid', 'Shipped', 'Completed'], Paid: ['Shipped', 'Completed'], Shipped: ['Completed'], Disputed: [], ReturnRequested: ['Returning', 'Refunded'], Returning: ['Refunded'] };
const ALT = { Listed: 'albo: Anulowane', Paid: 'brak nadania w terminie → Środki zwrócone kupującemu', Shipped: 'albo: Reklamacja · brak decyzji w terminie → Zakończone', Disputed: 'ocena „sprzedający” → Zakończone · „kupujący” → odesłanie paczki · brak oceny w terminie → odesłanie paczki', ReturnRequested: 'brak odesłania w terminie → Zakończone', Returning: 'brak potwierdzenia w terminie → Środki zwrócone kupującemu' };
const ESCROW = ['Paid', 'Shipped', 'Disputed', 'ReturnRequested', 'Returning'];
const FEE = 0.000005;
const NONE: TxResult = { signature: null, explorerUrl: null };
const FCONDS = ['Nowy z metką', 'Bardzo dobry', 'Dobry', 'Używany'];
const SIZE_OPTS = ['XS', 'S', 'M', 'L', 'XL', '38', '39', '40', '41', '42', '43', '44', '45', 'Uniwersalny'];
const SORTS = [['new', 'Najnowsze'], ['cheap', 'Najtańsze'], ['exp', 'Najdroższe']];
const PRICE_MAX = 1.5;
const DIAC = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z', 'ü': 'u' };
const norm = s => s.toLowerCase().replace(/[ąćęłńóśźżü]/g, ch => DIAC[ch]);
const fmtPL = (v, dp) => { const [i, d] = v.toFixed(dp).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? ',' + d : ''); };
const plural = n => (n === 1 ? 'ogłoszenie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'ogłoszenia' : 'ogłoszeń');
const short = s => (s ? s.slice(0, 4) + '…' + s.slice(-4) : '');
const ICON = n => n;
const ADDR = pda => 'https://explorer.solana.com/address/' + pda + '?cluster=devnet';
const pad = n => String(n).padStart(2, '0');
const hhmm = t => { const d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const DAYS = ['ndz', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const stamp = t => { const d = new Date(t * 1000); return (d.toDateString() === new Date().toDateString() ? '' : DAYS[d.getDay()] + ' ') + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const hms = s => { s = Math.max(0, Math.floor(s)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
const ARBITER = process.env.EXPO_PUBLIC_ORACLE_PUBKEY || '';
const CONDS = ['Nowy', 'B. dobry', 'Dobry', 'Używany'];
const CONDK = { 'Nowy': 'nowy', 'B. dobry': 'jak_nowy', 'Dobry': 'dobry', 'Używany': 'widoczne_slady' };
// Complaint chips → ComplaintCategory (@unbox/shared).
const CATS = ['Nieujawniona wada', 'Inny przedmiot', 'Zły rozmiar', 'Uszkodzenie'];
const CAT_KEY = { 'Nieujawniona wada': 'not_as_described', 'Inny przedmiot': 'wrong_item', 'Zły rozmiar': 'not_as_described', 'Uszkodzenie': 'damaged' };
const TABS = [['browse', 'layout-grid', 'Przeglądaj'], ['sell', 'plus', 'Wystaw'], ['deals', 'package', 'Transakcje'], ['wallet', 'wallet', 'Portfel']];
const QUICK = [['ania@demo.pl', 'Ania · sprzedająca'], ['bartek@demo.pl', 'Bartek · kupujący'], ['celina@demo.pl', 'Celina']];
const BRIEF = {
  unboxing: { title: 'Nagraj otwarcie od zamkniętej paczki', items: ['Zacznij od zamkniętej paczki – pokaż etykietę i taśmę.', 'Nagrywaj bez przerw. Limit to 2 minuty.', 'Pokaż kartę z kodem, gdy tylko ją zobaczysz.', 'Pokaż całe ubranie z obu stron, w dobrym świetle.'], warning: 'Ucięte, zasłonięte albo ciemne nagranie liczy się przeciwko osobie, która je nagrała. Bez nagrania nie ma reklamacji. Nagranie trafia do oceny tylko przy reklamacji i jest wtedy dostępne pod adresem zapisanym w umowie.' },
  packing: { title: 'Nagraj pakowanie w jednym ujęciu', items: ['Pokaż ubranie z obu stron, także wady z listy.', 'Włóż kartę z kodem do środka – na nagraniu.', 'Zaklej paczkę i pokaż etykietę z numerem.', 'Nagrywaj bez przerw. Limit to 2 minuty.'], warning: 'Jeśli kupujący złoży reklamację, słabe nagranie pakowania działa przeciwko Tobie. Nagranie jest dostępne pod adresem zapisanym w umowie.' },
  return: { title: 'Nagraj pakowanie zwrotu', items: ['Pokaż ubranie, które odsyłasz, z obu stron.', 'Włóż nową kartę zwrotu do środka – na nagraniu.', 'Zaklej paczkę i pokaż etykietę z numerem.', 'Nagrywaj bez przerw. Limit to 2 minuty.'], warning: 'Słabe albo ucięte nagranie zwrotu działa przeciwko Tobie.' },
};
const freshForm = () => ({ title: 'Marynarka Zara', brand: 'Zara', size: 'M', cond: 'B. dobry', price: PAYMENTS === 'solana' ? '0.05' : '50', priceError: '',
  desc: 'Marynarka z domieszką wełny, noszona kilka razy.', catId: null, flaws: ['Drobne zaciągnięcie na rękawie'], flawDraft: '', photos: [] });

export class AppProvider extends React.Component<any, any> {
  pending = {};
  skew = 0;
  prevStatus = null;
  state = { me: null, linkError: null, deals: [], wallet: null, cats: [], tick: 0, active: '_', phones: { _: this.ph('_', 'loading') },
    rate: { pln: 640, live: false, at: null }, devMsg: '' };

  ph(user, onb) {
    return { user, tab: 'browse', stack: [], onb, banner: null, tx: null, sheet: null, rulesOpen: false, feed: 'loading', feedError: '',
      dealsTab: 'Zakupy', form: freshForm(), login: { email: '', password: '', error: '' }, walletJson: '',
      rec: null, unbox: null, scan: null, filt: { q: '', cat: 'Wszystko', sizes: [], conds: [], max: PRICE_MAX, sort: 'new', noFlaws: false },
      decide: { cat: null, text: '', dur: '' }, pack: { card: null, cardError: '', qr: false, video: false, uri: null, dur: '', tracking: '', mode: 'ship' } };
  }
  componentDidMount() {
    this.iv = setInterval(() => this.setState({ tick: Date.now() }), 250);
    this.fetchRate(); this.rateIv = setInterval(() => this.fetchRate(), 30000);
    restore().then(s => (s ? this.startSession(s, false) : this.setPh('_', { onb: 'welcome' })))
      .catch(e => this.setPh('_', P => ({ onb: 'welcome', login: { ...P.login, error: explain(e).text } })));
  }
  componentWillUnmount() { [this.iv, this.rateIv, this.pollIv, this.clockIv].forEach(clearInterval); }

  // ---------- session ----------
  startSession(s, fresh) {
    const k = s.user.id;
    this.prevStatus = null;
    this.setState({ me: s.user, linkError: s.walletLinkError, deals: [], wallet: null, active: k, phones: { [k]: this.ph(k, fresh ? 'ready' : null) } },
      () => { this.refresh(); this.syncClock(); });
    clearInterval(this.pollIv); this.pollIv = setInterval(() => this.refresh(), 3000);
    clearInterval(this.clockIv); this.clockIv = setInterval(() => this.syncClock(), 30000);
  }
  async login(email, password) {
    this.setPh('_', P => ({ onb: 'creating', login: { ...P.login, error: '' } }));
    try { this.startSession(await signIn(email, password), true); }
    catch (e) { this.setPh('_', P => ({ onb: 'welcome', login: { ...P.login, error: explain(e).text } })); }
  }
  async logout() {
    clearInterval(this.pollIv); clearInterval(this.clockIv);
    await signOut();
    this.setState({ me: null, linkError: null, deals: [], wallet: null, active: '_', phones: { _: this.ph('_', 'welcome') } });
  }
  async switchAccount(email) { await this.logout(); this.login(email, 'demo1234'); }

  // ---------- data ----------
  async refresh() {
    if (!this.state.me) return;
    if (this.refreshing) return this.refreshing;
    const k = this.state.active;
    this.refreshing = (async () => {
      try {
        const cats = this.state.cats.length ? this.state.cats : await categories();
        const [ls, mine, buys, sales, w] = await Promise.all([listings(), myListings(), fetchDeals('buyer'), fetchDeals('seller'), fetchWallet()]);
        if (this.state.active !== k) return;
        const names = Object.fromEntries(cats.map(c => [c.id, c.name]));
        const catOf = new Map([...ls, ...mine].map(l => [l.id, l.categoryId]));
        const byId = new Map();
        for (const l of [...ls, ...mine]) byId.set(l.id, fromListing(l, names));
        for (const d of [...buys, ...sales]) byId.set(d.id, fromDeal(d, names, catOf.get(d.id)));
        const items = [...byId.values()];
        this.bannerFor(k, items);
        this.setState({ cats, deals: items, wallet: w });
        this.setPh(k, { feed: 'ok', feedError: '' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return this.logout();
        this.setPh(k, { feed: 'error', feedError: explain(e).text });
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
  /** The other party moved (seen by polling) and now it is my move: show a banner. */
  bannerFor(k, items) {
    const prev = this.prevStatus;
    this.prevStatus = new Map(items.map(d => [d.id, d.status]));
    if (!prev) return;
    for (const d of items) {
      if ((d.buyer !== k && d.seller !== k) || prev.get(d.id) === d.status || !prev.has(d.id) && d.status === 'Listed') continue;
      const v = this.dv(d, k);
      if (v.hasHint || ['Completed', 'Refunded'].includes(d.status) && prev.has(d.id)) {
        this.setPh(k, { banner: { text: d.title + ': ' + STATUS[d.status][0] + '.', id: d.id, st: Date.now() } });
        setTimeout(() => this.setPh(k, P => (P.banner && Date.now() - P.banner.st >= 6400 ? { banner: null } : {})), 6500);
      }
    }
  }
  async syncClock() {
    try { this.skew = (await escrow.networkNow()) - Date.now() / 1000; } catch { /* keep the last known skew */ }
  }
  now() { return Math.floor(Date.now() / 1000 + this.skew); }
  async fetchRate() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=pln');
      const j = await r.json(), v = j && j.solana && j.solana.pln;
      if (typeof v !== 'number') throw new Error('no rate');
      this.setState({ rate: { pln: v, live: true, at: Date.now() } });
    } catch (e) { this.setState(s => ({ rate: { ...s.rate, live: false, at: s.rate.at || Date.now() } })); }
  }
  cur() { return this.state.wallet?.currency ?? (PAYMENTS === 'solana' ? 'SOL' : 'PLN'); }
  bal() { const w = this.state.wallet; return w ? toUnits(w.balanceMinor, w.currency) : 0; }
  /** Approximate złoty value, only for SOL amounts (orientacyjnie); '' for PLN. */
  zl(units, currency = this.cur()) {
    if (currency !== 'SOL') return '';
    const v = units * this.state.rate.pln; if (v > 0 && v < 0.01) return '< 0,01 zł'; return fmtPL(v, v < 100 ? 2 : 0) + ' zł';
  }

  setPh(k, patch) { this.setState(s => { const P = s.phones[k]; if (!P) return null; const np = typeof patch === 'function' ? patch(P, s) : patch; return { phones: { ...s.phones, [k]: { ...P, ...np } } }; }); }
  go(k, screen, id, extra) { this.setPh(k, P => ({ stack: [...P.stack, { screen, id, ...extra }], sheet: null })); }
  back(k) { this.setPh(k, P => ({ stack: P.stack.slice(0, -1), sheet: null, rec: null })); }
  tab(k, t) { this.setPh(k, { tab: t, stack: [], sheet: null }); if (t === 'browse' || t === 'deals' || t === 'wallet') this.refresh(); }
  deal(id, s = this.state) { return s.deals.find(d => d.id === id); }

  // ---------- one money action ----------
  fail(k, failTitle, failText, code, retryable, needFunds = false) { this.setPh(k, P => ({ tx: { ...P.tx, phase: 'fail', failTitle, failText, code, retryable, needFunds } })); }
  async tx(k, cfg) {
    this.pending[k] = cfg;
    const start = Date.now();
    if (PAYMENTS === 'solana' && cfg.kind !== 'faucet' && this.bal() < FEE) {
      this.setPh(k, { tx: { title: cfg.title, upload: false, start, phase: 'fail', failTitle: 'Brak salda na opłatę sieci', failText: 'Każda operacja kosztuje ułamek grosza (≈ 0.000005 SOL), także odbiór paczki. Doładuj testowe SOL i wróć do tej operacji.', code: '', retryable: false, needFunds: true }, sheet: null });
      return;
    }
    const stage = st => this.setPh(k, P => (P.tx && P.tx.phase === 'run' ? { tx: { ...P.tx, stage: st } } : {}));
    this.setPh(k, { tx: { title: cfg.title, upload: !!cfg.upload, start, phase: 'run', stage: cfg.upload ? 'upload' : 'chain' }, sheet: null });
    try {
      const r = await perform(() => cfg.run(stage), {
        sync: escrow.mode === 'solana' ? () => (cfg.dealPda ? chainSync(cfg.dealPda) : Promise.resolve()) : undefined,
        refresh: () => this.refresh(),
        onStage: s => { if (s === 'sync') stage('sync'); },
      });
      this.setPh(k, P => ({ tx: { ...P.tx, phase: 'ok', okTitle: cfg.ok[0], okText: cfg.ok[1], sig: r.signature, href: r.explorerUrl } }));
      cfg.after?.();
    } catch (e) {
      const x = explain(e);
      if (x.code === 'InvalidStatus' || x.code === 'DeadlinePassed') await this.refresh();
      this.fail(k, x.title, x.text, x.code, x.retryable, x.code === 'InsufficientFunds' && PAYMENTS === 'solana');
    }
  }
  async retry(k) {
    const c = this.pending[k];
    if (!c) return;
    await this.refresh();
    if (c.guard) {
      const d = this.deal(c.guard.id);
      if (!d || d.status !== c.guard.status) return this.fail(k, 'Stan umowy już się zmienił', 'Ktoś wykonał ruch w tej umowie chwilę wcześniej. Pokazujemy aktualny stan.', 'InvalidStatus', false);
    }
    this.tx(k, c);
  }

  buy(k, id) {
    const d = this.deal(id);
    this.tx(k, { kind: 'buy', title: 'Zabezpieczamy środki w umowie…', guard: { id, status: 'Listed' }, dealPda: d.pda, run: () => escrow.purchase(d.key),
      ok: ['Środki zabezpieczone w umowie', money(d.price, d.currency) + ' czeka w umowie. Sprzedający ma czas na nadanie do ok. ' + hhmm(this.now() + TIMEOUTS_DEMO.Paid) + '.'],
      after: () => this.setPh(k, { tab: 'deals', dealsTab: 'Zakupy', stack: [{ screen: 'deal', id }] }) });
  }
  publish(k) {
    const f = this.state.phones[k].form, cur = PAYMENTS === 'solana' ? 'SOL' : 'PLN';
    const pr = parsePrice(f.price, cur);
    if ('error' in pr) return this.setPh(k, P => ({ form: { ...P.form, priceError: pr.error } }));
    const categoryId = f.catId ?? this.state.cats[0]?.id ?? 'inne';
    const cfg = { kind: 'publish', title: 'Zapisujemy ogłoszenie…', upload: f.photos.length > 0, newId: null, dealPda: null,
      run: async stage => {
        if (!cfg.newId) {   // a retry after a failed create_listing must not create a second listing
          const photos = [];
          for (const uri of f.photos) photos.push(await uploadPhoto(uri));
          stage('chain');
          const l = await createListing({ title: f.title.trim(), description: f.desc.trim(), categoryId, condition: CONDK[f.cond], brand: f.brand.trim(), size: f.size.trim(), defects: f.flaws, photos, priceMinor: pr.minor });
          cfg.newId = l.id;
        }
        if (escrow.mode !== 'solana') return NONE;
        return this.putOnChain(cfg, cfg.newId);
      },
      ok: ['Ogłoszenie wystawione', 'Opis i lista wad są zapisane w umowie. Po zakupie nie da się ich zmienić.'],
      after: () => this.setPh(k, { tab: 'deals', dealsTab: 'Sprzedaże', stack: [{ screen: 'deal', id: cfg.newId }], form: freshForm() }) };
    this.tx(k, cfg);
  }
  /** publish (server freezes the text) → create_listing signed by the seller. Idempotent: an existing Deal account is just synced. */
  async putOnChain(cfg, id) {
    const args = await publishListing(id);
    cfg.dealPda = args.deal;
    const s = await chainSync(args.deal).catch(() => null);
    if (s && s.published) return NONE;
    return escrow.createListing(args);
  }
  publishOnChain(k, id) {
    const cfg = { kind: 'publish', title: 'Zapisujemy ogłoszenie w umowie…', guard: { id, status: 'Listed' }, dealPda: null, run: () => this.putOnChain(cfg, id),
      ok: ['Ogłoszenie zapisane w umowie', 'Opis i lista wad są zapisane w umowie. Po zakupie nie da się ich zmienić.'] };
    this.tx(k, cfg);
  }
  cancel(k, id) {
    const d = this.deal(id);
    this.tx(k, { title: 'Anulujemy ogłoszenie…', guard: { id, status: 'Listed' }, dealPda: d.pda,
      run: async () => (escrow.mode === 'solana' && !d.published ? (await cancelListingRest(id), NONE) : escrow.cancelListing(d.key)),
      ok: ['Ogłoszenie anulowane', 'Nikt nie zapłacił, nic nie zostało zablokowane.'] });
  }
  async openPack(k, id, mode) {
    const d = this.deal(id), kind = mode === 'return' ? 'return' : 'ship', key = 'unbox.card.' + id + '.' + kind;
    this.setPh(k, P => ({ pack: { card: null, cardError: '', qr: false, video: false, uri: null, dur: '', tracking: '', mode }, stack: [...P.stack, { screen: 'pack', id }] }));
    try {
      let card = null;
      const saved = await kv.get(key).catch(() => null);
      if (saved) card = JSON.parse(saved);
      if (!card) { card = await escrow.newQrCard(kind, d.key); await kv.set(key, JSON.stringify(card)).catch(() => {}); }
      this.setPh(k, P => ({ pack: { ...P.pack, card } }));
    } catch (e) {
      this.setPh(k, P => ({ pack: { ...P.pack, cardError: explain(e).text } }));
    }
  }
  async printPackCard(k, id) {
    const P = this.state.phones[k], d = this.deal(id);
    if (!P.pack.card) return;
    try { await printCard(P.pack.card, d.title); } catch { /* cancelled print dialog: the card is still on screen */ }
    this.setPh(k, Q => ({ pack: { ...Q.pack, qr: true } }));
  }
  brief(k, mode, id) { this.go(k, 'brief', id, { mode }); }
  startRec(k, mode, id) { this.setPh(k, P => ({ rec: { mode, id }, stack: [...P.stack.slice(0, -1), { screen: 'record', id }] })); }
  recDone(k, uri, payload, secs) {
    const r = this.state.phones[k].rec, dur = pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);
    if (!r) return;
    if (r.mode === 'unboxing') {
      this.setPh(k, Q => ({ rec: null, unbox: { uri, id: r.id }, decide: { cat: null, text: '', dur },
        scan: payload ? { id: r.id, mode: 'unbox', payload } : { id: r.id, mode: 'unbox', payload: null },
        stack: [...Q.stack.slice(0, -1), { screen: payload ? 'decide' : 'scan', id: r.id }] }));
    } else {
      this.setPh(k, Q => ({ rec: null, pack: { ...Q.pack, video: true, uri, dur }, stack: Q.stack.slice(0, -1) }));
    }
  }
  startScan(k, id) { this.setPh(k, P => ({ scan: { id, mode: 'return', payload: null }, stack: [...P.stack, { screen: 'scan', id }] })); }
  scanDone(k, payload) {
    const S = this.state.phones[k].scan;
    if (!S) return;
    if (S.mode === 'unbox') this.setPh(k, Q => ({ scan: { ...S, payload }, stack: [...Q.stack.slice(0, -1), { screen: 'decide', id: S.id }] }));
    else this.setPh(k, Q => ({ scan: { ...S, payload }, stack: Q.stack.slice(0, -1), sheet: 'ret' }));
  }
  submitPack(k, id) {
    const P = this.state.phones[k], d = this.deal(id), pk = P.pack, isRet = pk.mode === 'return', tracking = pk.tracking.trim();
    this.tx(k, { kind: 'pack', title: isRet ? 'Zapisujemy zwrot…' : 'Zapisujemy nadanie…', upload: true, guard: { id, status: d.status }, dealPda: d.pda,
      run: async stage => {
        const video = await uploadRecording(pk.uri);
        stage('chain');
        return isRet
          ? escrow.markReturned(d.key, { returnQrCommitment: pk.card.commitment, returnVideoSha256: video, trackingNumber: tracking })
          : escrow.markShipped(d.key, { qrCommitment: pk.card.commitment, packingVideoSha256: video, trackingNumber: tracking });
      },
      ok: isRet ? ['Zwrot nadany', 'Gdy sprzedający zeskanuje kod zwrotu, środki wrócą do Ciebie. Jeśli tego nie zrobi, wrócą po terminie.'] : ['Paczka nadana', 'Nagranie i numer przesyłki są zapisane w umowie. Kupujący ma czas na otwarcie i decyzję.'],
      after: () => { kv.del('unbox.card.' + id + '.' + (isRet ? 'return' : 'ship')).catch(() => {}); this.setPh(k, { tab: 'deals', stack: [{ screen: 'deal', id }] }); } });
  }
  accept(k, id) {
    const d = this.deal(id), payload = this.state.phones[k].scan?.payload;
    this.tx(k, { kind: 'qr', title: 'Przekazujemy środki sprzedającemu…', guard: { id, status: 'Shipped' }, dealPda: d.pda, run: () => escrow.acceptDelivery(d.key, payload),
      ok: [money(d.price, d.currency) + ' u sprzedającego', 'Umowa jest zamknięta. Nagranie otwarcia zostało tylko na Twoim urządzeniu.'],
      after: () => this.setPh(k, { tab: 'deals', stack: [{ screen: 'deal', id }], unbox: null, scan: null }) });
  }
  complain(k, id) {
    const d = this.deal(id), P = this.state.phones[k], c = P.decide, payload = P.scan?.payload, uri = P.unbox?.uri;
    const complaint = { category: CAT_KEY[c.cat], description: c.text.trim().length >= 3 ? c.text.trim() : c.cat };
    this.tx(k, { kind: 'qr', title: 'Wysyłamy reklamację…', upload: true, guard: { id, status: 'Shipped' }, dealPda: d.pda,
      run: async stage => {
        const unboxingVideoSha256 = await uploadRecording(uri);
        const complaintSha256 = await uploadJson(JSON.stringify({ v: 1, ...complaint, created_at: this.now() }));
        stage('chain');
        return escrow.openDispute(d.key, { qrPayload: payload, unboxingVideoSha256, complaint, complaintSha256 });
      },
      ok: ['Reklamacja zgłoszona', 'Weryfikator AI porówna oba nagrania z opisem. Środki zostają w umowie do czasu oceny.'],
      after: () => this.setPh(k, { tab: 'deals', stack: [{ screen: 'deal', id }], unbox: null, scan: null }) });
  }
  confirmReturn(k, id) {
    const d = this.deal(id), payload = this.state.phones[k].scan?.payload;
    this.tx(k, { kind: 'qr', title: 'Zwracamy środki kupującemu…', guard: { id, status: 'Returning' }, dealPda: d.pda, run: () => escrow.confirmReturn(d.key, payload),
      ok: ['Środki zwrócone kupującemu', money(d.price, d.currency) + ' wróciło do kupującego. Umowa jest zamknięta.'],
      after: () => this.setPh(k, { scan: null, tab: 'deals', stack: [{ screen: 'deal', id }] }) });
  }
  settle(k, id) {
    const d = this.deal(id), to = SETTLE_TO[d.status];
    const msg = { Refunded: 'Środki zwrócone kupującemu', Completed: 'Środki u sprzedającego', ReturnRequested: 'Kupujący odsyła paczkę za zwrot' }[to];
    this.tx(k, { kind: 'settle', title: 'Zamykamy sprawę po terminie…', guard: { id, status: d.status }, dealPda: d.pda, run: () => escrow.settleExpired(d.key),
      ok: [msg, 'Nikt nie musiał się zgodzić. Umowa wykonała regułę po terminie.'] });
  }
  faucet(k) {
    this.tx(k, { kind: 'faucet', title: 'Pobieramy testowe SOL…', run: () => escrow.requestTestSol(), ok: ['Doładowano 1.000 SOL', 'To testowe SOL z sieci deweloperskiej, bez wartości.'] });
  }
  setForm(k, field) { return e => { const v = e.target.value; this.setPh(k, P => ({ form: { ...P.form, [field]: v, ...(field === 'price' ? { priceError: '' } : {}) } })); }; }

  // ---------- view models ----------
  dv(d, me) {
    const now = this.now();
    const iB = d.buyer === me, iS = d.seller === me;
    const sN = d.sellerName, bN = d.buyerName;
    const deadline = ESCROW.includes(d.status) ? d.deadlineAt : null;
    const remain = deadline !== null ? deadline - now : null;
    const expired = remain !== null && remain <= 0;
    const unlocked = remain !== null && remain <= -GRACE;
    const benefRole = BENEF[d.status], benef = benefRole === 'buyer' ? d.buyer : benefRole === 'seller' ? d.seller : null;
    const can = !!SETTLE_TO[d.status];
    const who = ({ Listed: d.published ? 'Czeka na kupującego' : 'Ty – zapisz ogłoszenie w umowie', Paid: iS ? 'Ty – spakuj i nadaj paczkę' : 'Sprzedający (' + sN + ') – nadaje paczkę', Shipped: iB ? 'Ty – nagraj otwarcie i zdecyduj' : 'Kupujący (' + bN + ') – nagrywa otwarcie', Disputed: 'Weryfikator AI – porównuje oba nagrania', ReturnRequested: iB ? 'Ty – odeślij paczkę' : 'Kupujący (' + bN + ') – odsyła paczkę', Returning: iS ? 'Ty – zeskanuj kod zwrotu' : 'Sprzedający (' + sN + ') – potwierdza odbiór zwrotu' })[d.status] || '';
    const after = ({ Listed: 'Ogłoszenie czeka. Możesz je anulować, dopóki nikt nie zapłacił.', Paid: 'Po terminie każdy może zwrócić środki kupującemu.', Shipped: 'Po terminie środki trafią do sprzedającego.', Disputed: 'Po terminie kupujący odsyła paczkę za zwrot środków.', ReturnRequested: 'Po terminie środki trafią do sprzedającego.', Returning: 'Po terminie środki wrócą do kupującego.' })[d.status] || '';
    const priceText = money(d.price, d.currency);
    let hint = null;
    if (can && unlocked && benef === me) hint = 'Odbierz środki';
    else if (!expired) {
      if (iB) hint = { Shipped: 'Nagraj otwarcie', ReturnRequested: 'Spakuj zwrot' }[d.status] || null;
      if (iS) hint = { Paid: 'Spakuj i nadaj', Returning: 'Zeskanuj kod zwrotu' }[d.status] || hint;
    }
    if (iS && d.status === 'Listed' && !d.published && PAYMENTS === 'solana') hint = 'Zapisz w umowie';
    let nSecured = false, nNeutral = false, nTitle = '', nText = '';
    if (d.status === 'Completed') { nSecured = true; nTitle = iS ? 'Środki są na Twoim saldzie' : 'Zakończone'; nText = priceText + ' trafiło do sprzedającego. Umowa jest zamknięta.'; }
    if (d.status === 'Refunded') { nSecured = true; nTitle = iB ? 'Środki wróciły na Twoje saldo' : 'Środki zwrócone kupującemu'; nText = priceText + ' zwróciła umowa, bez niczyjej zgody.'; }
    if (d.status === 'Cancelled') { nNeutral = true; nTitle = 'Ogłoszenie anulowane'; nText = 'Nikt nie zapłacił, nic nie zostało zablokowane.'; }
    if (d.status === 'Disputed' && !expired) {
      nNeutral = true;
      if (d.analysis && d.analysis.status === 'failed') { nTitle = 'Ocena nie powiodła się'; nText = 'Po terminie oceny kupujący odsyła paczkę za zwrot środków.'; }
      else { nTitle = 'Weryfikator AI porównuje oba nagrania'; nText = 'Nagranie pakowania, nagranie otwarcia, opis i reklamację. Wynik wyliczy jawna reguła.'; }
    }
    if (d.status === 'ReturnRequested' && d.noVerdict) { nNeutral = true; nTitle = 'Brak oceny w terminie'; nText = 'Umowa przeszła na neutralną ścieżkę: kupujący odsyła paczkę za zwrot środków.'; }
    const final = !FUT[d.status];
    const nodes = d.events.map((e, i) => ({ st: e.st, sub: e.label, when: stamp(e.at), href: e.href, state: i === d.events.length - 1 && !final ? 'current' : 'done' }));
    (FUT[d.status] || []).forEach(st => nodes.push({ st, sub: '', when: 'później', href: null, state: 'todo' }));
    const timeline = nodes.map((n, i) => {
      const c = n.state === 'done' ? 'var(--success)' : n.state === 'current' ? 'var(--warning)' : 'var(--line-strong)';
      const when = n.state === 'current' && deadline !== null ? n.when + ' · termin ok. ' + hhmm(deadline) : n.when;
      return { label: STATUS[n.st][0], id: n.st, showId: true, sub: n.sub, hasSub: !!n.sub, when, color: c, fill: n.state === 'todo' ? 'transparent' : c, line: n.state === 'done' ? 'var(--success)' : 'var(--line)',
        labelColor: n.state === 'todo' ? 'var(--fg-3)' : 'var(--fg-1)', weight: n.state === 'current' ? 700 : 500, notLast: i < nodes.length - 1, hasSig: !!n.href, href: n.href || '#',
        alt: n.state !== 'done' ? ALT[n.st] || '' : '', hasAlt: n.state !== 'done' && !!ALT[n.st] };
    });
    const evidence = [];
    if (d.listingHash) evidence.push({ label: 'Opis i zdjęcia ogłoszenia', value: short(d.listingHash) });
    if (d.buyer && PAYMENTS === 'solana' && ARBITER) evidence.push({ label: 'Zaakceptowany weryfikator', value: short(ARBITER) });
    if (d.tracking) evidence.push({ label: 'Nagranie pakowania', value: short(d.packHash) }, { label: 'Karta z kodem', value: short(d.qrCommit) }, { label: 'Numer przesyłki', value: d.tracking });
    if (d.unboxHash) evidence.push({ label: 'Nagranie otwarcia', value: short(d.unboxHash) }, { label: 'Reklamacja · ' + ((d.complaint && d.complaint.cat) || ''), value: short(d.complaintHash) });
    if (d.reportHash) evidence.push({ label: 'Raport oceny AI', value: short(d.reportHash) });
    if (d.returnTracking) evidence.push({ label: 'Nagranie zwrotu', value: short(d.retVideo) }, { label: 'Karta zwrotu', value: short(d.retQr) }, { label: 'Przesyłka zwrotna', value: d.returnTracking });
    const last = [...d.events].reverse().find(e => e.href);
    const href = last ? last.href : d.pda && d.published ? ADDR(d.pda) : null;
    const mineB = benef === me;
    const settleLabel = d.status === 'Disputed' ? 'Przejdź do zwrotu' : mineB ? 'Odbierz środki' : benefRole === 'buyer' ? 'Zwróć środki kupującemu' : 'Przekaż środki sprzedającemu';
    return {
      id: d.id, no: d.no, title: d.title, photo: d.photos[0] || null, priceText, zl: this.zl(d.price, d.currency), statusLabel: STATUS[d.status][0], statusColor: STATUS[d.status][1],
      parties: d.buyer ? (iS ? 'Kupuje: ' + bN : 'Sprzedaje: ' + sN) : 'Sprzedaje: ' + sN,
      hint, hasHint: !!hint, isActive: ESCROW.includes(d.status) || d.status === 'Listed',
      funds: d.status === 'Listed' ? 'Nikt jeszcze nie zapłacił' : 'Zabezpieczone w umowie · ' + priceText + (this.zl(d.price, d.currency) ? ' (≈ ' + this.zl(d.price, d.currency) + ')' : ''), fundsColor: d.status === 'Listed' ? 'var(--fg-2)' : 'var(--secured)', who, after,
      hasDeadline: deadline !== null, countdown: expired ? '00:00:00' : hms(remain || 0), cdColor: remain !== null && remain <= 60 ? 'var(--warning)' : 'var(--fg-1)',
      cdWhen: deadline === null ? '' : (expired ? 'Termin minął ok. ' : 'Termin ok. ') + hhmm(deadline) + ' · liczy go sieć, nie telefon',
      cardBorder: can && expired ? 'var(--warning)' : 'var(--line-strong)',
      settleLocked: can && !expired && mineB, settleChecking: can && expired && !unlocked, settleMine: can && unlocked && mineB, settleOther: can && unlocked && !mineB,
      settleLabel, outcome: OUTCOME[d.status] || '',
      actRecord: iB && d.status === 'Shipped' && !expired, actShip: iS && d.status === 'Paid' && !expired, actReturn: iB && d.status === 'ReturnRequested' && !expired, actScan: iS && d.status === 'Returning' && !expired,
      actCancel: iS && d.status === 'Listed', actPublish: iS && d.status === 'Listed' && !d.published && PAYMENTS === 'solana',
      hasVerdict: !!d.verdict, nSecured, nNeutral, nTitle, nText, timeline, evidence, href, hasHref: !!href,
      settle: () => this.settle(me, d.id), record: () => this.brief(me, 'unboxing', d.id), shipFlow: () => this.openPack(me, d.id, 'ship'), returnFlow: () => this.openPack(me, d.id, 'return'),
      scan: () => this.startScan(me, d.id), verdict: () => this.go(me, 'verdict', d.id), cancel: () => this.cancel(me, d.id), publish: () => this.publishOnChain(me, d.id), open: () => this.go(me, 'deal', d.id),
    };
  }

  vm(k) {
    const s = this.state, P = s.phones[k], me = s.me, now = this.now(), cur = this.cur();
    const top = P.stack[P.stack.length - 1];
    const scr = P.onb ? 'onb_' + P.onb : top ? top.screen : P.tab;
    const bal = this.bal();
    const v = {
      caption: me ? me.name : '', roleLabel: me ? me.name : 'Sellsor', modeLabel: PAYMENTS === 'solana' ? 'devnet' : 'demo',
      roleBg: P.tab === 'deals' && P.dealsTab === 'Sprzedaże' ? '#FFB547' : '#9945FF', clock: hhmm(now), balance: money(bal, cur), balanceZl: this.zl(bal, cur), feeZl: this.zl(FEE, 'SOL'),
      addrShort: s.wallet?.address ? short(s.wallet.address) : PAYMENTS === 'solana' ? 'portfel niepołączony' : 'tryb demo – saldo prowadzi serwer', address: s.wallet?.address || '',
      arbiterShort: ARBITER ? short(ARBITER) : '', solana: PAYMENTS === 'solana', web: WEB, linkError: s.linkError || '',
      sOnbLoading: scr === 'onb_loading', sOnbWelcome: scr === 'onb_welcome', sOnbCreating: scr === 'onb_creating', sOnbReady: scr === 'onb_ready', sBrowse: scr === 'browse', sListing: scr === 'listing', sSell: scr === 'sell', sDeals: scr === 'deals', sDeal: scr === 'deal',
      sBrief: scr === 'brief', sPack: scr === 'pack', sRecord: scr === 'record', sScan: scr === 'scan', sPhoto: scr === 'photo', sDecide: scr === 'decide', sVerdict: scr === 'verdict', sWallet: scr === 'wallet',
      back: () => this.back(k), faucet: () => this.faucet(k), lowBal: PAYMENTS === 'solana' && !!s.wallet && bal < 0.001,
      onbDone: () => { this.setPh(k, { onb: null, tab: 'browse', stack: [] }); this.refresh(); },
      reload: () => { this.setPh(k, { feed: 'loading' }); this.refresh(); }, openDev: () => this.setPh(k, { sheet: 'dev' }),
    };
    v.sCamera = v.sRecord || v.sScan || v.sPhoto;
    v.login = { email: P.login.email, password: P.login.password, error: P.login.error, hasError: !!P.login.error,
      setEmail: t => this.setPh(k, Q => ({ login: { ...Q.login, email: t } })), setPassword: t => this.setPh(k, Q => ({ login: { ...Q.login, password: t } })),
      submit: () => this.login(P.login.email, P.login.password), quick: QUICK.map(([email, label]) => ({ label, go: () => this.login(email, 'demo1234') })) };
    v.showTabs = !P.onb && (!top || top.screen === 'deal');
    const anyHint = s.deals.filter(d => d.buyer === k || d.seller === k).some(d => this.dv(d, k).hasHint);
    v.tabs = TABS.map(([id, ic, label]) => ({ label, icon: ICON(ic), color: id === P.tab ? 'var(--fg-1)' : 'var(--fg-3)', badge: id === 'deals' && anyHint, go: () => this.tab(k, id) }));
    v.feedLoading = P.feed === 'loading'; v.feedError = P.feed === 'error'; v.feedOk = P.feed === 'ok'; v.feedErrorText = P.feedError || 'Serwer chwilowo nie odpowiada. Twoje środki i umowy są bez zmian.';
    if (scr === 'browse') {
      const F = P.filt, q = norm(F.q.trim());
      const setF = patch => this.setPh(k, Q => ({ filt: { ...Q.filt, ...(typeof patch === 'function' ? patch(Q.filt) : patch) } }));
      const tog = (arr, x) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x]);
      const list = s.deals.filter(d => d.status === 'Listed' && d.published && d.seller !== k && (F.cat === 'Wszystko' || d.cat === F.cat) && (!q || norm(d.title + ' ' + d.brand + ' ' + (d.cat || '')).includes(q)) && (!F.sizes.length || F.sizes.includes(d.size)) && (!F.conds.length || F.conds.includes(d.cond)) && (F.max >= PRICE_MAX || d.price <= F.max + 1e-9) && (!F.noFlaws || !d.flaws.length));
      list.sort((a, b) => (F.sort === 'cheap' ? a.price - b.price : F.sort === 'exp' ? b.price - a.price : b.changedAt - a.changedAt));
      v.feed = list.map(d => ({ id: d.id, title: d.title, priceText: money(d.price, d.currency), zl: this.zl(d.price, d.currency), meta: d.size + ' · ' + d.cond, cat: d.cat || 'foto', photo: d.photos[0] || null, open: () => this.go(k, 'listing', d.id) }));
      v.feedEmpty = list.length === 0; v.resultsLabel = list.length + ' ' + plural(list.length); v.sortLabel = SORTS.find(x => x[0] === F.sort)[1];
      v.q = F.q; v.hasQ = !!F.q; v.setQ = e => { const val = e.target.value; setF({ q: val }); }; v.clearQ = () => setF({ q: '' });
      const chip = (on, pick, label) => ({ label, pick, bg: on ? 'var(--fg-1)' : 'transparent', fg: on ? 'var(--ink-950)' : 'var(--fg-2)', border: on ? 'var(--fg-1)' : 'var(--line-strong)' });
      v.cats = ['Wszystko', ...s.cats.map(c => c.name)].map(c => chip(F.cat === c, () => setF({ cat: c }), c));
      const fCount = (F.sizes.length ? 1 : 0) + (F.conds.length ? 1 : 0) + (F.max < PRICE_MAX ? 1 : 0) + (F.noFlaws ? 1 : 0);
      v.fCount = fCount; v.hasFCount = fCount > 0; v.fBorder = fCount ? 'var(--accent)' : 'var(--line-strong)';
      v.openFilters = () => this.setPh(k, { sheet: 'filters' });
      v.fSizes = SIZE_OPTS.map(x => chip(F.sizes.includes(x), () => setF(G => ({ sizes: tog(G.sizes, x) })), x));
      v.fConds = FCONDS.map(x => chip(F.conds.includes(x), () => setF(G => ({ conds: tog(G.conds, x) })), x));
      v.fSorts = SORTS.map(([id, l]) => chip(F.sort === id, () => setF({ sort: id }), l));
      v.fPrice = cur === 'SOL'; v.fMax = F.max; v.fMaxText = F.max >= PRICE_MAX ? 'Bez limitu' : 'do ' + F.max.toFixed(2) + ' SOL · ≈ ' + this.zl(F.max, 'SOL');
      v.setFMax = e => { const val = parseFloat(e.target.value); setF({ max: val }); };
      v.toggleNoFlaws = () => setF(G => ({ noFlaws: !G.noFlaws })); v.swBg = F.noFlaws ? 'var(--accent)' : 'var(--line-strong)'; v.swX = F.noFlaws ? '23px' : '3px';
      v.fResults = 'Pokaż ' + list.length + ' ' + plural(list.length);
      v.clearFilters = () => setF({ q: '', cat: 'Wszystko', sizes: [], conds: [], max: PRICE_MAX, noFlaws: false, sort: 'new' });
    }

    if (top && top.id) {
      const d = this.deal(top.id);
      if (d) {
        const cb = me ? canBuy(me, PAYMENTS, s.linkError) : { ok: false, reason: '' }, short_ = bal < d.price;
        v.L = { title: d.title, photo: d.photos[0] || null, photoLabel: d.photos.length ? '' : 'brak zdjęć', brandLine: d.brand + ' · ' + d.size + ' · ' + d.cond + ' · ' + d.cat, desc: d.desc, flaws: d.flaws, flawsCount: d.flaws.length, noFlaws: d.flaws.length === 0,
          priceText: money(d.price, d.currency), zl: this.zl(d.price, d.currency),
          sellerLine: d.sellerName + (d.sellerWallet ? ' · ' + short(d.sellerWallet) : ''), isOwn: d.seller === k, notOwn: d.seller !== k, shipBy: hhmm(now + TIMEOUTS_DEMO.Paid),
          short: short_, blocked: !cb.ok, blockedReason: cb.reason };
        v.D = this.dv(d, k);
        v.openBuy = () => this.setPh(k, { sheet: 'buy', rulesOpen: false });
        v.buy = () => { if (!short_ && cb.ok) this.buy(k, d.id); };
        if (scr === 'brief') { const b = BRIEF[top.mode]; v.B = { title: b.title, warning: b.warning, items: b.items.map((t, i) => ({ n: pad(i + 1), text: t })), go: () => this.startRec(k, top.mode, d.id) }; }
        if (scr === 'pack') {
          const pk = P.pack, isRet = pk.mode === 'return', tr = pk.tracking.trim(), okT = tr.replace(/\s/g, '').length >= 3 && tr.length <= 32, can = !!pk.card && pk.qr && pk.video && okT;
          const stp = (done, cur_) => ({ b: done ? 'var(--secured)' : cur_ ? 'var(--fg-1)' : 'var(--line-strong)', bg: done ? 'var(--secured)' : 'transparent', fg: done ? 'var(--ink-950)' : cur_ ? 'var(--fg-1)' : 'var(--fg-3)' });
          const a = stp(pk.qr, !pk.qr), b = stp(pk.video, pk.qr && !pk.video), c = stp(okT, pk.qr && pk.video);
          const dl = d.deadlineAt || now;
          v.K = { title: isRet ? 'Spakuj zwrot' : 'Spakuj i nadaj', intro: isRet ? 'Aplikacja wygenerowała nową kartę zwrotu. Sprzedający zeskanuje ją po odebraniu paczki – wtedy środki wrócą do Ciebie.' : 'Nagranie pakowania jest Twoim dowodem, jeśli pojawi się reklamacja. Najpierw wydrukuj kartę, potem nagraj pakowanie.',
            s1Title: isRet ? 'Nowa karta zwrotu' : 'Karta z kodem', s1Todo: !pk.qr, s1Done: pk.qr, s1Border: a.b, s1Bg: a.bg, s1Fg: a.fg,
            cardPayload: pk.card ? pk.card.payload : '', hasCard: !!pk.card, cardError: pk.cardError, showCardText: WEB && !!pk.card,
            s2Title: isRet ? 'Nagraj pakowanie zwrotu' : 'Nagraj pakowanie', s2Todo: !pk.video, s2Done: pk.video, dur: pk.dur, s2Border: b.b, s2Bg: b.bg, s2Fg: b.fg, recOpacity: pk.qr ? 1 : 0.4,
            s3Border: c.b, s3Bg: c.bg, s3Fg: c.fg, tracking: pk.tracking,
            setTracking: e => { const val = e.target.value; this.setPh(k, Q => ({ pack: { ...Q.pack, tracking: val } })); },
            print: () => this.printPackCard(k, d.id), markPrinted: () => this.setPh(k, Q => ({ pack: { ...Q.pack, qr: true } })),
            rec: () => { if (this.state.phones[k].pack.qr) this.brief(k, isRet ? 'return' : 'packing', d.id); },
            deadline: (isRet ? 'Termin odesłania ok. ' : 'Termin nadania ok. ') + hhmm(dl), cta: isRet ? 'Odeślij paczkę' : 'Nadaj paczkę', cant: !can, opacity: can ? 1 : 0.4, submit: () => { if (can) this.submitPack(k, d.id); } };
        }
        if (scr === 'decide' || P.sheet === 'ok') {
          const dc = P.decide;
          v.X = { dur: dc.dur, priceText: money(d.price, d.currency), zl: this.zl(d.price, d.currency), text: dc.text, cant: !dc.cat, opacity: dc.cat ? 1 : 0.4, hasQr: !!P.scan?.payload,
            cats: CATS.map(c => ({ label: c, bg: dc.cat === c ? 'var(--amber-tint)' : 'transparent', fg: dc.cat === c ? 'var(--warning)' : 'var(--fg-2)', border: dc.cat === c ? 'var(--warning)' : 'var(--line-strong)', pick: () => this.setPh(k, Q => ({ decide: { ...Q.decide, cat: Q.decide.cat === c ? null : c } })) })),
            setText: e => { const val = e.target.value; this.setPh(k, Q => ({ decide: { ...Q.decide, text: val } })); },
            accept: () => this.setPh(k, { sheet: 'ok' }), acceptConfirm: () => this.accept(k, d.id), complain: () => { if (this.state.phones[k].decide.cat) this.complain(k, d.id); } };
        }
        if (P.sheet === 'ret') {
          v.RT = { priceText: money(d.price, d.currency), zl: this.zl(d.price, d.currency), confirm: () => this.confirmReturn(k, d.id) };
        }
        if (scr === 'verdict') {
          const vv = verdictView(d), win = d.verdict === 'Buyer', iB = d.buyer === k;
          const checks = vv.rows.map(r => {
            const damage = r.label === 'Nieujawniona wada';
            return { label: r.label, answer: damage ? (r.ok ? 'nie' : 'tak') : (r.ok ? 'tak' : 'nie'), color: r.ok ? 'var(--success)' : 'var(--warning)', hasDetail: !!r.detail, detail: r.detail };
          });
          let next = '';
          const dl = d.deadlineAt ? hhmm(d.deadlineAt) : '';
          if (d.status === 'ReturnRequested') next = iB ? 'Odeślij paczkę z nową kartą zwrotu do ok. ' + dl + '. Gdy sprzedający ją zeskanuje, dostaniesz ' + money(d.price, d.currency) + '.' : 'Kupujący odsyła paczkę do ok. ' + dl + '. Po odbiorze zeskanuj kartę zwrotu – wtedy środki wrócą do kupującego.';
          if (d.status === 'Returning') next = 'Zwrot w drodze. Po zeskanowaniu karty albo po terminie środki wrócą do kupującego.';
          const di = d.events.findIndex(e => e.st === 'Disputed'), res = di >= 0 ? d.events[di + 1] : null;
          v.V = { title: vv.title, result: win ? 'Wynik: zwrot dla kupującego' : 'Wynik: środki dla sprzedającego', conclusion: win ? 'zwrot dla kupującego (po odesłaniu paczki)' : 'środki dla sprzedającego', resultColor: win ? 'var(--warning)' : 'var(--success)',
            reasoning: vv.reasoning, byEvidence: vv.byEvidence, checks, hasChecks: checks.length > 0, next, hasNext: !!next, actReturn: iB && d.status === 'ReturnRequested', returnFlow: () => this.openPack(k, d.id, 'return'),
            reportShort: d.reportHash ? short(d.reportHash) : '', reportHref: d.reportHash ? api.mediaUrl(d.reportHash) : null,
            model: d.analysis?.model || '', href: res && res.href ? res.href : null };
        }
      }
    }
    if (scr === 'record' && P.rec) v.R = { mode: P.rec.mode, done: (uri, payload, secs) => this.recDone(k, uri, payload, secs), cancel: () => this.back(k) };
    if (scr === 'scan' && P.scan) v.Q = { prefix: P.scan.mode === 'unbox' ? 'UNBOX1:' : 'UNBOX1R:', done: payload => this.scanDone(k, payload), cancel: () => this.back(k),
      hint: P.scan.mode === 'unbox' ? 'Nagranie otwarcia jest zapisane. Zeskanuj kartę, która była w paczce.' : 'Zeskanuj kartę zwrotu z odebranej paczki.' };
    if (scr === 'photo') v.PH = { done: uri => this.setPh(k, Q => ({ form: { ...Q.form, photos: [...Q.form.photos, uri].slice(0, 4) }, stack: Q.stack.slice(0, -1) })), cancel: () => this.back(k) };
    if (scr === 'sell') {
      const f = P.form, ok = f.title.trim().length > 2 && f.price.trim().length > 0 && (!me || PAYMENTS !== 'solana' || canBuy(me, PAYMENTS, s.linkError).ok);
      v.form = f; v.formZl = this.zl(parseFloat((f.price || '').replace(',', '.')) || 0, cur); v.cantPublish = !ok; v.publishOpacity = ok ? 1 : 0.4; v.priceError = f.priceError; v.unit = cur === 'SOL' ? 'SOL' : 'zł';
      v.sellBlocked = PAYMENTS === 'solana' && me && !canBuy(me, PAYMENTS, s.linkError).ok ? canBuy(me, PAYMENTS, s.linkError).reason : '';
      v.priceHint = cur === 'SOL' ? 'Maks. 0,1 SOL. Wystawienie kosztuje depozyt za miejsce w sieci (ok. 0,0055 SOL).' : 'Cena w złotych (tryb demo).';
      v.conds = CONDS.map(c => ({ label: c, bg: c === f.cond ? 'var(--fg-1)' : 'transparent', fg: c === f.cond ? 'var(--ink-950)' : 'var(--fg-2)', pick: () => this.setPh(k, Q => ({ form: { ...Q.form, cond: c } })) }));
      const catId = f.catId ?? s.cats[0]?.id;
      v.formCats = s.cats.map(c => ({ label: c.name, bg: c.id === catId ? 'var(--fg-1)' : 'transparent', fg: c.id === catId ? 'var(--ink-950)' : 'var(--fg-2)', border: c.id === catId ? 'var(--fg-1)' : 'var(--line-strong)', pick: () => this.setPh(k, Q => ({ form: { ...Q.form, catId: c.id } })) }));
      v.formFlaws = f.flaws.map((t, i) => ({ text: t, remove: () => this.setPh(k, Q => ({ form: { ...Q.form, flaws: Q.form.flaws.filter((_, j) => j !== i) } })) }));
      v.formPhotos = f.photos.map((uri, i) => ({ uri, remove: () => this.setPh(k, Q => ({ form: { ...Q.form, photos: Q.form.photos.filter((_, j) => j !== i) } })) }));
      v.canAddPhoto = !WEB && f.photos.length < 4; v.addPhoto = () => this.go(k, 'photo', 'form');
      v.fTitle = this.setForm(k, 'title'); v.fBrand = this.setForm(k, 'brand'); v.fSize = this.setForm(k, 'size'); v.fPrice = this.setForm(k, 'price'); v.fFlaw = this.setForm(k, 'flawDraft'); v.fDesc = this.setForm(k, 'desc');
      v.addFlaw = () => this.setPh(k, Q => (Q.form.flawDraft.trim() ? { form: { ...Q.form, flaws: [...Q.form.flaws, Q.form.flawDraft.trim()], flawDraft: '' } } : {}));
      v.publish = () => { if (ok) this.publish(k); };
    }
    if (scr === 'deals') {
      const buys = P.dealsTab === 'Zakupy';
      const rows = s.deals.filter(d => (buys ? d.buyer === k : d.seller === k)).sort((a, b) => b.changedAt - a.changedAt).map(d => this.dv(d, k));
      v.rowsLoading = P.feed === 'loading'; v.rows = rows; v.rowsEmpty = P.feed !== 'loading' && rows.length === 0; v.rowsEmptyText = buys ? 'Nie masz jeszcze zakupów' : 'Nie masz jeszcze ogłoszeń';
      v.buysLine = buys ? 'var(--fg-1)' : 'transparent'; v.buysColor = buys ? 'var(--fg-1)' : 'var(--fg-3)'; v.salesLine = !buys ? 'var(--fg-1)' : 'transparent'; v.salesColor = !buys ? 'var(--fg-1)' : 'var(--fg-3)';
      v.tabBuys = () => this.setPh(k, { dealsTab: 'Zakupy' }); v.tabSales = () => this.setPh(k, { dealsTab: 'Sprzedaże' });
    }
    if (scr === 'wallet') {
      const w = s.wallet, esc = w ? toUnits(w.heldMinor, w.currency) : 0;
      v.escrow = money(esc, cur); v.escrowZl = this.zl(esc, cur); v.hasEscrow = esc > 0;
      const R = s.rate, at = R.at ? new Date(R.at) : null, t = at ? pad(at.getHours()) + ':' + pad(at.getMinutes()) + ':' + pad(at.getSeconds()) : '';
      v.showRate = cur === 'SOL'; v.rateText = fmtPL(R.pln, 2) + ' zł'; v.rateDot = R.live ? 'var(--secured)' : 'var(--warning)';
      v.rateSrc = (R.live ? 'Na żywo z CoinGecko · ' + t : 'Kurs przykładowy – brak połączenia z serwisem kursów') + '. Przeliczenia są orientacyjne, umowa rozlicza się tylko w SOL.';
      let hist = [];
      if (w && w.ledger.length) hist = w.ledger.map(e => ({ label: e.label, amt: toUnits(Math.abs(e.amountMinor), w.currency), in: e.amountMinor > 0 }));
      else for (const d of s.deals) {
        if (d.buyer === k && d.status !== 'Listed') hist.push({ label: 'Zakup · ' + d.title, amt: d.price, in: false, at: d.events[1]?.at || 0 });
        if (d.seller === k && d.status === 'Completed') hist.push({ label: 'Wypłata · ' + d.title, amt: d.price, in: true, at: d.changedAt });
        if (d.buyer === k && d.status === 'Refunded') hist.push({ label: 'Zwrot · ' + d.title, amt: d.price, in: true, at: d.changedAt });
      }
      if (!(w && w.ledger.length)) hist.sort((a, b) => b.at - a.at);
      v.history = hist.map(h => ({ label: h.label, amount: (h.in ? '+' : '−') + money(h.amt, cur), color: h.in ? 'var(--success)' : 'var(--fg-1)', icon: ICON(h.in ? 'arrow-down-left' : 'arrow-up-right'), zl: this.zl(h.amt, cur) }));
      v.hasHistory = v.history.length > 0;
    }
    v.sheetBuy = P.sheet === 'buy' && !!v.L; v.sheetDev = P.sheet === 'dev'; v.sheetFilters = P.sheet === 'filters' && scr === 'browse'; v.sheetOk = P.sheet === 'ok' && !!v.X; v.sheetRet = P.sheet === 'ret' && !!v.RT; v.closeSheet = () => this.setPh(k, { sheet: null });
    v.rulesOpen = P.rulesOpen; v.rulesLabel = P.rulesOpen ? 'Ukryj reguły' : 'Zobacz jakie reguły →'; v.toggleRules = () => this.setPh(k, Q => ({ rulesOpen: !Q.rulesOpen }));
    v.hasBanner = !!P.banner && !P.tx; v.bannerText = P.banner ? P.banner.text : '';
    v.bannerOpen = () => { const b = this.state.phones[k].banner; this.setPh(k, b && b.id && !this.state.phones[k].onb ? { banner: null, tab: 'deals', stack: [{ screen: 'deal', id: b.id }] } : { banner: null }); };
    v.hasTx = !!P.tx;
    if (P.tx) {
      const T = P.tx, order = ['upload', 'chain', 'sync'];
      const defs = [];
      if (T.upload) defs.push(['upload', 'Wysyłanie pliku']);
      defs.push(['chain', 'Zapisywanie w umowie'], ['sync', 'Potwierdzanie i odświeżanie']);
      const at = order.indexOf(T.stage);
      const steps = defs.map(([id, label]) => {
        const i = order.indexOf(id), st = T.phase !== 'run' ? 'done' : i < at ? 'done' : i === at ? 'current' : 'todo';
        const c = st === 'done' ? 'var(--success)' : st === 'current' ? 'var(--accent)' : 'var(--line-strong)';
        return { label, color: c, fill: st === 'todo' ? 'transparent' : c, labelColor: st === 'todo' ? 'var(--fg-3)' : 'var(--fg-1)', weight: st === 'current' ? 700 : 500, showBar: false, pct: '0%', hasDetail: false, detail: '' };
      });
      v.T = { run: T.phase === 'run', ok: T.phase === 'ok', fail: T.phase === 'fail', title: T.title, steps, okTitle: T.okTitle || '', okText: T.okText || '', sigShort: T.sig ? short(T.sig) : '', href: T.href || null, hasHref: !!T.href,
        failTitle: T.failTitle || '', failText: T.failText || '', code: T.code || '', hasCode: !!T.code, retryable: !!T.retryable, needFunds: !!T.needFunds && PAYMENTS === 'solana', topUp: () => this.faucet(k),
        retry: () => this.retry(k), close: () => this.setPh(k, { tx: null }) };
    }
    return v;
  }

  render() { return React.createElement(Ctx.Provider, { value: this.renderVals() }, this.props.children); }
  renderVals() {
    const k = this.state.active, s = this.state, P = s.phones[k];
    const on2 = on => ({ bg: on ? 'var(--fg-1)' : 'transparent', fg: on ? 'var(--ink-950)' : 'var(--fg-1)', border: on ? 'var(--fg-1)' : 'var(--line-strong)' });
    const g = {
      clockNow: hhmm(this.now()), solanaMode: PAYMENTS === 'solana', devMsg: s.devMsg, hasDevMsg: !!s.devMsg,
      skip: async () => { try { await devClock(660); await this.syncClock(); await this.refresh(); this.setState({ devMsg: 'Zegar serwera przesunięty o 11 min.' }); } catch (e) { this.setState({ devMsg: explain(e).text }); } },
      scenarios: [['ok', 'Ocena: odrzucona'], ['defect', 'Ocena: uznana']].map(([id, label]) => ({ label, ...on2((demoScenario ?? 'ok') === id), pick: () => { setDemoScenario(id); this.setState({ devMsg: 'Następna reklamacja: ' + label.toLowerCase() + '.' }); } })),
      accounts: QUICK.map(([email, label]) => ({ label, bg: s.me?.email === email ? 'var(--fg-1)' : 'transparent', fg: s.me?.email === email ? 'var(--ink-950)' : 'var(--fg-2)', pick: () => this.switchAccount(email) })),
      env: [['Serwer', api.base], ['Tryb płatności', PAYMENTS], ['Portfel', s.wallet?.address || '—'], ['Weryfikator', ARBITER || '—']],
      walletJson: P?.walletJson || '', setWalletJson: t => this.setPh(k, { walletJson: t }),
      importWallet: async () => { try { const a = await importWalletJson(this.state.phones[k].walletJson); this.setState({ devMsg: 'Portfel ' + short(a) + ' zapisany. Uruchom aplikację ponownie (odśwież stronę).' }); } catch (e) { this.setState({ devMsg: 'To nie jest plik portfela (tablica 64 liczb).' }); } },
      logout: () => this.logout(),
    };
    return { phones: [{ ...this.vm(k), ...g }] };
  }
}

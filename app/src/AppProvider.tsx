// @ts-nocheck
// Demo engine: state machine mock, view models, timers. Ported 1:1 from the Sellsor prototype.
// Replace tx() / oracle() / fetchRate() with app/src/solana, oracle events and a real price source.
import React from 'react';
export const Ctx = React.createContext(null);
export const useP = () => React.useContext(Ctx).phones[0];
const TO = { Paid: 600, Shipped: 3600, Disputed: 600, ReturnRequested: 600, Returning: 600 };
const GRACE = 8;
const SETTLE = { Paid: 'Refunded', Shipped: 'Completed', Disputed: 'ReturnRequested', ReturnRequested: 'Completed', Returning: 'Refunded' };
const BENEF = { Paid: 'buyer', Shipped: 'seller', Disputed: null, ReturnRequested: 'seller', Returning: 'buyer' };
const OUTCOME = { Paid: 'Środki wrócą do kupującego.', Returning: 'Środki wrócą do kupującego.', Shipped: 'Środki trafią do sprzedającego.', ReturnRequested: 'Środki trafią do sprzedającego.', Disputed: 'Kupujący odeśle paczkę za zwrot środków.' };
const STATUS = { Listed: ['Wystawione', 'var(--fg-3)'], Paid: ['Opłacone – czeka na wysyłkę', 'var(--info)'], Shipped: ['W drodze', 'var(--info)'], Disputed: ['Reklamacja – trwa ocena', 'var(--warning)'], ReturnRequested: ['Reklamacja uznana – odeślij paczkę', 'var(--warning)'], Returning: ['Zwrot w drodze', 'var(--info)'], Completed: ['Zakończone – środki u sprzedającego', 'var(--success)'], Refunded: ['Środki zwrócone kupującemu', 'var(--success)'], Cancelled: ['Anulowane', 'var(--fg-3)'] };
const FUT = { Listed: ['Paid', 'Shipped', 'Completed'], Paid: ['Shipped', 'Completed'], Shipped: ['Completed'], Disputed: [], ReturnRequested: ['Returning', 'Refunded'], Returning: ['Refunded'] };
const ALT = { Listed: 'albo: Anulowane', Paid: 'brak nadania w terminie → Środki zwrócone kupującemu', Shipped: 'albo: Reklamacja · brak decyzji w terminie → Zakończone', Disputed: 'ocena „sprzedający” → Zakończone · „kupujący” → odesłanie paczki · brak oceny w terminie → odesłanie paczki', ReturnRequested: 'brak odesłania w terminie → Zakończone', Returning: 'brak potwierdzenia w terminie → Środki zwrócone kupującemu' };
const ESCROW = ['Paid', 'Shipped', 'Disputed', 'ReturnRequested', 'Returning'];
const DEADLINE_MSG = { Paid: 'Termin nadania minął. Środki może teraz odebrać kupujący.', Shipped: 'Termin na nagranie otwarcia minął. Środki trafią do sprzedającego.', ReturnRequested: 'Termin odesłania paczki minął. Środki trafią do sprzedającego.', Disputed: 'Termin oceny minął. Kupujący odsyła paczkę za zwrot środków.' };
const FEE = 0.000005;
const ERR = { Unauthorized: 6000, InvalidStatus: 6001, DeadlineNotReached: 6002, DeadlinePassed: 6003, QrMismatch: 6004, ListingMismatch: 6005, ArbiterMismatch: 6006 };
const errCode = n => 'Kod programu: ' + n + ' · ' + ERR[n] + ' (0x' + ERR[n].toString(16) + ')';
const PROG_FAIL = {
  settle: ['Termin jeszcze nie minął według sieci', 'Zegar telefonu wyprzedza czas sieci o kilka sekund. Spróbuj za chwilę – nic nie zostało pobrane.', 'DeadlineNotReached', true],
  buy: ['Ogłoszenie nie zgadza się z umową', 'Opis albo arbiter różnią się od tego, co widzisz w aplikacji, więc umowa odrzuciła zakup. Środki nie zostały pobrane.', 'ListingMismatch', false],
  qr: ['Kod z karty nie pasuje do tej umowy', 'Karta pochodzi z innej paczki. Umowa jest bez zmian – zeskanuj kartę z tej przesyłki.', 'QrMismatch', true],
  def: ['Termin na tę czynność minął', 'Umowa przyjmuje ją tylko przed terminem. Po terminie wykona regułę sama – środki nie przepadły.', 'DeadlinePassed', false],
};
const FAIL_OPTS = [['ok', 'Wszystko działa'], ['net', 'Sieć nie odpowie'], ['upload', 'Zerwie się wysyłka nagrania'], ['program', 'Umowa odrzuci operację']];
const SCENES = [
  { id: 'A', label: 'A · Reklamacja na żywo', cue: 'Kupująca: „Nagraj otwarcie” → pokazuje plamę → „Reklamuję” → po kilku sekundach ocena AI z listą warunków → link do Explorera.' },
  { id: 'B', label: 'B · Zakup i odbiór', cue: "Kupująca kupuje kurtkę Levi's → sprzedający dostaje powiadomienie i nadaje paczkę → kupująca nagrywa otwarcie → „Wszystko OK” → wypłata w Explorerze." },
  { id: 'C', label: 'C · Pośrednik znika', cue: 'Sprzedająca nie nadała płaszcza. Odliczanie dochodzi do zera, aplikacja sprawdza czas sieci, przycisk się odblokowuje → „Odbierz środki”. Nikt nie musi się zgodzić.' },
];
const CATEGORIES = [
  ['Kurtki', ['Kurtka jeansowa', 'Kurtka puchowa', 'Kurtka przejściowa', 'Parka', 'Ramoneska'], ["Levi's", 'Zara', 'The North Face', 'Carhartt', 'Mango']],
  ['Bluzy', ['Bluza z kapturem', 'Bluza crewneck', 'Bluza rozpinana'], ['Nike', 'Adidas', 'Champion', 'Carhartt', 'H&M']],
  ['Swetry', ['Sweter z wełny', 'Kardigan', 'Golf', 'Sweter oversize'], ['COS', 'Arket', 'Uniqlo', 'Massimo Dutti', '& Other Stories']],
  ['Koszule', ['Koszula lniana', 'Koszula oxford', 'Koszula flanelowa'], ['Massimo Dutti', 'Ralph Lauren', 'Uniqlo', 'Reserved']],
  ['T-shirty', ['T-shirt basic', 'T-shirt z nadrukiem', 'Longsleeve'], ['Nike', 'Stüssy', 'COS', 'Uniqlo', 'H&M']],
  ['Spodnie', ['Jeansy 501', 'Chinosy', 'Spodnie cargo', 'Spodnie dresowe'], ["Levi's", 'Dickies', 'Zara', 'Adidas']],
  ['Sukienki', ['Sukienka midi', 'Sukienka maxi', 'Sukienka koszulowa'], ['Mango', 'Zara', '& Other Stories', 'Reserved']],
  ['Buty', ['Sneakersy', 'Botki', 'Mokasyny', 'Trampki'], ['New Balance', 'Nike', 'Dr. Martens', 'Converse', 'Vans']],
  ['Akcesoria', ['Torba na ramię', 'Czapka beanie', 'Szalik wełniany', 'Pasek skórzany'], ['COS', 'Carhartt', 'Arket', 'Mango']],
];
const FCONDS = ['Nowy z metką', 'Bardzo dobry', 'Dobry', 'Używany'];
const FLAW_POOL = ['Drobne zmechacenie', 'Przetarcie przy mankiecie', 'Mała plamka na podszewce', 'Brak metki z rozmiarem', 'Lekkie odbarwienie', 'Zaciągnięcie na rękawie', 'Ślady noszenia na podeszwie'];
const SIZE_OPTS = ['XS', 'S', 'M', 'L', 'XL', '38', '39', '40', '41', '42', '43', '44', '45', 'Uniwersalny'];
const SORTS = [['new', 'Najnowsze'], ['cheap', 'Najtańsze'], ['exp', 'Najdroższe']];
const PRICE_MAX = 1.5;
const DIAC = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z', 'ü': 'u' };
const norm = s => s.toLowerCase().replace(/[ąćęłńóśźżü]/g, ch => DIAC[ch]);
const fmtPL = (v, dp) => { const [i, d] = v.toFixed(dp).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (d ? ',' + d : ''); };
const plural = n => (n === 1 ? 'ogłoszenie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'ogłoszenia' : 'ogłoszeń');
function genItems() {
  let a = 20261004;
  const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = xs => xs[Math.floor(r() * xs.length)];
  const out = [];
  for (let i = 0; i < 96; i++) {
    const [cat, names, brands] = pick(CATEGORIES), name = pick(names), brand = pick(brands);
    const size = cat === 'Buty' ? String(38 + Math.floor(r() * 8)) : cat === 'Akcesoria' ? 'Uniwersalny' : pick(['XS', 'S', 'M', 'L', 'XL']);
    const cond = pick(FCONDS), nf = r() < 0.45 ? 0 : r() < 0.7 ? 1 : 2, flaws = [];
    while (flaws.length < nf) { const f = pick(FLAW_POOL); if (!flaws.includes(f)) flaws.push(f); }
    const price = Math.round((0.05 + Math.pow(r(), 1.6) * 1.15) * 100) / 100;
    const seller = r() < 0.1 ? 'kuba' : pick(['marta', 'ania']);
    out.push({ id: 'g' + i, no: String(100 + i).padStart(4, '0'), title: name + ' ' + brand, brand, size, cond, cat, price, desc: name + ' marki ' + brand + ', rozmiar ' + size + '. Stan: ' + cond.toLowerCase() + '.', flaws, seller, status: 'Listed', changedAt: -(1800 + i * 1500 + Math.floor(r() * 900)) });
  }
  return out;
}
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const rnd = n => Array.from({ length: n }, () => B58[Math.floor(Math.random() * 58)]).join('');
const short = s => s.slice(0, 4) + '…' + s.slice(-4);
const ICON = n => n;
const EXPL = sig => 'https://explorer.solana.com/tx/' + sig + '?cluster=devnet';
const BASE = new Date(2026, 9, 4, 14, 0, 0).getTime();
const pad = n => String(n).padStart(2, '0');
const hhmm = t => { const d = new Date(BASE + t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const DAYS = ['ndz', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const stamp = t => { const d = new Date(BASE + t * 1000); return (d.toDateString() === new Date(BASE).toDateString() ? '' : DAYS[d.getDay()] + ' ') + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const hms = s => { s = Math.max(0, Math.floor(s)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
const ARBITER = 'ArbT4Gq9xVmZ7kNc2pRwYhB5sLdF8uJtE3nQaK6vW1';
const USERS = {
  ola: { name: 'Ola', addr: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
  kuba: { name: 'Kuba', addr: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' },
  marta: { name: 'Marta', addr: 'HN7cABqLq46Es1jh92dQQisAq662SmxEZZsHHe4YWrH' },
  ania: { name: 'Ania', addr: '3Kzh9qAqVWQhyNwZDN6BYzAzRXYgEXZSPFT4QnMrmjke' },
};
const PHONES = ['ola', 'kuba'];
const ROLE = { ola: { bg: '#9945FF', label: 'Kupująca · Ola', caption: 'Ola' }, kuba: { bg: '#FFB547', label: 'Sprzedający · Kuba', caption: 'Kuba' } };
const CONDS = ['Nowy', 'B. dobry', 'Dobry', 'Używany'];
const CATS = ['Nieujawniona wada', 'Inny przedmiot', 'Zły rozmiar', 'Uszkodzenie'];
const TABS = [['browse', 'layout-grid', 'Przeglądaj'], ['sell', 'plus', 'Wystaw'], ['deals', 'package', 'Transakcje'], ['wallet', 'wallet', 'Portfel']];
const BRIEF = {
  unboxing: { title: 'Nagraj otwarcie od zamkniętej paczki', items: ['Zacznij od zamkniętej paczki – pokaż etykietę i taśmę.', 'Nagrywaj bez przerw. Limit to 2 minuty.', 'Pokaż kartę z kodem, gdy tylko ją zobaczysz.', 'Pokaż całe ubranie z obu stron, w dobrym świetle.'], warning: 'Ucięte, zasłonięte albo ciemne nagranie liczy się przeciwko osobie, która je nagrała. Bez nagrania nie ma reklamacji.' },
  packing: { title: 'Nagraj pakowanie w jednym ujęciu', items: ['Pokaż ubranie z obu stron, także wady z listy.', 'Włóż kartę z kodem do środka – na nagraniu.', 'Zaklej paczkę i pokaż etykietę z numerem.', 'Nagrywaj bez przerw. Limit to 2 minuty.'], warning: 'Jeśli kupujący złoży reklamację, słabe nagranie pakowania działa przeciwko Tobie.' },
  return: { title: 'Nagraj pakowanie zwrotu', items: ['Pokaż ubranie, które odsyłasz, z obu stron.', 'Włóż nową kartę zwrotu do środka – na nagraniu.', 'Zaklej paczkę i pokaż etykietę z numerem.', 'Nagrywaj bez przerw. Limit to 2 minuty.'], warning: 'Słabe albo ucięte nagranie zwrotu działa przeciwko Tobie.' },
};

export class AppProvider extends React.Component<any, any> {
  timers = [];
  pending = {};
  state = { ...this.initial(), rate: { pln: 640, live: false, at: null } };

  initial() {
    this.t0 = Date.now();
    const ev = (st, at, label) => ({ st, label: label || '', at, sig: rnd(88) });
    const mk = o => ({ buyer: null, hidden: false, flaws: [], listingHash: rnd(44), pda: rnd(44), ...o });
    const deals = [
      mk({ id: 'd1', no: '0011', title: "Kurtka jeansowa Levi's", brand: "Levi's", size: 'M', cond: 'Bardzo dobry', price: 0.42, fiat: 312, desc: 'Kurtka trucker z lat 90., ciemny denim. Noszona kilka sezonów, bez dziur.', flaws: ['Przetarcie przy lewym mankiecie', 'Brak jednego guzika wewnątrz'], seller: 'kuba', status: 'Listed', changedAt: -5400, events: [ev('Listed', -5400)] }),
      mk({ id: 'd2', no: '0012', title: 'New Balance 550', brand: 'New Balance', size: '42', cond: 'Nowy z metką', price: 0.55, fiat: 409, desc: 'Sneakersy biało-zielone, nienoszone, w oryginalnym pudełku.', seller: 'ania', status: 'Listed', changedAt: -9000, events: [ev('Listed', -9000)] }),
      mk({ id: 'd3', no: '0013', title: 'Koszula lniana Massimo Dutti', brand: 'Massimo Dutti', size: 'L', cond: 'Bardzo dobry', price: 0.24, fiat: 178, desc: 'Biała koszula z lnu, krój regular.', flaws: ['Odbarwienie na kołnierzu'], seller: 'marta', status: 'Listed', changedAt: -12000, events: [ev('Listed', -12000)] }),
      mk({ id: 'd8', no: '0014', title: 'Sukienka midi Mango', brand: 'Mango', size: 'S', cond: 'Dobry', price: 0.15, fiat: 111, desc: 'Sukienka w drobny wzór, wiskoza.', seller: 'ania', status: 'Listed', changedAt: -15000, events: [ev('Listed', -15000)] }),
      mk({ id: 'd4', no: '0006', title: 'Płaszcz wełniany Arket', brand: 'Arket', size: 'L', cond: 'Bardzo dobry', price: 0.61, fiat: 453, desc: 'Płaszcz wełniany w kolorze camel.', flaws: ['Drobna plamka na podszewce'], seller: 'marta', buyer: 'ola', status: 'Paid', changedAt: -(TO.Paid - 45), events: [ev('Listed', -90000), ev('Paid', -(TO.Paid - 45))] }),
      mk({ id: 'd5', no: '0007', title: 'Sweter COS z wełny merino', brand: 'COS', size: 'S', cond: 'Dobry', price: 0.18, fiat: 134, desc: 'Sweter z wełny merino, szary melanż.', flaws: ['Lekkie mechacenie pod pachami'], seller: 'kuba', buyer: 'ola', status: 'Shipped', changedAt: -1260, hidden: true, tracking: '6200 4417 9032 18', packHash: rnd(44), qrCommit: rnd(44), events: [ev('Listed', -86400), ev('Paid', -2400), ev('Shipped', -1260)] }),
      mk({ id: 'd6', no: '0005', title: 'Bluza Carhartt', brand: 'Carhartt', size: 'M', cond: 'Dobry', price: 0.33, fiat: 245, desc: 'Bluza z kapturem, granatowa.', seller: 'ania', buyer: 'ola', status: 'Completed', changedAt: -170000, tracking: '6200 1180 5521 07', packHash: rnd(44), qrCommit: rnd(44), events: [ev('Listed', -260000), ev('Paid', -200000), ev('Shipped', -190000), ev('Completed', -170000, 'Odebrane – wszystko OK')] }),
      mk({ id: 'd9', no: '0003', title: 'Kurtka Nike ACG', brand: 'Nike', size: 'L', cond: 'Bardzo dobry', price: 0.54, fiat: 401, desc: 'Kurtka przeciwdeszczowa.', seller: 'kuba', buyer: 'ania', status: 'Completed', changedAt: -300000, tracking: '6200 7781 0042 33', packHash: rnd(44), qrCommit: rnd(44), events: [ev('Listed', -400000), ev('Paid', -350000), ev('Shipped', -330000), ev('Completed', -300000, 'Odebrane – wszystko OK')] }),
    ];
    const CAT0 = { d1: 'Kurtki', d2: 'Buty', d3: 'Koszule', d8: 'Sukienki', d4: 'Kurtki', d5: 'Swetry', d6: 'Bluzy', d9: 'Kurtki' };
    deals.forEach(d => { d.cat = CAT0[d.id]; });
    genItems().forEach(o => deals.push(mk({ ...o, events: [ev('Listed', o.changedAt)] })));
    const onb = this.props.onboarding ?? true;
    return {
      offset: 0, tick: 0, failMode: 'ok', scene: null, active: this.props.account === 'Kuba (sprzedający)' ? 'kuba' : 'ola', deals,
      balances: { ola: this.props.buyerBalance ?? 0.38, kuba: 0.84, marta: 2.1, ania: 1.3 },
      history: {
        ola: [{ label: 'Zakup · Płaszcz Arket', amt: 0.61, in: false }, { label: 'Zakup · Sweter COS', amt: 0.18, in: false }, { label: 'Zakup · Bluza Carhartt', amt: 0.33, in: false }, { label: 'Doładowanie testowe', amt: 1.5, in: true }],
        kuba: [{ label: 'Wypłata · Kurtka Nike ACG', amt: 0.54, in: true }, { label: 'Doładowanie testowe', amt: 0.3, in: true }],
      },
      phones: { ola: this.ph('ola', onb), kuba: this.ph('kuba', false) },
    };
  }
  ph(user, onb) {
    return { user, tab: 'browse', stack: [], onb: onb ? 'welcome' : null, banner: null, tx: null, sheet: null, rulesOpen: false, feed: 'loading', dealsTab: user === 'kuba' ? 'Sprzedaże' : 'Zakupy',
      form: { title: 'Marynarka Zara', brand: 'Zara', size: 'M', cond: 'B. dobry', price: '0.20', flaws: ['Drobne zaciągnięcie na rękawie'], flawDraft: '' },
      rec: null, scan: null, dealsLoad: false, filt: { q: '', cat: 'Wszystko', sizes: [], conds: [], max: PRICE_MAX, sort: 'new', noFlaws: false }, decide: { cat: null, text: '', dur: '' }, pack: { qr: false, video: false, dur: '', tracking: '', mode: 'ship' } };
  }
  componentDidMount() {
    this.iv = setInterval(() => this.setState({ tick: Date.now() }), 250); PHONES.forEach(k => this.loadFeed(k));
    this.fetchRate(); this.rateIv = setInterval(() => this.fetchRate(), 30000);
    this.jIv = setInterval(() => { if (!this.state.rate.live) this.setState(s => ({ rate: { ...s.rate, pln: s.rate.pln * (1 + (Math.random() - 0.5) * 0.003), at: Date.now() } })); }, 4000);
  }
  componentWillUnmount() { clearInterval(this.iv); clearInterval(this.rateIv); clearInterval(this.jIv); this.timers.forEach(clearTimeout); }
  now() { return Math.floor((Date.now() - this.t0) / 1000) + this.state.offset; }
  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  reset() { this.timers.forEach(clearTimeout); this.timers = []; this.pending = {}; this.setState(this.initial(), () => PHONES.forEach(k => this.loadFeed(k))); }
  async fetchRate() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=pln');
      const j = await r.json(), v = j && j.solana && j.solana.pln;
      if (typeof v !== 'number') throw new Error('no rate');
      this.setState({ rate: { pln: v, live: true, at: Date.now() } });
    } catch (e) { this.setState(s => ({ rate: { ...s.rate, live: false, at: s.rate.at || Date.now() } })); }
  }
  zl(sol) { const v = sol * this.state.rate.pln; if (v > 0 && v < 0.01) return '< 0,01 zł'; return fmtPL(v, v < 100 ? 2 : 0) + ' zł'; }
  switchTo(u) {
    this.setPh(this.state.active, { sheet: null }); this.setState({ active: u });
    const b = this.state.phones[u].banner;
    if (b) { const st = b.st; this.later(() => this.setPh(u, P => (P.banner && P.banner.st === st ? { banner: null } : {})), 6500); }
  }
  takeFail(ok) { const m = this.state.failMode; if (m !== 'ok' && ok(m)) { this.setState({ failMode: 'ok' }); return m; } return null; }
  fallbackQr() { return (this.props.qrMode ?? 'Podczas nagrania') === 'Skan po nagraniu'; }
  scene(id) {
    this.timers.forEach(clearTimeout); this.timers = []; this.pending = {};
    const s = this.initial(), P = s.phones;
    s.scene = id; s.active = 'ola'; P.ola = { ...P.ola, onb: null };
    if (id === 'A') { P.ola = { ...P.ola, tab: 'deals', dealsTab: 'Zakupy', stack: [{ screen: 'deal', id: 'd5' }] }; P.kuba = { ...P.kuba, tab: 'deals', dealsTab: 'Sprzedaże', stack: [{ screen: 'deal', id: 'd5' }] }; }
    if (id === 'B') { s.balances = { ...s.balances, ola: Math.max(s.balances.ola, 1.38) }; P.ola = { ...P.ola, tab: 'browse', stack: [{ screen: 'listing', id: 'd1' }] }; P.kuba = { ...P.kuba, tab: 'deals', dealsTab: 'Sprzedaże', stack: [] }; }
    if (id === 'C') { const at = -(TO.Paid - 12); s.deals = s.deals.map(d => (d.id === 'd4' ? { ...d, changedAt: at, events: [d.events[0], { ...d.events[1], at }] } : d)); P.ola = { ...P.ola, tab: 'deals', dealsTab: 'Zakupy', stack: [{ screen: 'deal', id: 'd4' }] }; }
    this.setState(s, () => PHONES.forEach(k => this.loadFeed(k)));
  }

  setPh(k, patch) { this.setState(s => { const P = s.phones[k]; const np = typeof patch === 'function' ? patch(P, s) : patch; return { phones: { ...s.phones, [k]: { ...P, ...np } } }; }); }
  go(k, screen, id, extra) { this.setPh(k, P => ({ stack: [...P.stack, { screen, id, ...extra }], sheet: null })); }
  back(k) { this.setPh(k, P => ({ stack: P.stack.slice(0, -1), sheet: null, rec: null, scan: null })); }
  tab(k, t) { this.setPh(k, { tab: t, stack: [], sheet: null }); if (t === 'browse') this.loadFeed(k); if (t === 'deals') { this.setPh(k, { dealsLoad: true }); this.later(() => this.setPh(k, { dealsLoad: false }), 700); } }
  deal(id, s = this.state) { return s.deals.find(d => d.id === id); }
  loadFeed(k) { this.setPh(k, { feed: 'loading' }); this.later(() => this.setPh(k, { feed: this.takeFail(m => m === 'net') ? 'error' : 'ok' }), 1100); }

  notify(user, text, id) {
    if (!PHONES.includes(user)) return;
    const st = Date.now() + Math.random();
    this.setPh(user, { banner: { text, id, st } });
    if (user !== this.state.active) return;
    this.later(() => this.setPh(user, P => (P.banner && P.banner.st === st ? { banner: null } : {})), 6500);
  }
  transition(s, id, to, extra, sig, now, label) {
    const d = this.deal(id, s);
    const nd = { ...d, ...extra, status: to, changedAt: now, events: [...d.events, { st: to, label: label || '', at: now, sig }] };
    const bal = { ...s.balances }, hist = { ...s.history };
    const add = (u, amt, l, inc) => { bal[u] = (bal[u] || 0) + (inc ? amt : -amt); if (hist[u]) hist[u] = [{ label: l, amt, in: inc }, ...hist[u]]; };
    if (to === 'Paid') add(nd.buyer, d.price, 'Zakup · ' + d.title, false);
    if (to === 'Completed') add(d.seller, d.price, 'Wypłata · ' + d.title, true);
    if (to === 'Refunded') add(d.buyer, d.price, 'Zwrot · ' + d.title, true);
    return { deals: s.deals.map(x => (x.id === id ? nd : x)), balances: bal, history: hist };
  }
  fail(k, failTitle, failText, code, retryable) { this.setPh(k, P => ({ tx: { ...P.tx, phase: 'fail', failTitle, failText, code, retryable, needFunds: false } })); }
  tx(k, cfg) {
    this.pending[k] = cfg;
    const mb = cfg.upload ? 38 + Math.floor(Math.random() * 24) : 0, start = Date.now();
    if (cfg.kind !== 'faucet' && this.state.balances[k] < FEE) {
      this.setPh(k, { tx: { title: cfg.title, upload: false, mb: 0, start, phase: 'fail', failTitle: 'Brak salda na opłatę sieci', failText: 'Każda operacja kosztuje ułamek grosza (≈ 0.000005 SOL), także odbiór paczki. Doładuj testowe SOL i wróć do tej operacji.', code: '', retryable: false, needFunds: true }, sheet: null });
      return;
    }
    this.setPh(k, { tx: { title: cfg.title, upload: !!cfg.upload, mb, start, phase: 'run' }, sheet: null });
    const upMs = cfg.upload ? 2600 : 0;
    const fm = this.takeFail(m => m === 'net' || (m === 'upload' && !!cfg.upload) || (m === 'program' && cfg.kind !== 'faucet'));
    if (fm) {
      let f, ms = upMs + 1700;
      if (fm === 'upload') { f = ['Nie udało się wysłać nagrania', 'Połączenie zerwało się w trakcie wysyłania. Nagranie jest zapisane na telefonie, a umowa nie została zmieniona.', 'Błąd magazynu plików · przed operacją w sieci', true]; ms = 1500; }
      else if (fm === 'program') { const p = PROG_FAIL[cfg.kind] || PROG_FAIL.def; f = [p[0], p[1], errCode(p[2]), p[3]]; }
      else if (cfg.kind === 'faucet') f = ['Kran testowych SOL nie odpowiada', 'Publiczny kran sieci testowej ma limity. Spróbuj za minutę albo poproś zespół o przelew z portfela demo.', 'Limit zapytań kranu', true];
      else f = ['Nie udało się – spróbuj ponownie', 'Sieć nie potwierdziła operacji na czas, więc ta próba wygasła. Twoje środki nie zostały pobrane, umowa jest bez zmian.' + (cfg.upload ? ' Nagranie jest już wysłane – nie trzeba go powtarzać.' : ''), 'Operacja wygasła przed potwierdzeniem', true];
      if (cfg.upload && fm !== 'upload') this.pending[k] = { ...cfg, upload: false };
      this.later(() => this.fail(k, ...f), ms);
      return;
    }
    this.later(() => {
      const now = this.now();
      if (cfg.guard) {
        const d = this.deal(cfg.guard.id);
        if (d.status !== cfg.guard.status) return this.fail(k, 'Stan umowy już się zmienił', 'Ktoś inny wykonał ruch w tej umowie chwilę wcześniej. Pokazujemy aktualny stan.', errCode('InvalidStatus'), false);
        if (cfg.guard.before && TO[d.status] && now >= d.changedAt + TO[d.status]) return this.fail(k, 'Termin minął', DEADLINE_MSG[d.status], errCode('DeadlinePassed'), false);
      }
      const sig = rnd(88);
      this.setState(s => cfg.mutate(s, sig, now));
      this.setPh(k, P => ({ tx: { ...P.tx, phase: 'ok', sig, okTitle: cfg.ok[0], okText: cfg.ok[1] } }));
      if (cfg.notify) this.notify(cfg.notify[0], cfg.notify[1], cfg.notify[2]);
      if (cfg.after) cfg.after(sig);
    }, upMs + 2200);
  }

  buy(k, id) {
    const d = this.deal(id);
    this.tx(k, { kind: 'buy', title: 'Zabezpieczamy środki w umowie…', guard: { id, status: 'Listed' }, mutate: (s, sig, now) => this.transition(s, id, 'Paid', { buyer: k }, sig, now),
      ok: ['Środki zabezpieczone w umowie', d.price.toFixed(2) + ' SOL czeka w umowie. Sprzedający ma czas na nadanie do ok. ' + hhmm(this.now() + TO.Paid) + '.'],
      notify: [d.seller, 'Nowy zakup: ' + d.title + '. Spakuj i nadaj paczkę.', id], after: () => this.setPh(k, { tab: 'deals', dealsTab: 'Zakupy', stack: [{ screen: 'deal', id }] }) });
  }
  publish(k) {
    const f = this.state.phones[k].form, price = parseFloat(f.price.replace(',', '.'));
    const id = 'n' + Date.now(), no = String(15 + this.state.deals.length).padStart(4, '0');
    this.tx(k, { title: 'Zapisujemy ogłoszenie…', mutate: (s, sig, now) => ({ deals: [{ id, no, title: f.title, brand: f.brand || '—', size: f.size || '—', cond: ({ 'Nowy': 'Nowy z metką', 'B. dobry': 'Bardzo dobry' })[f.cond] || f.cond, cat: 'Inne', price, desc: f.title + '.', flaws: f.flaws, seller: k, buyer: null, status: 'Listed', changedAt: now, listingHash: rnd(44), pda: rnd(44), hidden: false, events: [{ st: 'Listed', label: '', at: now, sig }] }, ...s.deals] }),
      ok: ['Ogłoszenie wystawione', 'Opis i lista wad są zapisane w umowie. Po zakupie nie da się ich zmienić.'], after: () => this.setPh(k, { tab: 'deals', dealsTab: 'Sprzedaże', stack: [{ screen: 'deal', id }] }) });
  }
  cancel(k, id) { this.tx(k, { title: 'Anulujemy ogłoszenie…', guard: { id, status: 'Listed' }, mutate: (s, sig, now) => this.transition(s, id, 'Cancelled', {}, sig, now), ok: ['Ogłoszenie anulowane', 'Nikt nie zapłacił, nic nie zostało zablokowane.'] }); }
  openPack(k, id, mode) { this.setPh(k, P => ({ pack: { qr: false, video: false, dur: '', tracking: '', mode }, stack: [...P.stack, { screen: 'pack', id }] })); }
  brief(k, mode, id) { this.go(k, 'brief', id, { mode }); }
  startRec(k, mode, id) { this.setPh(k, P => ({ rec: { mode, id, start: Date.now() }, stack: [...P.stack.slice(0, -1), { screen: 'record', id }] })); }
  stopRec(k) {
    const r = this.state.phones[k].rec, el = Math.floor((Date.now() - r.start) / 1000), dur = '00:' + pad(Math.min(el, 119));
    if (r.mode === 'unboxing' && this.fallbackQr()) this.setPh(k, Q => ({ rec: null, decide: { cat: null, text: '', dur }, scan: { id: r.id, start: Date.now(), mode: 'unbox' }, stack: [...Q.stack.slice(0, -1), { screen: 'scan', id: r.id }] }));
    else if (r.mode === 'unboxing') this.setPh(k, Q => ({ rec: null, decide: { cat: null, text: '', dur }, stack: [...Q.stack.slice(0, -1), { screen: 'decide', id: r.id }] }));
    else this.setPh(k, Q => ({ rec: null, pack: { ...Q.pack, video: true, dur }, stack: Q.stack.slice(0, -1) }));
  }
  submitPack(k, id) {
    const P = this.state.phones[k], d = this.deal(id), isRet = P.pack.mode === 'return';
    const extra = isRet ? { returnTracking: P.pack.tracking, retQr: rnd(44), retVideo: rnd(44) } : { tracking: P.pack.tracking, packHash: rnd(44), qrCommit: rnd(44) };
    this.tx(k, { title: isRet ? 'Zapisujemy zwrot…' : 'Zapisujemy nadanie…', upload: true, guard: { id, status: d.status, before: true },
      mutate: (s, sig, now) => this.transition(s, id, isRet ? 'Returning' : 'Shipped', extra, sig, now),
      ok: isRet ? ['Zwrot nadany', 'Gdy sprzedający zeskanuje kod zwrotu, środki wrócą do Ciebie. Jeśli tego nie zrobi, wrócą po terminie.'] : ['Paczka nadana', 'Nagranie i numer przesyłki są zapisane w umowie. Kupujący ma czas na otwarcie i decyzję.'],
      notify: isRet ? [d.seller, 'Zwrot w drodze: ' + d.title + '. Po odbiorze zeskanuj kod zwrotu.', id] : [d.buyer, 'Paczka nadana: ' + d.title + '. Po odbiorze nagraj otwarcie.', id],
      after: () => this.setPh(k, { tab: 'deals', stack: [{ screen: 'deal', id }] }) });
  }
  accept(k, id) {
    const d = this.deal(id);
    this.tx(k, { kind: 'qr', title: 'Przekazujemy środki sprzedającemu…', guard: { id, status: 'Shipped', before: true }, mutate: (s, sig, now) => this.transition(s, id, 'Completed', {}, sig, now, 'Odebrane – wszystko OK'),
      ok: [d.price.toFixed(2) + ' SOL u sprzedającego', 'Umowa jest zamknięta. Nagranie otwarcia zostało tylko na Twoim telefonie.'],
      notify: [d.seller, 'Odbiór potwierdzony: ' + d.title + '. Środki są na Twoim saldzie.', id], after: () => this.setPh(k, { tab: 'deals', stack: [{ screen: 'deal', id }] }) });
  }
  complain(k, id) {
    const d = this.deal(id), c = this.state.phones[k].decide;
    this.tx(k, { kind: 'qr', title: 'Wysyłamy reklamację…', upload: true, guard: { id, status: 'Shipped', before: true },
      mutate: (s, sig, now) => this.transition(s, id, 'Disputed', { unboxHash: rnd(44), complaintHash: rnd(44), complaint: { cat: c.cat, text: c.text } }, sig, now),
      ok: ['Reklamacja zgłoszona', 'AI porówna oba nagrania z opisem. Środki zostają w umowie do czasu oceny.'],
      notify: [d.seller, 'Reklamacja: ' + d.title + '. AI ocenia oba nagrania.', id], after: () => { this.setPh(k, { tab: 'deals', stack: [{ screen: 'deal', id }] }); this.oracle(id); } });
  }
  oracle(id) {
    this.later(() => {
      const d = this.deal(id);
      if (!d || d.status !== 'Disputed') return;
      const sig = rnd(88), win = d.hidden, now = this.now();
      this.setState(s => this.transition(s, id, win ? 'ReturnRequested' : 'Completed', { verdict: win ? 'Buyer' : 'Seller', reportHash: rnd(44) }, sig, now, win ? 'Ocena AI: reklamacja uznana' : 'Ocena AI: reklamacja odrzucona'));
      const t = (win ? 'Reklamacja uznana: ' : 'Reklamacja odrzucona: ') + d.title + '.';
      this.notify(d.buyer, t, id); this.notify(d.seller, t, id);
    }, (this.props.aiDelay ?? 5) * 1000);
  }
  startScan(k, id) { this.setPh(k, P => ({ scan: { id, start: Date.now() }, stack: [...P.stack, { screen: 'scan', id }] })); }
  confirmReturn(k, id) {
    const d = this.deal(id);
    this.tx(k, { kind: 'qr', title: 'Zwracamy środki kupującemu…', guard: { id, status: 'Returning' }, mutate: (s, sig, now) => this.transition(s, id, 'Refunded', {}, sig, now, 'Zwrot odebrany'),
      ok: ['Środki zwrócone kupującemu', d.price.toFixed(2) + ' SOL wróciło do kupującego. Umowa jest zamknięta.'],
      notify: [d.buyer, 'Zwrot potwierdzony: ' + d.title + '. Środki wróciły na Twoje saldo.', id], after: () => this.setPh(k, { scan: null, tab: 'deals', stack: [{ screen: 'deal', id }] }) });
  }
  settle(k, id) {
    const d = this.deal(id), to = SETTLE[d.status], other = k === d.buyer ? d.seller : d.buyer;
    const msg = { Refunded: 'Środki zwrócone kupującemu', Completed: 'Środki u sprzedającego', ReturnRequested: 'Kupujący odsyła paczkę za zwrot' }[to];
    this.tx(k, { kind: 'settle', title: 'Zamykamy sprawę po terminie…', guard: { id, status: d.status }, mutate: (s, sig, now) => this.transition(s, id, to, to === 'ReturnRequested' ? { noVerdict: true } : {}, sig, now, 'Termin minął – zamknęła/zamknął: ' + USERS[k].name),
      ok: [msg, 'Nikt nie musiał się zgodzić. Umowa wykonała regułę po terminie.'], notify: [other, 'Termin minął: ' + d.title + '. ' + msg + '.', id] });
  }
  faucet(k) {
    this.tx(k, { kind: 'faucet', title: 'Pobieramy testowe SOL…', mutate: s => ({ balances: { ...s.balances, [k]: s.balances[k] + 1 }, history: { ...s.history, [k]: [{ label: 'Doładowanie testowe', amt: 1, in: true }, ...s.history[k]] } }), ok: ['Doładowano 1.000 SOL', 'To testowe SOL z sieci deweloperskiej, bez wartości.'] });
  }
  setForm(k, field) { return e => { const v = e.target.value; this.setPh(k, P => ({ form: { ...P.form, [field]: v } })); }; }

  dv(d, me) {
    const now = this.now(), showIds = this.props.showStateIds ?? true;
    const iB = d.buyer === me, iS = d.seller === me;
    const sN = USERS[d.seller].name, bN = d.buyer ? USERS[d.buyer].name : '';
    const deadline = TO[d.status] ? d.changedAt + TO[d.status] : null;
    const remain = deadline !== null ? deadline - now : null;
    const expired = remain !== null && remain <= 0;
    const unlocked = remain !== null && remain <= -GRACE;
    const benefRole = BENEF[d.status], benef = benefRole === 'buyer' ? d.buyer : benefRole === 'seller' ? d.seller : null;
    const can = !!SETTLE[d.status];
    const who = ({ Listed: 'Czeka na kupującego', Paid: iS ? 'Ty – spakuj i nadaj paczkę' : 'Sprzedający (' + sN + ') – nadaje paczkę', Shipped: iB ? 'Ty – nagraj otwarcie i zdecyduj' : 'Kupujący (' + bN + ') – nagrywa otwarcie', Disputed: 'Niezależna ocena AI – porównuje oba nagrania', ReturnRequested: iB ? 'Ty – odeślij paczkę' : 'Kupujący (' + bN + ') – odsyła paczkę', Returning: iS ? 'Ty – zeskanuj kod zwrotu' : 'Sprzedający (' + sN + ') – potwierdza odbiór zwrotu' })[d.status] || '';
    const after = ({ Listed: 'Ogłoszenie czeka. Możesz je anulować, dopóki nikt nie zapłacił.', Paid: 'Po terminie każdy może zwrócić środki kupującemu.', Shipped: 'Po terminie środki trafią do sprzedającego.', Disputed: 'Po terminie kupujący odsyła paczkę za zwrot środków.', ReturnRequested: 'Po terminie środki trafią do sprzedającego.', Returning: 'Po terminie środki wrócą do kupującego.' })[d.status] || '';
    const priceText = d.price.toFixed(2);
    let hint = null;
    if (can && unlocked && benef === me) hint = 'Odbierz środki';
    else if (!expired) {
      if (iB) hint = { Shipped: 'Nagraj otwarcie', ReturnRequested: 'Spakuj zwrot' }[d.status] || null;
      if (iS) hint = { Paid: 'Spakuj i nadaj', Returning: 'Zeskanuj kod zwrotu' }[d.status] || hint;
    }
    let nSecured = false, nNeutral = false, nTitle = '', nText = '';
    if (d.status === 'Completed') { nSecured = true; nTitle = iS ? 'Środki są na Twoim saldzie' : 'Zakończone'; nText = priceText + ' SOL trafiło do sprzedającego. Umowa jest zamknięta.'; }
    if (d.status === 'Refunded') { nSecured = true; nTitle = iB ? 'Środki wróciły na Twoje saldo' : 'Środki zwrócone kupującemu'; nText = priceText + ' SOL zwróciła umowa, bez niczyjej zgody.'; }
    if (d.status === 'Cancelled') { nNeutral = true; nTitle = 'Ogłoszenie anulowane'; nText = 'Nikt nie zapłacił, nic nie zostało zablokowane.'; }
    if (d.status === 'Disputed' && !expired) { nNeutral = true; nTitle = 'AI porównuje oba nagrania'; nText = 'Nagranie pakowania, nagranie otwarcia, opis i reklamację. Wynik wyliczy jawna reguła.'; }
    if (d.status === 'ReturnRequested' && d.noVerdict) { nNeutral = true; nTitle = 'Brak oceny w terminie'; nText = 'Umowa przeszła na neutralną ścieżkę: kupujący odsyła paczkę za zwrot środków.'; }
    const final = !FUT[d.status];
    const nodes = d.events.map((e, i) => ({ st: e.st, sub: e.label, when: stamp(e.at), sig: e.sig, state: i === d.events.length - 1 && !final ? 'current' : 'done' }));
    (FUT[d.status] || []).forEach(st => nodes.push({ st, sub: '', when: 'później', sig: null, state: 'todo' }));
    const timeline = nodes.map((n, i) => {
      const c = n.state === 'done' ? 'var(--success)' : n.state === 'current' ? 'var(--warning)' : 'var(--line-strong)';
      const when = n.state === 'current' && deadline !== null ? n.when + ' · termin ok. ' + hhmm(deadline) : n.when;
      return { label: STATUS[n.st][0], id: n.st, showId: showIds, sub: n.sub, hasSub: !!n.sub, when, color: c, fill: n.state === 'todo' ? 'transparent' : c, line: n.state === 'done' ? 'var(--success)' : 'var(--line)',
        labelColor: n.state === 'todo' ? 'var(--fg-3)' : 'var(--fg-1)', weight: n.state === 'current' ? 700 : 500, notLast: i < nodes.length - 1, hasSig: !!n.sig, href: n.sig ? EXPL(n.sig) : '#',
        alt: n.state !== 'done' ? ALT[n.st] || '' : '', hasAlt: n.state !== 'done' && !!ALT[n.st] };
    });
    const evidence = [{ label: 'Opis i zdjęcia ogłoszenia', value: short(d.listingHash) }];
    if (d.buyer) evidence.push({ label: 'Zaakceptowany arbiter', value: short(ARBITER) });
    if (d.tracking) evidence.push({ label: 'Nagranie pakowania', value: short(d.packHash) }, { label: 'Karta z kodem', value: short(d.qrCommit) }, { label: 'Numer przesyłki', value: d.tracking });
    if (d.unboxHash) evidence.push({ label: 'Nagranie otwarcia', value: short(d.unboxHash) }, { label: 'Reklamacja · ' + ((d.complaint && d.complaint.cat) || ''), value: short(d.complaintHash) });
    if (d.reportHash) evidence.push({ label: 'Raport oceny AI', value: short(d.reportHash) });
    if (d.returnTracking) evidence.push({ label: 'Nagranie zwrotu', value: short(d.retVideo) }, { label: 'Karta zwrotu', value: short(d.retQr) }, { label: 'Przesyłka zwrotna', value: d.returnTracking });
    const lastSig = d.events[d.events.length - 1].sig;
    const mineB = benef === me;
    return {
      id: d.id, no: d.no, title: d.title, priceText, zl: this.zl(d.price), statusLabel: STATUS[d.status][0], statusColor: STATUS[d.status][1],
      parties: d.buyer ? (iS ? 'Kupuje: ' + bN : 'Sprzedaje: ' + sN) : 'Sprzedaje: ' + sN,
      hint, hasHint: !!hint, isActive: ESCROW.includes(d.status) || d.status === 'Listed',
      funds: d.status === 'Listed' ? 'Nikt jeszcze nie zapłacił' : 'Zabezpieczone w umowie · ' + priceText + ' SOL (≈ ' + this.zl(d.price) + ')', fundsColor: d.status === 'Listed' ? 'var(--fg-2)' : 'var(--secured)', who, after,
      hasDeadline: deadline !== null, countdown: expired ? '00:00:00' : hms(remain || 0), cdColor: remain !== null && remain <= 60 ? 'var(--warning)' : 'var(--fg-1)',
      cdWhen: deadline === null ? '' : (expired ? 'Termin minął ok. ' : 'Termin ok. ') + hhmm(deadline) + ' · liczy go sieć, nie telefon',
      cardBorder: can && expired ? 'var(--warning)' : 'var(--line-strong)',
      settleLocked: can && !expired && mineB, settleChecking: can && expired && !unlocked, settleMine: can && unlocked && mineB, settleOther: can && unlocked && !mineB,
      settleLabel: mineB ? 'Odbierz środki' : 'Zamknij sprawę po terminie', outcome: OUTCOME[d.status] || '',
      actRecord: iB && d.status === 'Shipped' && !expired, actShip: iS && d.status === 'Paid' && !expired, actReturn: iB && d.status === 'ReturnRequested' && !expired, actScan: iS && d.status === 'Returning' && !expired,
      actCancel: iS && d.status === 'Listed', hasVerdict: !!d.verdict, nSecured, nNeutral, nTitle, nText, timeline, evidence, href: EXPL(lastSig),
      settle: () => this.settle(me, d.id), record: () => this.brief(me, 'unboxing', d.id), shipFlow: () => this.openPack(me, d.id, 'ship'), returnFlow: () => this.openPack(me, d.id, 'return'),
      scan: () => this.startScan(me, d.id), verdict: () => this.go(me, 'verdict', d.id), cancel: () => this.cancel(me, d.id), open: () => this.go(me, 'deal', d.id),
    };
  }

  vm(k) {
    const s = this.state, P = s.phones[k], u = USERS[k], now = this.now();
    const top = P.stack[P.stack.length - 1];
    const scr = P.onb ? 'onb_' + P.onb : top ? top.screen : P.tab;
    const bal = s.balances[k];
    const v = {
      caption: ROLE[k].caption, roleLabel: ROLE[k].label, roleBg: ROLE[k].bg, clock: hhmm(now), balance: bal.toFixed(3), balanceZl: this.zl(bal), feeZl: this.zl(FEE), addrShort: short(u.addr), arbiterShort: short(ARBITER),
      sOnbWelcome: scr === 'onb_welcome', sOnbCreating: scr === 'onb_creating', sOnbReady: scr === 'onb_ready', sBrowse: scr === 'browse', sListing: scr === 'listing', sSell: scr === 'sell', sDeals: scr === 'deals', sDeal: scr === 'deal',
      sBrief: scr === 'brief', sPack: scr === 'pack', sCamera: scr === 'record' || scr === 'scan', sDecide: scr === 'decide', sVerdict: scr === 'verdict', sWallet: scr === 'wallet',
      back: () => this.back(k), faucet: () => this.faucet(k), lowBal: bal < 0.001,
      onbStart: () => { this.setPh(k, { onb: 'creating' }); this.later(() => this.setPh(k, { onb: 'ready' }), 1400); },
      onbDone: () => { this.setPh(k, { onb: null, tab: 'browse', stack: [] }); this.loadFeed(k); },
      reload: () => this.loadFeed(k), openDev: () => this.setPh(k, { sheet: 'dev' }),
    };
    v.showTabs = !P.onb && (!top || top.screen === 'deal');
    const anyHint = s.deals.filter(d => d.buyer === k || d.seller === k).some(d => this.dv(d, k).hasHint);
    v.tabs = TABS.map(([id, ic, label]) => ({ label, icon: ICON(ic), color: id === P.tab ? 'var(--fg-1)' : 'var(--fg-3)', badge: id === 'deals' && anyHint, go: () => this.tab(k, id) }));
    v.feedLoading = P.feed === 'loading'; v.feedError = P.feed === 'error'; v.feedOk = P.feed === 'ok';
    if (scr === 'browse') {
      const F = P.filt, q = norm(F.q.trim());
      const setF = patch => this.setPh(k, Q => ({ filt: { ...Q.filt, ...(typeof patch === 'function' ? patch(Q.filt) : patch) } }));
      const tog = (arr, x) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x]);
      const list = s.deals.filter(d => d.status === 'Listed' && d.seller !== k && (F.cat === 'Wszystko' || d.cat === F.cat) && (!q || norm(d.title + ' ' + d.brand + ' ' + (d.cat || '')).includes(q)) && (!F.sizes.length || F.sizes.includes(d.size)) && (!F.conds.length || F.conds.includes(d.cond)) && (F.max >= PRICE_MAX || d.price <= F.max + 1e-9) && (!F.noFlaws || !d.flaws.length));
      list.sort((a, b) => (F.sort === 'cheap' ? a.price - b.price : F.sort === 'exp' ? b.price - a.price : b.changedAt - a.changedAt));
      v.feed = list.map(d => ({ title: d.title, priceText: d.price.toFixed(2), zl: this.zl(d.price), meta: d.size + ' · ' + d.cond, cat: d.cat || 'foto', open: () => this.go(k, 'listing', d.id) }));
      v.feedEmpty = list.length === 0; v.resultsLabel = list.length + ' ' + plural(list.length); v.sortLabel = SORTS.find(x => x[0] === F.sort)[1];
      v.q = F.q; v.hasQ = !!F.q; v.setQ = e => { const val = e.target.value; setF({ q: val }); }; v.clearQ = () => setF({ q: '' });
      const chip = (on, pick, label) => ({ label, pick, bg: on ? 'var(--fg-1)' : 'transparent', fg: on ? 'var(--ink-950)' : 'var(--fg-2)', border: on ? 'var(--fg-1)' : 'var(--line-strong)' });
      v.cats = ['Wszystko', ...CATEGORIES.map(c => c[0])].map(c => chip(F.cat === c, () => setF({ cat: c }), c));
      const fCount = (F.sizes.length ? 1 : 0) + (F.conds.length ? 1 : 0) + (F.max < PRICE_MAX ? 1 : 0) + (F.noFlaws ? 1 : 0);
      v.fCount = fCount; v.hasFCount = fCount > 0; v.fBorder = fCount ? 'var(--accent)' : 'var(--line-strong)';
      v.openFilters = () => this.setPh(k, { sheet: 'filters' });
      v.fSizes = SIZE_OPTS.map(x => chip(F.sizes.includes(x), () => setF(G => ({ sizes: tog(G.sizes, x) })), x));
      v.fConds = FCONDS.map(x => chip(F.conds.includes(x), () => setF(G => ({ conds: tog(G.conds, x) })), x));
      v.fSorts = SORTS.map(([id, l]) => chip(F.sort === id, () => setF({ sort: id }), l));
      v.fMax = F.max; v.fMaxText = F.max >= PRICE_MAX ? 'Bez limitu' : 'do ' + F.max.toFixed(2) + ' SOL · ≈ ' + this.zl(F.max);
      v.setFMax = e => { const val = parseFloat(e.target.value); setF({ max: val }); };
      v.toggleNoFlaws = () => setF(G => ({ noFlaws: !G.noFlaws })); v.swBg = F.noFlaws ? 'var(--accent)' : 'var(--line-strong)'; v.swX = F.noFlaws ? '23px' : '3px';
      v.fResults = 'Pokaż ' + list.length + ' ' + plural(list.length);
      v.clearFilters = () => setF({ q: '', cat: 'Wszystko', sizes: [], conds: [], max: PRICE_MAX, noFlaws: false, sort: 'new' });
    }

    if (top && top.id) {
      const d = this.deal(top.id);
      if (d) {
        v.L = { title: d.title, brandLine: d.brand + ' · ' + d.size + ' · ' + d.cond, desc: d.desc, flaws: d.flaws, flawsCount: d.flaws.length, noFlaws: d.flaws.length === 0, priceText: d.price.toFixed(2), zl: this.zl(d.price),
          sellerLine: USERS[d.seller].name + ' · ' + short(USERS[d.seller].addr), isOwn: d.seller === k, notOwn: d.seller !== k, shipBy: hhmm(now + TO.Paid), short: bal < d.price, buyOpacity: bal < d.price ? 0.4 : 1 };
        v.D = this.dv(d, k);
        v.openBuy = () => this.setPh(k, { sheet: 'buy', rulesOpen: false });
        v.buy = () => { if (this.state.balances[k] >= d.price) this.buy(k, d.id); };
        if (scr === 'brief') { const b = BRIEF[top.mode]; v.B = { title: b.title, warning: b.warning, items: b.items.map((t, i) => ({ n: pad(i + 1), text: t })), go: () => this.startRec(k, top.mode, d.id) }; }
        if (scr === 'pack') {
          const pk = P.pack, isRet = pk.mode === 'return', okT = pk.tracking.replace(/\s/g, '').length >= 6, can = pk.qr && pk.video && okT;
          const stp = (done, cur) => ({ b: done ? 'var(--secured)' : cur ? 'var(--fg-1)' : 'var(--line-strong)', bg: done ? 'var(--secured)' : 'transparent', fg: done ? 'var(--ink-950)' : cur ? 'var(--fg-1)' : 'var(--fg-3)' });
          const a = stp(pk.qr, !pk.qr), b = stp(pk.video, pk.qr && !pk.video), c = stp(okT, pk.qr && pk.video);
          const dl = TO[d.status] ? d.changedAt + TO[d.status] : now;
          v.K = { title: isRet ? 'Spakuj zwrot' : 'Spakuj i nadaj', intro: isRet ? 'Aplikacja wygenerowała nową kartę zwrotu. Sprzedający zeskanuje ją po odebraniu paczki – wtedy środki wrócą do Ciebie.' : 'Nagranie pakowania jest Twoim dowodem, jeśli pojawi się reklamacja. Najpierw wydrukuj kartę, potem nagraj pakowanie.',
            s1Title: isRet ? 'Nowa karta zwrotu' : 'Karta z kodem', s1Todo: !pk.qr, s1Done: pk.qr, s1Border: a.b, s1Bg: a.bg, s1Fg: a.fg,
            s2Title: isRet ? 'Nagraj pakowanie zwrotu' : 'Nagraj pakowanie', s2Todo: !pk.video, s2Done: pk.video, dur: pk.dur, s2Border: b.b, s2Bg: b.bg, s2Fg: b.fg, recOpacity: pk.qr ? 1 : 0.4,
            s3Border: c.b, s3Bg: c.bg, s3Fg: c.fg, tracking: pk.tracking,
            setTracking: e => { const val = e.target.value; this.setPh(k, Q => ({ pack: { ...Q.pack, tracking: val } })); },
            print: () => this.setPh(k, Q => ({ pack: { ...Q.pack, qr: true } })),
            rec: () => { if (this.state.phones[k].pack.qr) this.brief(k, isRet ? 'return' : 'packing', d.id); },
            deadline: (isRet ? 'Termin odesłania ok. ' : 'Termin nadania ok. ') + hhmm(dl), cta: isRet ? 'Odeślij paczkę' : 'Nadaj paczkę', cant: !can, opacity: can ? 1 : 0.4, submit: () => { if (can) this.submitPack(k, d.id); } };
        }
        if (scr === 'decide' || P.sheet === 'ok') {
          const dc = P.decide;
          v.X = { dur: dc.dur, priceText: d.price.toFixed(2), zl: this.zl(d.price), text: dc.text, cant: !dc.cat, opacity: dc.cat ? 1 : 0.4,
            cats: CATS.map(c => ({ label: c, bg: dc.cat === c ? 'var(--amber-tint)' : 'transparent', fg: dc.cat === c ? 'var(--warning)' : 'var(--fg-2)', border: dc.cat === c ? 'var(--warning)' : 'var(--line-strong)', pick: () => this.setPh(k, Q => ({ decide: { ...Q.decide, cat: Q.decide.cat === c ? null : c } })) })),
            setText: e => { const val = e.target.value; this.setPh(k, Q => ({ decide: { ...Q.decide, text: val } })); },
            accept: () => this.setPh(k, { sheet: 'ok' }), acceptConfirm: () => this.accept(k, d.id), complain: () => { if (this.state.phones[k].decide.cat) this.complain(k, d.id); } };
        }
        if (scr === 'verdict') {
          const win = d.verdict === 'Buyer', iB = d.buyer === k;
          const yes = (label, good = true) => ({ label, answer: 'tak', color: good ? 'var(--success)' : 'var(--warning)', hasDetail: false, detail: '' });
          const checks = [yes('Nagranie otwarcia ciągłe, od zamkniętej paczki'), yes('Kod z karty ujawniony dopiero przy otwarciu'), yes('Nagranie pakowania wyraźne, karta w środku'), yes('Paczka zgodna z nagraniem nadania')];
          checks.push(win ? { label: 'Przedmiot zgodny z opisem', answer: 'nie', color: 'var(--warning)', hasDetail: false, detail: '' } : yes('Przedmiot zgodny z opisem'));
          checks.push(win ? { label: 'Nieujawniona wada', answer: 'tak', color: 'var(--warning)', hasDetail: true, detail: 'Plama na przodzie · 0:41, 0:52' } : { label: 'Nieujawniona wada', answer: 'nie', color: 'var(--success)', hasDetail: false, detail: '' });
          const dl = TO[d.status] ? hhmm(d.changedAt + TO[d.status]) : '';
          let next = '';
          if (d.status === 'ReturnRequested') next = iB ? 'Odeślij paczkę z nową kartą zwrotu do ok. ' + dl + '. Gdy sprzedający ją zeskanuje, dostaniesz ' + d.price.toFixed(2) + ' SOL.' : 'Kupujący odsyła paczkę do ok. ' + dl + '. Po odbiorze zeskanuj kartę zwrotu – wtedy środki wrócą do kupującego.';
          if (d.status === 'Returning') next = 'Zwrot w drodze. Po zeskanowaniu karty albo po terminie środki wrócą do kupującego.';
          v.V = { title: win ? 'Reklamacja uznana' : 'Reklamacja odrzucona', result: win ? 'Wynik: zwrot dla kupującego' : 'Wynik: środki dla sprzedającego', conclusion: win ? 'zwrot dla kupującego (po odesłaniu paczki)' : 'środki dla sprzedającego', resultColor: win ? 'var(--warning)' : 'var(--success)',
            reasoning: win ? 'Na nagraniu otwarcia widać plamę na przodzie swetra. Nie ma jej w opisie ani na zdjęciach ogłoszenia. Paczka zgadza się z nagraniem nadania.' : 'Przedmiot zgadza się z opisem i zdjęciami. Wady widoczne na nagraniu były zgłoszone w ogłoszeniu.',
            checks, next, hasNext: !!next, actReturn: iB && d.status === 'ReturnRequested', returnFlow: () => this.openPack(k, d.id, 'return'),
            href: EXPL((d.events.find(e => e.label.indexOf('Ocena AI') === 0) || d.events[d.events.length - 1]).sig) };
        }
      }
    }
    if (scr === 'record' && P.rec) {
      const el = Math.floor((Date.now() - P.rec.start) / 1000), m = P.rec.mode, pct = Math.min(100, (el / 120) * 100) + '%';
      if (m === 'unboxing') {
        const fb = this.fallbackQr(), qr = !fb && el >= 4, can = el >= 4;
        v.C = { isRec: true, isScan: false, tag: '720p', time: '00:' + pad(Math.min(el, 119)), limitPct: pct, limitColor: el > 100 ? '#FF6B6B' : '#fff', frame: qr ? '#14F195' : 'rgba(255,255,255,.45)', found: qr, notFound: !qr, scanCta: '',
          status: qr ? 'Kod z karty wykryty' : fb && can ? 'Nagrywam – pokaż całe otwarcie' : 'Zacznij od zamkniętej paczki', hint: fb ? 'Kartę z kodem zeskanujesz zaraz po nagraniu. Nagrywaj bez przerw.' : 'Nagrywaj bez przerw, aż całe ubranie będzie widoczne.', hasChecks: false, checks: [], opacity: can ? 1 : 0.4, stop: () => { if (can) this.stopRec(k); }, cancel: () => this.back(k) };
      } else {
        const labels = ['Ubranie widoczne', m === 'return' ? 'Karta zwrotu w środku' : 'Karta z kodem w środku', 'Paczka zaklejona', 'Etykieta przewoźnika'];
        const checks = labels.map((l, i) => ({ label: l, color: el >= (i + 1) * 2 ? '#14F195' : 'rgba(255,255,255,.5)' }));
        const all = el >= 8;
        v.C = { isRec: true, isScan: false, tag: '720p', time: '00:' + pad(Math.min(el, 119)), limitPct: pct, limitColor: el > 100 ? '#FF6B6B' : '#fff', frame: 'rgba(255,255,255,.45)', found: false, notFound: true, scanCta: '',
          status: all ? 'Wszystko widać – możesz zakończyć' : 'Pokaż ubranie, kartę, zaklejenie i etykietę', hint: 'Najpierw nagranie trafi do magazynu plików, potem jego odcisk do umowy.', hasChecks: true, checks, opacity: all ? 1 : 0.4, stop: () => { if (all) this.stopRec(k); }, cancel: () => this.back(k) };
      }
    }
    if (scr === 'scan' && P.scan) {
      const el = (Date.now() - P.scan.start) / 1000, found = el >= 2.5, d = this.deal(P.scan.id), unbox = P.scan.mode === 'unbox';
      v.C = { isRec: false, isScan: true, tag: 'skaner', time: '', limitPct: '0%', limitColor: '#fff', frame: found ? '#14F195' : 'rgba(255,255,255,.45)', found, notFound: !found, scanCta: unbox ? 'Dalej' : 'Potwierdź odbiór zwrotu',
        status: found ? (unbox ? 'Kod z karty zgodny z umową' : 'Karta zwrotu zgodna z umową') : (unbox ? 'Szukam karty z paczki…' : 'Szukam karty zwrotu…'),
        hint: unbox ? 'Nagranie otwarcia jest zapisane na telefonie. Zeskanuj kartę, która była w paczce.' : 'Zeskanuj kartę z odebranej paczki. Po potwierdzeniu ' + d.price.toFixed(2) + ' SOL wróci do kupującego.', hasChecks: false, checks: [], opacity: found ? 1 : 0.4,
        stop: () => { if (!found) return; if (unbox) this.setPh(k, Q => ({ scan: null, stack: [...Q.stack.slice(0, -1), { screen: 'decide', id: d.id }] })); else this.confirmReturn(k, d.id); }, cancel: () => this.back(k) };
    }
    if (scr === 'sell') {
      const f = P.form, price = parseFloat((f.price || '').replace(',', '.')), ok = f.title.trim().length > 2 && price > 0;
      v.form = f; v.formZl = price > 0 ? this.zl(price) : '0,00 zł'; v.cantPublish = !ok; v.publishOpacity = ok ? 1 : 0.4;
      v.conds = CONDS.map(c => ({ label: c, bg: c === f.cond ? 'var(--fg-1)' : 'transparent', fg: c === f.cond ? 'var(--ink-950)' : 'var(--fg-2)', pick: () => this.setPh(k, Q => ({ form: { ...Q.form, cond: c } })) }));
      v.formFlaws = f.flaws.map((t, i) => ({ text: t, remove: () => this.setPh(k, Q => ({ form: { ...Q.form, flaws: Q.form.flaws.filter((_, j) => j !== i) } })) }));
      v.fTitle = this.setForm(k, 'title'); v.fBrand = this.setForm(k, 'brand'); v.fSize = this.setForm(k, 'size'); v.fPrice = this.setForm(k, 'price'); v.fFlaw = this.setForm(k, 'flawDraft');
      v.addFlaw = () => this.setPh(k, Q => (Q.form.flawDraft.trim() ? { form: { ...Q.form, flaws: [...Q.form.flaws, Q.form.flawDraft.trim()], flawDraft: '' } } : {}));
      v.publish = () => { if (ok) this.publish(k); };
    }
    if (scr === 'deals') {
      const buys = P.dealsTab === 'Zakupy';
      const rows = s.deals.filter(d => (buys ? d.buyer === k : d.seller === k)).map(d => this.dv(d, k));
      v.rowsLoading = !!P.dealsLoad; v.rows = P.dealsLoad ? [] : rows; v.rowsEmpty = !P.dealsLoad && rows.length === 0; v.rowsEmptyText = buys ? 'Nie masz jeszcze zakupów' : 'Nie masz jeszcze ogłoszeń';
      v.buysLine = buys ? 'var(--fg-1)' : 'transparent'; v.buysColor = buys ? 'var(--fg-1)' : 'var(--fg-3)'; v.salesLine = !buys ? 'var(--fg-1)' : 'transparent'; v.salesColor = !buys ? 'var(--fg-1)' : 'var(--fg-3)';
      v.tabBuys = () => this.setPh(k, { dealsTab: 'Zakupy' }); v.tabSales = () => this.setPh(k, { dealsTab: 'Sprzedaże' });
    }
    if (scr === 'wallet') {
      const esc = s.deals.filter(d => d.buyer === k && ESCROW.includes(d.status)).reduce((a, d) => a + d.price, 0);
      v.escrow = esc.toFixed(3); v.escrowZl = this.zl(esc); v.hasEscrow = esc > 0;
      const R = s.rate, at = R.at ? new Date(R.at) : null, t = at ? pad(at.getHours()) + ':' + pad(at.getMinutes()) + ':' + pad(at.getSeconds()) : '';
      v.rateText = fmtPL(R.pln, 2) + ' zł'; v.rateDot = R.live ? 'var(--secured)' : 'var(--warning)';
      v.rateSrc = (R.live ? 'Na żywo z CoinGecko · ' + t : 'Kurs przykładowy – brak połączenia z serwisem kursów') + '. Przeliczenia są orientacyjne, umowa rozlicza się tylko w SOL.';
      v.history = (s.history[k] || []).map(h => ({ label: h.label, amount: (h.in ? '+' : '−') + h.amt.toFixed(3), color: h.in ? 'var(--success)' : 'var(--fg-1)', icon: ICON(h.in ? 'arrow-down-left' : 'arrow-up-right'), zl: this.zl(h.amt) }));
    }
    v.sheetBuy = P.sheet === 'buy' && !!v.L; v.sheetDev = P.sheet === 'dev'; v.sheetFilters = P.sheet === 'filters' && scr === 'browse'; v.sheetOk = P.sheet === 'ok' && !!v.X; v.closeSheet = () => this.setPh(k, { sheet: null });
    v.rulesOpen = P.rulesOpen; v.rulesLabel = P.rulesOpen ? 'Ukryj reguły' : 'Zobacz jakie reguły →'; v.toggleRules = () => this.setPh(k, Q => ({ rulesOpen: !Q.rulesOpen }));
    v.hasBanner = !!P.banner && !P.tx; v.bannerText = P.banner ? P.banner.text : '';
    v.bannerOpen = () => { const b = this.state.phones[k].banner; this.setPh(k, b && b.id && !this.state.phones[k].onb ? { banner: null, tab: 'deals', stack: [{ screen: 'deal', id: b.id }] } : { banner: null }); };
    v.hasTx = !!P.tx;
    if (P.tx) {
      const T = P.tx, el = Date.now() - T.start, up = T.upload ? 2600 : 0;
      const defs = [];
      if (T.upload) defs.push({ label: 'Wysyłanie nagrania', from: 0, to: up, upload: true });
      defs.push({ label: 'Przygotowanie operacji', from: up, to: up + 400 }, { label: 'Wysyłanie do sieci', from: up + 400, to: up + 1000 }, { label: 'Potwierdzanie przez sieć', from: up + 1000, to: up + 2200 });
      const steps = defs.map(dd => {
        const st = T.phase !== 'run' ? 'done' : el >= dd.to ? 'done' : el >= dd.from ? 'current' : 'todo';
        const c = st === 'done' ? 'var(--success)' : st === 'current' ? 'var(--accent)' : 'var(--line-strong)';
        const frac = Math.max(0, Math.min(1, (el - dd.from) / (dd.to - dd.from)));
        return { label: dd.label, color: c, fill: st === 'todo' ? 'transparent' : c, labelColor: st === 'todo' ? 'var(--fg-3)' : 'var(--fg-1)', weight: st === 'current' ? 700 : 500,
          showBar: !!dd.upload && st === 'current', pct: Math.round(frac * 100) + '%', hasDetail: !!dd.upload, detail: dd.upload ? Math.round(frac * T.mb) + ' / ' + T.mb + ' MB' : '' };
      });
      v.T = { run: T.phase === 'run', ok: T.phase === 'ok', fail: T.phase === 'fail', title: T.title, steps, okTitle: T.okTitle || '', okText: T.okText || '', sigShort: T.sig ? short(T.sig) : '', href: T.sig ? EXPL(T.sig) : '#',
        failTitle: T.failTitle || '', failText: T.failText || '', code: T.code || '', hasCode: !!T.code, retryable: !!T.retryable, needFunds: !!T.needFunds, topUp: () => this.faucet(k),
        retry: () => { const c = this.pending[k]; if (c) this.tx(k, c); }, close: () => this.setPh(k, { tx: null }) };
    }
    return v;
  }

  render() { return React.createElement(Ctx.Provider, { value: this.renderVals() }, this.props.children); }
  renderVals() {
    const k = this.state.active, fm = this.state.failMode, sc = this.state.scene;
    const on2 = on => ({ bg: on ? 'var(--fg-1)' : 'transparent', fg: on ? 'var(--ink-950)' : 'var(--fg-1)', border: on ? 'var(--fg-1)' : 'var(--line-strong)' });
    const g = {
      clockNow: hhmm(this.now()), skip: () => this.setState(s => ({ offset: s.offset + 600 })), reset: () => this.reset(),
      failOpts: FAIL_OPTS.map(([id, label]) => { const on = fm === id, c = id === 'ok' ? 'var(--fg-1)' : 'var(--danger)'; return { label, bg: on ? c : 'transparent', fg: on ? 'var(--ink-950)' : 'var(--fg-1)', border: on ? c : 'var(--line-strong)', pick: () => this.setState({ failMode: id }) }; }),
      scenes: SCENES.map(x => ({ label: x.label, ...on2(sc === x.id), go: () => this.scene(x.id) })),
      hasCue: !!sc, cue: sc ? SCENES.find(x => x.id === sc).cue : '',
      accounts: PHONES.map(u => ({ label: ROLE[u].label, bg: u === k ? 'var(--fg-1)' : 'transparent', fg: u === k ? 'var(--ink-950)' : 'var(--fg-2)', pick: () => this.switchTo(u) })),
    };
    return { phones: [{ ...this.vm(k), ...g }] };
  }
}

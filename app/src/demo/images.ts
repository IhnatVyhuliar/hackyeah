// Illustrations for the demo engine (AppProvider): listing photos and simulated camera frames.
// Generated with an image model; d1 and unbox-d1 are the landing photos (landing/assets/ff1dc69d.jpg, a9118c78.jpg).

// Named demo deals, by deal id.
export const DEAL_IMG: Record<string, number> = {
  d1: require('./img/d1.jpg'),
  d2: require('./img/d2.jpg'),
  d3: require('./img/d3.jpg'),
  d4: require('./img/d4.jpg'),
  d5: require('./img/d5.jpg'),
  d6: require('./img/d6.jpg'),
  d8: require('./img/d8.jpg'),
  d9: require('./img/d9.jpg'),
};

// Generated feed items, by product name (CATEGORIES in AppProvider).
export const NAME_IMG: Record<string, number> = {
  'Kurtka jeansowa': require('./img/kurtka-jeansowa.jpg'),
  'Kurtka puchowa': require('./img/kurtka-puchowa.jpg'),
  'Kurtka przejściowa': require('./img/kurtka-przejsciowa.jpg'),
  'Parka': require('./img/parka.jpg'),
  'Ramoneska': require('./img/ramoneska.jpg'),
  'Bluza z kapturem': require('./img/bluza-z-kapturem.jpg'),
  'Bluza crewneck': require('./img/bluza-crewneck.jpg'),
  'Bluza rozpinana': require('./img/bluza-rozpinana.jpg'),
  'Sweter z wełny': require('./img/sweter-z-welny.jpg'),
  'Kardigan': require('./img/kardigan.jpg'),
  'Golf': require('./img/golf.jpg'),
  'Sweter oversize': require('./img/sweter-oversize.jpg'),
  'Koszula lniana': require('./img/koszula-lniana.jpg'),
  'Koszula oxford': require('./img/koszula-oxford.jpg'),
  'Koszula flanelowa': require('./img/koszula-flanelowa.jpg'),
  'T-shirt basic': require('./img/t-shirt-basic.jpg'),
  'T-shirt z nadrukiem': require('./img/t-shirt-z-nadrukiem.jpg'),
  'Longsleeve': require('./img/longsleeve.jpg'),
  'Jeansy 501': require('./img/jeansy-501.jpg'),
  'Chinosy': require('./img/chinosy.jpg'),
  'Spodnie cargo': require('./img/spodnie-cargo.jpg'),
  'Spodnie dresowe': require('./img/spodnie-dresowe.jpg'),
  'Sukienka midi': require('./img/sukienka-midi.jpg'),
  'Sukienka maxi': require('./img/sukienka-maxi.jpg'),
  'Sukienka koszulowa': require('./img/sukienka-koszulowa.jpg'),
  'Sneakersy': require('./img/sneakersy.jpg'),
  'Botki': require('./img/botki.jpg'),
  'Mokasyny': require('./img/mokasyny.jpg'),
  'Trampki': require('./img/trampki.jpg'),
  'Torba na ramię': require('./img/torba-na-ramie.jpg'),
  'Czapka beanie': require('./img/czapka-beanie.jpg'),
  'Szalik wełniany': require('./img/szalik-welniany.jpg'),
  'Pasek skórzany': require('./img/pasek-skorzany.jpg'),
};

// Photos of the default Sell draft ("Marynarka Zara", snag on the sleeve).
export const SELL_IMG: number[] = [require('./img/sell-1.jpg'), require('./img/sell-2.jpg'), require('./img/sell-3.jpg')];

// Opened parcel with the QR card, by deal id (unboxing still and camera frame); d5 has the undisclosed stain of scene A.
const UNBOX_IMG: Record<string, number> = { d1: require('./img/unbox-d1.jpg'), d5: require('./img/unbox-d5.jpg') };
const UNBOX_GENERIC: number = require('./img/unbox-generic.jpg');
const PACKING_OPEN: number = require('./img/packing-open.jpg');
export const PARCEL_CLOSED: number = require('./img/parcel-closed.jpg');
export const SCAN_CARD: number = require('./img/scan-card.jpg');

export const unboxImg = (id: string) => UNBOX_IMG[id] ?? UNBOX_GENERIC;
// Scene B: the seller packs the Levi's jacket the buyer then unboxes; everything else (returns too) uses the generic frame.
export const packingImg = (id: string, isReturn: boolean) => (!isReturn && id === 'd1' ? UNBOX_IMG.d1 : PACKING_OPEN);

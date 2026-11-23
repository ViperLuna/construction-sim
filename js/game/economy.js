// Money and fuel (see docs/DESIGN.md, sections 7.4 and 9). All money is whole
// dollars. The HUD shows a short form ($1.54M); the money screen shows it in full.

export const START_MONEY = 500;
export const FUEL_PRICE = 3; // dollars per gallon, flat
export const FUEL_CAPACITY = 500; // gallons in the property reservoir (starts full)
export const FUEL_GAL_PER_TILE = 0.012; // truck fuel burned per map tile driven

export function createEconomy() {
  return { money: START_MONEY, fuelGal: FUEL_CAPACITY };
}

export function formatMoneyFull(n) {
  const v = Math.round(n);
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US')}`;
}

export function formatMoneyShort(n) {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const trim = (x, d) => x.toFixed(d).replace(/\.?0+$/, '');
  if (a < 10000) return `${sign}$${a.toLocaleString('en-US')}`;
  if (a < 1e6) return `${sign}$${trim(a / 1e3, 1)}K`;
  if (a < 1e9) return `${sign}$${trim(a / 1e6, 2)}M`;
  return `${sign}$${trim(a / 1e9, 2)}B`;
}

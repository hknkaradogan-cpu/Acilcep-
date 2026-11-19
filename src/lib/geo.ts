// ISO 3166-1 alpha-2 country codes. Names are shown in the user's language via Intl.DisplayNames.
const CODES =
  'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SN SO SR SS SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VE VN XK YE ZA ZM ZW'.split(' ');

export function countryName(code: string | null | undefined, lang: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryOptions(lang: string): { code: string; name: string }[] {
  return CODES.map((code) => ({ code, name: countryName(code, lang) })).sort((a, b) =>
    a.name.localeCompare(b.name, lang),
  );
}

/** Supported currencies. No conversion is done anywhere: prices are shown in the currency the buyer chose. */
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN',
  'CZK', 'HUF', 'RON', 'BGN', 'RSD', 'GEL', 'AZN', 'KZT', 'UAH', 'RUB', 'EGP', 'MAD', 'TND', 'NGN', 'KES',
  'ZAR', 'INR', 'PKR', 'BDT', 'CNY', 'JPY', 'KRW', 'SGD', 'MYR', 'IDR', 'THB', 'VND', 'PHP', 'AUD', 'NZD',
  'CAD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP',
];

export const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'm', 'set', 'hour'];

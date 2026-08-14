const COUNTRY_CODES = [
    "AD",
    "AE",
    "AF",
    "AG",
    "AI",
    "AL",
    "AM",
    "AO",
    "AR",
    "AS",
    "AT",
    "AU",
    "AW",
    "AX",
    "AZ",
    "BA",
    "BB",
    "BD",
    "BE",
    "BF",
    "BG",
    "BH",
    "BI",
    "BJ",
    "BL",
    "BM",
    "BN",
    "BO",
    "BQ",
    "BR",
    "BS",
    "BT",
    "BW",
    "BY",
    "BZ",
    "CA",
    "CC",
    "CD",
    "CF",
    "CG",
    "CH",
    "CI",
    "CK",
    "CL",
    "CM",
    "CN",
    "CO",
    "CR",
    "CU",
    "CV",
    "CW",
    "CX",
    "CY",
    "CZ",
    "DE",
    "DJ",
    "DK",
    "DM",
    "DO",
    "DZ",
    "EC",
    "EE",
    "EG",
    "ER",
    "ES",
    "ET",
    "FI",
    "FJ",
    "FK",
    "FM",
    "FO",
    "FR",
    "GA",
    "GB",
    "GD",
    "GE",
    "GF",
    "GG",
    "GH",
    "GI",
    "GL",
    "GM",
    "GN",
    "GP",
    "GQ",
    "GR",
    "GT",
    "GU",
    "GW",
    "GY",
    "HK",
    "HN",
    "HR",
    "HT",
    "HU",
    "ID",
    "IE",
    "IL",
    "IM",
    "IN",
    "IO",
    "IQ",
    "IR",
    "IS",
    "IT",
    "JE",
    "JM",
    "JO",
    "JP",
    "KE",
    "KG",
    "KH",
    "KI",
    "KM",
    "KN",
    "KP",
    "KR",
    "KW",
    "KY",
    "KZ",
    "LA",
    "LB",
    "LC",
    "LI",
    "LK",
    "LR",
    "LS",
    "LT",
    "LU",
    "LV",
    "LY",
    "MA",
    "MC",
    "MD",
    "ME",
    "MF",
    "MG",
    "MH",
    "MK",
    "ML",
    "MM",
    "MN",
    "MO",
    "MP",
    "MQ",
    "MR",
    "MS",
    "MT",
    "MU",
    "MV",
    "MW",
    "MX",
    "MY",
    "MZ",
    "NA",
    "NC",
    "NE",
    "NF",
    "NG",
    "NI",
    "NL",
    "NO",
    "NP",
    "NR",
    "NU",
    "NZ",
    "OM",
    "PA",
    "PE",
    "PF",
    "PG",
    "PH",
    "PK",
    "PL",
    "PM",
    "PN",
    "PR",
    "PS",
    "PT",
    "PW",
    "PY",
    "QA",
    "RE",
    "RO",
    "RS",
    "RU",
    "RW",
    "SA",
    "SB",
    "SC",
    "SD",
    "SE",
    "SG",
    "SH",
    "SI",
    "SJ",
    "SK",
    "SL",
    "SM",
    "SN",
    "SO",
    "SR",
    "SS",
    "ST",
    "SV",
    "SX",
    "SY",
    "SZ",
    "TC",
    "TD",
    "TG",
    "TH",
    "TJ",
    "TK",
    "TL",
    "TM",
    "TN",
    "TO",
    "TR",
    "TT",
    "TV",
    "TW",
    "TZ",
    "UA",
    "UG",
    "UM",
    "US",
    "UY",
    "UZ",
    "VA",
    "VC",
    "VE",
    "VG",
    "VI",
    "VN",
    "VU",
    "WF",
    "WS",
    "XK",
    "YE",
    "YT",
    "ZA",
    "ZM",
    "ZW"
] as const;

export interface SupplierCountryOption {
    code: string;
    name: string;
}

export const PHILIPPINES_COUNTRY = "Philippines";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export const SUPPLIER_COUNTRY_OPTIONS: SupplierCountryOption[] = COUNTRY_CODES
    .map(code => ({ code, name: regionNames.of(code) || code }))
    .sort((a, b) => {
        if (a.code === "PH") return -1;
        if (b.code === "PH") return 1;
        return a.name.localeCompare(b.name, "en");
    });

const canonicalCountries = new Map(
    SUPPLIER_COUNTRY_OPTIONS.map(country => [country.name.trim().toLowerCase(), country.name])
);

const COUNTRY_ALIASES: Record<string, string> = {
    ph: PHILIPPINES_COUNTRY,
    phils: PHILIPPINES_COUNTRY,
    philippine: PHILIPPINES_COUNTRY,
    "republic of the philippines": PHILIPPINES_COUNTRY,
    us: "United States",
    usa: "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "united states of america": "United States"
};

function countryKey(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeSupplierCountry(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const key = countryKey(value);
    if (!key) return null;

    return COUNTRY_ALIASES[key] || canonicalCountries.get(key) || null;
}

export class SupplierCountryValidationError extends Error {
    constructor() {
        super("Country must be selected from the supported country list.");
        this.name = "SupplierCountryValidationError";
    }
}

export function canonicalizeSupplierCountry(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) return PHILIPPINES_COUNTRY;

    const normalized = normalizeSupplierCountry(value);
    if (!normalized) throw new SupplierCountryValidationError();

    return normalized;
}

export function isPhilippinesCountry(value: unknown): boolean {
    if (typeof value !== "string" || !value.trim()) return true;
    return normalizeSupplierCountry(value) === PHILIPPINES_COUNTRY;
}

export function isForeignCountry(value: unknown): boolean {
    return typeof value === "string" && Boolean(value.trim()) && !isPhilippinesCountry(value);
}

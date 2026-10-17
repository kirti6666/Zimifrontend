/* Country calling codes for phone sign-in, as ISO 3166 code + E.164 calling code.
   Names come from the device's own language data; flags are built from the code. */
const OB_DIAL = 'AF93 AX358 AL355 DZ213 AS1 AD376 AO244 AI1 AG1 AR54 AM374 AW297 AU61 AT43 AZ994 BS1 BH973 BD880 BB1 BY375 BE32 BZ501 BJ229 BM1 BT975 BO591 BQ599 BA387 BW267 BR55 IO246 VG1 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238 KY1 CF236 TD235 CL56 CN86 CX61 CC61 CO57 KM269 CG242 CD243 CK682 CR506 CI225 HR385 CU53 CW599 CY357 CZ420 DK45 DJ253 DM1 DO1 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FK500 FO298 FJ679 FI358 FR33 GF594 PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1 GP590 GU1 GT502 GG44 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IM44 IL972 IT39 JM1 JP81 JE44 JO962 KZ7 KE254 KI686 XK383 KW965 KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 NI505 NE227 NG234 NU683 NF672 KP850 MK389 MP1 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1 QA974 RE262 RO40 RU7 RW250 BL590 SH290 KN1 LC1 MF590 PM508 VC1 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SX1 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 LK94 SD249 SR597 SJ47 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 TG228 TK690 TO676 TT1 TN216 TR90 TM993 TC1 TV688 UG256 UA380 AE971 GB44 US1 UY598 VI1 UZ998 VU678 VA39 VE58 VN84 WF681 EH212 YE967 ZM260 ZW263';
const OB_COUNTRIES = OB_DIAL.split(' ').map(entry => ({ iso: entry.slice(0, 2), dial: '+' + entry.slice(2) }));
// Several places share a calling code; a typed "+1…" or "+44…" picks the main one.
const OB_DIAL_HOME = { '+1': 'US', '+7': 'RU', '+39': 'IT', '+44': 'GB', '+47': 'NO', '+61': 'AU', '+212': 'MA', '+262': 'RE', '+358': 'FI', '+590': 'GP', '+599': 'CW' };
const obRegionNames = (() => { try { return new Intl.DisplayNames([...(navigator.languages || []), 'en'], { type: 'region' }); } catch { return null; } })();
function obCountryName(iso) { try { return obRegionNames?.of(iso) || iso; } catch { return iso; } }
function obFlag(iso) { return String.fromCodePoint(...[...iso].map(letter => 127397 + letter.charCodeAt(0))); }
function obCountryOf(iso) { return OB_COUNTRIES.find(country => country.iso === iso); }
/** Last country used here; otherwise India for the India time zone, else the device region. */
const obHomeCountry = (() => {
  try { const saved = localStorage.getItem('zimi.country'); if (obCountryOf(saved)) return saved; } catch { /* Storage can be unavailable. */ }
  try { if (/^Asia\/(Kolkata|Calcutta)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone)) return 'IN'; } catch { /* Older engines. */ }
  for (const tag of navigator.languages || [navigator.language]) {
    try { const region = new Intl.Locale(tag).maximize().region; if (obCountryOf(region)) return region; } catch { /* Unknown tag. */ }
  }
  return 'IN';
})();
function obCountry() { return obCountryOf(S.auth.country) || obCountryOf(obHomeCountry); }
function obRememberCountry(iso) { S.auth.country = iso; try { localStorage.setItem('zimi.country', iso); } catch { /* Optional convenience. */ } }
/** "+447911123456" -> { iso: "GB", national: "7911123456" }, longest calling code first. */
function obParseInternational(value) {
  const digits = String(value).replace(/\D/g, '');
  for (let length = 3; length >= 1; length--) {
    const dial = '+' + digits.slice(0, length);
    const iso = OB_DIAL_HOME[dial] || OB_COUNTRIES.find(country => country.dial === dial)?.iso;
    if (iso) return { iso, national: digits.slice(length) };
  }
  return null;
}
// Many people keep their national trunk "0"; the calling code replaces it.
function obNational(digits) { return String(digits || '').replace(/\D/g, '').replace(/^0+/, ''); }
function obE164() { return obCountry().dial + obNational(S.auth.phone); }
function obPhoneProblem() {
  const country = obCountry(), national = obNational(S.auth.phone);
  if (country.iso === 'IN') return /^[6-9]\d{9}$/.test(national) ? '' : 'Enter a valid 10-digit Indian mobile number.';
  // E.164 numbers have at most 15 digits including the calling code.
  return /^[1-9]\d{3,13}$/.test(national) && national.length + country.dial.length - 1 <= 15 ? '' : `Enter a valid mobile number for ${obCountryName(country.iso)}.`;
}

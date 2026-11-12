/* Country calling codes for optional phone sign-in. Classic script, no network.
   Each row is ISO code, English name, calling code, and national-number length.
   Phone sign-in stays off until js/firebase-config.js sets phone: true. */
(function (root) {
  'use strict';

  /* iso|name|calling code|min national digits|max national digits */
  var RAW = [
    'AF|Afghanistan|93|9|9', 'AL|Albania|355|8|9', 'DZ|Algeria|213|8|9', 'AS|American Samoa|1|10|10',
    'AD|Andorra|376|6|9', 'AO|Angola|244|9|9', 'AI|Anguilla|1|10|10', 'AG|Antigua and Barbuda|1|10|10',
    'AR|Argentina|54|10|11', 'AM|Armenia|374|8|8', 'AW|Aruba|297|7|7', 'AU|Australia|61|9|9',
    'AT|Austria|43|7|13', 'AZ|Azerbaijan|994|9|9', 'BS|Bahamas|1|10|10', 'BH|Bahrain|973|8|8',
    'BD|Bangladesh|880|10|10', 'BB|Barbados|1|10|10', 'BY|Belarus|375|9|9', 'BE|Belgium|32|8|9',
    'BZ|Belize|501|7|7', 'BJ|Benin|229|8|8', 'BM|Bermuda|1|10|10', 'BT|Bhutan|975|7|8',
    'BO|Bolivia|591|8|8', 'BQ|Bonaire, Sint Eustatius and Saba|599|7|7', 'BA|Bosnia and Herzegovina|387|8|8',
    'BW|Botswana|267|7|8', 'BR|Brazil|55|10|11', 'IO|British Indian Ocean Territory|246|7|7',
    'VG|British Virgin Islands|1|10|10', 'BN|Brunei|673|7|7', 'BG|Bulgaria|359|7|9',
    'BF|Burkina Faso|226|8|8', 'BI|Burundi|257|8|8', 'KH|Cambodia|855|8|9', 'CM|Cameroon|237|9|9',
    'CA|Canada|1|10|10', 'CV|Cape Verde|238|7|7', 'KY|Cayman Islands|1|10|10', 'CF|Central African Republic|236|8|8',
    'TD|Chad|235|8|8', 'CL|Chile|56|9|9', 'CN|China|86|11|11', 'CX|Christmas Island|61|9|9',
    'CC|Cocos (Keeling) Islands|61|9|9', 'CO|Colombia|57|10|10', 'KM|Comoros|269|7|7',
    'CG|Congo|242|9|9', 'CD|Congo, Democratic Republic of the|243|9|9', 'CK|Cook Islands|682|5|5',
    'CR|Costa Rica|506|8|8', 'CI|Côte d’Ivoire|225|10|10', 'HR|Croatia|385|8|9', 'CU|Cuba|53|8|8',
    'CW|Curaçao|599|7|8', 'CY|Cyprus|357|8|8', 'CZ|Czechia|420|9|9', 'DK|Denmark|45|8|8',
    'DJ|Djibouti|253|8|8', 'DM|Dominica|1|10|10', 'DO|Dominican Republic|1|10|10', 'EC|Ecuador|593|8|9',
    'EG|Egypt|20|9|10', 'SV|El Salvador|503|8|8', 'GQ|Equatorial Guinea|240|9|9', 'ER|Eritrea|291|7|7',
    'EE|Estonia|372|7|8', 'SZ|Eswatini|268|8|8', 'ET|Ethiopia|251|9|9', 'FK|Falkland Islands|500|5|5',
    'FO|Faroe Islands|298|6|6', 'FJ|Fiji|679|7|7', 'FI|Finland|358|6|12', 'FR|France|33|9|9',
    'GF|French Guiana|594|9|9', 'PF|French Polynesia|689|6|8', 'GA|Gabon|241|7|8', 'GM|Gambia|220|7|7',
    'GE|Georgia|995|9|9', 'DE|Germany|49|6|13', 'GH|Ghana|233|9|9', 'GI|Gibraltar|350|8|8',
    'GR|Greece|30|10|10', 'GL|Greenland|299|6|6', 'GD|Grenada|1|10|10', 'GP|Guadeloupe|590|9|9',
    'GU|Guam|1|10|10', 'GT|Guatemala|502|8|8', 'GG|Guernsey|44|10|10', 'GN|Guinea|224|9|9',
    'GW|Guinea-Bissau|245|7|9', 'GY|Guyana|592|7|7', 'HT|Haiti|509|8|8', 'HN|Honduras|504|8|8',
    'HK|Hong Kong|852|8|8', 'HU|Hungary|36|8|9', 'IS|Iceland|354|7|7', 'IN|India|91|10|10',
    'ID|Indonesia|62|8|12', 'IR|Iran|98|10|10', 'IQ|Iraq|964|8|10', 'IE|Ireland|353|7|9',
    'IM|Isle of Man|44|10|10', 'IL|Israel|972|8|9', 'IT|Italy|39|6|11', 'JM|Jamaica|1|10|10',
    'JP|Japan|81|9|10', 'JE|Jersey|44|10|10', 'JO|Jordan|962|8|9', 'KZ|Kazakhstan|7|10|10',
    'KE|Kenya|254|9|9', 'KI|Kiribati|686|5|8', 'XK|Kosovo|383|8|8', 'KW|Kuwait|965|8|8',
    'KG|Kyrgyzstan|996|9|9', 'LA|Laos|856|8|10', 'LV|Latvia|371|8|8', 'LB|Lebanon|961|7|8',
    'LS|Lesotho|266|8|8', 'LR|Liberia|231|7|9', 'LY|Libya|218|9|9', 'LI|Liechtenstein|423|7|9',
    'LT|Lithuania|370|8|8', 'LU|Luxembourg|352|8|11', 'MO|Macao|853|8|8', 'MG|Madagascar|261|9|9',
    'MW|Malawi|265|7|9', 'MY|Malaysia|60|8|10', 'MV|Maldives|960|7|7', 'ML|Mali|223|8|8',
    'MT|Malta|356|8|8', 'MH|Marshall Islands|692|7|7', 'MQ|Martinique|596|9|9', 'MR|Mauritania|222|8|8',
    'MU|Mauritius|230|7|8', 'YT|Mayotte|262|9|9', 'MX|Mexico|52|10|10', 'FM|Micronesia|691|7|7',
    'MD|Moldova|373|8|8', 'MC|Monaco|377|8|9', 'MN|Mongolia|976|8|8', 'ME|Montenegro|382|8|8',
    'MS|Montserrat|1|10|10', 'MA|Morocco|212|9|9', 'MZ|Mozambique|258|8|9', 'MM|Myanmar|95|7|10',
    'NA|Namibia|264|8|9', 'NR|Nauru|674|7|7', 'NP|Nepal|977|8|10', 'NL|Netherlands|31|9|9',
    'NC|New Caledonia|687|6|6', 'NZ|New Zealand|64|8|10', 'NI|Nicaragua|505|8|8', 'NE|Niger|227|8|8',
    'NG|Nigeria|234|10|10', 'NU|Niue|683|4|4', 'NF|Norfolk Island|672|5|6', 'KP|North Korea|850|8|10',
    'MK|North Macedonia|389|8|8', 'MP|Northern Mariana Islands|1|10|10', 'NO|Norway|47|8|8',
    'OM|Oman|968|8|8', 'PK|Pakistan|92|10|10', 'PW|Palau|680|7|7', 'PS|Palestine|970|8|9',
    'PA|Panama|507|7|8', 'PG|Papua New Guinea|675|7|8', 'PY|Paraguay|595|9|9', 'PE|Peru|51|8|9',
    'PH|Philippines|63|10|10', 'PL|Poland|48|9|9', 'PT|Portugal|351|9|9', 'PR|Puerto Rico|1|10|10',
    'QA|Qatar|974|8|8', 'RE|Réunion|262|9|9', 'RO|Romania|40|9|9', 'RU|Russia|7|10|10',
    'RW|Rwanda|250|9|9', 'BL|Saint Barthélemy|590|9|9', 'SH|Saint Helena|290|4|4',
    'KN|Saint Kitts and Nevis|1|10|10', 'LC|Saint Lucia|1|10|10', 'MF|Saint Martin|590|9|9',
    'PM|Saint Pierre and Miquelon|508|6|6', 'VC|Saint Vincent and the Grenadines|1|10|10',
    'WS|Samoa|685|5|7', 'SM|San Marino|378|6|10', 'ST|São Tomé and Príncipe|239|7|7',
    'SA|Saudi Arabia|966|9|9', 'SN|Senegal|221|9|9', 'RS|Serbia|381|8|9', 'SC|Seychelles|248|7|7',
    'SL|Sierra Leone|232|8|8', 'SG|Singapore|65|8|8', 'SX|Sint Maarten|1|10|10', 'SK|Slovakia|421|9|9',
    'SI|Slovenia|386|8|8', 'SB|Solomon Islands|677|5|7', 'SO|Somalia|252|7|8', 'ZA|South Africa|27|9|9',
    'KR|South Korea|82|8|11', 'SS|South Sudan|211|9|9', 'ES|Spain|34|9|9', 'LK|Sri Lanka|94|9|9',
    'SD|Sudan|249|9|9', 'SR|Suriname|597|6|7', 'SE|Sweden|46|7|10', 'CH|Switzerland|41|9|9',
    'SY|Syria|963|8|9', 'TW|Taiwan|886|8|9', 'TJ|Tajikistan|992|9|9', 'TZ|Tanzania|255|9|9',
    'TH|Thailand|66|8|9', 'TL|Timor-Leste|670|7|8', 'TG|Togo|228|8|8', 'TK|Tokelau|690|4|4',
    'TO|Tonga|676|5|7', 'TT|Trinidad and Tobago|1|10|10', 'TN|Tunisia|216|8|8', 'TR|Turkey|90|10|10',
    'TM|Turkmenistan|993|8|8', 'TC|Turks and Caicos Islands|1|10|10', 'TV|Tuvalu|688|5|6',
    'UG|Uganda|256|9|9', 'UA|Ukraine|380|9|9', 'AE|United Arab Emirates|971|8|9',
    'GB|United Kingdom|44|9|10', 'US|United States|1|10|10', 'UY|Uruguay|598|8|8',
    'VI|U.S. Virgin Islands|1|10|10', 'UZ|Uzbekistan|998|9|9', 'VU|Vanuatu|678|5|7',
    'VA|Vatican City|39|6|11', 'VE|Venezuela|58|10|10', 'VN|Vietnam|84|9|10',
    'WF|Wallis and Futuna|681|6|6', 'EH|Western Sahara|212|9|9', 'YE|Yemen|967|8|9',
    'ZM|Zambia|260|9|9', 'ZW|Zimbabwe|263|9|9'
  ];

  /* Italy, San Marino, and Vatican City keep the leading 0 in international form. */
  var KEEP_TRUNK = { IT: 1, SM: 1, VA: 1 };

  var countries = RAW.map(function (row) {
    var p = row.split('|');
    return { iso: p[0], name: p[1], dial: p[2], min: +p[3], max: +p[4] };
  }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });

  var byIso = {};
  countries.forEach(function (c) { byIso[c.iso] = c; });

  function find(iso) { return byIso[String(iso || '').toUpperCase()] || null; }

  /* National digits plus the calling code, checked against E.164 (max 15 digits, no leading zero). */
  function toE164(iso, nationalRaw) {
    var country = find(iso);
    if (!country) return { error: 'Choose a country.' };
    var digits = String(nationalRaw || '').replace(/\D/g, '');
    if (!KEEP_TRUNK[country.iso] && digits.charAt(0) === '0') digits = digits.replace(/^0+/, '');
    if (!digits) return { error: 'Enter your phone number.' };
    if (digits.length < country.min || digits.length > country.max) {
      return { error: 'That number does not look right for ' + country.name + '. Use the national number, without the country code.' };
    }
    var e164 = '+' + country.dial + digits;
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) return { error: 'Enter a full international number.' };
    return { e164: e164, country: country };
  }

  function guessIso() {
    var langs = (root.navigator && root.navigator.languages) || [];
    var i, m;
    for (i = 0; i < langs.length; i++) {
      m = /-([A-Za-z]{2})\b/.exec(langs[i] || '');
      if (m && find(m[1])) return m[1].toUpperCase();
    }
    return find('US') ? 'US' : countries[0].iso;
  }

  root.ClayJarPhone = { countries: countries, find: find, toE164: toE164, guessIso: guessIso };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
  module.exports = globalThis.ClayJarPhone;
}

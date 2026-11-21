const TEENCODE_MAP: Record<string, string> = {
  k: 'khong',
  ko: 'khong',
  khong: 'khong',
  kg: 'khong',
  hok: 'khong',
  j: 'gi',
  gi: 'gi',
  z: 'vay',
  dz: 'vay',
  zay: 'vay',
  m: 'minh',
  mk: 'minh',
  t: 'tao',
  b: 'ban',
  bn: 'ban',
  dc: 'duoc',
  duoc: 'duoc',
  vs: 'voi',
  r: 'roi',
  rui: 'roi',
  lm: 'lam',
  dg: 'dang',
  dag: 'dang',
  fim: 'phim',
  flm: 'phim',
  thik: 'thich',
  iu: 'yeu',
  mun: 'muon',
  mún: 'muon',
  hum: 'hom',
  hnay: 'hom nay',
  hqua: 'hom qua',
  ng: 'nguoi',
  ngu: 'nguoi',
  ak: 'a',
  uk: 'u',
  uh: 'u',
  oke: 'ok',
  tks: 'cam on',
  nha: 'nha',
};

const STOPWORDS = new Set([
  'va',
  'cua',
  'la',
  'voi',
  'trong',
  'cach',
  'cho',
  'the',
  'nay',
  'day',
  'may',
  'cai',
  'mot',
  'theo',
  'them',
  'and',
  'the',
  'of',
  'a',
  'an',
  'to',
  'for',
  'in',
  'is',
  'with',
]);

/**
 * Chuẩn hoá keyword tìm kiếm để ghi event và embed ổn định.
 * Lần lượt NFC → lowercase → bỏ dấu → thay teencode → lọc stopword → bỏ punctuation → gộp whitespace.
 * @returns Chuỗi keyword chỉ gồm chữ cái/số và dấu cách đơn; đầu vào rỗng trả về chuỗi rỗng.
 */
export function normalizeKeyword(keyword?: string | null): string {
  if (typeof keyword !== 'string') return '';

  const composed = keyword.normalize('NFC').toLowerCase();
  const unaccented = composed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  const teencoded = unaccented
    .split(/\s+/)
    .filter(Boolean)
    .map(word => TEENCODE_MAP[word] ?? word)
    .join(' ');
  const withoutStopwords = teencoded
    .split(/\s+/)
    .filter(word => word.length > 0 && !STOPWORDS.has(word))
    .join(' ');
  const withoutPunctuation = withoutStopwords.replace(/[^\p{L}\p{N}\s]/gu, ' ');

  return withoutPunctuation.split(/\s+/).filter(Boolean).join(' ');
}

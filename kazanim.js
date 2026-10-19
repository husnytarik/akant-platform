import { readFileSync } from 'node:fs';

// MEB (TYMM) öğretim programlarından çıkarılan kazanım listesi; ilk istekte yüklenir.
let liste = null;
// Yalnızca ilkokul ve ortaokul (1-8): ortaöğretim programları dışarıda bırakılır
const LISE = /ORTA?A?ÖĞRETİM|\(9-12\)|\(10-11\)|\(11-12\)|12\. ?Sınıf|FELSEFE|İSLAM BİLİM|ASTRONOMİ/i;
const LISE_DERS = new Set(['Edebiyat', 'Fizik', 'Kimya', 'Biyoloji', 'Coğrafya', 'Tarih']);
const bas = s => s.toLocaleLowerCase('tr').replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toLocaleUpperCase('tr'));
// Akant derslerine bağlanmayan programlar kendi adıyla listelenir (Hayat Bilgisi, Arapça, seçmeliler...)
function dersAdi(program) {
  if (/ÇOKLU YABANCI DİL.*İNGİLİZCE/i.test(program)) return 'İngilizce';
  const ad = program.normalize('NFC').replace(/\(.*?\)/g, ' ').replace(/ORTAOKUL VE İMAM HATİP ORTAOKULU|İLKOKUL/gi, ' ')
    .replace(/DERSİ/gi, ' ').replace(/\s+/g, ' ').trim();
  return bas(ad).replace(/^T\.c\./, 'T.C.').replace(/\s+Dersi/g, '').replace(/\s+Dersi$/, '');
}
const yukle = () => {
  if (!liste) {
    const ham = JSON.parse(readFileSync(new URL('./kazanimlar.json', import.meta.url), 'utf8'));
    liste = ham.filter(k => !LISE.test(k.program) && !LISE_DERS.has(k.ders) && !(k.sinif > 8)).map(k => ({
      program: k.program, ders: k.ders || dersAdi(k.program), kod: k.kod, sinif: k.sinif,
      metin: String(k.metin).replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim(),
    })).filter(k => k.metin.length > 3);
  }
  return liste;
};
// Örnek veri için: bir dersin (Akant ders adı) bir sınıf düzeyindeki kazanımları, program sırasıyla
export const dersKazanimlari = (ders, sinif) => yukle().filter(k => k.ders === ders && k.sinif === sinif);
const kucuk = s => String(s).toLocaleLowerCase('tr');

export async function kazanimApi({ url, res, json }) {
  if (url.pathname !== '/api/kazanim') return false;
  if (url.searchParams.get('dersler')) {
    return json(res, 200, { dersler: [...new Set(yukle().map(k => k.ders))].sort((a, b) => a.localeCompare(b, 'tr')) }), true;
  }
  const ders = url.searchParams.get('ders') || '';
  const sinif = Number(url.searchParams.get('sinif'));
  const q = kucuk(url.searchParams.get('q') || '').trim();
  const sonuc = [];
  // Ders de arama sözcüğü de yoksa tüm programdan rastgele kazanım dökmeyiz
  if (!ders && q.length < 2) return json(res, 200, { kazanimlar: [] }), true;
  for (const k of yukle()) {
    if (ders && k.ders !== ders) continue;
    if (sinif && k.sinif != null && k.sinif !== sinif) continue;
    if (q && !kucuk(k.kod + ' ' + k.metin + ' ' + k.program).includes(q)) continue;
    sonuc.push(k);
    if (sonuc.length >= 60) break;
  }
  json(res, 200, { kazanimlar: sonuc });
  return true;
}

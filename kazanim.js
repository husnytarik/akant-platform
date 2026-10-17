import { readFileSync } from 'node:fs';

// MEB (TYMM) öğretim programlarından çıkarılan kazanım listesi; ilk istekte yüklenir.
let liste = null;
const yukle = () => {
  if (!liste) {
    const ham = JSON.parse(readFileSync(new URL('./kazanimlar.json', import.meta.url), 'utf8'));
    liste = ham.map(k => ({
      program: k.program, ders: k.ders, kod: k.kod, sinif: k.sinif,
      metin: String(k.metin).replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim(),
    })).filter(k => k.metin.length > 3);
  }
  return liste;
};
const kucuk = s => String(s).toLocaleLowerCase('tr');

export async function kazanimApi({ url, res, json }) {
  if (url.pathname !== '/api/kazanim') return false;
  const ders = url.searchParams.get('ders') || '';
  const sinif = Number(url.searchParams.get('sinif'));
  const q = kucuk(url.searchParams.get('q') || '').trim();
  const sonuc = [];
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

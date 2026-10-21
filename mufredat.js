import { readFileSync } from 'node:fs';
import { db } from './db.js';
import { dersKazanimlari } from './kazanim.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const kucuk = s => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
// Ünite = kodun son bölümü atılmış hâli (FB.6.2.1 -> FB.6.2). "program.sınıf.ünite" biçiminde olan programlar sıralı izlenir (FB, MAT, SB, İngilizce...)
const uniteAnahtar = kod => kod.slice(0, kod.lastIndexOf('.'));
const UNITELI = /^[^.]+\.\d+\.\d+$/;
// İsteğe bağlı ünite adları: { "FB.6.1": "Güneş Sistemi ve Tutulmalar" } (uniteler.json; yoksa "1. Ünite" yazılır)
let UNITE_AD = {};
try { UNITE_AD = JSON.parse(readFileSync(new URL('./uniteler.json', import.meta.url), 'utf8')); } catch { /* dosya yok */ }

// Bir sınıf düzeyinde dersin kazanımları, ünitelere ayrılmış hâlde (öğretmen kazanımı yazmaz, listeden seçer)
export function dersGruplari(dersAd, sinifAd) {
  const liste = dersKazanimlari(dersAd, parseInt(sinifAd, 10));
  const gruplar = new Map();
  for (const k of liste) {
    const anahtar = uniteAnahtar(k.kod);
    if (!gruplar.has(anahtar)) {
      const no = anahtar.match(/^[^.]+\.\d+\.(\d+)$/)?.[1];
      gruplar.set(anahtar, { anahtar, no: no ? Number(no) : null, ad: UNITE_AD[anahtar] || '', baslik: no ? `${no}. Ünite` : anahtar, kazanimlar: [] });
    }
    gruplar.get(anahtar).kazanimlar.push({ kod: k.kod, metin: k.metin });
  }
  return { var: liste.length > 0, uniteli: liste.length > 0 && liste.every(k => UNITELI.test(uniteAnahtar(k.kod))), gruplar: [...gruplar.values()] };
}

// Seçilen kodları doğrular; kayıtta saklanacak "KOD – metin" satırlarını ve otomatik konu başlığını üretir. Geçersiz kod varsa hata döner.
export function kazanimCoz(dersAd, sinifAd, kodlar) {
  const liste = dersKazanimlari(dersAd, parseInt(sinifAd, 10));
  const istenen = [...new Set((Array.isArray(kodlar) ? kodlar : []).map(String))];
  if (istenen.length > 15) return { hata: 'Bir derste en çok 15 kazanım seçilebilir' };
  const secilen = [];
  for (const kod of istenen) {
    const k = liste.find(x => x.kod === kod);
    if (!k) return { hata: 'Seçilen kazanım bu ders ve sınıf düzeyinde yok' };
    secilen.push(k);
  }
  const ilk = secilen[0]?.metin.replace(/-\s+/g, '') || '';
  const konu = !ilk ? '' : (ilk.length > 90 ? ilk.slice(0, 87).replace(/\s+\S*$/, '') + '…' : ilk) + (secilen.length > 1 ? ` (+${secilen.length - 1} kazanım)` : '');
  return { var: liste.length > 0, girdiler: secilen.map(k => `${k.kod} – ${k.metin}`), kodlar: secilen.map(k => k.kod), konu };
}

// Müfredat takibi: öğretmenin ders verdiği sınıf+ders için MEB kazanım listesi ile derste, konuda ve ödevde girilen kazanımlar karşılaştırılır.
// Sonraki bir ünitede kazanım girilmiş ama önceki bir ünitenin kazanımı hiç girilmemişse "atlanan" sayılır.
export async function mufredatApi({ req, res, url, o, json, govde }) {
  if (!url.pathname.startsWith('/api/mufredat/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');

  const atamalar = () => db.prepare(`SELECT DISTINCT a.class_id AS sinifId, c.name AS sinif, a.course_id AS dersId, co.name AS ders
    FROM assignments a JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
    WHERE a.teacher_membership_id = ? ORDER BY c.name, co.name`).all(o.membership_id);

  // Öğretmenin bir sınıfta verdiği dersin ünite ve kazanım listesi (ders bitirirken seçmek için)
  if (req.method === 'GET' && url.pathname === '/api/mufredat/kazanimlar') {
    const sinifId = tamSayi(url.searchParams.get('sinifId'), 1, 1e9), ders = url.searchParams.get('ders') || '';
    const a = atamalar().find(x => x.sinifId === sinifId && x.ders === ders);
    if (!a) return hata(404, 'Ders bulunamadı');
    json(res, 200, dersGruplari(a.ders, a.sinif));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/mufredat/takip') {
    const sonuc = [];
    for (const a of atamalar()) {
      const sinifDuzeyi = parseInt(a.sinif, 10);
      const liste = dersKazanimlari(a.ders, sinifDuzeyi);
      if (!liste.length) continue;
      // Girilen kazanımlar: işlenen dersler (yoklama), konu kayıtları ve ödevler; aynı sınıf+dersi veren tüm öğretmenler dahil
      const girilen = [
        ...db.prepare(`SELECT y.kazanim FROM yoklama y JOIN assignments x ON x.id = y.assignment_id
          WHERE y.class_id = ? AND x.course_id = ? AND y.cancelled = 0 AND y.completed_at IS NOT NULL AND y.kazanim IS NOT NULL AND y.kazanim <> ''`).all(a.sinifId, a.dersId),
        ...db.prepare(`SELECT k.kazanim FROM konular k JOIN assignments x ON x.id = k.assignment_id
          WHERE x.class_id = ? AND x.course_id = ? AND k.kazanim IS NOT NULL AND k.kazanim <> ''`).all(a.sinifId, a.dersId),
        ...db.prepare(`SELECT od.kazanim FROM odevler od JOIN assignments x ON x.id = od.assignment_id
          WHERE x.class_id = ? AND x.course_id = ? AND od.kazanim IS NOT NULL AND od.kazanim <> ''`).all(a.sinifId, a.dersId),
      ].map(r => kucuk(r.kazanim));
      const kodlar = new Set(girilen.map(g => { const i = g.indexOf(' – '); return i > 0 ? g.slice(0, i) : g; }));
      const isaret = new Map(db.prepare('SELECT kod, tur FROM mufredat_isaret WHERE teacher_membership_id = ? AND class_id = ? AND ders = ?')
        .all(o.membership_id, a.sinifId, a.ders).map(r => [r.kod, r.tur]));

      const uniteli = liste.every(k => UNITELI.test(uniteAnahtar(k.kod)));
      const unite = k => (uniteli ? uniteAnahtar(k.kod) : null);
      const uniteler = [...new Set(liste.map(unite))];
      const islendi = liste.map(k => {
        if (isaret.get(k.kod) === 'islendi') return true;
        const kod = kucuk(k.kod), metin = kucuk(k.metin).slice(0, 40);
        return kodlar.has(kod) || girilen.some(g => g.includes(kod) || (metin.length >= 25 && g.includes(metin)));
      });
      const muaf = liste.map(k => isaret.get(k.kod) === 'atla');
      const kapsam = liste.filter((_, i) => !muaf[i]);
      const islenen = liste.filter((_, i) => !muaf[i] && islendi[i]).length;

      let atlanan = [], uniteIci = [], suAnki = null;
      if (uniteli && islenen) {
        let enIleri = -1, enSon = -1;
        liste.forEach((k, i) => { if (islendi[i]) { enIleri = Math.max(enIleri, uniteler.indexOf(unite(k))); enSon = i; } });
        suAnki = uniteler[enIleri];
        liste.forEach((k, i) => {
          if (islendi[i] || muaf[i]) return;
          const u = uniteler.indexOf(unite(k));
          const x = { kod: k.kod, metin: k.metin, unite: Number(unite(k).split('.')[2]), uniteAd: UNITE_AD[unite(k)] || '' };
          if (u < enIleri) atlanan.push(x);
          else if (u === enIleri && i < enSon) uniteIci.push(x);
        });
      }
      // Sınavda sorulmuş ama hiç girilmemiş kazanımlar da (hangi ünitede olursa olsun) atlanan sayılır
      const sorulan = new Map();
      for (const r of db.prepare(`SELECT sk.kazanim, s.name AS sinav, s.date AS tarih FROM sinav_kazanim sk JOIN sinav_dersler d ON d.id = sk.sinav_ders_id
        JOIN sinavlar s ON s.id = d.sinav_id JOIN sinav_siniflar ss ON ss.sinav_id = s.id WHERE ss.class_id = ? AND d.ders = ? ORDER BY s.date`).all(a.sinifId, a.ders)) {
        const i = r.kazanim.indexOf(' – ');
        const kod = i > 0 ? r.kazanim.slice(0, i) : r.kazanim;
        if (!sorulan.has(kod)) sorulan.set(kod, { sinav: r.sinav, tarih: r.tarih });
      }
      liste.forEach((k, i) => {
        if (islendi[i] || muaf[i] || !sorulan.has(k.kod)) return;
        const var_ = atlanan.find(x => x.kod === k.kod);
        if (var_) { var_.sinavda = sorulan.get(k.kod); return; }
        atlanan.push({ kod: k.kod, metin: k.metin, unite: uniteli ? Number(unite(k).split('.')[2]) : null, uniteAd: uniteli ? UNITE_AD[unite(k)] || '' : '', sinavda: sorulan.get(k.kod) });
      });
      sonuc.push({
        sinifId: a.sinifId, sinif: a.sinif, ders: a.ders, toplam: kapsam.length, islenen, uniteli,
        suAnkiUnite: suAnki ? Number(suAnki.split('.')[2]) : null, atlanan, uniteIci,
      });
    }
    json(res, 200, { siniflar: sonuc, atlananSayi: sonuc.reduce((t, s) => t + s.atlanan.length, 0) });
    return true;
  }

  // Bir kazanımı "anlatıldı (girmeyi unutmuşum)" ya da "atlanacak/ihtiyaç yok" diye işaretle
  if (req.method === 'POST' && url.pathname === '/api/mufredat/isaretle') {
    const b = await govde(req);
    const sinifId = tamSayi(b.sinifId, 1, 1e9), ders = String(b.ders || ''), kod = String(b.kod || '');
    if (!sinifId || !ders || !kod || !['islendi', 'atla'].includes(b.tur)) return hata(400, 'Geçersiz istek');
    const a = atamalar().find(x => x.sinifId === sinifId && x.ders === ders);
    if (!a || !dersKazanimlari(ders, parseInt(a.sinif, 10)).some(k => k.kod === kod)) return hata(404, 'Kazanım bulunamadı');
    db.prepare(`INSERT INTO mufredat_isaret (teacher_membership_id, class_id, ders, kod, tur, tarih) VALUES (?,?,?,?,?,?)
      ON CONFLICT (teacher_membership_id, class_id, ders, kod) DO UPDATE SET tur = excluded.tur, tarih = excluded.tarih`)
      .run(o.membership_id, sinifId, ders, kod, b.tur, Date.now());
    json(res, 200, { tamam: true });
    return true;
  }

  return hata(404, 'Bulunamadı');
}

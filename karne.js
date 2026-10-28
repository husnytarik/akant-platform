import { db, FOTO_SQL } from './db.js';
import { sinavHesap } from './sinav.js';
import { ogrenciErisimi } from './ogrenci.js';

// Dönem karnesi: bir öğrencinin (ya da bir sınıfın tüm öğrencilerinin) seçilen gelişim dönemi boyunca dersleri, sınavları,
// ödevleri, etütleri ve öğretmen gözlemleri. Yalnız okuma; sınavlar yönetimin yayınladığı kadarıyla görünür.
// Yönetim her öğrenciyi, mentor öğretmen kendi sınıfını, veli çocuğunu görür; öğrenci şimdilik göremez (yayın akışı sonra).

const bugunTarih = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tamSayi = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const sayiYap = r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, typeof b === 'bigint' ? Number(b) : b]));
const yuvarla = (n, basamak = 1) => Math.round(n * 10 ** basamak) / 10 ** basamak;
const ortalamaAl = dizi => dizi.length ? yuvarla(dizi.reduce((t, x) => t + x, 0) / dizi.length) : null;

const OGRENCI_SQL = `SELECT m.id, m.user_id AS userId, m.branch_id AS subeId, m.okul_no AS okulNo, u.full_name AS ad, ${FOTO_SQL} AS foto,
    cs.class_id AS sinifId, c.name AS sinif, c.homeroom_membership_id AS mentorId, b.name AS okul
  FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id
  LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id`;

function okulBilgisi(subeId) {
  const okul = db.prepare('SELECT name AS ad FROM branches WHERE id = ?').get(subeId);
  const kurum = db.prepare('SELECT ad FROM kurum WHERE id = 1').get();
  const okulLogo = db.prepare('SELECT guncelleme FROM okul_logo WHERE branch_id = ?').get(subeId);
  const kurumLogo = db.prepare('SELECT 1 AS var FROM kurum_logo WHERE id = 1').get();
  return {
    ad: okul?.ad || kurum?.ad || '', kurum: kurum?.ad || '',
    logo: okulLogo ? `/api/okul-logo?id=${subeId}&v=${okulLogo.guncelleme}` : kurumLogo ? '/api/kurum-logo' : null,
  };
}

// Varsayılan dönem: bitmiş en son dönem; hiç bitmemişse başlamış en son dönem
function donemSec(subeId, istenen, bugun) {
  const liste = db.prepare('SELECT id, ad, baslangic, bitis FROM gelisim_donemleri WHERE branch_id = ? ORDER BY baslangic').all(subeId)
    .map(d => ({ ...d, acik: bugun <= d.bitis, baslamadi: bugun < d.baslangic }));
  const secili = liste.find(d => d.id === istenen)
    || [...liste].reverse().find(d => !d.acik) || [...liste].reverse().find(d => !d.baslamadi) || liste[0] || null;
  return { liste, secili };
}

function ogrenciKarnesi(ogr, donem, hesap, bugun) {
  const bas = donem.baslangic, son = donem.bitis;
  const ustSinir = son < bugun ? son : bugun;
  const id = ogr.id;

  const veliler = db.prepare(`SELECT u.full_name AS ad FROM guardians g JOIN memberships pm ON pm.id = g.parent_membership_id
    JOIN users u ON u.id = pm.user_id WHERE g.student_membership_id = ? ORDER BY u.full_name`).all(id).map(v => v.ad);
  const mentor = ogr.mentorId ? db.prepare('SELECT u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(ogr.mentorId)?.ad || '' : '';

  // Dersler: sınıfın dersleri, dersin öğretmeni, dönem içi devamsızlık
  const dersListesi = ogr.sinifId ? db.prepare(`SELECT co.name AS ders, GROUP_CONCAT(DISTINCT tu.full_name) AS ogretmen
    FROM assignments a JOIN courses co ON co.id = a.course_id JOIN memberships tm ON tm.id = a.teacher_membership_id JOIN users tu ON tu.id = tm.user_id
    WHERE a.class_id = ? GROUP BY co.name ORDER BY co.name`).all(ogr.sinifId) : [];
  const devamHarita = new Map(db.prepare(`SELECT co.name AS ders, COUNT(k.yoklama_id) AS toplam, COALESCE(SUM(k.status = 'gelmedi'), 0) AS gelmedi,
      COALESCE(SUM(k.status = 'gec'), 0) AS gec, COALESCE(SUM(k.status = 'izinli'), 0) AS izinli
    FROM assignments a JOIN courses co ON co.id = a.course_id
    JOIN yoklama y ON y.assignment_id = a.id AND y.cancelled = 0 AND y.completed_at IS NOT NULL AND y.date BETWEEN ? AND ?
    JOIN yoklama_kayit k ON k.yoklama_id = y.id AND k.student_membership_id = ?
    WHERE a.class_id = ? GROUP BY co.name`).all(bas, ustSinir, id, ogr.sinifId || 0).map(r => [r.ders, sayiYap(r)]));

  // Sınavlar: yalnız yayınlanmış ve dönem içinde yapılmış olanlar
  const sinavlar = hesap.yayinliSinavlar(id).filter(s => s.tarih >= bas && s.tarih <= son).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const yazililar = sinavlar.filter(s => s.yazili);
  const denemeler = sinavlar.filter(s => !s.yazili);

  const yaziliHarita = new Map();
  for (const s of yazililar) for (const d of s.dersler) {
    if (d.puan === null || d.puan === undefined) continue;
    (yaziliHarita.get(d.ders) || yaziliHarita.set(d.ders, []).get(d.ders)).push({ ad: s.ad, tarih: s.tarih, puan: d.puan });
  }
  const adlar = new Set(dersListesi.map(d => d.ders));
  const dersler = [...dersListesi, ...[...yaziliHarita.keys()].filter(a => !adlar.has(a)).map(ders => ({ ders, ogretmen: '' }))].map(d => {
    const yaz = yaziliHarita.get(d.ders) || [];
    const dv = devamHarita.get(d.ders) || { toplam: 0, gelmedi: 0, gec: 0, izinli: 0 };
    return { ders: d.ders, ogretmen: d.ogretmen || '', yazililar: yaz, not: ortalamaAl(yaz.map(y => y.puan)), devam: dv };
  });

  const devamToplam = dersler.reduce((t, d) => ({ toplam: t.toplam + d.devam.toplam, gelmedi: t.gelmedi + d.devam.gelmedi, gec: t.gec + d.devam.gec, izinli: t.izinli + d.devam.izinli }),
    { toplam: 0, gelmedi: 0, gec: 0, izinli: 0 });

  // Tekrar edilmesi gereken konular: kazanımın en son ölçüldüğü denemede hâlâ "Eksik" olanlar
  const kazanimSon = new Map();
  for (const s of denemeler) for (const d of s.dersler) for (const k of d.kazanimlar || []) kazanimSon.set(d.ders + '|' + k.kazanim, { ders: d.ders, kazanim: k.kazanim, oran: k.oran, durum: k.durum, sinav: s.ad, tarih: s.tarih });
  const tekrar = [...kazanimSon.values()].filter(k => k.durum === 'Eksik').sort((a, b) => a.oran - b.oran).slice(0, 10);

  // Sınıf için yayınlanmış ama öğrencinin girmediği sınavlar
  const girdi = new Set(sinavlar.map(s => s.ad + '|' + s.tarih));
  const katilmadi = ogr.sinifId ? db.prepare(`SELECT s.name AS ad, s.date AS tarih FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id
    WHERE ss.class_id = ? AND s.yayin = 1 AND s.amac = 'deneme' AND s.durum = 'aktif' AND s.date BETWEEN ? AND ? ORDER BY s.date`).all(ogr.sinifId, bas, son)
    .filter(s => !girdi.has(s.ad + '|' + s.tarih)) : [];

  // Ödevler: dönem içinde son tarihi gelmiş ödevler, derse göre
  const odevSatirlari = ogr.sinifId ? db.prepare(`SELECT co.name AS ders, COUNT(*) AS verilen,
      COALESCE(SUM(d.durum IN ('yapildi','dogrulandi')), 0) AS yapildi, COALESCE(SUM(d.durum = 'duzeltme'), 0) AS duzeltme,
      COALESCE(SUM(d.durum = 'yapilamadi'), 0) AS yapilmadi, COALESCE(SUM(d.durum IS NULL), 0) AS isaretsiz
    FROM odevler od JOIN assignments a ON a.id = od.assignment_id JOIN courses co ON co.id = a.course_id
    LEFT JOIN odev_durumlari d ON d.odev_id = od.id AND d.student_membership_id = ?
    WHERE a.class_id = ? AND od.due_date BETWEEN ? AND ? GROUP BY co.name ORDER BY co.name`).all(id, ogr.sinifId, bas, ustSinir).map(sayiYap) : [];
  const odevDersler = odevSatirlari.map(r => ({ ...r, yuzde: r.verilen ? Math.round(r.yapildi / r.verilen * 100) : null }));
  const odevToplam = odevSatirlari.reduce((t, r) => ({ verilen: t.verilen + r.verilen, yapildi: t.yapildi + r.yapildi, duzeltme: t.duzeltme + r.duzeltme, yapilmadi: t.yapilmadi + r.yapilmadi, isaretsiz: t.isaretsiz + r.isaretsiz }),
    { verilen: 0, yapildi: 0, duzeltme: 0, yapilmadi: 0, isaretsiz: 0 });
  odevToplam.yuzde = odevToplam.verilen ? Math.round(odevToplam.yapildi / odevToplam.verilen * 100) : null;
  // Tamamlanmamış ödevlerden son birkaçı (liste kısa tutulur; sayfaya sığmayan uzun liste karneye yakışmaz)
  const eksikOdevler = ogr.sinifId ? db.prepare(`SELECT od.title AS baslik, od.due_date AS son, co.name AS ders, d.durum
    FROM odevler od JOIN assignments a ON a.id = od.assignment_id JOIN courses co ON co.id = a.course_id
    LEFT JOIN odev_durumlari d ON d.odev_id = od.id AND d.student_membership_id = ?
    WHERE a.class_id = ? AND od.due_date BETWEEN ? AND ? AND (d.durum IS NULL OR d.durum IN ('yapilamadi','duzeltme'))
    ORDER BY od.due_date DESC, od.id DESC LIMIT 8`).all(id, ogr.sinifId, bas, ustSinir).map(x => ({ ...x, durum: x.durum || 'isaretsiz' })) : [];

  // Etütler
  const etutler = db.prepare(`SELECT e.topic AS konu, e.date AS tarih, e.start_time AS saat, co.name AS ders, ek.attendance AS devam
    FROM etut_katilimcilar ek JOIN etutler e ON e.id = ek.etut_id LEFT JOIN courses co ON co.id = e.course_id
    WHERE ek.student_membership_id = ? AND e.status = 'planli' AND e.date BETWEEN ? AND ? ORDER BY e.date, e.start_time`).all(id, bas, son);
  const etutOzet = { toplam: etutler.length, geldi: etutler.filter(e => e.devam === 'geldi').length, gelmedi: etutler.filter(e => e.devam === 'gelmedi').length,
    izinli: etutler.filter(e => e.devam === 'izinli').length, bekliyor: etutler.filter(e => !e.devam).length };

  // Gelişim gözlemleri ve görüşme notları
  const dersEtiket = new Map();
  const ogretmenDersi = mid => {
    if (!dersEtiket.has(mid)) {
      const dl = ogr.sinifId ? db.prepare(`SELECT DISTINCT co.name FROM assignments a JOIN courses co ON co.id = a.course_id WHERE a.class_id = ? AND a.teacher_membership_id = ? ORDER BY co.name`)
        .all(ogr.sinifId, mid).map(r => r.name) : [];
      if (mid === ogr.mentorId) dl.push('Sınıf öğretmeni');
      dersEtiket.set(mid, dl.join(', '));
    }
    return dersEtiket.get(mid);
  };
  const gozlemler = db.prepare(`SELECT b.ad AS baslik, g.teacher_membership_id AS ogretmenId, u.full_name AS ogretmen, g.metin
    FROM gelisim_girisleri g JOIN gelisim_basliklari b ON b.id = g.baslik_id JOIN memberships m ON m.id = g.teacher_membership_id JOIN users u ON u.id = m.user_id
    WHERE g.donem_id = ? AND g.student_membership_id = ? ORDER BY b.sira, u.full_name`).all(donem.id, id)
    .map(g => ({ baslik: g.baslik, ogretmen: g.ogretmen, ders: ogretmenDersi(g.ogretmenId), metin: g.metin }));
  const gorusmeler = db.prepare(`SELECT g.tur, g.tarih, g.notu, u.full_name AS yazan FROM gelisim_gorusmeleri g
    JOIN memberships m ON m.id = g.yazan_membership_id JOIN users u ON u.id = m.user_id
    WHERE g.donem_id = ? AND g.student_membership_id = ? ORDER BY g.tarih, g.id`).all(donem.id, id);

  const notlar = dersler.map(d => d.not).filter(n => n !== null);
  return {
    ogrenci: { id, ad: ogr.ad, okulNo: ogr.okulNo || '', foto: ogr.foto || null, sinif: ogr.sinif || '', veli: veliler.join(' · '), mentor },
    genel: {
      ortalama: ortalamaAl(notlar), denemeOrtalama: ortalamaAl(denemeler.map(s => s.ortalama)),
      devamsiz: devamToplam.gelmedi, izinli: devamToplam.izinli, gec: devamToplam.gec, dersSaati: devamToplam.toplam,
      odevYuzde: odevToplam.yuzde, etut: etutOzet.toplam,
    },
    dersler,
    sinav: {
      denemeler: denemeler.map(s => ({ ad: s.ad, tarih: s.tarih, ortalama: s.ortalama, giren: s.giren, siralama: s.siralama, degisim: s.degisim ? { fark: s.degisim.fark, oran: s.degisim.oran } : null })),
      tekrar, katilmadi,
    },
    odev: { toplam: odevToplam, dersler: odevDersler, eksik: eksikOdevler },
    etut: { ozet: etutOzet, liste: etutler },
    gelisim: { gozlemler, gorusmeler },
  };
}

export async function karneApi({ req, res, url, o, json }) {
  if (url.pathname !== '/api/karne') return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (req.method !== 'GET') return hata(405, 'Geçersiz istek');
  if (o.role === 'ogrenci') return hata(403, 'Bu işlem için yetkiniz yok');
  const bugun = bugunTarih();
  const ogrId = tamSayi(url.searchParams.get('id'));
  const sinifId = tamSayi(url.searchParams.get('sinifId'));
  const donemId = tamSayi(url.searchParams.get('donemId'));

  let ogrenciler, sinif = null;
  if (sinifId) {
    sinif = db.prepare('SELECT id, name AS ad, branch_id AS subeId, homeroom_membership_id AS mentorId FROM classes WHERE id = ?').get(sinifId);
    if (!sinif) return hata(404, 'Sınıf bulunamadı');
    if (o.role === 'ogretmen' ? sinif.mentorId !== o.membership_id : o.role !== 'yonetim') return hata(403, 'Bu işlem için yetkiniz yok');
    ogrenciler = db.prepare(`${OGRENCI_SQL} WHERE cs.class_id = ? AND m.role = 'ogrenci' AND m.status = 'aktif'`).all(sinifId);
    ogrenciler.sort((a, b) => (Number(a.okulNo) || 1e9) - (Number(b.okulNo) || 1e9) || a.ad.localeCompare(b.ad, 'tr'));
  } else if (ogrId) {
    const izinli = o.role === 'veli' ? !!db.prepare('SELECT 1 FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').get(o.membership_id, ogrId)
      : !!ogrenciErisimi(o, ogrId);
    if (!izinli) return hata(404, 'Öğrenci bulunamadı');
    const ogr = db.prepare(`${OGRENCI_SQL} WHERE m.id = ? AND m.role = 'ogrenci'`).get(ogrId);
    if (!ogr) return hata(404, 'Öğrenci bulunamadı');
    ogrenciler = [ogr];
  } else return hata(400, 'Öğrenci ya da sınıf seçilmedi');
  if (!ogrenciler.length) return json(res, 200, { ogrenciler: [], sinif: sinif && { id: sinif.id, ad: sinif.ad }, donemler: [], donem: null }), true;

  const subeId = sinif ? sinif.subeId : ogrenciler[0].subeId;
  const { liste, secili } = donemSec(subeId, donemId, bugun);
  if (!secili) return hata(404, 'Bu okulda tanımlı dönem yok');
  const hesap = sinavHesap();
  json(res, 200, {
    okul: okulBilgisi(subeId), donem: secili, donemler: liste, rapor: bugun, sinif: sinif && { id: sinif.id, ad: sinif.ad },
    ogrenciler: ogrenciler.map(g => ogrenciKarnesi(g, secili, hesap, bugun)),
  });
  return true;
}

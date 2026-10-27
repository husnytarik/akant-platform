import { db } from './db.js';
import { DERS_ZAMANLARI, ACIK_GUNLER, GUN_ADLARI, gunAcik } from './okul-ayar.js';
import { tarihAcik } from './tatil.js';
import { KULUP_DERSI } from './ders-programi.js';

const TURLER = ['deney', 'proje', 'sunum', 'gezi', 'diger'];
const KATILIM = ['geldi', 'gelmedi', 'izinli'];
const TALEP_SINIRI = 3;

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const metin = (v, enCok) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, enCok);
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay();
const simdiSaat = () => new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const aralik = saat => DERS_ZAMANLARI[saat - 1]?.join('–') || '';

// Ders saati başladı mı (yoklama ancak başladıktan sonra alınır)
function basladi(tarih, saat) {
  const t = bugun();
  if (tarih !== t) return tarih < t;
  return (DERS_ZAMANLARI[saat - 1]?.[0] || '00:00') <= simdiSaat();
}
function kulupDurumu(tarih, saat, c) {
  if (c?.iptal) return 'iptal';
  if (c?.tamamlandi) return 'tamam';
  const t = bugun();
  if (tarih !== t) return tarih > t ? 'bekliyor' : 'gecikti';
  const bitis = DERS_ZAMANLARI[saat - 1]?.[1];
  return bitis && simdiSaat() > bitis ? 'gecikti' : 'bekliyor';
}

// Kulübün önümüzdeki ders günleri ve öğretmenin önceden yazdığı etkinlik (tatil günleri atlanır)
function planlar(k, adet = 6) {
  const sonuc = [];
  const d = new Date(bugun() + 'T00:00:00Z');
  for (let i = 0; i < 100 && sonuc.length < adet; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const t = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== k.gun || !tarihAcik(t)) continue;
    const c = db.prepare('SELECT tur, baslik, aciklama, tamamlandi, iptal FROM kulup_calismalar WHERE kulup_id = ? AND tarih = ?').get(k.id, t);
    if (c?.tamamlandi && !c.iptal) continue;
    sonuc.push({ tarih: t, tur: c?.tur || 'diger', baslik: c?.baslik || '', aciklama: c?.aciklama || '', iptal: !!c?.iptal });
  }
  return sonuc;
}

// Öğretmenin o günkü kulüp dersleri: ders programındaki satırlarla aynı biçimde (ders.js ve panel kullanır)
export function ogretmenKulupDersleri(ogretmenId, tarih) {
  if (!tarihAcik(tarih)) return [];
  return db.prepare(`SELECT k.* FROM kulupler k JOIN kulup_ogretmen ko ON ko.kulup_id = k.id
    WHERE ko.teacher_membership_id = ? AND k.aktif = 1 AND k.gun = ? ORDER BY k.ders_saati`).all(ogretmenId, gunNo(tarih)).map(k => {
    const c = db.prepare('SELECT * FROM kulup_calismalar WHERE kulup_id = ? AND tarih = ?').get(k.id, tarih);
    return {
      dersSaati: k.ders_saati, atamaId: null, kulupId: k.id, sinifId: null, sinif: k.ad, ders: KULUP_DERSI, aralik: aralik(k.ders_saati),
      alindi: !!c?.tamamlandi, durum: kulupDurumu(tarih, k.ders_saati, c), konu: c?.baslik || '',
      gelmedi: c ? db.prepare("SELECT COUNT(*) AS n FROM kulup_katilim WHERE calisma_id = ? AND durum = 'gelmedi'").get(c.id).n : 0,
      baslangic: new Date(k.created_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
    };
  });
}

// Sınıf düzeyi: "6-C" -> "6" (kulüp saati ve kulübün açık olduğu düzeyler bununla tutulur)
const duzey = ad => String(ad).match(/^\d+/)?.[0] || String(ad);
const duzeySirasi = (a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b), 'tr');

const kulupDersiId = () => db.prepare('SELECT id FROM courses WHERE name = ?').get(KULUP_DERSI).id;
const subeId = o => db.prepare('SELECT branch_id FROM memberships WHERE id = ?').get(o.membership_id)?.branch_id;

const ogretmenleri = kulupId => db.prepare(`SELECT ko.teacher_membership_id AS uyelikId, u.full_name AS ad
  FROM kulup_ogretmen ko JOIN memberships m ON m.id = ko.teacher_membership_id JOIN users u ON u.id = m.user_id
  WHERE ko.kulup_id = ? ORDER BY u.full_name`).all(kulupId);

const seviyeler = k => k.seviyeler ? k.seviyeler.split(',') : [];

// Öğrencinin sınıfı, kulübün düzeyinde ve o gün/saatte sınıfının programında "Kulüp" saati var mı
function ogrenciHatasi(ogrenciId, kulup) {
  const s = db.prepare(`SELECT c.id, c.name, c.branch_id FROM class_students cs JOIN classes c ON c.id = cs.class_id
    JOIN memberships m ON m.id = cs.student_membership_id WHERE cs.student_membership_id = ? AND m.status = 'aktif'`).get(ogrenciId);
  if (!s) return 'Öğrenci bir sınıfa kayıtlı değil';
  if (s.branch_id !== kulup.branch_id) return 'Öğrenci bu kulübün şubesinde değil';
  if (!seviyeler(kulup).includes(duzey(s.name))) return `${s.name} sınıfı bu kulübün düzeylerinde değil`;
  const hucre = db.prepare(`SELECT 1 FROM schedule sc JOIN assignments a ON a.id = sc.assignment_id
    WHERE sc.class_id = ? AND sc.day = ? AND sc.period = ? AND a.course_id = ?`).get(s.id, kulup.gun, kulup.ders_saati, kulupDersiId());
  if (!hucre) return `${s.name} sınıfının programında bu gün ve saatte kulüp dersi yok`;
  return null;
}

const ogrenciKarti = id => db.prepare(`SELECT m.id AS uyelikId, u.full_name AS ad, m.okul_no AS okulNo, c.name AS sinif
  FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN class_students cs ON cs.student_membership_id = m.id
  LEFT JOIN classes c ON c.id = cs.class_id WHERE m.id = ?`).get(id);

const uyeleri = kulupId => db.prepare(`SELECT m.id AS uyelikId, u.full_name AS ad, m.okul_no AS okulNo, c.name AS sinif
  FROM kulup_uyeler ku JOIN memberships m ON m.id = ku.student_membership_id JOIN users u ON u.id = m.user_id
  LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
  WHERE ku.kulup_id = ? ORDER BY c.name, u.full_name`).all(kulupId);

function kulupOzeti(k) {
  return {
    id: k.id, ad: k.ad, tema: k.tema, aciklama: k.aciklama, kontenjan: k.kontenjan, aktif: !!k.aktif,
    gun: k.gun, gunAd: GUN_ADLARI[k.gun], dersSaati: k.ders_saati, aralik: aralik(k.ders_saati),
    seviyeler: seviyeler(k), ogretmenler: ogretmenleri(k.id),
    uyeSayisi: db.prepare('SELECT COUNT(*) AS n FROM kulup_uyeler WHERE kulup_id = ?').get(k.id).n,
    bekleyen: db.prepare("SELECT COUNT(*) AS n FROM kulup_talepleri WHERE kulup_id = ? AND durum = 'bekliyor'").get(k.id).n,
  };
}

// Öğretmen aynı saatte derste olmamalı ve başka bir kulübün danışmanı da olmamalı
function ogretmenCakismasi(uyelikId, gun, saat, haricKulup) {
  const u = db.prepare('SELECT user_id FROM memberships WHERE id = ?').get(uyelikId).user_id;
  const ders = db.prepare(`SELECT c.name AS sinif FROM schedule s JOIN assignments a ON a.id = s.assignment_id
    JOIN memberships m ON m.id = a.teacher_membership_id JOIN classes c ON c.id = s.class_id
    WHERE m.user_id = ? AND s.day = ? AND s.period = ?`).get(u, gun, saat);
  if (ders) return `bu saatte ${ders.sinif} sınıfında derste`;
  const kulup = db.prepare(`SELECT k.ad FROM kulup_ogretmen ko JOIN kulupler k ON k.id = ko.kulup_id
    JOIN memberships m ON m.id = ko.teacher_membership_id
    WHERE m.user_id = ? AND k.gun = ? AND k.ders_saati = ? AND k.aktif = 1 AND k.id != ?`).get(u, gun, saat, haricKulup || 0);
  if (kulup) return `bu saatte ${kulup.ad} kulübünde görevli`;
  return null;
}

// Öğrencinin (ya da velinin çocuğunun) üyelik numarası
function cocukBul(o, istenen) {
  if (o.role === 'ogrenci') return o.membership_id;
  if (o.role !== 'veli') return null;
  const ids = db.prepare('SELECT student_membership_id AS id FROM guardians WHERE parent_membership_id = ?').all(o.membership_id).map(r => r.id);
  return ids.includes(istenen) ? istenen : ids[0] || null;
}

export async function kulupApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/kulup/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const yonetim = o.role === 'yonetim';
  const ogretmen = o.role === 'ogretmen';

  // ---------- Yönetim ----------
  if (yonetim && req.method === 'GET' && yol === '/api/kulup/yonetim') {
    const sube = subeId(o);
    const siniflar = db.prepare('SELECT id, name FROM classes WHERE branch_id = ?').all(sube);
    const duzeyler = [...new Set(siniflar.map(s => duzey(s.name)))].sort(duzeySirasi);
    const kulupDersi = kulupDersiId();
    // Düzey bazında kulüp saatleri: o düzeydeki sınıfların kaçında bu hücre kulüp dersi
    const saatler = db.prepare(`SELECT c.name AS sinif, s.day AS gun, s.period AS saat FROM schedule s
      JOIN assignments a ON a.id = s.assignment_id JOIN classes c ON c.id = s.class_id
      WHERE c.branch_id = ? AND a.course_id = ?`).all(sube, kulupDersi);
    const harita = new Map();
    for (const r of saatler) {
      const anahtar = `${duzey(r.sinif)}:${r.gun}:${r.saat}`;
      harita.set(anahtar, (harita.get(anahtar) || 0) + 1);
    }
    json(res, 200, {
      kulupler: db.prepare('SELECT * FROM kulupler WHERE branch_id = ? ORDER BY aktif DESC, ad').all(sube).map(kulupOzeti),
      duzeyler,
      sinifSayisi: Object.fromEntries(duzeyler.map(d => [d, siniflar.filter(s => duzey(s.name) === d).length])),
      kulupSaatleri: [...harita].map(([a, n]) => { const [d, g, s] = a.split(':'); return { duzey: d, gun: Number(g), gunAd: GUN_ADLARI[g], saat: Number(s), aralik: aralik(Number(s)), sinif: n }; })
        .sort((a, b) => duzeySirasi(a.duzey, b.duzey) || a.gun - b.gun || a.saat - b.saat),
      ogretmenler: db.prepare(`SELECT m.id AS uyelikId, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.role = 'ogretmen' AND m.status = 'aktif' AND m.branch_id = ? ORDER BY u.full_name`).all(sube),
      gunler: ACIK_GUNLER.map(g => ({ gun: g, ad: GUN_ADLARI[g] })),
      zamanlar: DERS_ZAMANLARI.map(z => z.join('–')),
    });
    return true;
  }

  if (yonetim && req.method === 'GET' && yol === '/api/kulup/talepler') {
    const sube = subeId(o);
    const satirlar = db.prepare(`SELECT t.id, t.student_membership_id AS ogrenciId, t.kulup_id AS kulupId, k.ad AS kulup, t.sira, t.durum,
      k.kontenjan, (SELECT COUNT(*) FROM kulup_uyeler ku WHERE ku.kulup_id = k.id) AS uyeSayisi
      FROM kulup_talepleri t JOIN kulupler k ON k.id = t.kulup_id WHERE k.branch_id = ? ORDER BY t.student_membership_id, t.sira`).all(sube);
    const ogrenciler = new Map();
    for (const t of satirlar) {
      if (!ogrenciler.has(t.ogrenciId)) {
        const kart = ogrenciKarti(t.ogrenciId);
        const uye = db.prepare('SELECT k.id, k.ad FROM kulup_uyeler ku JOIN kulupler k ON k.id = ku.kulup_id WHERE ku.student_membership_id = ?').get(t.ogrenciId);
        ogrenciler.set(t.ogrenciId, { ...kart, uye: uye || null, talepler: [] });
      }
      ogrenciler.get(t.ogrenciId).talepler.push({ id: t.id, kulupId: t.kulupId, kulup: t.kulup, sira: t.sira, durum: t.durum, kontenjan: t.kontenjan, uyeSayisi: t.uyeSayisi });
    }
    // Yerleşmemiş olanlar önce
    json(res, 200, { ogrenciler: [...ogrenciler.values()].sort((a, b) => Number(!!a.uye) - Number(!!b.uye) || String(a.sinif).localeCompare(String(b.sinif), 'tr') || a.ad.localeCompare(b.ad, 'tr')) });
    return true;
  }

  if ((yonetim || ogretmen) && req.method === 'GET' && yol === '/api/kulup/uyeler') {
    const k = db.prepare('SELECT * FROM kulupler WHERE id = ?').get(tamSayi(url.searchParams.get('kulupId'), 1, 1e9));
    if (!k) return hata(404, 'Kulüp bulunamadı');
    if (yonetim ? k.branch_id !== subeId(o) : !db.prepare('SELECT 1 FROM kulup_ogretmen WHERE kulup_id = ? AND teacher_membership_id = ?').get(k.id, o.membership_id)) return hata(403, 'Bu kulüp için yetkiniz yok');
    json(res, 200, { uyeler: uyeleri(k.id) });
    return true;
  }

  if (yonetim && req.method === 'POST') {
    const yazma = ['/api/kulup/kaydet', '/api/kulup/durum', '/api/kulup/sil', '/api/kulup/yerlestir', '/api/kulup/cikar', '/api/kulup/red', '/api/kulup/saat'];
    if (!yazma.includes(yol)) return false;
    const b = await govde(req);
    const sube = subeId(o);
    const kulupBul = id => { const k = db.prepare('SELECT * FROM kulupler WHERE id = ?').get(tamSayi(id, 1, 1e9)); return k && k.branch_id === sube ? k : null; };

    if (yol === '/api/kulup/kaydet') {
      const ad = metin(b.ad, 60), tema = metin(b.tema, 60), aciklama = String(b.aciklama ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 500);
      const kontenjan = tamSayi(b.kontenjan, 1, 300);
      const gun = Number.isInteger(Number(b.gun)) && b.gun !== '' && b.gun !== null && gunAcik(Number(b.gun)) ? Number(b.gun) : null;
      const saat = tamSayi(b.dersSaati, 1, DERS_ZAMANLARI.length);
      if (ad.length < 2) return hata(400, 'Kulüp adı en az 2 karakter olmalı');
      if (!kontenjan) return hata(400, 'Kontenjan 1-300 arası olmalı');
      if (gun === null || !saat) return hata(400, 'Kulüp günü ve ders saatini seçin');
      const gecerliDuzey = new Set(db.prepare('SELECT name FROM classes WHERE branch_id = ?').all(sube).map(s => duzey(s.name)));
      const dz = [...new Set((Array.isArray(b.seviyeler) ? b.seviyeler : []).map(String))].filter(d => gecerliDuzey.has(d)).sort(duzeySirasi);
      if (!dz.length) return hata(400, 'En az bir sınıf düzeyi seçin');
      const ogretmenler = [...new Set((Array.isArray(b.ogretmenler) ? b.ogretmenler : []).map(Number))];
      if (!ogretmenler.length) return hata(400, 'En az bir kulüp öğretmeni seçin');
      for (const id of ogretmenler) {
        if (!db.prepare("SELECT 1 FROM memberships WHERE id = ? AND role = 'ogretmen' AND status = 'aktif' AND branch_id = ?").get(id, sube)) return hata(400, 'Geçersiz öğretmen');
      }
      const mevcut = b.id ? kulupBul(b.id) : null;
      if (b.id && !mevcut) return hata(404, 'Kulüp bulunamadı');
      if (db.prepare('SELECT 1 FROM kulupler WHERE branch_id = ? AND ad = ? COLLATE NOCASE AND id != ?').get(sube, ad, mevcut?.id || 0)) return hata(409, 'Bu adla bir kulüp zaten var');
      for (const id of ogretmenler) {
        const c = ogretmenCakismasi(id, gun, saat, mevcut?.id);
        if (c) return hata(409, `${db.prepare('SELECT u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(id).ad} ${c}`);
      }
      const yeni = { branch_id: sube, gun, ders_saati: saat, seviyeler: dz.join(',') };
      if (mevcut) {
        const uyeler = uyeleri(mevcut.id);
        if (kontenjan < uyeler.length) return hata(409, `Kulübün ${uyeler.length} üyesi var; kontenjan bundan az olamaz`);
        const sorunlu = uyeler.map(u => ({ u, h: ogrenciHatasi(u.uyelikId, { ...mevcut, ...yeni }) })).filter(x => x.h);
        if (sorunlu.length) return hata(409, `${sorunlu.length} üye yeni gün/saat ya da düzeylere uymuyor (${sorunlu[0].u.ad}: ${sorunlu[0].h}). Önce üyeleri çıkarın.`);
        db.prepare('UPDATE kulupler SET ad = ?, tema = ?, aciklama = ?, kontenjan = ?, gun = ?, ders_saati = ?, seviyeler = ? WHERE id = ?')
          .run(ad, tema, aciklama, kontenjan, gun, saat, yeni.seviyeler, mevcut.id);
        db.prepare('DELETE FROM kulup_ogretmen WHERE kulup_id = ?').run(mevcut.id);
      } else {
        const id = Number(db.prepare('INSERT INTO kulupler (branch_id, ad, tema, aciklama, kontenjan, gun, ders_saati, seviyeler, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(sube, ad, tema, aciklama, kontenjan, gun, saat, yeni.seviyeler, Date.now()).lastInsertRowid);
        b.id = id;
      }
      const kulupId = mevcut?.id || b.id;
      for (const id of ogretmenler) db.prepare('INSERT INTO kulup_ogretmen (kulup_id, teacher_membership_id) VALUES (?,?)').run(kulupId, id);
      denetle(o.user_id, mevcut ? 'kulup.guncelle' : 'kulup.ekle', { kulupId, ad });
      json(res, mevcut ? 200 : 201, { tamam: true, id: kulupId });
      return true;
    }

    if (yol === '/api/kulup/durum') {
      const k = kulupBul(b.id);
      if (!k) return hata(404, 'Kulüp bulunamadı');
      db.prepare('UPDATE kulupler SET aktif = ? WHERE id = ?').run(b.aktif ? 1 : 0, k.id);
      denetle(o.user_id, 'kulup.durum', { kulupId: k.id, aktif: !!b.aktif });
      json(res, 200, { tamam: true });
      return true;
    }

    if (yol === '/api/kulup/sil') {
      const k = kulupBul(b.id);
      if (!k) return hata(404, 'Kulüp bulunamadı');
      if (db.prepare('SELECT 1 FROM kulup_uyeler WHERE kulup_id = ?').get(k.id) || db.prepare('SELECT 1 FROM kulup_calismalar WHERE kulup_id = ?').get(k.id)) {
        return hata(409, 'Üyesi ya da çalışma kaydı olan kulüp silinemez; pasife alın');
      }
      db.prepare('DELETE FROM kulup_talepleri WHERE kulup_id = ?').run(k.id);
      db.prepare('DELETE FROM kulup_ogretmen WHERE kulup_id = ?').run(k.id);
      db.prepare('DELETE FROM kulupler WHERE id = ?').run(k.id);
      denetle(o.user_id, 'kulup.sil', { kulupId: k.id, ad: k.ad });
      json(res, 200, { tamam: true });
      return true;
    }

    if (yol === '/api/kulup/yerlestir') {
      const k = kulupBul(b.kulupId);
      const ogrenciId = tamSayi(b.ogrenciId, 1, 1e9);
      if (!k || !ogrenciId) return hata(404, 'Kulüp ya da öğrenci bulunamadı');
      if (!k.aktif) return hata(409, 'Kulüp pasif');
      const h = ogrenciHatasi(ogrenciId, k);
      if (h) return hata(409, h);
      const zaten = db.prepare('SELECT kulup_id FROM kulup_uyeler WHERE student_membership_id = ?').get(ogrenciId);
      if (zaten?.kulup_id !== k.id) {
        const dolu = db.prepare('SELECT COUNT(*) AS n FROM kulup_uyeler WHERE kulup_id = ?').get(k.id).n;
        if (dolu >= k.kontenjan) return hata(409, `Kontenjan dolu (${k.kontenjan})`);
        db.prepare('DELETE FROM kulup_uyeler WHERE student_membership_id = ?').run(ogrenciId);
        db.prepare('INSERT INTO kulup_uyeler (kulup_id, student_membership_id, tarih) VALUES (?,?,?)').run(k.id, ogrenciId, Date.now());
      }
      // Tek kulüp: seçilen talep kabul, diğer bekleyenler kapanır
      db.prepare("UPDATE kulup_talepleri SET durum = 'kabul' WHERE student_membership_id = ? AND kulup_id = ?").run(ogrenciId, k.id);
      db.prepare("UPDATE kulup_talepleri SET durum = 'red' WHERE student_membership_id = ? AND kulup_id != ? AND durum != 'red'").run(ogrenciId, k.id);
      denetle(o.user_id, 'kulup.yerlestir', { kulupId: k.id, ogrenciId });
      json(res, 200, { tamam: true });
      return true;
    }

    if (yol === '/api/kulup/cikar') {
      const ogrenciId = tamSayi(b.ogrenciId, 1, 1e9);
      const uye = ogrenciId && db.prepare('SELECT ku.kulup_id FROM kulup_uyeler ku JOIN kulupler k ON k.id = ku.kulup_id WHERE ku.student_membership_id = ? AND k.branch_id = ?').get(ogrenciId, sube);
      if (!uye) return hata(404, 'Öğrenci bir kulüpte değil');
      db.prepare('DELETE FROM kulup_uyeler WHERE student_membership_id = ?').run(ogrenciId);
      db.prepare("UPDATE kulup_talepleri SET durum = 'bekliyor' WHERE student_membership_id = ? AND kulup_id = ? AND durum = 'kabul'").run(ogrenciId, uye.kulup_id);
      denetle(o.user_id, 'kulup.cikar', { kulupId: uye.kulup_id, ogrenciId });
      json(res, 200, { tamam: true });
      return true;
    }

    if (yol === '/api/kulup/red') {
      const t = db.prepare('SELECT t.id FROM kulup_talepleri t JOIN kulupler k ON k.id = t.kulup_id WHERE t.id = ? AND k.branch_id = ?').get(tamSayi(b.talepId, 1, 1e9), sube);
      if (!t) return hata(404, 'Talep bulunamadı');
      db.prepare("UPDATE kulup_talepleri SET durum = 'red' WHERE id = ? AND durum = 'bekliyor'").run(t.id);
      json(res, 200, { tamam: true });
      return true;
    }

    // Bir düzeydeki tüm sınıfların programına aynı gün/saatte "Kulüp" dersi koyar ya da kaldırır
    if (yol === '/api/kulup/saat') {
      const dz = String(b.duzey ?? '');
      const gun = Number.isInteger(Number(b.gun)) && b.gun !== '' && b.gun !== null && gunAcik(Number(b.gun)) ? Number(b.gun) : null;
      const saat = tamSayi(b.saat, 1, DERS_ZAMANLARI.length);
      if (gun === null || !saat) return hata(400, 'Geçersiz gün veya ders saati');
      const siniflar = db.prepare('SELECT id, name FROM classes WHERE branch_id = ?').all(sube).filter(s => duzey(s.name) === dz);
      if (!siniflar.length) return hata(404, 'Bu düzeyde sınıf yok');
      const dersId = kulupDersiId();
      const hucre = db.prepare(`SELECT sc.id, a.course_id AS dersId, co.name AS ders FROM schedule sc JOIN assignments a ON a.id = sc.assignment_id
        JOIN courses co ON co.id = a.course_id WHERE sc.class_id = ? AND sc.day = ? AND sc.period = ?`);
      const atamaSay = db.prepare('UPDATE assignments SET weekly_hours = MAX(1, (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = assignments.id)) WHERE id = ?');

      if (b.kaldir) {
        const kullanan = db.prepare(`SELECT ad FROM kulupler WHERE branch_id = ? AND gun = ? AND ders_saati = ? AND aktif = 1
          AND (',' || seviyeler || ',') LIKE ?`).get(sube, gun, saat, `%,${dz},%`);
        if (kullanan) return hata(409, `${kullanan.ad} kulübü bu saati kullanıyor; önce kulübün gün/saatini değiştirin`);
        let silinen = 0;
        for (const s of siniflar) {
          const h = hucre.get(s.id, gun, saat);
          if (h?.dersId === dersId) {
            db.prepare('DELETE FROM schedule WHERE id = ?').run(h.id);
            silinen++;
          }
          const a = db.prepare('SELECT id FROM assignments WHERE class_id = ? AND course_id = ?').get(s.id, dersId);
          if (a) atamaSay.run(a.id);
        }
        denetle(o.user_id, 'kulup.saat-kaldir', { duzey: dz, gun, saat, silinen });
        json(res, 200, { tamam: true, silinen });
        return true;
      }

      const atlanan = [];
      let yerlesen = 0;
      for (const s of siniflar) {
        const h = hucre.get(s.id, gun, saat);
        if (h && h.dersId !== dersId) { atlanan.push({ sinif: s.name, ders: h.ders }); continue; }
        if (h) continue;
        let a = db.prepare('SELECT id FROM assignments WHERE class_id = ? AND course_id = ?').get(s.id, dersId);
        if (!a) a = { id: Number(db.prepare('INSERT INTO assignments (class_id, course_id, teacher_membership_id, weekly_hours) VALUES (?,?,NULL,1)').run(s.id, dersId).lastInsertRowid) };
        db.prepare('INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)').run(s.id, gun, saat, a.id);
        atamaSay.run(a.id);
        yerlesen++;
      }
      denetle(o.user_id, 'kulup.saat', { duzey: dz, gun, saat, yerlesen, atlanan: atlanan.length });
      json(res, 200, { tamam: true, yerlesen, atlanan });
      return true;
    }
    return false;
  }

  // ---------- Öğrenci / veli ----------
  if ((o.role === 'ogrenci' || o.role === 'veli') && req.method === 'GET' && yol === '/api/kulup/benim') {
    const cocuklar = o.role === 'ogrenci'
      ? db.prepare('SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').all(o.membership_id)
      : db.prepare(`SELECT m.id, u.full_name AS ad FROM guardians g JOIN memberships m ON m.id = g.student_membership_id
          JOIN users u ON u.id = m.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    const cocukId = cocukBul(o, tamSayi(url.searchParams.get('cocuk'), 1, 1e9));
    if (!cocukId) return json(res, 200, { cocuklar, cocuk: null }), true;
    const sinif = db.prepare('SELECT c.id, c.name, c.branch_id FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_membership_id = ?').get(cocukId);
    const sonuc = { cocuklar, cocuk: cocukId, sinif: sinif?.name || '', talepSiniri: TALEP_SINIRI, uye: null, kulupler: [], talepler: [] };
    if (!sinif) return json(res, 200, sonuc), true;

    const uye = db.prepare('SELECT k.* FROM kulup_uyeler ku JOIN kulupler k ON k.id = ku.kulup_id WHERE ku.student_membership_id = ?').get(cocukId);
    if (uye) {
      const ozet = kulupOzeti(uye);
      ozet.planlar = planlar(uye, 4).filter(p => !p.iptal);
      ozet.calismalar = db.prepare(`SELECT c.id, c.tarih, c.tur, c.baslik, c.aciklama, kk.durum AS devam
        FROM kulup_calismalar c LEFT JOIN kulup_katilim kk ON kk.calisma_id = c.id AND kk.student_membership_id = ?
        WHERE c.kulup_id = ? AND c.tamamlandi IS NOT NULL AND c.iptal = 0 ORDER BY c.tarih DESC, c.id DESC LIMIT 30`).all(cocukId, uye.id);
      sonuc.uye = ozet;
    }
    // Yalnızca öğrencinin sınıfında kulüp saati olan, düzeyine açık, aktif kulüpler
    sonuc.kulupler = db.prepare('SELECT * FROM kulupler WHERE branch_id = ? AND aktif = 1 ORDER BY ad').all(sinif.branch_id)
      .filter(k => !ogrenciHatasi(cocukId, k)).map(k => { const { bekleyen, ...ozet } = kulupOzeti(k); return ozet; });
    sonuc.talepler = db.prepare(`SELECT t.kulup_id AS kulupId, k.ad AS kulup, t.sira, t.durum FROM kulup_talepleri t
      JOIN kulupler k ON k.id = t.kulup_id WHERE t.student_membership_id = ? ORDER BY t.sira`).all(cocukId);
    json(res, 200, sonuc);
    return true;
  }

  // Tercih listesinin tamamı bir kerede kaydedilir (en çok 3 kulüp, sıra = tercih sırası)
  if ((o.role === 'ogrenci' || o.role === 'veli') && req.method === 'POST' && yol === '/api/kulup/talep') {
    const b = await govde(req);
    const cocukId = cocukBul(o, tamSayi(b.cocuk, 1, 1e9));
    if (!cocukId) return hata(404, 'Öğrenci bulunamadı');
    if (db.prepare('SELECT 1 FROM kulup_uyeler WHERE student_membership_id = ?').get(cocukId)) return hata(409, 'Öğrenci zaten bir kulübe yerleştirilmiş');
    const idler = [...new Set((Array.isArray(b.kulupler) ? b.kulupler : []).map(Number))];
    if (idler.length > TALEP_SINIRI) return hata(400, `En fazla ${TALEP_SINIRI} kulüp seçilebilir`);
    const kulupler = [];
    for (const id of idler) {
      const k = Number.isInteger(id) && db.prepare('SELECT * FROM kulupler WHERE id = ? AND aktif = 1').get(id);
      if (!k) return hata(404, 'Kulüp bulunamadı');
      const h = ogrenciHatasi(cocukId, k);
      if (h) return hata(409, `${k.ad}: ${h}`);
      kulupler.push(k);
    }
    db.prepare('DELETE FROM kulup_talepleri WHERE student_membership_id = ?').run(cocukId);
    kulupler.forEach((k, i) => db.prepare('INSERT INTO kulup_talepleri (student_membership_id, kulup_id, sira, tarih) VALUES (?,?,?,?)').run(cocukId, k.id, i + 1, Date.now()));
    denetle(o.user_id, 'kulup.talep', { ogrenciId: cocukId, kulupler: idler });
    json(res, 200, { tamam: true });
    return true;
  }

  // ---------- Öğretmen ----------
  if (!ogretmen) return false;
  const kendiKulubu = id => {
    const k = db.prepare('SELECT * FROM kulupler WHERE id = ?').get(tamSayi(id, 1, 1e9));
    return k && db.prepare('SELECT 1 FROM kulup_ogretmen WHERE kulup_id = ? AND teacher_membership_id = ?').get(k.id, o.membership_id) ? k : null;
  };
  const calismaOzeti = c => {
    const say = db.prepare('SELECT durum, COUNT(*) AS n FROM kulup_katilim WHERE calisma_id = ? GROUP BY durum').all(c.id);
    const n = d => say.find(x => x.durum === d)?.n || 0;
    return { id: c.id, tarih: c.tarih, tur: c.tur, baslik: c.baslik, aciklama: c.aciklama, geldi: n('geldi'), gelmedi: n('gelmedi'), izinli: n('izinli') };
  };

  if (req.method === 'GET' && yol === '/api/kulup/kuluplerim') {
    const kulupler = db.prepare(`SELECT k.* FROM kulupler k JOIN kulup_ogretmen ko ON ko.kulup_id = k.id
      WHERE ko.teacher_membership_id = ? AND k.aktif = 1 ORDER BY k.ad`).all(o.membership_id);
    json(res, 200, {
      bugun: bugun(),
      kulupler: kulupler.map(k => ({
        ...kulupOzeti(k), uyeler: uyeleri(k.id), planlar: planlar(k),
        calismalar: db.prepare('SELECT * FROM kulup_calismalar WHERE kulup_id = ? AND tamamlandi IS NOT NULL AND iptal = 0 ORDER BY tarih DESC, id DESC LIMIT 30').all(k.id).map(calismaOzeti),
      })),
    });
    return true;
  }

  // Kulüp dersi: günü ve saati kulübe bağlıdır, tarih seçilir; konu önceden yazılabilir, yoklama ders başlayınca alınır
  const oturumKulubu = (kulupId, tarih) => {
    const k = kendiKulubu(kulupId);
    if (!k) return { hata: [404, 'Kulüp bulunamadı'] };
    if (!tarihGecerli(tarih) || gunNo(tarih) !== k.gun) return { hata: [400, 'Bu tarihte kulüp dersi yok'] };
    return { k };
  };
  const oturumSatiri = (kulupId, tarih) => db.prepare('SELECT * FROM kulup_calismalar WHERE kulup_id = ? AND tarih = ?').get(kulupId, tarih);

  if (req.method === 'GET' && yol === '/api/kulup/oturum') {
    const tarih = String(url.searchParams.get('tarih') || '');
    const { k, hata: h } = oturumKulubu(url.searchParams.get('kulupId'), tarih);
    if (h) return hata(h[0], h[1]);
    const c = oturumSatiri(k.id, tarih);
    json(res, 200, {
      kulup: { id: k.id, ad: k.ad, dersSaati: k.ders_saati, aralik: aralik(k.ders_saati) }, tarih, basladi: basladi(tarih, k.ders_saati),
      uyeler: uyeleri(k.id),
      calisma: c ? { id: c.id, tur: c.tur, baslik: c.baslik, aciklama: c.aciklama, tamam: !!c.tamamlandi && !c.iptal, iptal: !!c.iptal } : null,
      katilim: c ? Object.fromEntries(db.prepare('SELECT student_membership_id AS id, durum FROM kulup_katilim WHERE calisma_id = ?').all(c.id).map(r => [r.id, r.durum])) : {},
    });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/kulup/oturum-kaydet') {
    const b = await govde(req);
    const tarih = String(b.tarih || '');
    const { k, hata: h } = oturumKulubu(b.kulupId, tarih);
    if (h) return hata(h[0], h[1]);
    const tur = TURLER.includes(b.tur) ? b.tur : 'diger';
    const baslik = metin(b.baslik, 100), aciklama = String(b.aciklama ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 1000);
    const mevcut = oturumSatiri(k.id, tarih);
    const bitir = !!b.bitir;
    if (bitir) {
      if (!basladi(tarih, k.ders_saati)) return hata(400, 'Ders başlamadan yoklama alınamaz');
      if (baslik.length < 2) return hata(400, 'Konu en az 2 karakter olmalı');
    } else if (mevcut?.tamamlandi && baslik.length < 2) return hata(400, 'Konu en az 2 karakter olmalı');
    let id = mevcut?.id;
    if (mevcut) {
      db.prepare('UPDATE kulup_calismalar SET tur = ?, baslik = ?, aciklama = ?, teacher_membership_id = ? WHERE id = ?').run(tur, baslik, aciklama, o.membership_id, id);
    } else {
      id = Number(db.prepare('INSERT INTO kulup_calismalar (kulup_id, tarih, tur, baslik, aciklama, teacher_membership_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(k.id, tarih, tur, baslik, aciklama, o.membership_id, Date.now()).lastInsertRowid);
    }
    if (bitir) {
      const katilim = b.katilim && typeof b.katilim === 'object' ? b.katilim : {};
      db.prepare('DELETE FROM kulup_katilim WHERE calisma_id = ?').run(id);
      for (const u of uyeleri(k.id)) {
        db.prepare('INSERT INTO kulup_katilim (calisma_id, student_membership_id, durum) VALUES (?,?,?)').run(id, u.uyelikId, KATILIM.includes(katilim[u.uyelikId]) ? katilim[u.uyelikId] : 'geldi');
      }
      db.prepare('UPDATE kulup_calismalar SET tamamlandi = ?, iptal = 0 WHERE id = ?').run(Date.now(), id);
    }
    const say = db.prepare("SELECT COALESCE(SUM(durum = 'gelmedi'), 0) AS gelmedi, COALESCE(SUM(durum = 'izinli'), 0) AS izinli FROM kulup_katilim WHERE calisma_id = ?").get(id);
    denetle(o.user_id, bitir ? 'kulup.ders-bitir' : 'kulup.ders-plan', { kulupId: k.id, tarih });
    json(res, 200, { tamam: true, gelmedi: Number(say.gelmedi), izinli: Number(say.izinli) });
    return true;
  }

  // Dersi iptal et (yoklama silinir) ya da iptali geri al
  if (req.method === 'POST' && yol === '/api/kulup/oturum-iptal') {
    const b = await govde(req);
    const tarih = String(b.tarih || '');
    const { k, hata: h } = oturumKulubu(b.kulupId, tarih);
    if (h) return hata(h[0], h[1]);
    const mevcut = oturumSatiri(k.id, tarih);
    if (b.geriAl) {
      if (mevcut) db.prepare('UPDATE kulup_calismalar SET iptal = 0 WHERE id = ?').run(mevcut.id);
    } else if (mevcut) {
      db.prepare('DELETE FROM kulup_katilim WHERE calisma_id = ?').run(mevcut.id);
      db.prepare('UPDATE kulup_calismalar SET iptal = 1, tamamlandi = NULL WHERE id = ?').run(mevcut.id);
    } else {
      db.prepare("INSERT INTO kulup_calismalar (kulup_id, tarih, tur, baslik, aciklama, teacher_membership_id, created_at, iptal) VALUES (?,?,'diger','','',?,?,1)").run(k.id, tarih, o.membership_id, Date.now());
    }
    denetle(o.user_id, b.geriAl ? 'kulup.ders-iptal-geri' : 'kulup.ders-iptal', { kulupId: k.id, tarih });
    json(res, 200, { tamam: true });
    return true;
  }
  return false;
}

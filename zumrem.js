import { db } from './db.js';
import { KULUP_DERSI } from './ders-programi.js';
import { tarihAcik } from './tatil.js';

// Zümre = bir okuldaki aynı dersin öğretmenleri. Zümre başkanı ayrı profil değildir: "Zümre başkanı" rolü olan
// öğretmen, kendi dersinin zümresinde başkandır. Toplantıyı yalnızca başkan kurar; yazı tüm zümre öğretmenlerinindir.
db.exec(`
CREATE TABLE IF NOT EXISTS zumre_toplantilari (
  id                     INTEGER PRIMARY KEY,
  branch_id              INTEGER NOT NULL REFERENCES branches(id),
  course_id              INTEGER NOT NULL REFERENCES courses(id),
  baslik                 TEXT NOT NULL,
  tekrar                 TEXT NOT NULL CHECK (tekrar IN ('yok','haftalik','2haftalik','aylik')),
  baslangic              TEXT NOT NULL,
  saat                   TEXT NOT NULL,
  yer                    TEXT NOT NULL DEFAULT '',
  gundem                 TEXT NOT NULL DEFAULT '',
  olusturan_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  created_at             INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS zumre_iletileri (
  id            INTEGER PRIMARY KEY,
  branch_id     INTEGER NOT NULL REFERENCES branches(id),
  course_id     INTEGER NOT NULL REFERENCES courses(id),
  membership_id INTEGER NOT NULL REFERENCES memberships(id),
  metin         TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);`);

export const TEKRAR = { yok: 'Tek seferlik', haftalik: 'Her hafta', '2haftalik': 'İki haftada bir', aylik: 'Ayda bir' };
const HATIRLATMA_GUN = 2;
const ILETI_SINIRI = 60;

const tamSayi = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const metin = (v, en) => String(v ?? '').trim().slice(0, en);
const trTarih = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const trSaat = (d = new Date()) => d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t + 'T00:00:00Z')) && new Date(t + 'T00:00:00Z').toISOString().slice(0, 10) === t;
const gunEkle = (t, n) => { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function ayEkle(t, n) {
  const [y, a, g] = t.split('-').map(Number);
  const hedef = new Date(Date.UTC(y, a - 1 + n, 1));
  const son = new Date(Date.UTC(hedef.getUTCFullYear(), hedef.getUTCMonth() + 1, 0)).getUTCDate();
  hedef.setUTCDate(Math.min(g, son));
  return hedef.toISOString().slice(0, 10);
}

// Bugünden (saati geçmediyse bugün dahil) başlayarak toplantının sıradaki tarihleri. Haftalık toplantılar tatile düşerse o hafta atlanır;
// aylık toplantı kapalı güne (hafta sonu, tatil) düşerse sonraki okul gününe kayar.
export function siradakiler(t, adet, simdi = new Date()) {
  const bugun = trTarih(simdi), saat = trSaat(simdi);
  const gelecekMi = d => d > bugun || (d === bugun && t.saat >= saat);
  if (t.tekrar === 'yok') return gelecekMi(t.baslangic) ? [t.baslangic] : [];
  const sonuc = [];
  let d = t.baslangic;
  for (let i = 0; i < 800 && sonuc.length < adet; i++) {
    let g = d;
    if (t.tekrar === 'aylik') for (let k = 0; k < 10 && !tarihAcik(g); k++) g = gunEkle(g, 1);
    if (gelecekMi(g) && tarihAcik(g)) sonuc.push(g);
    d = t.tekrar === 'aylik' ? ayEkle(t.baslangic, i + 1) : gunEkle(d, t.tekrar === 'haftalik' ? 7 : 14);
  }
  return sonuc;
}

// Öğretmenin zümreleri: şubesinde girdiği (verebildiği) dersler
function zumreler(uyelikId) {
  return db.prepare(`SELECT DISTINCT co.id, co.name AS ad, m.branch_id AS sube FROM teacher_courses tc
    JOIN courses co ON co.id = tc.course_id JOIN memberships m ON m.id = tc.teacher_membership_id
    WHERE tc.teacher_membership_id = ? AND co.name <> ? ORDER BY co.name`).all(uyelikId, KULUP_DERSI);
}

const BASKAN_SQL = `EXISTS (SELECT 1 FROM kullanici_roller kr JOIN roller r ON r.id = kr.rol_id WHERE r.kod = 'zumre' AND kr.user_id = m.user_id)`;

function uyeler(sube, dersId, benimId) {
  return db.prepare(`SELECT m.id, u.full_name AS ad, u.phone AS telefon, ${BASKAN_SQL} AS baskan
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.role = 'ogretmen' AND m.status = 'aktif' AND m.branch_id = ?
      AND m.id IN (SELECT teacher_membership_id FROM teacher_courses WHERE course_id = ?)
    ORDER BY baskan DESC, u.full_name`).all(sube, dersId).map(r => ({ id: r.id, ad: r.ad, telefon: r.telefon, baskan: !!r.baskan, ben: r.id === benimId }));
}

const baskanMi = (uyelikId) => !!db.prepare(`SELECT 1 FROM memberships m WHERE m.id = ? AND ${BASKAN_SQL}`).get(uyelikId);

// Toplantı hatırlatmaları: önümüzdeki günlerde olan zümre toplantıları (öğretmen paneli)
export function zumreHatirlatmalari(uyelikId) {
  const bugun = trTarih();
  const sinir = gunEkle(bugun, HATIRLATMA_GUN);
  const liste = [];
  for (const z of zumreler(uyelikId)) {
    for (const t of db.prepare('SELECT * FROM zumre_toplantilari WHERE branch_id = ? AND course_id = ?').all(z.sube, z.id)) {
      const [tarih] = siradakiler(t, 1);
      if (tarih && tarih <= sinir) liste.push({ baslik: t.baslik, zumre: z.ad, courseId: z.id, tarih, saat: t.saat, yer: t.yer, kalanGun: Math.round((Date.parse(tarih) - Date.parse(bugun)) / 86400000) });
    }
  }
  return liste.sort((a, b) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat));
}

export async function zumremApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/zumre/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (!o) return hata(401, 'Oturum yok');
  if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');
  const sube = db.prepare('SELECT branch_id FROM memberships WHERE id = ?').get(o.membership_id).branch_id;
  const benim = zumreler(o.membership_id);
  const zumreBul = id => benim.find(z => z.id === tamSayi(id));

  if (req.method === 'GET' && yol === '/api/zumre/hatirlatma') return json(res, 200, { toplantilar: zumreHatirlatmalari(o.membership_id) }), true;

  // ---- Zümre özeti: üyeler, toplantılar, yazılar ----
  if (req.method === 'GET' && yol === '/api/zumre/benim') {
    const baskan = baskanMi(o.membership_id);
    return json(res, 200, {
      baskan,
      zumreler: benim.map(z => ({ id: z.id, ad: z.ad, ogretmenSayisi: uyeler(sube, z.id, o.membership_id).length })),
    }), true;
  }

  if (req.method === 'GET' && yol === '/api/zumre/detay') {
    const z = zumreBul(url.searchParams.get('courseId'));
    if (!z) return hata(404, 'Zümre bulunamadı');
    const kisiler = uyeler(sube, z.id, o.membership_id);
    const ben = kisiler.find(k => k.ben);
    const baskan = !!ben?.baskan;
    const toplantilar = db.prepare('SELECT * FROM zumre_toplantilari WHERE branch_id = ? AND course_id = ? ORDER BY baslangic, saat').all(sube, z.id)
      .map(t => ({ id: t.id, baslik: t.baslik, tekrar: t.tekrar, baslangic: t.baslangic, saat: t.saat, yer: t.yer, gundem: t.gundem, siradaki: siradakiler(t, 3) }))
      .sort((a, b) => (a.siradaki[0] || '9999').localeCompare(b.siradaki[0] || '9999'));
    const yazilar = db.prepare(`SELECT i.id, i.metin, i.created_at AS zaman, i.membership_id AS yazanId, u.full_name AS yazan, ${BASKAN_SQL} AS baskan
      FROM zumre_iletileri i JOIN memberships m ON m.id = i.membership_id JOIN users u ON u.id = m.user_id
      WHERE i.branch_id = ? AND i.course_id = ? ORDER BY i.created_at DESC, i.id DESC LIMIT ?`).all(sube, z.id, ILETI_SINIRI)
      .map(r => ({ id: r.id, metin: r.metin, zaman: r.zaman, yazan: r.yazan, baskan: !!r.baskan, benim: r.yazanId === o.membership_id }));
    return json(res, 200, { zumre: { id: z.id, ad: z.ad }, baskan, ogretmenler: kisiler, toplantilar, yazilar, tekrarlar: TEKRAR }), true;
  }

  if (req.method !== 'POST') return false;
  const b = await govde(req);

  // ---- Toplantı kur / güncelle / sil (yalnızca zümre başkanı) ----
  if (yol === '/api/zumre/toplanti') {
    const z = zumreBul(b.courseId);
    if (!z) return hata(404, 'Zümre bulunamadı');
    if (!baskanMi(o.membership_id)) return hata(403, 'Toplantıyı yalnızca zümre başkanı kurar');
    const baslik = metin(b.baslik, 80) || 'Zümre toplantısı';
    const tekrar = TEKRAR[b.tekrar] ? b.tekrar : null;
    const tarih = String(b.tarih || ''), saat = String(b.saat || '');
    if (!tekrar) return hata(400, 'Tekrar türü geçersiz');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(saat)) return hata(400, 'Saat geçersiz');
    const yer = metin(b.yer, 60), gundem = metin(b.gundem, 500);
    // Rutin toplantı hiçbir okul gününe denk gelmiyorsa (ör. hafta sonu) hatırlatma hiç çıkmaz
    if (tekrar !== 'yok' && !siradakiler({ tekrar, baslangic: tarih, saat: '00:00' }, 1).length) return hata(400, 'Rutin toplantı için okul günü seçin');
    const id = tamSayi(b.id);
    if (id) {
      const var_ = db.prepare('SELECT 1 FROM zumre_toplantilari WHERE id = ? AND branch_id = ? AND course_id = ?').get(id, sube, z.id);
      if (!var_) return hata(404, 'Toplantı bulunamadı');
      db.prepare('UPDATE zumre_toplantilari SET baslik = ?, tekrar = ?, baslangic = ?, saat = ?, yer = ?, gundem = ? WHERE id = ?').run(baslik, tekrar, tarih, saat, yer, gundem, id);
      denetle(o.user_id, 'zumre-toplanti-guncelle', { id });
      return json(res, 200, { tamam: true, id }), true;
    }
    const yeni = Number(db.prepare('INSERT INTO zumre_toplantilari (branch_id, course_id, baslik, tekrar, baslangic, saat, yer, gundem, olusturan_membership_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(sube, z.id, baslik, tekrar, tarih, saat, yer, gundem, o.membership_id, Date.now()).lastInsertRowid);
    denetle(o.user_id, 'zumre-toplanti-ekle', { id: yeni, courseId: z.id });
    return json(res, 200, { tamam: true, id: yeni }), true;
  }

  if (yol === '/api/zumre/toplanti-sil') {
    const z = zumreBul(b.courseId);
    if (!z) return hata(404, 'Zümre bulunamadı');
    if (!baskanMi(o.membership_id)) return hata(403, 'Toplantıyı yalnızca zümre başkanı siler');
    const s = db.prepare('DELETE FROM zumre_toplantilari WHERE id = ? AND branch_id = ? AND course_id = ?').run(tamSayi(b.id) || 0, sube, z.id);
    if (!s.changes) return hata(404, 'Toplantı bulunamadı');
    denetle(o.user_id, 'zumre-toplanti-sil', { id: b.id });
    return json(res, 200, { tamam: true }), true;
  }

  // ---- Yazılar: zümrenin tüm öğretmenleri yazabilir; kendi yazısını sahibi, herhangi birini başkan siler ----
  if (yol === '/api/zumre/yazi') {
    const z = zumreBul(b.courseId);
    if (!z) return hata(404, 'Zümre bulunamadı');
    const m = metin(b.metin, 1000);
    if (!m) return hata(400, 'Yazı boş olamaz');
    db.prepare('INSERT INTO zumre_iletileri (branch_id, course_id, membership_id, metin, created_at) VALUES (?,?,?,?,?)').run(sube, z.id, o.membership_id, m, Date.now());
    return json(res, 200, { tamam: true }), true;
  }

  if (yol === '/api/zumre/yazi-sil') {
    const z = zumreBul(b.courseId);
    if (!z) return hata(404, 'Zümre bulunamadı');
    const y = db.prepare('SELECT id, membership_id FROM zumre_iletileri WHERE id = ? AND branch_id = ? AND course_id = ?').get(tamSayi(b.id) || 0, sube, z.id);
    if (!y) return hata(404, 'Yazı bulunamadı');
    if (y.membership_id !== o.membership_id && !baskanMi(o.membership_id)) return hata(403, 'Yalnızca kendi yazınızı silebilirsiniz');
    db.prepare('DELETE FROM zumre_iletileri WHERE id = ?').run(y.id);
    return json(res, 200, { tamam: true }), true;
  }

  return false;
}

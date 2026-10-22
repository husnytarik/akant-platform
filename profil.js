import { db } from './db.js';

const YAKINLIK = ['Anne', 'Baba', 'Kardeş', 'Dede', 'Nine', 'Amca / Dayı', 'Teyze / Hala', 'Diğer'];
const epostaGecerli = v => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v);

// "0555 123 45 67", "+90 555..." -> 10 haneli numara; geçersizse null
const tel = v => {
  let d = String(v).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[1-9]\d{9}$/.test(d) ? d : null;
};
const gizle = k => (k && k.length === 11 ? k.slice(0, 3) + '******' + k.slice(-2) : k);

// Kişinin kendi iletişim bilgileri; giriş telefonu ve kimlik yalnızca okul yönetimi tarafından değişir
export async function profilApi({ req, res, url, o, json, govde, denetle }) {
  if (url.pathname !== '/api/profil/bilgi' && url.pathname !== '/api/profil/kaydet') return false;

  if (req.method === 'GET' && url.pathname === '/api/profil/bilgi') {
    const u = db.prepare('SELECT tc_no, passport_no, phone, full_name FROM users WHERE id = ?').get(o.user_id);
    const b = db.prepare('SELECT * FROM profil_bilgi WHERE user_id = ?').get(o.user_id) || {};
    const hesap = [
      { ad: 'Ad soyad', deger: u.full_name },
      u.tc_no ? { ad: 'T.C. kimlik no', deger: gizle(u.tc_no) } : { ad: 'Pasaport no', deger: u.passport_no },
      { ad: 'Giriş telefonu', deger: u.phone },
    ];
    if (o.branch) hesap.push({ ad: 'Şube', deger: o.branch });

    const okul = { baslik: '', satirlar: [] };
    if (o.role === 'ogretmen') {
      okul.baslik = 'Verdiğim dersler';
      okul.satirlar = db.prepare(`SELECT co.name AS ad, GROUP_CONCAT(c.name, ', ') AS deger FROM
        (SELECT DISTINCT course_id, class_id FROM assignments WHERE teacher_membership_id = ?) a
        JOIN courses co ON co.id = a.course_id JOIN classes c ON c.id = a.class_id GROUP BY co.id ORDER BY co.name`).all(o.membership_id);
    } else if (o.role === 'ogrenci') {
      okul.baslik = 'Okul bilgilerim';
      const s = db.prepare(`SELECT c.name AS sinif, m.okul_no FROM memberships m LEFT JOIN class_students cs ON cs.student_membership_id = m.id
        LEFT JOIN classes c ON c.id = cs.class_id WHERE m.id = ?`).get(o.membership_id);
      if (s?.sinif) okul.satirlar.push({ ad: 'Sınıf', deger: s.sinif });
      if (s?.okul_no) okul.satirlar.push({ ad: 'Okul no', deger: s.okul_no });
      for (const v of db.prepare(`SELECT u.full_name, u.phone FROM guardians g JOIN memberships pm ON pm.id = g.parent_membership_id
        JOIN users u ON u.id = pm.user_id WHERE g.student_membership_id = ? ORDER BY u.full_name`).all(o.membership_id)) okul.satirlar.push({ ad: 'Veli', deger: `${v.full_name} · ${v.phone}` });
    } else if (o.role === 'veli') {
      okul.baslik = 'Öğrencilerim';
      okul.satirlar = db.prepare(`SELECT u.full_name AS ad, c.name AS sinif, sm.okul_no FROM guardians g JOIN memberships sm ON sm.id = g.student_membership_id
        JOIN users u ON u.id = sm.user_id LEFT JOIN class_students cs ON cs.student_membership_id = sm.id LEFT JOIN classes c ON c.id = cs.class_id
        WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id)
        .map(r => ({ ad: r.ad, deger: [r.sinif, r.okul_no && 'No ' + r.okul_no].filter(Boolean).join(' · ') }));
    }

    json(res, 200, {
      hesap, okul, yakinlar: YAKINLIK,
      duzenle: { email: b.email || '', telefon2: b.telefon2 || '', il: b.il || '', ilce: b.ilce || '', adres: b.adres || '',
        yakinAd: b.yakin_ad || '', yakinYakinlik: b.yakin_yakinlik || '', yakinTelefon: b.yakin_telefon || '' },
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/profil/kaydet') {
    const b = await govde(req);
    const hata = mesaj => { json(res, 400, { hata: mesaj }); return true; };
    const metin = (v, enCok) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, enCok);
    const eposta = metin(b.email, 120), il = metin(b.il, 40), ilce = metin(b.ilce, 40);
    const adres = String(b.adres ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 250);
    const yakinAd = metin(b.yakinAd, 80), yakinYakinlik = metin(b.yakinYakinlik, 30);
    if (eposta && !epostaGecerli(eposta)) return hata('E-posta adresi geçerli değil');
    let telefon2 = '', yakinTelefon = '';
    if (String(b.telefon2 || '').trim()) { telefon2 = tel(b.telefon2); if (!telefon2) return hata('İkinci telefon geçerli değil (10 haneli, örn. 532 123 45 67)'); }
    if (String(b.yakinTelefon || '').trim()) { yakinTelefon = tel(b.yakinTelefon); if (!yakinTelefon) return hata('Yakının telefonu geçerli değil (10 haneli, örn. 532 123 45 67)'); }
    if (yakinYakinlik && !YAKINLIK.includes(yakinYakinlik)) return hata('Yakınlık listeden seçilmeli');
    if ((yakinAd || yakinYakinlik) && !yakinTelefon) return hata('Yakın kişi için telefon numarası gerekli');

    db.prepare(`INSERT INTO profil_bilgi (user_id, email, telefon2, il, ilce, adres, yakin_ad, yakin_yakinlik, yakin_telefon, guncelleme)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, telefon2 = excluded.telefon2, il = excluded.il, ilce = excluded.ilce,
        adres = excluded.adres, yakin_ad = excluded.yakin_ad, yakin_yakinlik = excluded.yakin_yakinlik, yakin_telefon = excluded.yakin_telefon, guncelleme = excluded.guncelleme`)
      .run(o.user_id, eposta, telefon2, il, ilce, adres, yakinAd, yakinYakinlik, yakinTelefon, Date.now());
    denetle(o.user_id, 'profil.guncelle', { kullanici: o.user_id });
    json(res, 200, { tamam: true });
    return true;
  }
  return false;
}

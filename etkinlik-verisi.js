// Örnek etkinlik verisi: geçmiş yoklamalar, işlenen konular, ödevler ve etütler.
// Önce ornek-veri.js çalışmış olmalı (sınıf, öğretmen, program). Tekrar çalıştırılırsa bir şey eklemez.
import { db } from './db.js';
import { dersKazanimlari } from './kazanim.js';

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay();
const sec = a => a[Math.floor(Math.random() * a.length)];
const karistir = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const KONULAR = ['Giriş ve tekrar', 'Yeni konu anlatımı', 'Alıştırmalar', 'Uygulama çalışması', 'Konu özeti', 'Soru çözümü', 'Değerlendirme', 'Grup çalışması'];
const ODEVLER = ['Çalışma kâğıdı', 'Ders kitabı alıştırmaları', 'Konu tekrarı', 'Araştırma ödevi', 'Test çözümü'];
const ETUT_KONULARI = ['Soru çözümü', 'Konu tekrarı', 'Eksik konular', 'Sınav hazırlık', 'Problemler'];

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM yoklama').get().n > 0) {
    console.log('Etkinlik verisi zaten var, atlandı.');
    return;
  }
  const atamalar = db.prepare(`SELECT a.id, a.class_id AS sinif, a.teacher_membership_id AS ogr, c.name AS ders, cl.name AS sinifAd FROM assignments a JOIN courses c ON c.id = a.course_id JOIN classes cl ON cl.id = a.class_id WHERE a.teacher_membership_id IS NOT NULL`).all();
  if (!atamalar.length) { console.log('Önce ornek-veri.js çalıştırılmalı.'); return; }
  const demoOgr = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = 'Demo Öğrenci' AND m.role = 'ogrenci'`).get()?.id;
  const sinifOgr = new Map();
  for (const r of db.prepare(`SELECT cs.class_id AS sinif, cs.student_membership_id AS id FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id WHERE m.status = 'aktif'`).all()) {
    if (!sinifOgr.has(r.sinif)) sinifOgr.set(r.sinif, []);
    sinifOgr.get(r.sinif).push(r.id);
  }
  const simdi = Date.now();
  // Her ders ataması için gerçek (MEB) kazanımlar sırayla işlenir; kazanım bulunamayan derste genel konu kullanılır
  const kazSirasi = new Map(atamalar.map(a => [a.id, { liste: dersKazanimlari(a.ders, parseInt(a.sinifAd, 10)), i: 0 }]));
  const sonrakiKonu = atamaId => {
    const k = kazSirasi.get(atamaId);
    if (!k.liste.length) return { konu: sec(KONULAR), kazanim: null };
    const x = k.liste[k.i++ % k.liste.length];
    const metin = x.metin.replace(/-\s+/g, '');
    return { konu: metin.length > 110 ? metin.slice(0, 107).replace(/\s+\S*$/, '') + '…' : metin, kazanim: ((x.kod ? x.kod + ' – ' : '') + metin).slice(0, 300) };
  };

  db.exec('BEGIN');
  try {
    // Son 3 haftanın geçmiş iş günleri için yoklama
    const programlar = db.prepare('SELECT class_id, day, period, assignment_id FROM schedule').all();
    const yEkle = db.prepare('INSERT INTO yoklama (class_id, date, period, assignment_id, teacher_membership_id, created_at, updated_at, topic, kazanim, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const konuEkle = db.prepare('INSERT INTO konular (assignment_id, date, title, note, created_at, yoklama_id) VALUES (?,?,?,?,?,?)');
    const kEkle = db.prepare('INSERT INTO yoklama_kayit (yoklama_id, student_membership_id, status) VALUES (?,?,?)');
    const ogrOf = new Map(atamalar.map(a => [a.id, a.ogr]));
    // Her öğrenci için hafif bir devamsızlık eğilimi: çoğu öğrenci neredeyse hiç, bazıları sık
    const egilim = new Map();
    for (const ids of sinifOgr.values()) for (const id of ids) egilim.set(id, Math.random() < 0.15 ? 0.15 : 0.02);
    if (demoOgr) egilim.set(demoOgr, 0.12);
    let yoklamaSayisi = 0;
    for (let n = 21; n >= 1; n--) {
      const t = kaydir(bugun, -n);
      const gun = gunNo(t);
      if (gun < 1 || gun > 5) continue;
      for (const p of programlar.filter(p => p.day === gun)) {
        const bitti = Math.random() < 0.92; // %8 ders tamamlanmamış (süresi geçen ders hatırlatması için örnek)
        const kv = bitti ? sonrakiKonu(p.assignment_id) : null;
        const yid = Number(yEkle.run(p.class_id, t, p.period, p.assignment_id, ogrOf.get(p.assignment_id), simdi, simdi, kv?.konu ?? null, kv?.kazanim ?? null, bitti ? simdi : null).lastInsertRowid);
        if (kv) konuEkle.run(p.assignment_id, t, kv.konu, kv.kazanim ? 'Kazanım: ' + kv.kazanim : null, simdi, yid);
        for (const id of sinifOgr.get(p.class_id) || []) {
          const x = Math.random();
          const e = egilim.get(id) || 0.02;
          const durum = x < e ? 'gelmedi' : x < e + 0.015 ? 'gec' : x < e + 0.03 ? 'izinli' : 'geldi';
          kEkle.run(yid, id, durum);
        }
        yoklamaSayisi++;
      }
    }

    // Konular ve ödevler
    const odevEkle = db.prepare('INSERT INTO odevler (assignment_id, title, note, due_date, created_at, kazanim) VALUES (?,?,?,?,?,?)');
    let odevSayisi = 0;
    for (const a of atamalar) {
      if (Math.random() < 0.7) {
        odevEkle.run(a.id, sec(ODEVLER), 'Ders kitabından belirtilen bölümler.', kaydir(bugun, Math.floor(Math.random() * 12) - 3), simdi, sonrakiKonu(a.id).kazanim);
        odevSayisi++;
      }
    }
    // Demo öğretmenin dersleri için garanti kayıt
    const demoOgrt = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = 'Demo Öğretmen' AND m.role = 'ogretmen'`).get()?.id;
    for (const a of atamalar.filter(a => a.ogr === demoOgrt)) {
      odevEkle.run(a.id, 'Alıştırma çalışması', 'Sayfa 40-41 alıştırmaları.', kaydir(bugun, 4), simdi, sonrakiKonu(a.id).kazanim);
      odevSayisi++;
    }

    // Etütler: geçmiş (yoklamalı) ve yaklaşan
    const etutEkle = db.prepare(`INSERT INTO etutler (teacher_membership_id, course_id, topic, date, start_time, duration_min, place, note, status, created_at)
                                 VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const katEkle = db.prepare(`INSERT INTO etut_katilimcilar (etut_id, student_membership_id, parent_response, responded_at, attendance)
                                VALUES (?,?,?,?,?)`);
    const ogretmenler = [...new Set(atamalar.map(a => a.ogr))];
    const secili = karistir([...ogretmenler]).slice(0, 12);
    if (demoOgrt && !secili.includes(demoOgrt)) secili.push(demoOgrt);
    let etutSayisi = 0;
    for (const ogr of secili) {
      const benimAtamalar = atamalar.filter(a => a.ogr === ogr);
      const dersId = db.prepare('SELECT course_id AS c FROM assignments WHERE id = ?').get(benimAtamalar[0].id).c;
      const planlar = [{ gun: -(2 + Math.floor(Math.random() * 10)), gecmis: true }, { gun: -(1 + Math.floor(Math.random() * 5)), gecmis: true },
        { gun: 1 + Math.floor(Math.random() * 6), gecmis: false }];
      for (const pl of planlar) {
        let t = kaydir(bugun, pl.gun);
        while (gunNo(t) === 0 || gunNo(t) === 6) t = kaydir(t, pl.gecmis ? -1 : 1);
        const saat = sec(['15:30', '16:20', '17:10']);
        const id = Number(etutEkle.run(ogr, dersId, sec(ETUT_KONULARI), t, saat, 40, sec(['Sınıfta', 'Kütüphane', 'Etüt odası']), null, 'planli', simdi).lastInsertRowid);
        const sinifId = sec(benimAtamalar).sinif;
        let kisiler = karistir([...(sinifOgr.get(sinifId) || [])]).slice(0, 4 + Math.floor(Math.random() * 5));
        if (ogr === demoOgrt && demoOgr && !kisiler.includes(demoOgr)) kisiler.push(demoOgr);
        for (const k of kisiler) {
          const yanit = pl.gecmis ? (Math.random() < 0.85 ? 'gelecek' : 'gelmeyecek') : sec(['gelecek', 'gelecek', 'bekliyor', 'gelmeyecek']);
          let devam = null;
          if (pl.gecmis) devam = yanit === 'gelecek' ? (Math.random() < 0.9 ? 'geldi' : 'gelmedi') : sec(['gelmedi', 'izinli']);
          katEkle.run(id, k, yanit, yanit === 'bekliyor' ? null : simdi, devam);
        }
        etutSayisi++;
      }
    }
    db.exec('COMMIT');
    console.log(`Eklendi: ${yoklamaSayisi} ders yoklaması, ${db.prepare('SELECT COUNT(*) AS n FROM konular').get().n} konu, ${odevSayisi} ödev, ${etutSayisi} etüt.`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

calistir();

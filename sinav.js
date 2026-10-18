import { db } from './db.js';

const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const SIKLAR = 'ABCDE';

function islem(fn) {
  db.exec('BEGIN');
  try { const s = fn(); db.exec('COMMIT'); return s; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const anahtarTemiz = (a, n) => {
  const t = String(a || '').toLocaleUpperCase('en').replace(/[\s,;]/g, '');
  return t.length === n && [...t].every(c => SIKLAR.includes(c)) ? t : null;
};
// Öğrenci cevabı: A-E işaretli, diğer her karakter (boşluk, '-', '.', '*') boş; kısa kalırsa boşla tamamlanır
const cevapTemiz = (c, n) => {
  const t = String(c || '').toLocaleUpperCase('en').replace(/\s/g, ' ');
  return Array.from({ length: n }, (_, i) => (SIKLAR.includes(t[i]) ? t[i] : '-')).join('');
};

// Tek öğrencinin bir dersteki sonucu. İptal edilen soru herkese doğru sayılır.
function hesapla(anahtar, iptal, cevap, kat) {
  let dogru = 0, yanlis = 0, bos = 0;
  for (let i = 0; i < anahtar.length; i++) {
    if (iptal.includes(i + 1) || cevap[i] === anahtar[i]) dogru++;
    else if (cevap[i] === '-') bos++;
    else yanlis++;
  }
  const net = dogru - (kat > 0 ? yanlis / kat : 0);
  const puan = anahtar.length ? Math.max(0, net) / anahtar.length * 100 : 0;
  return { dogru, yanlis, bos, net: Math.round(net * 100) / 100, puan: Math.round(puan * 10) / 10 };
}

const zorluk = y => (y >= 80 ? 'Çok kolay' : y >= 60 ? 'Kolay' : y >= 40 ? 'Orta' : y >= 20 ? 'Zor' : 'Çok zor');

const sinifOgrencileri = idler => idler.length ? db.prepare(`
  SELECT m.id AS ogrenciId, u.full_name AS ad, c.name AS sinif
  FROM class_students cs JOIN classes c ON c.id = cs.class_id
  JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
  WHERE cs.class_id IN (${idler.map(() => '?').join(',')}) AND m.status = 'aktif'
  ORDER BY c.name, u.full_name`).all(...idler) : [];

// Sınav modülü: öğretmen optik/test sınavı tanımlar, cevap anahtarını girer, öğrenci cevaplarını işler.
export async function sinavApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/sinav/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const sinavim = id => db.prepare('SELECT * FROM sinavlar WHERE id = ? AND teacher_membership_id = ?').get(id, o.membership_id);
  const dersleri = id => db.prepare('SELECT id, ders, soru_sayisi AS soruSayisi, anahtar, iptal FROM sinav_dersler WHERE sinav_id = ? ORDER BY id')
    .all(id).map(d => ({ ...d, iptal: JSON.parse(d.iptal) }));
  const sinavSiniflari = id => db.prepare('SELECT c.id, c.name FROM sinav_siniflar ss JOIN classes c ON c.id = ss.class_id WHERE ss.sinav_id = ? ORDER BY c.name').all(id);

  // Sonuç + madde analizi (öğretmen ekranı ve yayınlanmış sınavlarda öğrenci görünümü bunu kullanır)
  const sonucHesapla = s => {
  const dersler = dersleri(s.id);
  const ogrenciler = sinifOgrencileri(sinavSiniflari(s.id).map(c => c.id));
  const cevaplar = db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar
    FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id);
  const harita = new Map(cevaplar.map(c => [c.dersId + ':' + c.ogrenciId, c.cevaplar]));

  const satirlar = ogrenciler.map(g => {
    const dersSonuc = {};
    let topPuan = 0, say = 0;
    for (const d of dersler) {
      const c = harita.get(d.id + ':' + g.ogrenciId);
      if (!c) continue;
      const r = hesapla(d.anahtar, d.iptal, c, s.yanlis_kat);
      dersSonuc[d.id] = r;
      topPuan += r.puan; say++;
    }
    return { ogrenciId: g.ogrenciId, ad: g.ad, sinif: g.sinif, dersler: dersSonuc, ortalama: say ? Math.round(topPuan / say * 10) / 10 : null };
  });
  const girenler = satirlar.filter(r => r.ortalama !== null).sort((a, b) => b.ortalama - a.ortalama);
  girenler.forEach((r, i) => { r.sira = i + 1; });

  const analiz = dersler.map(d => {
    const girenCevaplar = ogrenciler.map(g => ({ id: g.ogrenciId, c: harita.get(d.id + ':' + g.ogrenciId) })).filter(x => x.c);
    const n = girenCevaplar.length;
    const net = new Map(girenCevaplar.map(x => [x.id, hesapla(d.anahtar, d.iptal, x.c, s.yanlis_kat).net]));
    const sirali = [...girenCevaplar].sort((a, b) => net.get(b.id) - net.get(a.id));
    const grup = Math.round(n * 0.27);
    const ust = sirali.slice(0, grup), alt = sirali.slice(n - grup);
    const sorular = [];
    for (let i = 0; i < d.soruSayisi; i++) {
      const dagilim = { A: 0, B: 0, C: 0, D: 0, E: 0, bos: 0 };
      let dogru = 0, yanlis = 0, bos = 0;
      for (const x of girenCevaplar) {
        const ch = x.c[i];
        if (ch === '-') { bos++; dagilim.bos++; } else { dagilim[ch]++; if (ch === d.anahtar[i]) dogru++; else yanlis++; }
      }
      const iptalMi = d.iptal.includes(i + 1);
      const basari = n ? Math.round((iptalMi ? n : dogru) / n * 1000) / 10 : null;
      const ustD = ust.filter(x => x.c[i] === d.anahtar[i]).length, altD = alt.filter(x => x.c[i] === d.anahtar[i]).length;
      sorular.push({
        no: i + 1, dogruSik: d.anahtar[i], iptal: iptalMi, dogru, yanlis, bos, dagilim, basari,
        zorluk: basari === null ? null : zorluk(basari),
        ayirt: grup >= 1 ? Math.round((ustD - altD) / grup * 100) / 100 : null,
      });
    }
    return { dersId: d.id, ders: d.ders, giren: n, sorular };
  });

    return {
      sinav: { id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin },
      dersler: dersler.map(d => ({ id: d.id, ders: d.ders, soruSayisi: d.soruSayisi })),
      ogrenciler: satirlar, giren: girenler.length, beklenen: ogrenciler.length, analiz,
    };
  };


  // Öğrenci/veli: yalnızca öğretmenin yayınladığı sınavlar
  if (req.method === 'GET' && yol === '/api/sinav/notlarim') {
    let cocuklar;
    if (o.role === 'ogrenci') cocuklar = db.prepare('SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').all(o.membership_id);
    else if (o.role === 'veli') cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad FROM guardians g JOIN memberships m ON m.id = g.student_membership_id
      JOIN users u ON u.id = m.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    else return hata(403, 'Bu işlem için yetkiniz yok');
    const sinavlar = db.prepare(`SELECT s.* FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id
      JOIN class_students cs ON cs.class_id = ss.class_id WHERE cs.student_membership_id = ? AND s.yayin = 1 ORDER BY s.date DESC, s.id DESC`);
    json(res, 200, {
      ogrenciler: cocuklar.map(c => ({
        ad: c.ad,
        sinavlar: sinavlar.all(c.id).map(s => {
          const r = sonucHesapla(s);
          const g = r.ogrenciler.find(x => x.ogrenciId === c.id);
          if (!g || g.ortalama === null) return null;
          return {
            ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, ortalama: g.ortalama, sira: g.sira, giren: r.giren,
            dersler: r.dersler.filter(d => g.dersler[d.id]).map(d => ({ ders: d.ders, soruSayisi: d.soruSayisi, ...g.dersler[d.id] })),
          };
        }).filter(Boolean),
      })),
    });
    return true;
  }

  if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');

  // Öğretmenin ders verdiği sınıflar ve dersleri
  if (req.method === 'GET' && yol === '/api/sinav/secenekler') {
    const siniflar = db.prepare(`
      SELECT DISTINCT c.id, c.name FROM assignments a JOIN classes c ON c.id = a.class_id
      WHERE a.teacher_membership_id = ? ORDER BY c.name`).all(o.membership_id);
    const dersler = db.prepare(`
      SELECT DISTINCT co.name FROM assignments a JOIN courses co ON co.id = a.course_id
      WHERE a.teacher_membership_id = ? ORDER BY co.name`).all(o.membership_id).map(r => r.name);
    json(res, 200, { siniflar, dersler });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/sinav/liste') {
    const satirlar = db.prepare('SELECT id, name, date, yanlis_kat, yayin FROM sinavlar WHERE teacher_membership_id = ? ORDER BY date DESC, id DESC').all(o.membership_id);
    json(res, 200, {
      sinavlar: satirlar.map(s => ({
        id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin,
        siniflar: sinavSiniflari(s.id).map(c => c.name),
        dersler: dersleri(s.id).map(d => d.ders),
        okunan: db.prepare(`SELECT COUNT(DISTINCT c.student_membership_id) AS n FROM sinav_cevaplar c
          JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).get(s.id).n,
      })),
    });
    return true;
  }

  const dersleriOku = (b) => {
    if (!Array.isArray(b.dersler) || !b.dersler.length || b.dersler.length > 12) return { hata: 'En az bir ders ekleyin' };
    const sonuc = [];
    for (const d of b.dersler) {
      const ders = String(d.ders || '').trim();
      const n = tamSayi(d.soruSayisi, 1, 200);
      if (!ders || ders.length > 60 || !n) return { hata: 'Ders adı ve soru sayısı (1-200) gerekli' };
      const anahtar = anahtarTemiz(d.anahtar, n);
      if (!anahtar) return { hata: `${ders}: cevap anahtarı ${n} harften (A-E) oluşmalı` };
      const iptal = [...new Set((Array.isArray(d.iptal) ? d.iptal : []).map(Number))].filter(x => Number.isInteger(x) && x >= 1 && x <= n).sort((a, c) => a - c);
      sonuc.push({ id: d.id, ders, n, anahtar, iptal });
    }
    return { dersler: sonuc };
  };
  const katOku = v => (v === undefined || v === null || v === '' ? 0 : tamSayi(v, 0, 10));

  if (req.method === 'POST' && yol === '/api/sinav/olustur') {
    const b = await govde(req);
    const ad = String(b.ad || '').trim();
    const tarih = String(b.tarih || bugun());
    const kat = katOku(b.yanlisKat);
    if (ad.length < 2 || ad.length > 80) return hata(400, 'Sınav adı 2-80 karakter olmalı');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    if (kat === null || kat === 1) return hata(400, 'Yanlış katsayısı 0 (yok) veya 2-10 olmalı');
    const siniflar = [...new Set((Array.isArray(b.sinifIds) ? b.sinifIds : []).map(Number))];
    if (!siniflar.length) return hata(400, 'En az bir sınıf seçin');
    const yetkili = db.prepare('SELECT 1 FROM assignments WHERE class_id = ? AND teacher_membership_id = ?');
    if (!siniflar.every(id => yetkili.get(id, o.membership_id))) return hata(403, 'Seçilen sınıflardan birinde dersiniz yok');
    const d = dersleriOku(b);
    if (d.hata) return hata(400, d.hata);
    const id = islem(() => {
      const sid = Number(db.prepare('INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at) VALUES (?,?,?,?,?)')
        .run(ad, tarih, o.membership_id, kat, Date.now()).lastInsertRowid);
      for (const c of siniflar) db.prepare('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)').run(sid, c);
      for (const x of d.dersler) db.prepare('INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal) VALUES (?,?,?,?,?)')
        .run(sid, x.ders, x.n, x.anahtar, JSON.stringify(x.iptal));
      return sid;
    });
    denetle(o.user_id, 'sinav-olustur', { id, ad });
    json(res, 200, { id });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/sinav/detay') {
    const s = sinavim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    const siniflar = sinavSiniflari(s.id);
    const ogrenciler = sinifOgrencileri(siniflar.map(c => c.id));
    const cevaplar = db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar
      FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id);
    const harita = {};
    for (const c of cevaplar) (harita[c.ogrenciId] ||= {})[c.dersId] = c.cevaplar;
    json(res, 200, {
      sinav: { id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin },
      siniflar, dersler: dersleri(s.id),
      ogrenciler: ogrenciler.map(g => ({ ...g, cevaplar: harita[g.ogrenciId] || {} })),
    });
    return true;
  }

  // Cevap anahtarı düzeltme, soru iptali, yanlış katsayısı: sonuçlar cevaplardan hesaplandığı için anında yeniden hesaplanır
  if (req.method === 'POST' && yol === '/api/sinav/anahtar') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    const kat = katOku(b.yanlisKat);
    if (kat === null || kat === 1) return hata(400, 'Yanlış katsayısı 0 (yok) veya 2-10 olmalı');
    const mevcut = new Map(dersleri(s.id).map(d => [d.id, d]));
    const girilen = Array.isArray(b.dersler) ? b.dersler : [];
    for (const g of girilen) if (!mevcut.has(Number(g.id))) return hata(400, 'Geçersiz ders');
    const yeni = girilen.map(g => {
      const m = mevcut.get(Number(g.id));
      const anahtar = anahtarTemiz(g.anahtar, m.soruSayisi);
      if (!anahtar) return null;
      const iptal = [...new Set((Array.isArray(g.iptal) ? g.iptal : []).map(Number))].filter(x => Number.isInteger(x) && x >= 1 && x <= m.soruSayisi).sort((a, c) => a - c);
      return { id: m.id, anahtar, iptal };
    });
    if (yeni.some(x => !x)) return hata(400, 'Cevap anahtarı soru sayısı kadar harften (A-E) oluşmalı');
    islem(() => {
      db.prepare('UPDATE sinavlar SET yanlis_kat = ? WHERE id = ?').run(kat, s.id);
      for (const x of yeni) db.prepare('UPDATE sinav_dersler SET anahtar = ?, iptal = ? WHERE id = ?').run(x.anahtar, JSON.stringify(x.iptal), x.id);
    });
    denetle(o.user_id, 'sinav-anahtar', { id: s.id });
    json(res, 200, { tamam: true });
    return true;
  }

  // Öğrenci cevapları: { id, kayitlar: [{ ogrenciId, dersId, cevaplar }] }
  if (req.method === 'POST' && yol === '/api/sinav/cevaplar') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    if (!Array.isArray(b.kayitlar) || b.kayitlar.length > 2000) return hata(400, 'Geçersiz istek');
    const dersler = new Map(dersleri(s.id).map(d => [d.id, d]));
    const ogr = new Set(sinifOgrencileri(sinavSiniflari(s.id).map(c => c.id)).map(g => g.ogrenciId));
    islem(() => {
      for (const k of b.kayitlar) {
        const d = dersler.get(Number(k.dersId));
        const og = Number(k.ogrenciId);
        if (!d || !ogr.has(og)) throw new Error('Geçersiz kayıt');
        const c = String(k.cevaplar || '').trim();
        if (!c) db.prepare('DELETE FROM sinav_cevaplar WHERE sinav_ders_id = ? AND student_membership_id = ?').run(d.id, og);
        else db.prepare(`INSERT INTO sinav_cevaplar (sinav_ders_id, student_membership_id, cevaplar) VALUES (?,?,?)
          ON CONFLICT (sinav_ders_id, student_membership_id) DO UPDATE SET cevaplar = excluded.cevaplar`)
          .run(d.id, og, cevapTemiz(c, d.soruSayisi));
      }
    });
    json(res, 200, { tamam: true });
    return true;
  }

  // Sonuçlar ve madde analizi
  if (req.method === 'GET' && yol === '/api/sinav/sonuc') {
    const s = sinavim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    json(res, 200, sonucHesapla(s));
    return true;
  }

  // Yayınla / yayından kaldır: yayınlanınca öğrenci ve veli sonucu görür
  if (req.method === 'POST' && yol === '/api/sinav/yayin') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    db.prepare('UPDATE sinavlar SET yayin = ? WHERE id = ?').run(b.yayin ? 1 : 0, s.id);
    denetle(o.user_id, b.yayin ? 'sinav-yayin' : 'sinav-yayin-kaldir', { id: s.id });
    json(res, 200, { yayin: !!b.yayin });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/sinav/sil') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    islem(() => {
      db.prepare('DELETE FROM sinav_cevaplar WHERE sinav_ders_id IN (SELECT id FROM sinav_dersler WHERE sinav_id = ?)').run(s.id);
      db.prepare('DELETE FROM sinav_dersler WHERE sinav_id = ?').run(s.id);
      db.prepare('DELETE FROM sinav_siniflar WHERE sinav_id = ?').run(s.id);
      db.prepare('DELETE FROM sinavlar WHERE id = ?').run(s.id);
    });
    denetle(o.user_id, 'sinav-sil', { id: s.id, ad: s.name });
    json(res, 200, { tamam: true });
    return true;
  }

  return hata(404, 'Bulunamadı');
}

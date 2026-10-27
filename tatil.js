import { db } from './db.js';
import { gunAcik } from './okul-ayar.js';

// Okul tatilleri (resmi tatil, bayram, ara tatil, özel gün): tarih aralığı için ders yapılmaz.
// Liste bellekte tutulur; yönetim ekleyip sildiğinde yenilenir. Diğer modüller tarihAcik / tatilAdi'ni kullanır.
db.exec(`
CREATE TABLE IF NOT EXISTS tatiller (
  id         INTEGER PRIMARY KEY,
  baslangic  TEXT NOT NULL,
  bitis      TEXT NOT NULL,
  ad         TEXT NOT NULL,
  tur        TEXT NOT NULL CHECK (tur IN ('resmi','dini','ara','ozel')),
  created_at INTEGER NOT NULL
);`);

export const TURLER = { resmi: 'Resmi tatil', dini: 'Dini bayram', ara: 'Ara tatil', ozel: 'Özel gün' };

let onbellek = [];
const yenile = () => { onbellek = db.prepare('SELECT id, baslangic, bitis, ad, tur FROM tatiller ORDER BY baslangic, id').all(); };
yenile();

export const tatilAdi = t => onbellek.find(x => x.baslangic <= t && t <= x.bitis)?.ad || null;
// Ders günü olup olmadığı: haftanın günü açık ve tarih bir tatile denk gelmiyor
export const tarihAcik = t => gunAcik(new Date(t + 'T00:00:00Z').getUTCDay()) && !tatilAdi(t);

const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const metinDuz = (v, en) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, en);

export async function tatilApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/tatil/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (o.role !== 'yonetim') return hata(403, 'Bu işlem için yetkiniz yok');

  if (req.method === 'GET' && yol === '/api/tatil/liste') {
    json(res, 200, { tatiller: onbellek, turler: TURLER });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/tatil/ekle') {
    const b = await govde(req);
    const ad = metinDuz(b.ad, 80), tur = String(b.tur || 'ozel');
    const baslangic = String(b.baslangic || ''), bitis = String(b.bitis || baslangic);
    if (!ad) return hata(400, 'Tatilin adını yazın');
    if (!TURLER[tur]) return hata(400, 'Tatil türü geçersiz');
    if (!tarihGecerli(baslangic) || !tarihGecerli(bitis)) return hata(400, 'Tarih geçersiz');
    if (bitis < baslangic) return hata(400, 'Bitiş tarihi başlangıçtan önce olamaz');
    if ((Date.parse(bitis) - Date.parse(baslangic)) / 864e5 > 120) return hata(400, 'Bir tatil en fazla 120 gün olabilir');
    if (onbellek.some(x => x.baslangic === baslangic && x.bitis === bitis && x.ad === ad)) return hata(400, 'Bu tatil zaten ekli');
    const r = db.prepare('INSERT INTO tatiller (baslangic, bitis, ad, tur, created_at) VALUES (?,?,?,?,?)').run(baslangic, bitis, ad, tur, Date.now());
    yenile();
    denetle(o.user_id, 'tatil-ekle', `${ad} ${baslangic}..${bitis}`);
    json(res, 200, { tamam: true, id: Number(r.lastInsertRowid) });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/tatil/sil') {
    const b = await govde(req);
    const t = db.prepare('SELECT id, ad FROM tatiller WHERE id = ?').get(Number(b.id));
    if (!t) return hata(404, 'Tatil bulunamadı');
    db.prepare('DELETE FROM tatiller WHERE id = ?').run(t.id);
    yenile();
    denetle(o.user_id, 'tatil-sil', t.ad);
    json(res, 200, { tamam: true });
    return true;
  }

  return hata(404, 'Bulunamadı');
}

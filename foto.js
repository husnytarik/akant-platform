import { db } from './db.js';

// Profil fotoğrafları: yönetim herkes için yükler; öğretmen/yönetim kendi fotoğrafını değiştirir.
// Görüntüleme: yönetim ve öğretmenler hepsini, öğrenci ve veli yalnızca kendisini (ve velisi çocuğunu) görür.
const SINIR = 1024 * 1024;

function resimTuru(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function hamGovde(req, sinir) {
  return new Promise((resolve, reject) => {
    const parcalar = [];
    let n = 0;
    req.on('data', c => { n += c.length; if (n <= sinir) parcalar.push(c); });
    req.on('end', () => resolve(n > sinir ? null : Buffer.concat(parcalar)));
    req.on('error', reject);
  });
}

export async function fotoApi({ req, res, url, o, json, denetle }) {
  const hata = (kod, m) => (json(res, kod, { hata: m }), true);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return hata(400, 'Geçersiz istek');
  const yonetim = o.role === 'yonetim';
  const duzenleyebilir = yonetim || (id === o.user_id && o.role === 'ogretmen');

  if (req.method === 'GET' && url.pathname === '/api/foto') {
    const gorebilir = yonetim || o.role === 'ogretmen' || id === o.user_id
      || (o.role === 'veli' && !!db.prepare(`SELECT 1 FROM guardians g JOIN memberships sm ON sm.id = g.student_membership_id
        WHERE g.parent_membership_id = ? AND sm.user_id = ?`).get(o.membership_id, id));
    const f = gorebilir && db.prepare('SELECT mime, veri FROM kullanici_foto WHERE user_id = ?').get(id);
    if (!f) return hata(404, 'Fotoğraf yok');
    res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': f.veri.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.end(f.veri);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/foto') {
    if (!duzenleyebilir) return hata(403, 'Bu işlem için yetkiniz yok');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return hata(404, 'Kullanıcı bulunamadı');
    const buf = await hamGovde(req, SINIR);
    if (!buf) return hata(413, 'Fotoğraf çok büyük');
    const mime = resimTuru(buf);
    if (!mime) return hata(400, 'Yalnızca JPEG, PNG veya WebP fotoğraf yüklenebilir');
    db.prepare(`INSERT INTO kullanici_foto (user_id, mime, veri, guncelleme) VALUES (?,?,?,?)
      ON CONFLICT (user_id) DO UPDATE SET mime = excluded.mime, veri = excluded.veri, guncelleme = excluded.guncelleme`).run(id, mime, buf, Date.now());
    db.prepare('UPDATE users SET foto = NULL WHERE id = ?').run(id);
    denetle(o.user_id, 'foto.yukle', { kullaniciId: id });
    json(res, 200, { tamam: true });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/foto-sil') {
    if (!duzenleyebilir) return hata(403, 'Bu işlem için yetkiniz yok');
    db.prepare('DELETE FROM kullanici_foto WHERE user_id = ?').run(id);
    db.prepare('UPDATE users SET foto = NULL WHERE id = ?').run(id);
    denetle(o.user_id, 'foto.sil', { kullaniciId: id });
    json(res, 200, { tamam: true });
    return true;
  }
  return false;
}

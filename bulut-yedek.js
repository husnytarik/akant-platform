import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// Yedekleri S3 uyumlu bir depoya (Cloudflare R2, AWS S3, Backblaze B2, MinIO...) yükler; ek paket gerekmez.
// Ayar (hepsi ortam değişkeni): YEDEK_S3_ENDPOINT, YEDEK_S3_BUCKET, YEDEK_S3_KEY, YEDEK_S3_SECRET, [YEDEK_S3_REGION=auto], [YEDEK_S3_ONEK=neademy]
// Eski yedeklerin silinmesi için depoda "yaşam döngüsü kuralı" (örn. 90 gün sonra sil) tanımlanır.
const e = process.env;
export const bulutAyarli = () => !!(e.YEDEK_S3_ENDPOINT && e.YEDEK_S3_BUCKET && e.YEDEK_S3_KEY && e.YEDEK_S3_SECRET);

const hmac = (k, v) => crypto.createHmac('sha256', k).update(v).digest();
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
// RFC 3986'ya göre kodlama (S3 imzası için)
const kodla = v => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// tur: 'tam' | 'kritik'. Dosya sıkıştırılıp yüklenir.
export async function bulutaYukle(dosya, tur) {
  const govde = gzipSync(fs.readFileSync(dosya));
  const bolge = e.YEDEK_S3_REGION || 'auto';
  const anahtar = `${e.YEDEK_S3_ONEK || 'neademy'}/${tur}/${path.basename(dosya)}.gz`;
  const uc = new URL(e.YEDEK_S3_ENDPOINT);
  const yol = '/' + [e.YEDEK_S3_BUCKET, ...anahtar.split('/')].map(kodla).join('/');
  const t = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), gun = t.slice(0, 8);
  const icerikHash = sha(govde);
  const basliklar = { host: uc.host, 'x-amz-content-sha256': icerikHash, 'x-amz-date': t };
  const adlar = Object.keys(basliklar).sort();
  const kanonik = ['PUT', yol, '', ...adlar.map(a => `${a}:${basliklar[a]}`), '', adlar.join(';'), icerikHash].join('\n');
  const kapsam = `${gun}/${bolge}/s3/aws4_request`;
  const imzalanacak = ['AWS4-HMAC-SHA256', t, kapsam, sha(kanonik)].join('\n');
  const imzaAnahtari = hmac(hmac(hmac(hmac('AWS4' + e.YEDEK_S3_SECRET, gun), bolge), 's3'), 'aws4_request');
  const imza = crypto.createHmac('sha256', imzaAnahtari).update(imzalanacak).digest('hex');
  const yanit = await fetch(uc.origin + yol, {
    method: 'PUT',
    headers: {
      'x-amz-content-sha256': icerikHash, 'x-amz-date': t, 'content-type': 'application/gzip',
      Authorization: `AWS4-HMAC-SHA256 Credential=${e.YEDEK_S3_KEY}/${kapsam}, SignedHeaders=${adlar.join(';')}, Signature=${imza}`,
    },
    body: govde,
    signal: AbortSignal.timeout(120000),
  });
  if (!yanit.ok) throw new Error(`Bulut yedek reddedildi (${yanit.status}): ${(await yanit.text()).slice(0, 200)}`);
  return { anahtar, boyut: govde.length };
}

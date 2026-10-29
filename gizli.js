import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ortam } from './ortam.js';

// Kişisel kimlik/iletişim alanları (TC/pasaport no, telefon) veritabanında şifreli durur.
// Şifreleme deterministiktir (aynı değer aynı şifreli metni verir): böylece "WHERE tc_no = gz(?)" araması ve UNIQUE kuralı çalışmaya devam eder.
// Biçim: v1:<base64url(iv 12 + etiket 16 + şifreli metin)>. Anahtar veritabanı yedeğiyle birlikte durmamalıdır.
const ONEK = 'v1:';

function anahtariYukle() {
  const ham = process.env.GIZLI_ANAHTAR;
  if (ham) {
    const b = /^[0-9a-f]{64}$/i.test(ham) ? Buffer.from(ham, 'hex') : Buffer.from(ham, 'base64');
    if (b.length !== 32) throw new Error('GIZLI_ANAHTAR 32 bayt olmalı (64 haneli hex ya da base64). Üretmek için: node gizli.js --uret');
    return b;
  }
  if (ortam.uretim) throw new Error('Üretim modunda GIZLI_ANAHTAR tanımlı olmalı. Üretmek için: node gizli.js --uret');
  // Geliştirme: anahtar veri klasöründe otomatik üretilir
  const dosya = path.join(ortam.veriKlasoru, 'gizli.anahtar');
  fs.mkdirSync(ortam.veriKlasoru, { recursive: true });
  if (!fs.existsSync(dosya)) fs.writeFileSync(dosya, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(dosya, 'utf8').trim(), 'hex');
}

const ana = anahtariYukle();
const sifreAnahtari = Buffer.from(crypto.hkdfSync('sha256', ana, '', 'neademy-sifre', 32));
const ivAnahtari = Buffer.from(crypto.hkdfSync('sha256', ana, '', 'neademy-iv', 32));

export const sifreliMi = v => typeof v === 'string' && v.startsWith(ONEK);

export function sifrele(v) {
  if (v == null || v === '' || sifreliMi(v)) return v;
  const duz = Buffer.from(String(v), 'utf8');
  const iv = crypto.createHmac('sha256', ivAnahtari).update(duz).digest().subarray(0, 12);
  const c = crypto.createCipheriv('aes-256-gcm', sifreAnahtari, iv);
  const ct = Buffer.concat([c.update(duz), c.final()]);
  return ONEK + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

export function coz(v) {
  if (!sifreliMi(v)) return v;
  const b = Buffer.from(v.slice(ONEK.length), 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', sifreAnahtari, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

// Sorgu sonucundaki şifreli alanları çözer (satır ya da satır listesi)
export function satirCoz(r) {
  if (!r) return r;
  for (const k in r) { const v = r[k]; if (typeof v === 'string' && v.charCodeAt(0) === 118 && v.startsWith(ONEK)) r[k] = coz(v); }
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--uret') console.log(crypto.randomBytes(32).toString('hex'));
}

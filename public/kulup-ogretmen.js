// Öğretmen: danışmanı olduğum kulüpler, üyeler ve dersler. Bir derse dokununca "Derslerim"deki Dersi bitir ekranı burada açılır
// (bitmiş ders salt okunur, Düzenle ile değişir); kulüp dersi ayrıca haftalık programda ve Derslerim'de de görünür.
const kok = $('icerik');
let veri = null;

async function yukle() {
  const r = await api('/api/kulup/kuluplerim');
  if (!r.ok) return mesaj(r.veri.hata || 'Kulüpler alınamadı', 'hata');
  veri = r.veri;
  ciz();
}
yukle();

const gunYaz = t => new Date(t + 'T00:00:00Z').toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long' });

// Ders ekranı: Dersi bitir ile aynı form; kaydedince aynı ders (bitmişse salt okunur) yeniden açılır
function dersAc(k, tarih) {
  ekranAc(kok);
  const c = el('article', undefined, 'kl-kart');
  const baslik = el('div', undefined, 'kl-baslik');
  const b = el('div');
  b.append(el('h3', k.ad), el('p', `${gunYaz(tarih)} · ${k.dersSaati}. ders ${k.aralik}`, 'kl-zaman'));
  baslik.append(b);
  const icerik = el('div');
  c.append(geriDugme('Kulüplerim', yukle), baslik, icerik);
  kok.append(c);
  const ciz = () => kulupBitirCiz(icerik, ciz, k.id, tarih);
  ciz();
}
const acDugme = (a, k, tarih) => a.addEventListener('click', e => { e.preventDefault(); dersAc(k, tarih); });

function ciz() {
  ekranAc(kok);
  if (!veri.kulupler.length) return kok.append(el('p', 'Danışmanı olduğunuz bir kulüp yok.', 'bos-not'));
  for (const k of veri.kulupler) kok.append(kart(k));
}

function kart(k) {
  const c = el('article', undefined, 'kl-kart');
  const baslik = el('div', undefined, 'kl-baslik');
  const b = el('div');
  b.append(el('h3', k.ad), el('p', k.tema || ' ', 'kl-not'));
  baslik.append(b);
  c.append(baslik, el('p', `${k.gunAd} · ${k.dersSaati}. ders ${k.aralik}`, 'kl-zaman'));
  const ortak = k.ogretmenler.filter(o => o.ad).map(o => o.ad);
  if (ortak.length > 1) c.append(el('p', 'Danışmanlar: ' + ortak.join(', '), 'kl-kisi'));

  // Sonraki haftalar: her ders günü için etkinlik (konu) önceden yazılır; dokununca ders ekranı açılır
  c.append(el('div', undefined, 'kl-ayrac'), el('h4', 'Sonraki haftalar'),
    el('p', 'Her haftanın etkinliğini önceden yazın; öğrenciler kulüp sayfasında görür. Yoklama ders saatinde alınır.', 'kl-not'));
  const plan = el('div', undefined, 'kl-plan');
  for (const p of k.planlar) {
    const s = el('a', undefined, 'kl-calisma kl-plan-satir' + (p.iptal ? ' iptal' : ''));
    s.href = '#'; acDugme(s, k, p.tarih);
    const sol = el('div');
    sol.append(el('small', tarihYaz(p.tarih) + (p.tarih === veri.bugun ? ' · bugün' : '')),
      el('b', p.iptal ? 'Ders iptal edildi' : p.baslik || 'Etkinlik yazılmadı', p.baslik || p.iptal ? '' : 'kl-bos'));
    if (p.aciklama && !p.iptal) sol.append(el('p', p.aciklama, 'kl-aciklama'));
    s.append(sol, el('span', p.iptal ? 'İptal' : p.baslik ? TUR[p.tur] : 'Yaz', 'kl-chip ' + (p.baslik && !p.iptal ? 'tamam' : p.iptal ? 'dolu' : 'vurgu')), el('span', '›', 'kl-git'));
    plan.append(s);
  }
  c.append(plan);

  const uyeler = el('details', undefined, 'kl-detay');
  uyeler.append(el('summary', `Üyeler (${k.uyeler.length})`));
  if (!k.uyeler.length) uyeler.append(el('p', 'Henüz kulübe yerleştirilen öğrenci yok.', 'kl-not'));
  for (const u of k.uyeler) {
    const s = el('div', undefined, 'kl-uye');
    s.append(el('span', u.ad), el('small', u.sinif || ''));
    uyeler.append(s);
  }
  c.append(uyeler, el('div', undefined, 'kl-ayrac'), el('h4', 'İşlenen dersler'));

  if (!k.calismalar.length) c.append(el('p', 'Henüz işlenmiş ders yok.', 'kl-not'));
  for (const w of k.calismalar) {
    const s = el('a', undefined, 'kl-calisma');
    s.href = '#'; acDugme(s, k, w.tarih);
    const sol = el('div');
    sol.append(el('b', w.baslik), el('small', `${tarihYaz(w.tarih)} · ${TUR[w.tur]}`));
    s.append(sol, el('span', `${w.geldi}/${w.geldi + w.gelmedi + w.izinli}`, 'kl-sayi'), el('span', '›', 'kl-git'));
    c.append(s);
  }
  return c;
}

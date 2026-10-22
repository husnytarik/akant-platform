// Seçili dersin "Dersi bitir" sekmesi: yoklama, işlenen kazanımlar (ünite -> kazanım seçimi), ödev, iptal.
// derslerim.js içinden çağrılır (el, api, mesaj, kazanimSecici, ders, tarih, bugun oradan gelir).
const BITIR_SECENEK = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['gec', 'Geç'], ['izinli', 'İzinli']];

// Bitmiş ders önce salt okunur açılır; değişiklik için "Düzenle"ye basılır (yanlışlıkla dokunma kaydı bozmasın).
// cubuk: [iptal, kaydet] çubuğu; bitmediyse doğrudan form olarak açılır.
function saltOkunurKur(k, bolumler, cubuk, iptal, rozet, bitmis, yenile) {
  const kap = el('fieldset', undefined, 'salt-kap');
  kap.append(...bolumler);
  if (!bitmis) return k.append(kap, cubuk);
  kap.disabled = true;
  rozet.textContent = 'Tamamlandı';
  const duzenle = el('button', 'Düzenle', 'birincil'); duzenle.type = 'button';
  const salt = el('div', undefined, 'kaydet-cubuk');
  salt.append(duzenle);
  const vazgec = el('button', 'Vazgeç', 'ikincil'); vazgec.type = 'button';
  vazgec.addEventListener('click', yenile);
  duzenle.addEventListener('click', () => {
    mesaj('');
    kap.disabled = false;
    rozet.textContent = 'Düzenleniyor';
    const diger = el('div', undefined, 'adim');
    const dUst = el('div', undefined, 'adim-ust'); dUst.append(el('h3', 'Diğer işlemler'));
    diger.append(dUst, iptal);
    kap.after(diger);
    cubuk.prepend(vazgec);
    salt.replaceWith(cubuk);
  });
  k.append(kap, salt);
}

async function bitirCiz(k, bitince) {
  const q = new URLSearchParams({ tarih, sinifId: ders.sinifId, dersSaati: ders.dersSaati });
  const r = await api('/api/yoklama/ogrenciler?' + q);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const ogrenciler = r.veri.ogrenciler;
  const durum = new Map(ogrenciler.map(o => [o.ogrenciId, o.durum]));
  k.replaceChildren();

  const durumEtiket = el('span', r.veri.iptal ? 'İptal edilmiş' : r.veri.tamam ? 'Düzenleniyor' : 'Yeni kayıt', 'rozet ' + (r.veri.iptal ? 'iptal' : r.veri.tamam ? 'tamam' : 'bekliyor'));

  // Yoklama: oransal çubuk + sayılar; toplu işaretleme tek bir yumuşak düğme
  const RENK = { geldi: '#2e9e5b', gelmedi: '#d64545', gec: '#e0a100', izinli: '#8a867d' };
  const AD = { geldi: 'geldi', gelmedi: 'gelmedi', gec: 'geç', izinli: 'izinli' };
  const ozet = el('div', undefined, 'yok-ozet');
  const liste = el('div', undefined, 'yoklama-liste hapli');
  const toplu = el('button', undefined, 'yok-toplu'); toplu.type = 'button';
  toplu.append(el('span', '✓', 'yok-toplu-ikon'), document.createTextNode('Hepsini geldi yap'));
  const ozetYaz = () => {
    const say = { geldi: 0, gelmedi: 0, gec: 0, izinli: 0 };
    for (const o of ogrenciler) say[durum.get(o.ogrenciId)]++;
    const dilimler = Object.keys(say).map(d => ({ deger: say[d], renk: RENK[d], etiket: AD[d] }));
    ozet.replaceChildren(yiginCubuk(dilimler), gosterge(dilimler.filter(d => d.deger > 0 || d.etiket === 'geldi')));
    toplu.classList.toggle('gizli', ogrenciler.length === 0 || say.geldi === ogrenciler.length);
  };
  const hapCiz = () => {
    liste.replaceChildren();
    for (const o of ogrenciler) {
      const hap = el('button', undefined, 'yok-hap d-' + durum.get(o.ogrenciId));
      hap.type = 'button';
      const ikon = el('span', PASTA_IKON[durum.get(o.ogrenciId)], 'yok-ikon');
      hap.append(el('span', o.ad, 'yok-ad'), ikon);
      hap.addEventListener('click', () => pastaAc(o.ad, hap, BITIR_SECENEK, durum.get(o.ogrenciId), d => {
        durum.set(o.ogrenciId, d);
        hap.className = 'yok-hap d-' + d;
        ikon.textContent = PASTA_IKON[d];
        ozetYaz();
      }));
      liste.appendChild(hap);
    }
    ozetYaz();
  };
  toplu.addEventListener('click', () => {
    for (const o of ogrenciler) durum.set(o.ogrenciId, 'geldi');
    hapCiz();
  });

  const yok = el('div', undefined, 'adim');
  const yokUst = el('div', undefined, 'adim-ust');
  yokUst.append(el('h3', 'Yoklama'), durumEtiket);
  yok.append(yokUst, ozet, toplu, liste);
  if (!ogrenciler.length) yok.append(el('p', 'Bu sınıfta aktif öğrenci yok.', 'alt'));

  // İşlenen konu: ünite ve kazanım listeden seçilir (konu yazılmaz); açıklama isteğe bağlı
  const kazSec = kazanimSecici({ secili: r.veri.kazanimKodlari || [] });
  const ac = el('input'); ac.id = 'b-aciklama'; ac.maxLength = 500; ac.placeholder = 'Derste neler yapıldı, not düşmek isterseniz'; ac.value = r.veri.aciklama || '';
  const lac = el('label', 'Açıklama (isteğe bağlı)'); lac.htmlFor = 'b-aciklama';
  // MEB kazanım listesi olmayan derslerde (ör. seçmeli) konu serbest yazılır
  const konu = el('input'); konu.id = 'b-konu'; konu.maxLength = 120; konu.placeholder = 'Örn. Atölye çalışması'; konu.value = r.veri.konu || '';
  const lk = el('label', 'Konu'); lk.htmlFor = 'b-konu';
  const konuSerbest = el('div', undefined, 'gizli'); konuSerbest.append(lk, konu);
  kazSec.hazir.then(h => konuSerbest.classList.toggle('gizli', h.var));
  const konuKutu = el('div', undefined, 'adim');
  const konuUst = el('div', undefined, 'adim-ust'); konuUst.append(el('h3', 'İşlenen konu'));
  konuKutu.append(konuUst, kazSec, konuSerbest, lac, ac);

  // Ödev
  const ob = el('input'); ob.id = 'b-odev'; ob.maxLength = 120; ob.placeholder = 'Örn. Sayfa 40-41 alıştırmaları'; ob.value = r.veri.odev?.baslik || '';
  const oa = el('input'); oa.id = 'b-odev-ac'; oa.maxLength = 500; oa.value = r.veri.odev?.aciklama || '';
  const okSec = kazanimSecici({ tek: true, secili: r.veri.odev?.kazanimKod ? [r.veri.odev.kazanimKod] : [] });
  const ot = el('input'); ot.id = 'b-odev-tarih'; ot.type = 'date';
  ot.value = r.veri.odev?.sonTarih || new Date(Date.now() + 7 * 864e5).toLocaleDateString('sv-SE');
  const l1 = el('label', 'Ödev'); l1.htmlFor = 'b-odev';
  const l2 = el('label', 'Açıklama'); l2.htmlFor = 'b-odev-ac';
  const lok = el('label', 'Ödevin kazanımı (isteğe bağlı)');
  const l3 = el('label', 'Son teslim tarihi'); l3.htmlFor = 'b-odev-tarih';
  const odevKutu = el('div', undefined, 'adim');
  const odevUst = el('div', undefined, 'adim-ust'); odevUst.append(el('h3', 'Ödev'), el('span', 'isteğe bağlı', 'alt'));
  okSec.hazir.then(h => lok.classList.toggle('gizli', !h.var));
  odevKutu.append(odevUst, l1, ob, l2, oa, lok, okSec, l3, ot);

  // Düğmeler
  const iptal = el('button', 'Dersi iptal et', 'ikincil tehlike'); iptal.type = 'button';
  const kaydet = el('button', r.veri.tamam ? 'Değişiklikleri kaydet' : 'Dersi bitir', 'birincil'); kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(iptal, kaydet);

  const hataTemizle = () => {
    for (const x of k.querySelectorAll('.alan-hata')) x.remove();
    for (const x of k.querySelectorAll('.hatali')) x.classList.remove('hatali');
  };
  const hataGoster = metin => {
    hataTemizle();
    const m = metin.toLowerCase();
    const hedef = m.includes('kazanım') ? kazSec : m.includes('konu') ? konu : m.includes('açıklama') ? ac : m.includes('ödev başlığı') ? ob : m.includes('ödev') ? ot : null;
    const p = el('p', metin, 'alan-hata'); p.setAttribute('role', 'alert');
    if (hedef) { hedef.classList.add('hatali'); hedef.after(p); hedef.scrollIntoView({ behavior: 'smooth', block: 'center' }); hedef.focus({ preventScroll: true }); }
    else { cubuk.before(p); p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };
  for (const x of [konu, ob, ot]) x.addEventListener('input', hataTemizle);

  kaydet.addEventListener('click', async () => {
    const s = await api('/api/yoklama/kaydet', {
      tarih, sinifId: ders.sinifId, dersSaati: ders.dersSaati,
      kayitlar: ogrenciler.map(o => ({ ogrenciId: o.ogrenciId, durum: durum.get(o.ogrenciId) })),
      konu: konu.value, kazanimlar: kazSec.kodlar(), aciklama: ac.value,
      odev: { baslik: ob.value, aciklama: oa.value, kazanimKod: okSec.kodlar()[0] || '', sonTarih: ot.value },
    });
    if (!s.ok) return hataGoster(s.veri.hata || 'Hata');
    hataTemizle();
    mesaj(`Ders tamamlandı: ${s.veri.gelmedi} gelmedi, ${s.veri.gec} geç, ${s.veri.izinli} izinli.`, 'tamam');
    bitince();
  });
  iptal.addEventListener('click', async () => {
    if (!confirm('Bu ders iptal edilsin mi? Girilen yoklama, konu ve ödev silinir.')) return;
    const s = await api('/api/yoklama/iptal', { tarih, sinifId: ders.sinifId, dersSaati: ders.dersSaati });
    if (!s.ok) return mesaj(s.veri.hata || 'Hata', 'hata');
    mesaj('Ders iptal edildi.', 'tamam');
    bitince();
  });

  saltOkunurKur(k, [yok, konuKutu, odevKutu], cubuk, iptal, durumEtiket, !!r.veri.tamam && !r.veri.iptal, () => bitirCiz(k, bitince));
  hapCiz();
}

// Kulüp dersi: günü ve saati kulüpte sabit. Konu önceden (ileri tarih için de) yazılabilir; yoklama ders başladıktan sonra alınır.
const KULUP_SECENEK = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['izinli', 'İzinli']];
const KULUP_TUR = [['diger', 'Genel'], ['deney', 'Deney'], ['proje', 'Proje'], ['sunum', 'Sunum'], ['gezi', 'Gezi']];

// Derslerim'de seçili dersten, Kulüplerim'de ise doğrudan kulüp ve tarihten çağrılır.
async function kulupBitirCiz(k, bitince, kulupId = ders.kulupId, gun = tarih) {
  const r = await api('/api/kulup/oturum?' + new URLSearchParams({ kulupId, tarih: gun }));
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const { uyeler, calisma: c, katilim, basladi, kulup } = r.veri;
  const durum = new Map(uyeler.map(u => [u.uyelikId, katilim[u.uyelikId] || 'geldi']));
  k.replaceChildren();

  const rozetMetin = c?.iptal ? 'İptal edilmiş' : c?.tamam ? 'Düzenleniyor' : basladi ? 'Yeni kayıt' : 'Planlanıyor';
  const rozet = el('span', rozetMetin, 'rozet ' + (c?.iptal ? 'iptal' : c?.tamam ? 'tamam' : 'bekliyor'));

  // Yoklama: ders saati başlamadan alınamaz
  const yok = el('div', undefined, 'adim');
  const yokUst = el('div', undefined, 'adim-ust');
  yokUst.append(el('h3', 'Yoklama'), rozet);
  yok.append(yokUst);
  const ozet = el('div', undefined, 'yok-ozet');
  const liste = el('div', undefined, 'yoklama-liste hapli');
  const toplu = el('button', undefined, 'yok-toplu'); toplu.type = 'button';
  toplu.append(el('span', '✓', 'yok-toplu-ikon'), document.createTextNode('Hepsini geldi yap'));
  const RENK = { geldi: '#2e9e5b', gelmedi: '#d64545', izinli: '#8a867d' };
  const ozetYaz = () => {
    const say = { geldi: 0, gelmedi: 0, izinli: 0 };
    for (const u of uyeler) say[durum.get(u.uyelikId)]++;
    const dilimler = KULUP_SECENEK.map(([d, e]) => ({ deger: say[d], renk: RENK[d], etiket: e.toLocaleLowerCase('tr') }));
    ozet.replaceChildren(yiginCubuk(dilimler), gosterge(dilimler.filter(d => d.deger > 0 || d.etiket === 'geldi')));
    toplu.classList.toggle('gizli', !uyeler.length || say.geldi === uyeler.length);
  };
  const hapCiz = () => {
    liste.replaceChildren();
    for (const u of uyeler) {
      const hap = el('button', undefined, 'yok-hap d-' + durum.get(u.uyelikId));
      hap.type = 'button';
      const ikon = el('span', PASTA_IKON[durum.get(u.uyelikId)], 'yok-ikon');
      hap.append(el('span', u.ad, 'yok-ad'), ikon);
      hap.addEventListener('click', () => pastaAc(u.ad, hap, KULUP_SECENEK, durum.get(u.uyelikId), d => {
        durum.set(u.uyelikId, d);
        hap.className = 'yok-hap d-' + d;
        ikon.textContent = PASTA_IKON[d];
        ozetYaz();
      }));
      liste.appendChild(hap);
    }
    ozetYaz();
  };
  toplu.addEventListener('click', () => { for (const u of uyeler) durum.set(u.uyelikId, 'geldi'); hapCiz(); });
  if (basladi) {
    yok.append(ozet, toplu, liste);
    if (!uyeler.length) yok.append(el('p', 'Kulüpte öğrenci yok.', 'alt'));
  } else {
    yok.append(el('p', `Yoklama ders saati başladıktan sonra alınır (${kulup.aralik.split('–')[0]}). Şimdilik konuyu önceden yazabilirsiniz.`, 'alt'));
  }

  // Bu haftaki çalışma: konu önceden yazılabilir
  const tur = el('select');
  for (const [d, e] of KULUP_TUR) tur.append(Object.assign(el('option', e), { value: d }));
  tur.value = c?.tur || 'diger'; tur.id = 'kb-tur';
  const konu = el('input'); konu.id = 'kb-konu'; konu.maxLength = 100; konu.placeholder = 'Örn. Basit elektrik devresi'; konu.value = c?.baslik || '';
  const ac = el('input'); ac.id = 'kb-aciklama'; ac.maxLength = 1000; ac.placeholder = 'Plan, malzeme ya da derste neler yapıldı (isteğe bağlı)'; ac.value = c?.aciklama || '';
  const lt = el('label', 'Tür'); lt.htmlFor = 'kb-tur';
  const lk = el('label', 'Konu'); lk.htmlFor = 'kb-konu';
  const la = el('label', 'Açıklama (isteğe bağlı)'); la.htmlFor = 'kb-aciklama';
  const konuKutu = el('div', undefined, 'adim');
  const konuUst = el('div', undefined, 'adim-ust'); konuUst.append(el('h3', 'İşlenen konu'));
  konuKutu.append(konuUst, lt, tur, lk, konu, la, ac);

  const iptal = el('button', c?.iptal ? 'İptali kaldır' : 'Dersi iptal et', c?.iptal ? 'ikincil' : 'ikincil tehlike'); iptal.type = 'button';
  const kaydet = el('button', basladi ? (c?.tamam ? 'Değişiklikleri kaydet' : 'Dersi bitir') : 'Planı kaydet', 'birincil'); kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(iptal, kaydet);

  const hataGoster = metin => {
    for (const x of k.querySelectorAll('.alan-hata')) x.remove();
    const p = el('p', metin, 'alan-hata'); p.setAttribute('role', 'alert');
    konu.classList.add('hatali');
    konu.after(p);
    konu.scrollIntoView({ behavior: 'smooth', block: 'center' });
    konu.focus({ preventScroll: true });
  };
  konu.addEventListener('input', () => { konu.classList.remove('hatali'); for (const x of k.querySelectorAll('.alan-hata')) x.remove(); });

  kaydet.addEventListener('click', async () => {
    const s = await api('/api/kulup/oturum-kaydet', {
      kulupId, tarih: gun, tur: tur.value, baslik: konu.value, aciklama: ac.value,
      bitir: basladi, katilim: Object.fromEntries(durum),
    });
    if (!s.ok) return hataGoster(s.veri.hata || 'Hata');
    mesaj(basladi ? `Ders tamamlandı: ${s.veri.gelmedi} gelmedi, ${s.veri.izinli} izinli.` : 'Plan kaydedildi.', 'tamam');
    bitince();
  });
  iptal.addEventListener('click', async () => {
    if (!c?.iptal && !confirm('Bu ders iptal edilsin mi? Girilen yoklama silinir.')) return;
    const s = await api('/api/kulup/oturum-iptal', { kulupId, tarih: gun, geriAl: !!c?.iptal });
    if (!s.ok) return mesaj(s.veri.hata || 'Hata', 'hata');
    mesaj(c?.iptal ? 'İptal kaldırıldı.' : 'Ders iptal edildi.', 'tamam');
    bitince();
  });

  saltOkunurKur(k, [yok, konuKutu], cubuk, iptal, rozet, !!c?.tamam, () => kulupBitirCiz(k, bitince));
  if (basladi) hapCiz();
}

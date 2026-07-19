# SporX Futbol Okulu Yönetim Sistemi

İlk kullanıcı arayüzü prototipi. VetAmerikan Shift Asistan ile aynı tipografi yaklaşımını kullanır:

- Roboto: genel kullanıcı arayüzü
- Anta: SporX marka yazısı
- Responsive web düzeni: masaüstünde sol menü, mobilde alt menü
- Prototip rolleri: admin, normal kullanıcı, öğrenci velisi

## Çalıştırma

Bu klasörde bir statik dosya sunucusu başlatın:

```bash
python3 -m http.server 8765
```

Ardından `http://127.0.0.1:8765` adresini açın.

## Tamamlanan prototip akışları

- Giriş ve prototip rol değişimi
- Role göre menü ve ana panel
- Öğrenci listesi, arama, grup filtresi ve yeni kayıt formu
- Veliye özel çocuk profili
- Antrenman kartları ve yoklama formu
- Aidat listesi ve ödeme durumu güncelleme
- Temel muhasebe özeti
- Bildirim oluşturma ekranı

## Yerel veritabanı

Uygulama verileri şimdilik `localStorage` tabanlı, sürümlenmiş `sporx.localdb.v1` veri katmanında tutulur. Öğrenci kayıtları, aidat durumları, yoklamalar, muhasebe hareketleri ve bildirim taslakları sayfa kapatılıp yeniden açıldığında korunur.

Bu yöntem tek cihazlı geliştirme ve prototip kullanımı içindir. Farklı cihazlar veya tarayıcılar aynı veriyi paylaşmaz; tarayıcı verileri temizlenirse kayıtlar silinir.

## GitHub Pages

Proje GitHub deposunun kök dizinine gönderildiğinde `.github/workflows/pages.yml` iş akışı web sürümünü GitHub Pages'a yayınlamaya hazırdır. Depo ayarlarında **Settings → Pages → Source: GitHub Actions** seçilmelidir.

Supabase şeması, merkezi kimlik doğrulama, cihazlar arası veri paylaşımı ve Firebase Cloud Messaging sonraki çevrimiçi aşamada eklenecektir.

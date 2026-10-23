# V2rayAG Dashboard

اپلیکیشن مدیریت اتصال VPN با داشبورد مدرن.

## ساخت APK

برای ساخت و انتشار خودکار APK در GitHub Releases:

### ۱. تنظیم Secrets در مخزن
به مسیر `Settings → Secrets and variables → Actions` در مخزن GitHub بروید و این مقادیر را اضافه کنید:

| Secret Name | مقدار |
|---|---|
| `VITE_SUPABASE_URL` | آدرس Supabase پروژه |
| `VITE_SUPABASE_ANON_KEY` | کلید عمومی Supabase |

### ۲. (اختیاری) کلید امضای اندروید
برای APK امضاشده، این مقادیر را هم اضافه کنید:

| Secret Name | توضیح |
|---|---|
| `ANDROID_SIGNING_KEY` | فایل keystore با base64 |
| `ANDROID_KEY_ALIAS` | نام alias |
| `ANDROID_KEY_STORE_PASSWORD` | رمز keystore |
| `ANDROID_KEY_PASSWORD` | رمز key |

اگر این مقادیر را تنظیم نکنید، فقط APK نسخه debug ساخته می‌شود.

### ۳. انتشار
یک tag جدید بسازید:

```bash
git tag v1.0.0
git push origin v1.0.0
```

یا از بخش **Actions** در گیت‌هاب، روی `Build and Release APK` کلیک کنید و `Run workflow` را بزنید.

### نتیجه
فایل APK در بخش **Releases** مخزن قرار می‌گیرد و قابل دانلود و نصب روی اندروید است.

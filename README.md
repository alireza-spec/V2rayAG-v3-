# V2rayAG Dashboard

اپلیکیشن مدیریت اتصال VPN با داشبورد مدرن — ساخت APK اندروید.

## ساخت APK

برای ساخت و انتشار خودکار APK در GitHub Releases:

### ۱. تنظیم Secrets

به مسیر `Settings → Secrets and variables → Actions` در مخزن GitHub بروید و این مقادیر را اضافه کنید:

| Secret Name | مقدار |
|---|---|
| `VITE_SUPABASE_URL` | آدرس Supabase پروژه |
| `VITE_SUPABASE_ANON_KEY` | کلید عمومی Supabase |

### ۲. انتشار

یک tag جدید بسازید:

```bash
git tag v1.0.0
git push origin v1.0.0
```

یا از بخش **Actions** در گیت‌هاب، روی `Build and Release APK` کلیک کنید و `Run workflow` را بزنید.

### ۳. نتیجه

سه نسخه APK در بخش **Releases** مخزن قرار می‌گیرد:

| فایل | پردازنده | مناسب برای |
|------|----------|-----------|
| `arm64` | ARM 64-bit | گوشی‌های جدید |
| `armeabi` | ARM 32-bit | گوشی‌های قدیمی‌تر |
| `universal` | همه پردازنده‌ها | هر گوشی |

### نصب روی اندروید:
۱. فایل APK مناسب گوشی خود را دانلود کنید
۲. در تنظیمات اندروید «نصب از منابع ناشناخته» را فعال کنید
۳. فایل را باز و نصب کنید

> اگر نمی‌دانید کدام نسخه را دانلود کنید، نسخه **universal** را انتخاب کنید.

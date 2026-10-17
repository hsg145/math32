# دليل النشر — Deploy

المشروع ثابت بالكامل (Vite + hash routing)، فيعمل على **أي** استضافة ثابتة.
أدناه Vercel لأنها الأسهل، ومعها خطوات Netlify و GitHub Pages.

---

## ٠) المتطلبات

```bash
node -v      # ≥ 20
npm ci
npm run check        # typecheck + sql + render  — يجب أن يمرّ كله
```

---

## ١) Supabase (مرة واحدة)

1. **SQL Editor** → الصق `supabase/schema.sql` كاملاً → **Run**
2. `.env.local`:

```ini
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT>
TEACHER_EMAIL=your@school.edu
TEACHER_PASSWORD=<كلمة مرور قوية>
```

3. أنشئ حساب المعلّم واستورد الأسئلة:

```bash
npm run create-teacher     # يُنشئ المستخدم + صفّه في teachers
npm run seed               # ٢٦ سؤالاً مطابقة للأصل
npm run test:login && npm run test:e2e
```

4. **Authentication → URL Configuration**

| الحقل | القيمة |
|---|---|
| Site URL | نطاق Vercel النهائي، مثل `https://math32.vercel.app` |
| Redirect URLs | نفس النطاق + `http://localhost:5173/**` للتطوير |

---

## ٢) Vercel

### من الواجهة

1. **New Project** → استورد المستودع
2. **Framework Preset**: Vite · **Build Command**: `npm run build` ·
   **Output Directory**: `dist` — كلها موجودة في `vercel.json` تلقائياً
3. **Environment Variables** — أضف **القيمة العامة فقط**:

   | الاسم | القيمة | بيئة |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Production · Preview · Development |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` | Production · Preview · Development |

   > 🔴 **لا تضف** `SUPABASE_SERVICE_ROLE_KEY` ولا `TEACHER_PASSWORD` هنا.
   > هي لسكربتات Node على جهازك فقط؛ إضافتها تكشفها في بناء الواجهة.

4. **Deploy**

### من الطرفية

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

---

## ٣) Netlify

```
Build command   : npm run build
Publish directory: dist
```

`public/_redirects` غير مطلوب (hash routing)، لكن إن تغيّر التوجيه لاحقاً أضف:

```
/*  /index.html  200
```

المتغيرات: نفس الجدول أعلاه في **Site configuration → Environment variables**.

---

## ٤) GitHub Pages

`.github/workflows/deploy.yml` المرفق يتكفّل بذلك عند كل push على `main`:

```bash
# فعّل من: Settings → Pages → Source: GitHub Actions
```

المتغيرات السرّية في المستودع (الاسم يبدأ بـ `VITE_`) تُقرأ من
**Settings → Secrets and variables → Actions**.

---

## ٥) بعد النشر — قائمة تحقّق

```bash
# ١. الصفحة تفتح ولا أخطاء في الـ console
open https://<your-domain>/

# ٢. بوابة الدخول
https://<your-domain>/#/admin        → يظهر نموذج الدخول

# ٣. دخول المعلّم يبني جلسة وأكواداً
npm run test:e2e                     # يجب أن ينجح على القاعدة المنشورة

# ٤. رابط طالب 深
https://<your-domain>/#/j/ABC-DEF    → يفتح الحقول مباشرة
```

- [ ] `/#/admin` يفتح نموذج الدخول بلا أخطاء
- [ ] دخول المعلّم ينقلك للوحة فوراً بلا «جارٍ التحقق…»
- [ ] «إنشاء الجلسة» يولّد كوداً بصيغة `ABC-DEF`
- [ ] `#/j/<CODE>` يفتح شاشة الكود بالحقول الستة
- [ ] بعد ٦ خانات يُملأ الرمز تلقائياً ويتقدّم
- [ ] «ابدأ اللعبة» يظهر السؤال للطالب فوراً (بلا تحديث)
- [ ] العدّاد ينتهي عند الجميع في اللحظة نفسها
- [ ] «كشف الحل» يعرض الإجابة + النقاط + الترتيب
- [ ] لا يظهر `SUPABASE_SERVICE_ROLE_KEY` في مصدر الصفحة (View Source)

---

## ٦) النشر التلقائي (CI)

المستودع يحتوي على:

- `.github/workflows/deploy.yml` — بناء ونشر تلقائي
- `.github/workflows/verify.yml` — يشغّل كل الفحوص على كل PR

إيقافهما أو تشغيلهما من **Settings → Actions**.

---

## ٧) استكشاف الأخطاء

| العرض | السبب | الحل |
|---|---|---|
| `الإعدادات غير مكتملة` | المتغيرات غير موجودة وقت البناء | أعد النشر بعد ضبط `VITE_*` |
| `relation "public.x" does not exist` | لم يُطبّق المخطط | **SQL Editor** → الصق `supabase/schema.sql` |
| «جارٍ التحقق من الهوية…» عالق | حساب غير موجود في `teachers` | `npm run create-teacher` |
| `Invalid API key` | خلط بين `anon` و`service_role` | راجع جدول المتغيرات أعلاه |
| لا تحديث لحظي | الجداول خارج publication | أعد تطبيق `schema.sql` |
| «الكود غير صحيح» للطلاب | كود ملغى أو منتهٍ | «كود جديد» من لوحة المعلّم |

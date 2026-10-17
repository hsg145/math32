# الأمان — Security

## ما لا يُرفع أبداً

| الملف | لماذا | الحالة |
|---|---|---|
| `.env.local` | يحتوي `SUPABASE_SERVICE_ROLE_KEY` وكلمة مرور المعلّم | **مُستثنى في `.gitignore`** |
| `.env.*.local` | أي نسخة محلية | **مُستثنى** |
| `dist/` | ناتج البناء | **مُستثنى** |

> `VITE_SUPABASE_ANON_KEY` (Publishable) **ليس سرّاً** — هو الذي يُشحن داخل
> الحزمة ويصل للمتصفح دائماً. لا يُعدَّ revealingه خطأ. أمّا
> `service_role` (أو `sb_secret_…`) فمفتاح إداري كامل: **اعتبره مكشوفاً فور
> نشره** ودوّره من Supabase → Settings → API Keys.

## قبل أول push

```bash
git check-ignore -v .env.local      # يجب أن يطبع القاعدة المطابقة
git ls-files | grep -i env          # يجب ألا يطبع شيئاً
```

## خطّ الدفاع

| الطبقة | التفصيل |
|---|---|
| المتصفح | لا يحمل إلا المفتاح العام. لا `eval` ولا `new Function` ولا بيانات من قاعدة تُنفَّذ |
| RLS | مفعّل على الجداول الثمانية. `questions` للمعلّم فقط في الكتابة |
| `results` / `player_stats` | **بلا سياسة قراءة عامة إطلاقاً** — لا تُقرأ من المتصفح |
| RPC | كلها `SECURITY DEFINER` + `set search_path = public, pg_temp` (لا حقن عبر `search_path`) |
| الهوية | `assert_teacher()` يفحص `auth.uid()` مقابل `public.teachers` في كل إجراء إداري |
| التوقيت | `rpc_answer` يقيس زمن الإجابة على الخادم؛ لا يُقبل رقم من المتصفح |
| الإجابة الصحيحة | لا تُغادر القاعدة قبل انتهاء الوقت؛ `get_question()` لا يُرجع `correct_index` |
| الإدخال | نصوص الأسئلة تُهرَّب مع إبقاء `<`/`>` حرفية كما في الأصل، فلا يمكن تنفيذ وسم |
| المعدّل | أول إجابة فقط لكل (جلسة، طالب، جولة) بسبب قيد `UNIQUE` |

## قبل النشر على الإنتاج

- [ ] كلمة مرور المعلّم قوية وفريدة (**ليست** مؤقتة)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` موجود كمتغير بيئة في Vercel فقط
- [ ] المفتاح الإداري **ليس** في GitHub — تحقّق بـ `git log -p | grep -i secret`
- [ ] في Supabase → **Authentication → URL Configuration** أضف نطاق Vercel في
      `Site URL` و `Redirect URLs`
- [ ] في Supabase → **Authentication → Providers** عطّل أي مزوّد لا تستخدمه
- [ ] فعّل **Leak Protection** لـ `auth.users` إن كان متاحاً في خطتك
- [ ] فعّل جدولة `maintenance_sweep` (تنظيف دوري — اختياري)

## الإبلاغ عن ثغرة

افتح Issue خاصاً، أو تواصل مباشرة عبر بريد المشروع. لا تنشر تفاصيل في Issue عام.

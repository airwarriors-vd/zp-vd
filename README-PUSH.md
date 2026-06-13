# Налаштування push-сповіщень

1. У Vercel додайте Environment Variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - VAPID_PUBLIC_KEY
   - VAPID_PRIVATE_KEY
   - VAPID_SUBJECT, наприклад mailto:your@email.com

2. Згенерувати VAPID ключі можна локально:
   npm install
   npm run vapid

3. Вставте VAPID_PUBLIC_KEY також у index.html у рядок:
   const VAPID_PUBLIC_KEY='PASTE_VAPID_PUBLIC_KEY_HERE';

4. Завантажте всі файли з цього пакета в корінь GitHub.

5. Після деплою користувач відкриває «Мій профіль» або верхню кнопку «Увімкнути push» і дозволяє сповіщення.

6. Vercel Cron викликатиме /api/send-reminders кожні 30 хвилин.

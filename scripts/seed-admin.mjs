import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'

// Read DATABASE_URL from .env
const envContent = readFileSync('.env', 'utf8')
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim()

if (!dbUrl) {
  console.error('❌ DATABASE_URL not found in .env')
  process.exit(1)
}

// Hash password (SHA-256) - same as lib/auth.ts
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const sql = neon(dbUrl)
const username = 'admin'
const password = 'admin123'
const hashed = await hashPassword(password)

try {
  const existing = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`

  if (existing.length > 0) {
    await sql`UPDATE users SET password = ${hashed}, status = 'active', role = 'admin' WHERE username = ${username}`
    console.log('✅ تم تحديث كلمة مرور admin بنجاح')
  } else {
    await sql`INSERT INTO users (role, username, password, full_name, status) VALUES ('admin', ${username}, ${hashed}, 'المدير', 'active')`
    console.log('✅ تم إنشاء مستخدم admin بنجاح')
  }

  // Ensure default kindergarten settings exist
  await sql`INSERT INTO settings (key, value) VALUES 
    ('school_name', 'روضة براعم الفردوس'),
    ('academic_year', '2025/2026'),
    ('academic_season_start', '2025-09-01'),
    ('contact_phone', '0555123456'),
    ('country_code', '+213'),
    ('default_student_fee', '2500'),
    ('default_teacher_salary', '35000'),
    ('msg_absent', 'السلام عليكم. نعلمكم أن الطفل(ة) {student_name} غائب(ة) اليوم {date}. يرجى التواصل مع إدارة الروضة.'),
    ('msg_late', 'السلام عليكم. نعلمكم أن الطفل(ة) {student_name} تأخر(ت) عن موعد الدخول اليوم {date}.'),
    ('primary_color', '#1a5c35'),
    ('auto_attendance', 'true'),
    ('online_registration', 'true')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  console.log('✅ تم ضبط إعدادات روضة براعم الفردوس الافتراضية')

  console.log('👤 اسم المستخدم: admin')
  console.log('🔑 كلمة المرور: admin123')
} catch (err) {
  console.error('❌ خطأ:', err.message)
  process.exit(1)
}

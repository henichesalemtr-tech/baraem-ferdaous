import { redirect } from 'next/navigation'

// صفحة حفظ القرآن معطّلة في نظام روضة الأطفال براعم الفردوس
// يتم إعادة التوجيه تلقائياً إلى لوحة التحكم
export default function MemorizationRedirectPage() {
  redirect('/dashboard')
}

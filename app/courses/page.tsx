import { redirect } from 'next/navigation'

// صفحة الدورات التعليمية معطّلة في نظام روضة الأطفال براعم الفردوس
// يتم إعادة التوجيه تلقائياً إلى لوحة التحكم
export default function CoursesRedirectPage() {
  redirect('/dashboard')
}

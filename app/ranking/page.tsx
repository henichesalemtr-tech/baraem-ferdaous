import { redirect } from 'next/navigation'

// صفحة ترتيب الفوج التنافسي معطّلة في نظام روضة الأطفال براعم الفردوس
// بما يتوافق مع معايير رياض الأطفال التربوية
export default function RankingRedirectPage() {
  redirect('/dashboard')
}

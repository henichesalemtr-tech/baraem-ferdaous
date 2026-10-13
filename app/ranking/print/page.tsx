import { redirect } from 'next/navigation'

// طباعة ترتيب الحفظ معطّلة في نظام روضة الأطفال
export default function RankingPrintRedirectPage() {
  redirect('/dashboard')
}

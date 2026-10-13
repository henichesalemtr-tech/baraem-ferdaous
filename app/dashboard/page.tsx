'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type DashData = {
  students: { total: number; active: number; withdrawn: number; waiting: number }
  teachers: { total: number }
  groups: { total: number; open: number; withStudents: number; empty: number }
  today: { present: number; absent: number; date: string }
  recentNotifs: { id: number; title: string; body: string; createdAt: string }[]
}
type SessionData = { id: number; role: string; fullName: string | null }

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then(r => r.ok ? r.json() : null),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
    ]).then(([stats, me]) => {
      setData(stats)
      setSession(me)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
      <p className="text-gray-400 text-sm">جاري تحميل لوحة التحكم...</p>
    </div>
  )

  if (!data) return (
    <div className="text-center py-20 text-red-500">تعذّر تحميل البيانات</div>
  )

  const isAdmin = session?.role === 'admin'
  const todayLabel = new Date().toLocaleDateString('ar-DZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const totalToday = data.students.active
  const attendedToday = data.today.present
  const absentToday = data.today.absent
  const notRecordedYet = data.today.present === 0 && data.today.absent === 0

  const statCards = [
    { title: 'الأطفال المسجلون', value: data.students.active, total: `إجمالي ${data.students.total} طفل`, icon: '👶', color: '#1a5c35', bg: '#f0fdf4', border: '#bbf7d0', href: '/students' },
    { title: 'حاضرون اليوم', value: data.today.present, total: data.today.absent > 0 ? `${data.today.absent} غائب` : notRecordedYet ? 'لم يُسجَّل بعد' : 'لا غياب ✅', icon: '✅', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', href: '/attendance' },
    { title: 'الأقسام', value: data.groups.open, total: `من أصل ${data.groups.total} قسم`, icon: '🏫', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', href: '/groups' },
    { title: 'المربيات والموظفون', value: data.teachers.total, total: 'موظف', icon: '👩‍🏫', color: '#b45309', bg: '#fffbeb', border: '#fde68a', href: isAdmin ? '/teachers' : '/schedules' },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 hidden sm:block">{todayLabel}</div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            السلام عليكم، {session?.fullName?.split(' ')[0] ?? 'مستخدم'} 👋
          </h1>
          <p className="text-base text-gray-500">
            {session?.role === 'admin' ? 'مدير النظام' : 'مربية / موظف'}
            {' '}&mdash; براعم الفردوس
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statCards.map(card => (
          <Link key={card.href} href={card.href}
            className="rounded-2xl border p-4 flex flex-col gap-2 transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95"
            style={{ background: card.bg, borderColor: card.border }}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{card.icon}</span>
              <span className="text-sm font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: card.color }}>
                {card.title}
              </span>
            </div>
            <div>
              <p className="text-4xl font-bold" style={{ color: card.color }}>{card.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.total}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Today attendance */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <Link href="/attendance" className="text-xs text-green-700 font-medium hover:underline">تسجيل الحضور ←</Link>
          <h2 className="font-bold text-gray-700 flex items-center gap-2 text-base"><span>📅</span> حضور الأطفال اليوم</h2>
        </div>
        {notRecordedYet ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-50 border border-yellow-200">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-yellow-800">لم يُسجَّل حضور الأطفال اليوم بعد</p>
              <p className="text-xs text-yellow-600">اضغط على &quot;تسجيل الحضور&quot; للبدء</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-200">
              <span className="text-3xl font-bold text-green-700">{data.today.present}</span>
              <div>
                <p className="text-base font-semibold text-green-700">✅ حاضر</p>
                <p className="text-sm text-green-600">طفل حضر اليوم</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
              <span className="text-3xl font-bold text-red-600">{data.today.absent}</span>
              <div>
                <p className="text-base font-semibold text-red-600">❌ غائب</p>
                <p className="text-sm text-red-500">{data.today.absent > 0 ? 'تم إشعار أولياء الأمور' : 'لا غياب اليوم'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-3xl font-bold text-gray-600">
                {data.students.active - data.today.present - data.today.absent > 0
                  ? data.students.active - data.today.present - data.today.absent
                  : 0}
              </span>
              <div>
                <p className="text-base font-semibold text-gray-600">⏳ لم يُسجَّل</p>
                <p className="text-sm text-gray-500">انتظار التسجيل</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Children breakdown + Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2"><span>📊</span> توزيع حالات الأطفال</h2>
          <div className="space-y-3">
            {[
              { label: 'نشط',         value: data.students.active,    color: '#16a34a', bg: '#dcfce7', pct: data.students.total ? Math.round(data.students.active / data.students.total * 100) : 0 },
              { label: 'في الانتظار', value: data.students.waiting,   color: '#d97706', bg: '#fef9c3', pct: data.students.total ? Math.round(data.students.waiting / data.students.total * 100) : 0 },
              { label: 'منسحب',       value: data.students.withdrawn, color: '#dc2626', bg: '#fee2e2', pct: data.students.total ? Math.round(data.students.withdrawn / data.students.total * 100) : 0 },
            ].map(item => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{item.label}</span>
                  <span className="font-bold" style={{ color: item.color }}>{item.value} ({item.pct}٪)</span>
                </div>
                <div className="w-full rounded-full h-2.5" style={{ background: item.bg }}>
                  <div className="h-2.5 rounded-full transition-all" style={{ width: `${item.pct}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2"><span>⚡</span> إجراءات سريعة</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/attendance',      icon: '📋', label: 'تسجيل الحضور' },
              { href: '/auto-attendance', icon: '📷', label: 'تحضير QR' },
              { href: '/groups',          icon: '🏫', label: 'الأقسام' },
              { href: '/notifications',   icon: '🔔', label: 'الإشعارات' },
              ...(isAdmin ? [
                { href: '/students', icon: '👶', label: 'إضافة طفل' },
                { href: '/finance',  icon: '💰', label: 'الرسوم المالية' },
                { href: '/reports',  icon: '📊', label: 'التقارير' },
                { href: '/dashboard/registration-requests', icon: '📝', label: 'طلبات التسجيل' },
              ] : []),
            ].map(action => (
              <Link key={action.href} href={action.href}
                className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:shadow-sm transition-all active:scale-95 bg-gray-50">
                <span className="text-xl">{action.icon}</span>
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Groups summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <Link href="/groups" className="text-xs text-green-700 font-medium hover:underline">عرض جميع الأقسام ←</Link>
          <h2 className="text-base font-bold text-gray-700 flex items-center gap-2"><span>🏫</span> ملخص الأقسام</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي الأقسام',    value: data.groups.total,        color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
            { label: 'أقسام مفتوحة',      value: data.groups.open,         color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: 'أقسام بها أطفال',   value: data.groups.withStudents, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'أقسام فارغة',       value: data.groups.empty,        color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb' },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-xl border text-center" style={{ background: item.bg, borderColor: item.border }}>
              <p className="text-3xl font-bold" style={{ color: item.color }}>{item.value}</p>
              <p className="text-xs text-gray-500 mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent notifications */}
      {data.recentNotifs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <Link href="/notifications" className="text-sm text-green-700 font-medium hover:underline">عرض الكل ←</Link>
            <h2 className="text-base font-bold text-gray-700 flex items-center gap-2"><span>🔔</span> آخر الإشعارات</h2>
          </div>
          <div className="space-y-2">
            {data.recentNotifs.map(n => (
              <div key={n.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-lg flex-shrink-0">🔔</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                  <p className="text-sm text-gray-500 truncate">{n.body}</p>
                </div>
                <p className="text-sm text-gray-400 flex-shrink-0">
                  {new Date(n.createdAt).toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
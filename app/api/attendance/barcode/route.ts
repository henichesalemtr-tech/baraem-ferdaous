import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { attendances, scanLogs, students, notifications } from '@/db/schemas/schema'
import { and, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { getAlgeriaNow } from '@/lib/algeria-time'
import { sendPushToUsers } from '@/lib/push'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const studentId = Number(body?.studentId)
    const date = typeof body?.date === 'string' ? body.date : ''

    if (!Number.isInteger(studentId) || studentId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'بيانات الحضور غير صحيحة' }, { status: 400 })
    }

    const [student] = await db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      guardianUserId: students.guardianUserId,
    })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1)

    if (!student) return NextResponse.json({ error: 'الطفل غير موجود' }, { status: 404 })

    // First try is atomic: the unique constraint makes simultaneous scanners safe.
    const inserted = await db.insert(attendances).values({
      studentId,
      attendanceDate: date,
      status: 'present',
      scheduleId: null,
      notes: null,
    }).onConflictDoNothing({
      target: [attendances.studentId, attendances.attendanceDate],
    }).returning({ id: attendances.id })

    const algeriaNow = getAlgeriaNow()
    const scanTimeStr = `${String(algeriaNow.hour).padStart(2, '0')}:${String(algeriaNow.minute).padStart(2, '0')}`

    try {
      await db.insert(scanLogs).values({
        studentId,
        scanType: 'barcode',
        scanDate: date,
        scanTime: scanTimeStr,
      })
    } catch (scanLogError) {
      // Attendance is the source of truth; a monitor-log failure must not reject a real scan.
      console.error('Barcode scan-log error:', scanLogError)
    }

    if (inserted.length > 0) {
      const childName = `${student.firstName} ${student.lastName}`
      await logActivity({
        userId: session.id,
        userFullName: session.fullName ?? session.username,
        userRole: session.role,
        action: 'attendance',
        entity: 'attendance',
        description: `تم تسجيل حضور الطفل ${childName} بالباركود بتاريخ ${date}`,
        metadata: { date, studentId, source: 'barcode' },
      })

      // Send instant notification to guardian account
      if (student.guardianUserId) {
        const notifTitle = `تسجيل حضور: ${childName}`
        const notifBody = `تم تسجيل حضور الطفل (${childName}) في الروضة بنجاح اليوم ${date} على الساعة ${scanTimeStr}.`

        await db.insert(notifications).values({
          title: notifTitle,
          body: notifBody,
          senderId: session.id,
          targetType: 'specific',
          targetIds: JSON.stringify([student.guardianUserId]),
          notificationType: 'manual',
          isReadBy: '[]',
        }).catch((err) => console.error('Guardian notification insert error:', err))

        sendPushToUsers([student.guardianUserId], notifTitle, notifBody, {
          url: '/guardian-dashboard',
        }).catch(() => {})
      }

      return NextResponse.json({ success: true, inserted: true, duplicate: false })
    }

    // The row already existed. Keep the legacy barcode behavior: a real scan
    // confirms presence, but report it as duplicate to the scanner UI.
    await db.update(attendances)
      .set({ status: 'present', notes: null })
      .where(and(
        eq(attendances.studentId, studentId),
        eq(attendances.attendanceDate, date),
      ))

    return NextResponse.json({ success: true, inserted: false, duplicate: true })
  } catch (error) {
    console.error('Barcode attendance error:', error)
    return NextResponse.json({ error: 'حدث خطأ في تسجيل الحضور' }, { status: 500 })
  }
}

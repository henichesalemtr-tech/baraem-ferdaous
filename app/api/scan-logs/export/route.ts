import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { scanLogs, students, groupStudents, groups } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const groupId = searchParams.get('groupId')

  const logs = await db.select({
    studentId: scanLogs.studentId,
    scanType: scanLogs.scanType,
    scanDate: scanLogs.scanDate,
    scanTime: scanLogs.scanTime,
    firstName: students.firstName,
    lastName: students.lastName,
    studentNumber: students.studentNumber,
    groupId: groupStudents.groupId,
    groupName: groups.name,
  })
  .from(scanLogs)
  .leftJoin(students, eq(scanLogs.studentId, students.id))
  .leftJoin(groupStudents, eq(groupStudents.studentId, students.id))
  .leftJoin(groups, eq(groupStudents.groupId, groups.id))
  .where(eq(scanLogs.scanDate, date))

  const filtered = groupId
    ? logs.filter(l => l.groupId === parseInt(groupId))
    : logs

  // Keep one row per student and count every scan for that student on the date.
  const byStudent = new Map<number | null, {
    name: string; studentNumber: string; groupName: string; scanType: string
    scanTime: string; scanDate: string; scanCount: number
  }>()
  for (const log of filtered) {
    const existing = byStudent.get(log.studentId)
    if (existing) {
      existing.scanCount += 1
      continue
    }
    byStudent.set(log.studentId, {
      name: `${log.firstName ?? ''} ${log.lastName ?? ''}`.trim(),
      studentNumber: log.studentNumber ?? '',
      groupName: log.groupName ?? '',
      scanType: log.scanType === 'barcode' ? 'باركود' : 'QR',
      scanTime: log.scanTime ?? '',
      scanDate: log.scanDate ?? '',
      scanCount: 1,
    })
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'نظام نور للقرآن'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('متابعة المسح', { properties: { tabColor: { argb: '1a5c35' } } })
  sheet.views = [{ rightToLeft: true }]
  sheet.columns = [
    { header: 'الاسم', key: 'name', width: 28 },
    { header: 'رقم الطالب', key: 'studentNumber', width: 18 },
    { header: 'الفوج', key: 'groupName', width: 22 },
    { header: 'نوع آخر مسح', key: 'scanType', width: 16 },
    { header: 'وقت آخر مسح', key: 'scanTime', width: 18 },
    { header: 'التاريخ', key: 'scanDate', width: 15 },
    { header: 'عدد مرات المسح', key: 'scanCount', width: 18 },
  ]
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a5c35' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 25
  Array.from(byStudent.values()).forEach((row, index) => {
    const excelRow = sheet.addRow(row)
    if (index % 2 === 0) {
      excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f9f4' } }
    }
    excelRow.alignment = { horizontal: 'right', vertical: 'middle' }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `scan-monitor-${date}.xlsx`
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}

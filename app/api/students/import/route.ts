import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { students } from '@/db/schemas/schema'
import { getSession } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { desc } from 'drizzle-orm'

const genderNorm = (v: unknown): 'male' | 'female' | null => {
  const val = String(v ?? '').trim().toLowerCase()
  if (['ذكر', 'm', 'male', 'ولد'].includes(val)) return 'male'
  if (['أنثى', 'انثى', 'f', 'female', 'بنت'].includes(val)) return 'female'
  return null
}

const statusNorm = (v: unknown): 'waiting' | 'active' | 'withdrawn' | 'graduated' => {
  const val = String(v ?? '').trim()
  const map: Record<string, 'waiting' | 'active' | 'withdrawn' | 'graduated'> = {
    'نشط': 'active', 'active': 'active',
    'في الانتظار': 'waiting', 'waiting': 'waiting', 'غير مفوج': 'waiting',
    'منسحب': 'withdrawn', 'withdrawn': 'withdrawn', 'متخلي': 'withdrawn',
    'خريج الروضة': 'graduated', 'متخرج': 'graduated', 'graduated': 'graduated',
  }
  return map[val] ?? 'waiting'
}

const bloodNorm = (v: unknown): string | null => {
  const val = String(v ?? '').trim().toUpperCase()
  if (!val) return null
  const valid = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  return valid.includes(val) ? val : (val.length <= 10 ? val : null)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'لم يتم إرفاق ملف' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const nodeBuffer = Buffer.from(arrayBuffer)
  const workbook = new ExcelJS.Workbook()
   
  await (workbook.xlsx as unknown as { load(buf: unknown): Promise<void> }).load(nodeBuffer)

  const sheet = workbook.worksheets[0]
  if (!sheet) return NextResponse.json({ error: 'لا يوجد بيانات في الملف' }, { status: 400 })

  // Auto-detect header row: try row 2 first (template with title banner), fallback to row 1
  const headers: Record<number, string> = {}
  let dataStartRow = 2

  const row2 = sheet.getRow(2)
  let row2HasHeaders = false
  row2.eachCell(cell => {
    const val = String(cell.value ?? '').trim()
    if (['الاسم الأول', 'اللقب', 'الاسم الأخير', 'first_name', 'اسم الطفل'].includes(val)) row2HasHeaders = true
  })

  if (row2HasHeaders) {
    dataStartRow = 3
    row2.eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim()
    })
  } else {
    dataStartRow = 2
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim()
    })
  }

  // Map header labels to field keys
  const headerMap: Record<string, string> = {
    'رقم التسجيل': 'student_number', 'رقم ملف الطفل': 'student_number', 'رقم الطالب': 'student_number',
    'الاسم الأول': 'first_name', 'اسم الطفل': 'first_name', 'الاسم': 'first_name',
    'اللقب': 'last_name', 'الاسم الأخير': 'last_name',
    'الجنس': 'gender',
    'تاريخ الميلاد': 'birth_date',
    'زمرة الدم': 'blood_type', 'فصيلة الدم': 'blood_type', 'زمرة': 'blood_type',
    'اسم الولي': 'guardian_name', 'اسم ولي الأمر': 'guardian_name', 'الولي': 'guardian_name',
    'رقم هاتف الولي': 'guardian_phone', 'هاتف الولي': 'guardian_phone', 'رقم هاتف ولي الأمر': 'guardian_phone',
    'هاتف ولي الأمر': 'guardian_phone', 'رقم الهاتف': 'guardian_phone', 'الهاتف': 'guardian_phone',
    'معلومات طبية': 'medical_notes', 'ملف طبي': 'medical_notes', 'ملاحظات طبية': 'medical_notes', 'حالة صحية': 'medical_notes',
    'العنوان': 'address', 'عنوان السكن': 'address',
    'تاريخ التسجيل': 'enrollment_date',
    'الحالة': 'status',
    'ملاحظات': 'notes',
    // English fallbacks
    'student_number': 'student_number', 'first_name': 'first_name',
    'last_name': 'last_name', 'gender': 'gender', 'birth_date': 'birth_date',
    'blood_type': 'blood_type', 'bloodType': 'blood_type',
    'guardian_name': 'guardian_name', 'guardian_phone': 'guardian_phone', 'phone': 'guardian_phone',
    'medical_notes': 'medical_notes', 'medicalNotes': 'medical_notes',
    'address': 'address', 'enrollment_date': 'enrollment_date', 'status': 'status', 'notes': 'notes',
  }

  // Get last student ID for numbering
  const [last] = await db.select({ id: students.id }).from(students).orderBy(desc(students.id)).limit(1)
  let nextId = (last?.id ?? 0) + 1

  const imported: string[] = []
  const errors: string[] = []

  for (let rowNum = dataStartRow; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum)
    const rowData: Record<string, unknown> = {}
    row.eachCell((cell, colNum) => {
      const hdr = headers[colNum]
      const key = headerMap[hdr]
      if (key) rowData[key] = cell.value
    })

    const firstName = String(rowData.first_name ?? '').trim()
    const lastName = String(rowData.last_name ?? '').trim()

    if (!firstName && !lastName) continue // skip empty rows
    if (!firstName || !lastName) {
      errors.push(`الصف ${rowNum}: الاسم الأول واللقب مطلوبان`)
      continue
    }

    const studentNumber = String(rowData.student_number ?? '').trim() || `BR${String(nextId).padStart(4, '0')}`
    const enrollDate = String(rowData.enrollment_date ?? '').trim() || new Date().toISOString().split('T')[0]

    try {
      const str = (v: unknown) => v ? String(v).trim() || null : null
      const effectivePhone = str(rowData.guardian_phone) || str(rowData.phone)

      await db.insert(students).values({
        studentNumber,
        firstName,
        lastName,
        gender: genderNorm(rowData.gender),
        birthDate: str(rowData.birth_date),
        phone: effectivePhone,
        guardianName: str(rowData.guardian_name),
        guardianPhone: effectivePhone,
        bloodType: bloodNorm(rowData.blood_type),
        medicalNotes: str(rowData.medical_notes),
        address: str(rowData.address),
        enrollmentDate: enrollDate,
        status: statusNorm(rowData.status),
        notes: str(rowData.notes),
      })
      imported.push(studentNumber)
      nextId++
    } catch (err) {
      errors.push(`الصف ${rowNum}: ${err instanceof Error ? err.message : 'خطأ في الإدخال'}`)
    }
  }

  return NextResponse.json({
    success: true,
    imported: imported.length,
    errors,
    message: `تم استيراد ${imported.length} طفل بنجاح${errors.length > 0 ? ` مع ${errors.length} أخطاء` : ''}`,
  })
}

// GET - Download template
export async function GET() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'روضة براعم الفردوس'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('الأطفال', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }],
  })

  // ── Row 1: title banner ──────────────────────────────────────
  sheet.mergeCells('A1:L1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = '📥  قالب استيراد بيانات الأطفال — روضة براعم الفردوس'
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a5c35' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  sheet.getRow(1).height = 32

  // ── Row 2: column headers ─────────────────────────────────────
  const COLS = [
    { header: 'رقم ملف الطفل',       key: 'student_number',    width: 16, req: false, note: 'تلقائي إذا تُرك فارغاً (BR0001…)' },
    { header: 'الاسم الأول',        key: 'first_name',        width: 18, req: true,  note: 'مطلوب' },
    { header: 'اللقب',              key: 'last_name',         width: 18, req: true,  note: 'مطلوب' },
    { header: 'الجنس',              key: 'gender',            width: 12, req: false, note: 'ذكر أو أنثى' },
    { header: 'تاريخ الميلاد',      key: 'birth_date',        width: 16, req: false, note: 'YYYY-MM-DD (يُحسب العمر آلياً)' },
    { header: 'زمرة الدم',          key: 'blood_type',        width: 14, req: false, note: 'مثال: O+, A+, B+, AB+...' },
    { header: 'اسم الولي',          key: 'guardian_name',     width: 22, req: false, note: 'اسم الأب أو الأم أو الولي' },
    { header: 'رقم هاتف الولي',     key: 'guardian_phone',    width: 18, req: false, note: 'يُستخدم لإنشاء حساب الولي واستلام الإشعارات' },
    { header: 'معلومات طبية',       key: 'medical_notes',     width: 28, req: false, note: 'حساسية، أدوية، حالات صحية خاصة...' },
    { header: 'العنوان',            key: 'address',           width: 22, req: false, note: 'المدينة، الحي...' },
    { header: 'تاريخ التسجيل',      key: 'enrollment_date',   width: 16, req: false, note: 'YYYY-MM-DD' },
    { header: 'الحالة',             key: 'status',            width: 16, req: false, note: 'نشط / في الانتظار / منسحب / خريج الروضة' },
    { header: 'ملاحظات',           key: 'notes',             width: 26, req: false, note: '' },
  ]

  sheet.columns = COLS.map(c => ({ key: c.key, width: c.width }))

  const hdrRow = sheet.getRow(2)
  COLS.forEach((col, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value = col.header
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.req ? 'b91c1c' : '166534' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' }
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFFFFF' } },
      left:   { style: 'thin',   color: { argb: 'FFFFFF' } },
    }
    if (col.note) cell.note = { texts: [{ text: col.note }] }
  })
  hdrRow.height = 28

  // ── Sample rows for Kindergarten ───────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const samples = [
    {
      student_number: '',
      first_name: 'يوسف',
      last_name: 'منصوري',
      gender: 'ذكر',
      birth_date: '2021-03-15',
      blood_type: 'O+',
      guardian_name: 'عبد القادر منصوري',
      guardian_phone: '0612345678',
      medical_notes: 'حساسية من الفول السوداني',
      address: 'وهران، حي النصر',
      enrollment_date: today,
      status: 'نشط',
      notes: 'طفل نشيط ويحب الرسم'
    },
    {
      student_number: '',
      first_name: 'مريم',
      last_name: 'بوعلام',
      gender: 'أنثى',
      birth_date: '2022-07-20',
      blood_type: 'A+',
      guardian_name: 'مراد بوعلام',
      guardian_phone: '0771234567',
      medical_notes: 'لا توجد',
      address: 'وهران، حي الزهور',
      enrollment_date: today,
      status: 'في الانتظار',
      notes: ''
    },
  ]

  samples.forEach((row, ri) => {
    const dataRow = sheet.addRow(row)
    dataRow.height = 22
    const fill = ri % 2 === 0
      ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'f0fdf4' } }
      : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF' } }
    dataRow.eachCell(cell => {
      cell.fill = fill
      cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'e5e7eb' } },
        left:   { style: 'thin', color: { argb: 'e5e7eb' } },
      }
      cell.font = { size: 10, color: { argb: '374151' } }
    })
  })

  // ── Reference sheet ───────────────────────────────────────────
  const ref = workbook.addWorksheet('دليل القيم المرجعية', { views: [{ rightToLeft: true }] })
  ref.columns = [
    { header: 'الجنس', key: 'gender', width: 14 },
    { header: 'الحالة', key: 'status', width: 22 },
    { header: 'زمرة الدم', key: 'blood', width: 16 },
  ]
  ;[
    ['ذكر', 'نشط', 'O+'],
    ['أنثى', 'في الانتظار', 'A+'],
    ['', 'منسحب', 'B+'],
    ['', 'خريج الروضة', 'AB+'],
    ['', '', 'O-'],
    ['', '', 'A-'],
    ['', '', 'B-'],
    ['', '', 'AB-']
  ].forEach(r => ref.addRow(r))

  const refHdr = ref.getRow(1)
  refHdr.font = { bold: true, color: { argb: 'FFFFFF' } }
  refHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a5c35' } }
  refHdr.height = 24

  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename*=UTF-8''baraem_children_template.xlsx",
    },
  })
}

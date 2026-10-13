import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import {
  students, teachers, groups, groupStudents,
  rooms, subjects, schedules, attendances,
  feePayments, expenses, donations, salaryPayments,
  teacherGroups, users, guardians,
  memorizationSessions, surahs, homework,
  teacherAttendances,
} from '@/db/schemas/schema'
import { getSession, hashPassword, hasPermission } from '@/lib/auth'
import { sql, eq } from 'drizzle-orm'

// ── Arabic names / data pools ────────────────────────────────────────────────
const firstNamesMale   = ['أحمد','محمد','يوسف','عمر','إبراهيم','عبدالرحمن','خالد','علي','سامي','بلال','أنس','زياد','هشام','ياسين','عمار','رياض','نور الدين','عبد الله','إدريس','حمزة']
const firstNamesFemale = ['فاطمة','مريم','خديجة','عائشة','زينب','نور','سارة','هاجر','رقية','أسماء','سلمى','أميرة','ريم','لمياء','نادية','إيمان','حفصة','منال','وفاء','شيماء']
const lastNames        = ['بن علي','العمري','الزهراني','بوعزيزي','بلقاسم','حداد','صالح','بن يوسف','الأمين','برهان','بن موسى','عثمان','كريم','بلال','الشريف','منصور','قاسم','حسن','بن عمر','لعموري']
const cities           = ['الجزائر','وهران','قسنطينة','عنابة','باتنة','سطيف','تلمسان','بجاية','تيزي وزو','بسكرة']
const levels           = ['فوج البراعم (3-4 سنوات)', 'فوج التمهيدي (4-5 سنوات)', 'فوج التحضيري (5-6 سنوات)']
const dayOfWeeks       = ['السبت','الأحد','الإثنين','الثلاثاء','الأربعاء']
const subjectNames     = ['التربية الإسلامية والسلوك', 'تنمية المهارات والتعبير', 'الأنشطة الحركية والرياضة', 'الرسم والتلوين والأشغال', 'مبادئ الحساب والأشكال']
const roomNames        = ['قاعة الفراشات', 'قاعة العصافير', 'قاعة النجوم', 'قاعة البراعم', 'قاعة الألعاب والأنشطة']
const ratings          = ['excellent','very_good','good','acceptable','weak'] as const
const sessionTypes     = ['new','review','big_review'] as const

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function randDate(from: Date, to: Date): string {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime())).toISOString().split('T')[0]
}
function phone(seed: number): string {
  return `05${String(10 + (seed % 89)).padStart(2, '0')}${String(100000 + (seed * 7919) % 899999).padStart(6, '0')}`
}

// ── Clear all demo/operational data ─────────────────────────────────────────
async function clearAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      salary_payments,
      fee_payments,
      expenses,
      donations,
      attendances,
      teacher_attendances,
      homework,
      memorization_sessions,
      schedules,
      teacher_groups,
      group_students,
      groups,
      subjects,
      rooms,
      students,
      teachers,
      guardians
    CASCADE;
  `)
  await db.execute(sql`DELETE FROM users WHERE role IN ('guardian', 'teacher');`)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!await hasPermission(session, 'backup.manage')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action } = await req.json()

  // ── CLEAR ────────────────────────────────────────────────────────────────
  if (action === 'clear') {
    await clearAll()
    return NextResponse.json({ success: true, message: 'تم مسح جميع البيانات بنجاح' })
  }

  // ── SEED DEMO ────────────────────────────────────────────────────────────
  if (action === 'seed') {
    await clearAll()

    // 1. Rooms (5) - bulk insert
    const roomRows = await db.insert(rooms).values(
      roomNames.map((name, i) => ({
        name,
        roomNumber: `R${String(i + 1).padStart(2, '0')}`,
        floor: i < 3 ? 'الطابق الأرضي' : 'الطابق الأول',
        capacity: [30, 25, 20, 35, 28][i],
        status: 'available' as const,
      }))
    ).returning()

    // 2. Subjects (5) - bulk insert
    const subjectRows = await db.insert(subjects).values(
      subjectNames.map((name, i) => ({
        subjectCode: `SBJ${String(i + 1).padStart(2, '0')}`,
        name,
        weeklySessions: randInt(2, 4),
      }))
    ).returning()

    // 3. Groups (6) - bulk insert
    const groupDefs = [
      { name: 'قسم براعم الفردوس (الصغار)',  type: 'براعم' },
      { name: 'قسم الفراشات (تمهيدي أ)',     type: 'تمهيدي' },
      { name: 'قسم العصافير (تمهيدي ب)',     type: 'تمهيدي' },
      { name: 'قسم النجوم (تحضيري أ)',       type: 'تحضيري' },
      { name: 'قسم الزهور (تحضيري ب)',       type: 'تحضيري' },
      { name: 'قسم الأبطال (دوام كامل)',     type: 'شامل' },
    ]
    const groupRows = await db.insert(groups).values(
      groupDefs.map((g, i) => ({
        groupNumber: `GRP${String(i + 1).padStart(2, '0')}`,
        name: g.name,
        groupType: g.type,
        roomId: roomRows[i % roomRows.length]?.id ?? null,
        capacity: randInt(20, 35),
        status: 'open' as const,
      }))
    ).returning()

    // 4. Teachers/Staff (6) + user accounts
    const teacherDefs = [
      { first: 'فاطمة',    last: 'بوزيدي', qualification: 'مربية أطفال معتمدة' },
      { first: 'مريم',     last: 'حداد',   qualification: 'ليسانس علم نفس تربوي' },
      { first: 'أمينة',    last: 'صالح',   qualification: 'مربية تعليم ما قبل التمدرس' },
      { first: 'خديجة',    last: 'بن علي', qualification: 'تقني سامي في تربية الطفولة' },
      { first: 'سارة',     last: 'العمري', qualification: 'ليسانس علوم التربية' },
      { first: 'نورة',     last: 'منصور',  qualification: 'مربية أطفال متخصصة' },
    ]

    const teacherHash = await hashPassword('teacher123')
    const teacherUserRows = await db.insert(users).values(
      teacherDefs.map((t, i) => ({
        username: `teacher${String(i + 1).padStart(2, '0')}`,
        password: teacherHash,
        fullName: `${t.first} ${t.last}`,
        role: 'teacher',
        phone: phone(100 + i),
        status: 'active',
      }))
    ).returning()

    const teacherRows = await db.insert(teachers).values(
      teacherDefs.map((t, i) => ({
        teacherNumber: `TCH${String(i + 1).padStart(2, '0')}`,
        fullName: `${t.first} ${t.last}`,
        qualification: t.qualification,
        phone: phone(100 + i),
        hireDate: randDate(new Date('2020-01-01'), new Date('2023-06-01')),
        baseSalary: String(randInt(25000, 45000)),
        status: 'active',
        userId: teacherUserRows[i].id,
      }))
    ).returning()

    // Link user ↔ teacher
    for (let i = 0; i < teacherRows.length; i++) {
      await db.update(users).set({ teacherId: teacherRows[i].id }).where(eq(users.id, teacherUserRows[i].id))
    }

    // 5. Teacher-Group assignments
    const teacherGroupValues = groupRows.map((grp, i) => {
      const tchr = teacherRows[i % teacherRows.length]
      const subj = subjectRows[i % subjectRows.length]
      return {
        teacherId: tchr.id,
        groupId: grp.id,
        subjectId: subj.id,
      }
    })
    await db.insert(teacherGroups).values(teacherGroupValues)

    // Set primary teacher on groups
    for (let i = 0; i < groupRows.length; i++) {
      const tchr = teacherRows[i % teacherRows.length]
      await db.update(groups).set({ teacherId: tchr.id } as never).where(eq(groups.id, groupRows[i].id)).catch(() => {})
    }

    // 6. Schedules (2 per group)
    const timeSlots = [
      { start: '08:00', end: '09:30' },
      { start: '10:00', end: '11:30' },
    ]
    const scheduleValues: {
      dayOfWeek: string
      startTime: string
      endTime: string
      groupId: number
      subjectId: number
      teacherId: number
      roomId: number | null
    }[] = []

    for (let gIdx = 0; gIdx < groupRows.length; gIdx++) {
      const grp = groupRows[gIdx]
      const teacher = teacherRows[gIdx % teacherRows.length]
      const subject = subjectRows[gIdx % subjectRows.length]
      for (let d = 0; d < 2; d++) {
        const ts = timeSlots[d]
        scheduleValues.push({
          dayOfWeek: dayOfWeeks[d],
          startTime: ts.start,
          endTime: ts.end,
          groupId: grp.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          roomId: grp.roomId ?? null,
        })
      }
    }
    const scheduleRows = await db.insert(schedules).values(scheduleValues).returning()

    // 7. Guardians (40) and Children (40)
    const guardianHash = await hashPassword('123456')
    const guardianDefs: { fullName: string; relation: string; phone: string }[] = []
    const childDefs: { isMale: boolean; first: string; last: string }[] = []

    for (let i = 0; i < 40; i++) {
      const isMale = Math.random() > 0.4
      const first = isMale ? rand(firstNamesMale) : rand(firstNamesFemale)
      const last = rand(lastNames)
      childDefs.push({ isMale, first, last })
      guardianDefs.push({
        fullName: `ولي أمر ${first} ${last}`,
        relation: isMale ? 'أب' : 'أم',
        phone: phone(500 + i),
      })
    }

    const guardianRows = await db.insert(guardians).values(guardianDefs).returning()

    const guardianUserRows = await db.insert(users).values(
      guardianDefs.map((g, i) => ({
        username: `guardian_${String(i + 1).padStart(2, '0')}`,
        password: guardianHash,
        fullName: g.fullName,
        role: 'guardian',
        phone: g.phone,
        status: 'active',
      }))
    ).returning()

    // Insert 40 students
    const studentRows = await db.insert(students).values(
      childDefs.map((c, i) => ({
        studentNumber:    `BR${String(i + 1).padStart(4, '0')}`,
        firstName:        c.first,
        lastName:         c.last,
        gender:           c.isMale ? ('male' as const) : ('female' as const),
        birthDate:        randDate(new Date('2020-01-01'), new Date('2023-06-30')),
        birthPlace:       rand(cities),
        address:          `حي ${rand(['النور','الأمل','الزهور','الفراشات','الفردوس'])} - ${rand(cities)}`,
        phone:            phone(800 + i),
        guardianName:     guardianDefs[i].fullName,
        guardianPhone:    guardianDefs[i].phone,
        guardianId:       guardianRows[i].id,
        guardianUserId:   guardianUserRows[i].id,
        educationalLevel: rand(levels),
        enrollmentDate:   randDate(new Date('2023-09-01'), new Date('2025-03-01')),
        status:           i < 35 ? ('active' as const) : i < 38 ? ('waiting' as const) : ('withdrawn' as const),
        notes:            i % 6 === 0 ? 'طفل متميز ومتفاعل ونشط' : null,
      }))
    ).returning()

    // 8. Assign children to groups - bulk insert
    await db.insert(groupStudents).values(
      studentRows.map((student, i) => ({
        studentId:  student.id,
        groupId:    groupRows[i % groupRows.length].id,
        joinedDate: randDate(new Date('2023-09-01'), new Date('2024-09-01')),
      }))
    )

    // 9. Attendance records (last 20 days for active children) - bulk insert
    const today = new Date()
    const notePool = ['مرض خفيف', 'ظروف عائلية', 'غياب مبرر', null, null]
    const attendanceValues: {
      studentId: number
      attendanceDate: string
      status: 'present' | 'absent' | 'late' | 'excused'
      scheduleId: number | null
      notes: string | null
    }[] = []

    for (let day = 19; day >= 0; day--) {
      const d = new Date(today)
      d.setDate(today.getDate() - day)
      if ([5, 6].includes(d.getDay())) continue
      const dateStr = d.toISOString().split('T')[0]

      for (let sIdx = 0; sIdx < Math.min(30, studentRows.length); sIdx++) {
        const student = studentRows[sIdx]
        const r = Math.random() * 100
        const status = r < 85 ? 'present' : r < 92 ? 'absent' : r < 96 ? 'late' : 'excused'
        const sched = scheduleRows.find(
          s => s.groupId === groupRows[sIdx % groupRows.length]?.id
        )
        attendanceValues.push({
          studentId: student.id,
          attendanceDate: dateStr,
          status,
          scheduleId: sched?.id ?? null,
          notes: status === 'absent' ? rand(notePool) : null,
        })
      }
    }

    if (attendanceValues.length > 0) {
      // Insert in chunks of 200 for clean payload
      for (let i = 0; i < attendanceValues.length; i += 200) {
        await db.insert(attendances).values(attendanceValues.slice(i, i + 200)).catch(() => {})
      }
    }

    // 10. Activity / Growth sessions + Homework
    const surahList = await db.select().from(surahs).limit(20)
    if (surahList.length > 0) {
      const memoValues: {
        studentId: number
        groupId: number | null
        teacherId: number | null
        sessionDate: string
        sessionType: 'new' | 'review' | 'big_review'
        surahId: number
        fromAyah: number
        toAyah: number
        rating: 'excellent' | 'very_good' | 'good' | 'acceptable' | 'weak'
        notes: string | null
      }[] = []

      for (let sIdx = 0; sIdx < Math.min(30, studentRows.length); sIdx++) {
        const student = studentRows[sIdx]
        const gIdx = sIdx % groupRows.length
        const teacher = teacherRows[gIdx % teacherRows.length]
        const group = groupRows[gIdx]
        const studentSurah = surahList[sIdx % surahList.length]

        for (let day = 15; day >= 0; day -= 5) {
          const d = new Date(today)
          d.setDate(today.getDate() - day)
          if ([5, 6].includes(d.getDay())) continue
          memoValues.push({
            studentId:   student.id,
            groupId:     group?.id ?? null,
            teacherId:   teacher?.id ?? null,
            sessionDate: d.toISOString().split('T')[0],
            sessionType: rand(sessionTypes),
            surahId:     studentSurah.id,
            fromAyah:    1,
            toAyah:      Math.min(5, studentSurah.ayahCount),
            rating:      rand(ratings),
            notes:       rand(['متميز ومتفاعل في الأنشطة', 'أداء جيد', 'تطور ملحوظ', null]),
          })
        }
      }

      if (memoValues.length > 0) {
        await db.insert(memorizationSessions).values(memoValues).catch(() => {})
      }

      const hwValues = studentRows.slice(0, 30).map((student, sIdx) => {
        const gIdx = sIdx % groupRows.length
        const teacher = teacherRows[gIdx % teacherRows.length]
        const group = groupRows[gIdx]
        const hwSurah = surahList[(sIdx + 3) % surahList.length]
        return {
          studentId:       student.id,
          groupId:         group?.id ?? null,
          isGroupHomework: false,
          fromSurahId:     hwSurah.id,
          toSurahId:       hwSurah.id,
          notes:           'نشاط تربوي وتلوين مع مراجعة السلوك الإيجابي',
          assignedBy:      teacher?.id ?? null,
        }
      })
      await db.insert(homework).values(hwValues).catch(() => {})
    }

    // 11. Teacher attendance (last 10 days) - bulk insert
    const teacherAttValues: {
      teacherId: number
      attendanceDate: string
      status: 'present' | 'absent' | 'late'
      checkInTime: string | null
      method: string
    }[] = []

    for (const teacher of teacherRows) {
      for (let day = 9; day >= 0; day--) {
        const d = new Date(today)
        d.setDate(today.getDate() - day)
        if ([5, 6].includes(d.getDay())) continue
        const r = Math.random()
        const status = r < 0.88 ? 'present' : r < 0.95 ? 'late' : 'absent'
        teacherAttValues.push({
          teacherId:      teacher.id,
          attendanceDate: d.toISOString().split('T')[0],
          status,
          checkInTime:    status !== 'absent'
            ? `${String(randInt(7, 8)).padStart(2,'0')}:${String(randInt(15,55)).padStart(2,'0')}`
            : null,
          method: 'manual',
        })
      }
    }
    if (teacherAttValues.length > 0) {
      await db.insert(teacherAttendances).values(teacherAttValues).catch(() => {})
    }

    // 12. Fee payments - bulk insert
    const months = ['2024-11','2024-12','2025-01','2025-02','2025-03']
    const feeValues: {
      studentId: number
      amount: string
      paymentDate: string
      forMonth: string
      notes: string | null
    }[] = []

    for (const student of studentRows.slice(0, 32)) {
      for (const month of months) {
        if (Math.random() > 0.3) {
          feeValues.push({
            studentId:   student.id,
            amount:      String(randInt(3500, 6000)),
            paymentDate: `${month}-${String(randInt(1, 10)).padStart(2, '0')}`,
            forMonth:    month,
            notes:       null,
          })
        }
      }
    }
    if (feeValues.length > 0) {
      await db.insert(feePayments).values(feeValues).catch(() => {})
    }

    // 13. Salary payments - bulk insert
    const salaryValues: {
      teacherId: number
      forMonth: string
      baseSalary: string
      bonus: string
      deduction: string
      netSalary: string
      paymentDate: string
    }[] = []

    for (const teacher of teacherRows) {
      for (const month of months) {
        salaryValues.push({
          teacherId:   teacher.id,
          forMonth:    month,
          baseSalary:  teacher.baseSalary ?? '30000',
          bonus:       String(randInt(0, 3000)),
          deduction:   '0',
          netSalary:   String(Number(teacher.baseSalary ?? 30000) + randInt(0, 3000)),
          paymentDate: `${month}-25`,
        })
      }
    }
    if (salaryValues.length > 0) {
      await db.insert(salaryPayments).values(salaryValues).catch(() => {})
    }

    // 14. Expenses & Donations - bulk insert
    const expenseCategories = ['صيانة وتجهيز','ألعاب وأدوات تربوية','تغذية ووجبات خفيفة','نظافة وتعقيم','متفرقات']
    const expenseValues = Array.from({ length: 12 }, () => ({
      category:    rand(expenseCategories),
      amount:      String(randInt(800, 6500)),
      expenseDate: randDate(new Date('2024-11-01'), today),
      notes:       null,
    }))
    await db.insert(expenses).values(expenseValues)

    const donorNames = ['جمعية أصدقاء الطفولة','عائلة بن يوسف','مؤسسة الأمل','فاعل خير','متبرع مجهول']
    const donationValues = Array.from({ length: 6 }, () => ({
      donorName:    rand(donorNames),
      amount:       String(randInt(10000, 45000)),
      donationDate: randDate(new Date('2024-06-01'), today),
      notes:        null,
    }))
    await db.insert(donations).values(donationValues)

    return NextResponse.json({
      success: true,
      message: 'تم استيراد البيانات التجريبية لبراعم الفردوس بنجاح',
      counts: {
        students:  studentRows.length,
        teachers:  teacherRows.length,
        groups:    groupRows.length,
        rooms:     roomRows.length,
        subjects:  subjectRows.length,
        schedules: scheduleRows.length,
      },
    })
  }

  return NextResponse.json({ error: 'action غير معروف' }, { status: 400 })
}

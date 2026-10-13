'use client'
import BarcodeScannerPage from '@/components/barcode-display/BarcodeScannerPage'

// صفحة تحضير الباركود لرياض الأطفال: واجهة التحضير الدائمة
export default function BarcodeAttendancePage() {
  return <BarcodeScannerPage enableIdle={false} />
}

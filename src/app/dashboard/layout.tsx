import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <span className="font-bold">AIシフト自動生成システム</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard/shift-types" className="hover:underline">
            勤務区分
          </Link>
          <Link href="/dashboard/employment-types" className="hover:underline">
            雇用形態
          </Link>
          <Link href="/dashboard/employees" className="hover:underline">
            従業員
          </Link>
          <Link href="/dashboard/leave-requests" className="hover:underline">
            休み希望・NG曜日
          </Link>
          <Link href="/dashboard/staffing-requirements" className="hover:underline">
            必要人数設定
          </Link>
          <Link href="/dashboard/shift" className="hover:underline">
            シフト生成
          </Link>
        </nav>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}

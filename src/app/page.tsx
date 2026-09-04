import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">AIシフト自動生成システム</h1>
      <Link href="/login" className="text-blue-600 underline">
        店長ログインへ
      </Link>
    </main>
  );
}

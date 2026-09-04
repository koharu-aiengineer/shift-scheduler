type SearchParams = {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  writtenValue?: string;
  readBackValue?: string;
  error?: string;
};

export default async function TestSheetsResultPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  if (params.error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-xl font-bold text-red-600">疎通確認 失敗</h1>
        <p className="text-sm text-gray-700">{params.error}</p>
      </main>
    );
  }

  const success =
    params.spreadsheetId &&
    params.writtenValue &&
    params.readBackValue === params.writtenValue;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-bold">
        {success ? "疎通確認 成功 ✅" : "疎通確認 内容不一致 ⚠️"}
      </h1>
      <div className="flex flex-col gap-2 text-sm text-gray-700">
        <p>スプレッドシートID: {params.spreadsheetId}</p>
        <p>
          スプレッドシートURL:{" "}
          <a
            className="text-blue-600 underline"
            href={params.spreadsheetUrl}
            target="_blank"
            rel="noreferrer"
          >
            {params.spreadsheetUrl}
          </a>
        </p>
        <p>書き込んだ値: {params.writtenValue}</p>
        <p>読み取った値: {params.readBackValue}</p>
      </div>
    </main>
  );
}

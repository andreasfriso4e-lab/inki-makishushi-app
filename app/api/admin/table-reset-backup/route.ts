import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildBackupFileName() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const timePart = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
    2,
    "0"
  )}${String(now.getSeconds()).padStart(2, "0")}`;

  return `backup-reset-tavoli-${datePart}-${timePart}.json`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fileName = buildBackupFileName();
    const backupDirectory = path.join(process.cwd(), "backups");
    const filePath = path.join(backupDirectory, fileName);

    await mkdir(backupDirectory, { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify(
        {
          ...body,
          savedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );

    return NextResponse.json({
      ok: true,
      fileName,
      filePath,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Errore creazione backup tavoli",
        createdAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

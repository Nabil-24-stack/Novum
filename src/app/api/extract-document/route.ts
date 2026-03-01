import { NextResponse } from "next/server";

export const maxDuration = 30;

const MAX_TEXT_LENGTH = 100_000; // 100K chars per document

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const documents: { name: string; text: string }[] = [];

    for (const file of files) {
      const name = file.name;
      const ext = name.split(".").pop()?.toLowerCase();

      try {
        if (ext === "pdf") {
          const buffer = Buffer.from(await file.arrayBuffer());
          const { extractText } = await import("unpdf");
          const { text: extracted } = await extractText(new Uint8Array(buffer), { mergePages: true });
          const text = extracted.slice(0, MAX_TEXT_LENGTH);
          documents.push({ name, text });
        } else if (ext === "docx") {
          const buffer = Buffer.from(await file.arrayBuffer());
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer });
          const text = result.value.slice(0, MAX_TEXT_LENGTH);
          documents.push({ name, text });
        } else {
          console.warn(`[extract-document] Unsupported file type: ${ext} for ${name}`);
          documents.push({ name, text: `[Unsupported file type: .${ext}]` });
        }
      } catch (err) {
        console.error(`[extract-document] Failed to extract ${name}:`, err);
        documents.push({ name, text: `[Failed to extract text from ${name}]` });
      }
    }

    return NextResponse.json({ documents });
  } catch (err) {
    console.error("[extract-document] Request failed:", err);
    return NextResponse.json({ error: "Failed to process documents" }, { status: 500 });
  }
}

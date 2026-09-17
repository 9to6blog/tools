import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { jobDir } from '@/lib/storage';
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  if (!/^(original\.png|reference\.png|sheet\.png|frame-\d{1,3}\.png|sprites\.zip|job\.json|(?:sprite|preview)-[1-9]\d{0,3}(?:x[1-9]\d{0,3})?\.png)$/.test(file)) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path.join(jobDir(id), file));
    const headers: Record<string, string> = { 'Content-Type': file.endsWith('.png') ? 'image/png' : file.endsWith('.zip') ? 'application/zip' : 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' };
    if (new URL(request.url).searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="${file}"`;
    return new Response(new Uint8Array(bytes), { headers });
  } catch { return new Response('Not found', { status: 404 }); }
}

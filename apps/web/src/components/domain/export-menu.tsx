'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccess } from '@/lib/session';

type ExportFormat = 'xlsx' | 'docx' | 'csv' | 'tsv';

/** Excel / Word / Google Sheets export for a server-side dataset. */
export function ExportMenu({ dataset, label = 'Xuất dữ liệu', disabled }: { dataset: string; label?: string; disabled?: boolean }) {
  const { can } = useAccess();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const allowed = can('report:export') && !disabled;

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      const response = await fetch(`/api/v1/exports/${dataset}?format=${format}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Không thể xuất dữ liệu');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `ninhvana-${dataset}.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải ${filename}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xuất dữ liệu');
    } finally {
      setBusy(null);
    }
  }

  async function googleSheets() {
    setBusy('tsv');
    const win = window.open('https://sheets.new', '_blank', 'noopener,noreferrer');
    try {
      const response = await fetch(`/api/v1/exports/${dataset}?format=tsv`, { credentials: 'include' });
      if (!response.ok) throw new Error('Không thể chuẩn bị dữ liệu');
      const text = (await response.text()).replace(/^\uFEFF/, '');
      await navigator.clipboard.writeText(text);
      toast.success(win ? 'Đã sao chép dữ liệu — dán vào Google Sheets vừa mở (Ctrl/Cmd+V).' : 'Đã sao chép dữ liệu — mở sheets.new và dán.', { duration: 7000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xuất Google Sheets');
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" disabled={!allowed || busy !== null}>
          <Download /> {busy ? 'Đang xuất…' : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Định dạng</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void download('xlsx')}><FileSpreadsheet /> Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download('docx')}><FileText /> Word (.docx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download('csv')}><Download /> CSV (UTF-8)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void googleSheets()}><Sheet /> Google Sheets (sao chép)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

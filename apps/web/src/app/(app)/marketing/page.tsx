'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderTree, Megaphone, Plus, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { ExportMenu } from '@/components/domain/export-menu';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';

interface MarketingNode {
  id: string; parentId: string | null; title: string; description: string | null;
  status: string; channel: string | null; budget: number | null; notes: string | null;
  children: MarketingNode[];
}
interface Tree { items: MarketingNode[]; roots: MarketingNode[]; total: number }

const STATUS: Record<string, { label: string; tone: 'outline' | 'success' | 'warning' | 'brand' }> = {
  PLANNED: { label: 'Kế hoạch', tone: 'outline' },
  IN_PROGRESS: { label: 'Đang làm', tone: 'brand' },
  DONE: { label: 'Hoàn tất', tone: 'success' },
  PAUSED: { label: 'Tạm dừng', tone: 'warning' },
};

export default function MarketingPage() {
  const { can } = useAccess(); const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; parentId: string | null; parentTitle?: string }>({ open: false, parentId: null });
  const [form, setForm] = useState({ title: '', description: '', status: 'PLANNED', channel: '', budget: '', notes: '' });
  const tree = useQuery<Tree>({ queryKey: ['marketing-tree'], queryFn: () => api('/marketing/tree'), enabled: can('marketing:view') });
  const selected = useMemo(() => tree.data?.items.find((item) => item.id === selectedId) ?? tree.data?.roots[0] ?? null, [tree.data, selectedId]);
  const childCount = (node: MarketingNode | null) => node?.children.length ?? 0;

  const create = useMutation({
    mutationFn: () => api('/marketing/items', { method: 'POST', body: {
      title: form.title,
      description: form.description || undefined,
      status: form.status,
      channel: form.channel || undefined,
      budget: form.budget ? Number(form.budget) : undefined,
      notes: form.notes || undefined,
      parentId: dialog.parentId,
    } }),
    onSuccess: async () => {
      toast.success(dialog.parentId ? 'Đã thêm mục con marketing' : 'Đã thêm mục marketing');
      setDialog({ open: false, parentId: null });
      setForm({ title: '', description: '', status: 'PLANNED', channel: '', budget: '', notes: '' });
      await queryClient.invalidateQueries({ queryKey: ['marketing-tree'] });
    },
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/marketing/items/${selected?.id}`, { method: 'PATCH', body }),
    onSuccess: async () => { toast.success('Đã cập nhật mục marketing'); await queryClient.invalidateQueries({ queryKey: ['marketing-tree'] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/marketing/items/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { toast.success('Đã xoá mục marketing'); setSelectedId(null); await queryClient.invalidateQueries({ queryKey: ['marketing-tree'] }); },
  });

  if (!can('marketing:view')) return <PermissionNotice />;

  const openAdd = (parentId: string | null, parentTitle?: string) => {
    setDialog({ open: true, parentId, parentTitle });
    setForm({ title: '', description: '', status: 'PLANNED', channel: '', budget: '', notes: '' });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Thương mại · Đội Marketing"
        title="Marketing Workspace"
        description="Chiến dịch, nội dung, kênh đối tác và ngân sách — tổ chức thành các mục lớn, thêm mục con chi tiết bằng nút +."
        actions={<><ExportMenu dataset="marketing" label="Xuất marketing" /><Button size="sm" disabled={!can('marketing:manage')} onClick={() => openAdd(null)}><Plus /> Mục lớn</Button></>}
      />
      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit">
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <p className="label-xs flex items-center gap-2"><FolderTree className="size-3.5" /> Danh mục marketing</p>
              <Button size="icon" variant="ghost" aria-label="Thêm mục lớn" disabled={!can('marketing:manage')} onClick={() => openAdd(null)}><Plus /></Button>
            </div>
            <div className="space-y-1">
              {tree.data?.roots.map((root) => (
                <div key={root.id}>
                  <button
                    onClick={() => setSelectedId(root.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${selected?.id === root.id ? 'bg-brand-soft text-brand' : 'hover:bg-muted'}`}
                  >
                    <span className="flex items-center gap-2"><ChevronRight className="size-3" /> {root.title}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{childCount(root)}</span>
                      {can('marketing:manage') ? <span role="button" tabIndex={0} aria-label={`Thêm mục con cho ${root.title}`} onClick={(event) => { event.stopPropagation(); openAdd(root.id, root.title); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); openAdd(root.id, root.title); } }} className="rounded p-0.5 hover:bg-surface"><Plus className="size-3" /></span> : null}
                    </span>
                  </button>
                  <div className="ml-4 border-l border-line pl-2">
                    {root.children.map((child) => (
                      <button key={child.id} onClick={() => setSelectedId(child.id)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] ${selected?.id === child.id ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted'}`}>
                        <span>{child.title}</span><span className="text-[9px]">{STATUS[child.status]?.label ?? child.status}</span>
                      </button>
                    ))}
                    {can('marketing:manage') ? <button onClick={() => openAdd(root.id, root.title)} className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-muted-foreground hover:text-brand"><Plus className="size-3" /> Thêm mục con</button> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
              {tree.data?.total ?? 0} mục · nút <b>+</b> cạnh mục lớn để thêm mục con chi tiết.
            </div>
          </CardContent>
        </Card>

        {selected ? (
          <div className="space-y-3">
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="label-xs flex items-center gap-1.5"><Megaphone className="size-3.5" /> {selected.parentId ? 'Mục con marketing' : 'Mục lớn marketing'}</p>
                    <h2 className="mt-1 font-display text-3xl text-ink">{selected.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{selected.description || 'Chưa có mô tả. Thêm mục con hoặc cập nhật nội dung chi tiết.'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS[selected.status]?.tone ?? 'outline'}>{STATUS[selected.status]?.label ?? selected.status}</Badge>
                    {can('marketing:manage') ? <Button size="sm" variant="secondary" onClick={() => openAdd(selected.id, selected.title)}><Plus /> Mục con</Button> : null}
                    {can('marketing:manage') && selected.children.length === 0 ? <Button size="icon" variant="ghost" aria-label="Xoá mục" onClick={() => remove.mutate(selected.id)}><Trash2 /></Button> : null}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Info label="Kênh" value={selected.channel || '—'} />
                  <Info label="Ngân sách" value={selected.budget ? formatMoney(selected.budget) : '—'} />
                  <Info label="Mục con" value={String(selected.children.length)} />
                </div>
                {can('marketing:manage') ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(STATUS).map(([key, meta]) => <Button key={key} size="sm" variant={selected.status === key ? 'primary' : 'secondary'} onClick={() => update.mutate({ status: key })}>{meta.label}</Button>)}
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
              {selected.children.map((child) => (
                <button key={child.id} onClick={() => setSelectedId(child.id)} className="card-surface p-4 text-left transition hover:border-brand/40">
                  <div className="flex items-center justify-between"><p className="text-sm font-medium text-ink">{child.title}</p><Badge tone={STATUS[child.status]?.tone ?? 'outline'}>{STATUS[child.status]?.label ?? child.status}</Badge></div>
                  <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{child.description || 'Chi tiết marketing'}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{child.channel || 'Chưa chọn kênh'}{child.budget ? ` · ${formatMoney(child.budget)}` : ''}</p>
                </button>
              ))}
              {can('marketing:manage') ? <button onClick={() => openAdd(selected.id, selected.title)} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-xs text-muted-foreground hover:border-brand/50 hover:text-brand"><Plus className="size-5" /> Thêm mục con chi tiết</button> : null}
            </div>
            {selected.notes ? <Card><CardContent className="p-4"><p className="label-xs">Ghi chú</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{selected.notes}</p></CardContent></Card> : null}
          </div>
        ) : <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"><Target className="size-6" />Chưa có mục marketing nào. Nhấn + để tạo mục lớn đầu tiên.</CardContent></Card>}
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ ...dialog, open })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog.parentId ? `Thêm mục con cho “${dialog.parentTitle}”` : 'Thêm mục marketing lớn'}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Tiêu đề</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ví dụ: Ưu đãi cuối năm" autoFocus /></div>
            <div><Label>Mô tả chi tiết</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mục tiêu, đối tượng, thông điệp…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Trạng thái</Label><select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{Object.entries(STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
              <div><Label>Kênh</Label><Input value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} placeholder="Email / OTA / Social" /></div>
            </div>
            <div><Label>Ngân sách (VND)</Label><Input type="number" min="0" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} placeholder="0" /></div>
            <div><Label>Ghi chú</Label><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
          </div>
          <Button className="mt-3 w-full" loading={create.isPending} disabled={form.title.trim().length < 2} onClick={() => create.mutate()}>Lưu mục marketing</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-surface p-3"><p className="label-xs">{label}</p><p className="mt-1 text-sm text-ink">{value}</p></div>;
}

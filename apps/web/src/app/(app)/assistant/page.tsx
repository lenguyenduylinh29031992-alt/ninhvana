'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Answer { answer: string; bullets: string[]; generatedAt: string }
const SUGGESTIONS = ['Tóm tắt tình hình hôm nay', 'Ngân sách tháng này thế nào?', 'Có bao nhiêu ca sắp tới?', 'Sự kiện tiệc sắp tới?'];

export default function AssistantPage() {
  const { can } = useAccess();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const ask = useMutation({
    mutationFn: (value: string) => api<Answer>('/assistant/ask', { method: 'POST', body: { question: value } }),
    onSuccess: (data) => setAnswer(data),
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Trợ lý chưa trả lời được'),
  });
  if (!can('assistant:use')) return <PermissionNotice />;
  const submit = () => { if (question.trim()) ask.mutate(question.trim()); };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Giai đoạn 5 · Trợ lý vận hành" title="Trợ lý AI" description="Hỏi nhanh dữ liệu vận hành: đặt phòng, ca làm, ngân sách và tiệc/sự kiện. Câu trả lời dựa trên dữ liệu thật của cơ sở." actions={<Badge tone="outline"><Bot className="size-3" />Beta</Badge>} />
      <Card><CardContent className="space-y-3 p-4">
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ví dụ: Tóm tắt tình hình hôm nay và cảnh báo việc cần làm..." onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <div className="flex flex-wrap gap-2">{SUGGESTIONS.map((suggestion) => <Button key={suggestion} size="sm" variant="secondary" onClick={() => { setQuestion(suggestion); ask.mutate(suggestion); }}>{suggestion}</Button>)}</div>
        <Button disabled={!question.trim() || ask.isPending} onClick={submit}><Send /> {ask.isPending ? 'Đang phân tích…' : 'Hỏi trợ lý'}</Button>
      </CardContent></Card>
      {answer ? <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="size-4 text-brand" />Trả lời</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-sm leading-relaxed text-ink">{answer.answer}</p><div className="space-y-1">{answer.bullets.map((bullet, index) => <p key={index} className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{bullet}</p>)}</div><p className="text-[10px] text-muted-foreground">Tạo lúc {new Date(answer.generatedAt).toLocaleString('vi-VN')} · Dữ liệu chỉ mang tính tham khảo.</p></CardContent></Card> : <Card><CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center"><Bot className="size-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">Chọn gợi ý hoặc nhập câu hỏi để bắt đầu.</p></CardContent></Card>}
    </div>
  );
}

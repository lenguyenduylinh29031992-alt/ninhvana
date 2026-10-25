import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export function ComingSoon({ title, phase, description, alternative, alternativeHref }: { title: string; phase: string; description: string; alternative?: string; alternativeHref?: string }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="label-xs">Lộ trình phát triển</p>
        <div className="mt-2 flex items-center gap-3"><h1 className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">{title}</h1><Badge tone="warning">{phase}</Badge></div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning"><Clock3 className="size-5" /></span>
        <p className="font-display text-xl text-ink">Mô-đun đang được hoàn thiện</p>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">Phần này chưa được đưa vào bản vận hành hiện tại. Dữ liệu và nghiệp vụ sẽ được bổ sung ở giai đoạn tiếp theo; các phân hệ liên quan bên dưới vẫn dùng được ngay.</p>
        {alternative && alternativeHref ? <Link href={alternativeHref} className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs text-surface">{alternative}<ArrowRight className="size-3.5" /></Link> : null}
      </CardContent></Card>
    </div>
  );
}

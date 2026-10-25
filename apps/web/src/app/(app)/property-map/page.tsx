'use client';

import { useQuery } from '@tanstack/react-query';
import { BedDouble, Building2, DoorOpen, MapPin, UtensilsCrossed, Users, Waves } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { ExportMenu } from '@/components/domain/export-menu';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';

interface Area { id: string; code: string; parentCode: string | null; name: string; kind: string; floorLabel: string | null; description: string | null; roomCount: number; features: Record<string, unknown> | null }
interface Payload { items: Area[]; properties: Array<{ id: string; code: string; name: string }> }

const KIND_ICON: Record<string, typeof Building2> = { BUILDING: Building2, FLOOR: BedDouble, FNB: UtensilsCrossed, POOL: Waves };

export default function PropertyMapPage() {
  const { can } = useAccess();
  const map = useQuery<Payload>({ queryKey: ['property-map'], queryFn: () => api('/property-map'), enabled: can('property:view') });
  if (!can('property:view')) return <PermissionNotice />;
  const items = map.data?.items ?? [];
  const zoneA = items.find((area) => area.code === 'A');
  const floors = items.filter((area) => area.parentCode === 'A').sort((a, b) => a.code.localeCompare(b.code));
  const otherZones = items.filter((area) => !area.parentCode && area.code !== 'A');

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Vận hành · Sơ đồ khu vực" title="Khu vực & mặt bằng" description="NinhVaNa gồm 4 khu A–D. Khu A là nhà chính trung tâm với 3 tầng lưu trú A1, A2, A3." actions={<ExportMenu dataset="property-map" label="Xuất sơ đồ" />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{ label: 'Khu vực', value: 4, icon: MapPin }, { label: 'Tầng khu A', value: floors.length, icon: Building2 }, { label: 'Phòng khu A', value: zoneA?.roomCount ?? 0, icon: BedDouble }, { label: 'Cơ sở', value: map.data?.properties.length ?? 0, icon: DoorOpen }].map((stat) => (
          <Card key={stat.label}><CardContent className="flex items-center justify-between p-4"><div><p className="label-xs">{stat.label}</p><p className="mt-1 font-display text-3xl text-ink">{stat.value}</p></div><stat.icon className="size-5 text-brand" /></CardContent></Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-brand via-info to-brand/20" />
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-full bg-brand-soft font-display text-sm text-brand">A</span><div><h2 className="font-display text-2xl text-ink">Khu A — Nhà chính trung tâm</h2><p className="text-xs text-muted-foreground">Đón khách · lưu trú · hồ bơi & view biển</p></div></div>
              <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{zoneA?.description}</p>
            </div>
            <Badge tone="brand">{zoneA?.roomCount ?? 0} phòng</Badge>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {floors.map((floor) => {
              const features = floor.features ?? {};
              return (
                <div key={floor.id} className="relative overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line bg-muted/40 px-4 py-3"><div><p className="font-display text-lg text-ink">{floor.code}</p><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{floor.floorLabel}</p></div><span className="text-[11px] text-brand">{floor.roomCount} phòng</span></div>
                  <div className="space-y-3 p-4">
                    <p className="min-h-12 text-[11px] leading-relaxed text-muted-foreground">{floor.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(features).map(([key, value]) => (
                        <span key={key} className="rounded-full border border-line bg-muted/60 px-2 py-1 text-[9px] text-muted-foreground">
                          {featureLabel(key)}{typeof value === 'number' ? `: ${value}` : value === true ? '' : `: ${String(value)}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 rounded-xl border border-dashed border-line bg-canvas/60 p-3 text-[10px] text-muted-foreground sm:grid-cols-4">
            <span className="flex items-center gap-1.5"><DoorOpen className="size-3.5 text-brand" /> Trước A1: cổng đón khách</span>
            <span className="flex items-center gap-1.5"><Users className="size-3.5 text-brand" /> A1: lễ tân & 6 dormitory</span>
            <span className="flex items-center gap-1.5"><Waves className="size-3.5 text-brand" /> Sau A1: hồ bơi & view biển</span>
            <span className="flex items-center gap-1.5"><BedDouble className="size-3.5 text-brand" /> A2–A3: dorm, view, family</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {otherZones.sort((a, b) => a.code.localeCompare(b.code)).map((zone) => {
          const Icon = KIND_ICON[zone.kind] ?? Building2;
          return (
            <Card key={zone.id}><CardContent className="p-5">
              <div className="flex items-start justify-between"><span className="flex size-10 items-center justify-center rounded-full bg-brand-soft font-display text-brand">{zone.code}</span><Icon className="size-5 text-brand/70" /></div>
              <h3 className="mt-3 font-display text-xl text-ink">{zone.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{zone.description}</p>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{zone.kind === 'FNB' ? 'Bếp & Bar' : zone.kind === 'POOL' ? 'Hồ bơi' : 'Khu chức năng'}</p>
            </CardContent></Card>
          );
        })}
      </div>
    </div>
  );
}

function featureLabel(key: string) {
  const labels: Record<string, string> = {
    gate: 'Cổng', lobby: 'Lễ tân', pool: 'Hồ bơi', seaView: 'View biển', dormRooms: 'Dormitory',
    reception: 'Lễ tân', viewRooms: 'Phòng view', connectingRooms: 'Connecting', doubleRooms: 'Phòng đôi',
    familyMezzanineRooms: 'Family gác lửng', commonHall: 'Sảnh chung',
  };
  return labels[key] ?? key;
}

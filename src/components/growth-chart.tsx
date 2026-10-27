import { useEffect, useState } from "react";

type Point = { week: string; listings: number; users: number; enquiries: number };

export function GrowthChart({ data }: { data: Point[] }) {
  const [charts, setCharts] = useState<typeof import("recharts") | null>(null);
  useEffect(() => {
    void import("recharts").then(setCharts);
  }, []);
  if (!charts) return <div className="h-64 rounded-3xl bg-brand-soft" />;
  const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } = charts;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <XAxis dataKey="week" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip />
          <Area type="monotone" dataKey="listings" stroke="var(--color-brand)" fill="var(--color-brand-soft)" name="Rooms" />
          <Area type="monotone" dataKey="users" stroke="var(--color-marigold)" fill="var(--color-marigold-soft)" name="People" />
          <Area type="monotone" dataKey="enquiries" stroke="var(--color-ink)" fill="transparent" name="Requests" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

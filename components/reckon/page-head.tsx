import * as React from "react";

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {sub && <p className="mt-1.5 text-[13.5px] text-ink-3">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

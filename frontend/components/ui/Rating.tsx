import { Star } from "lucide-react";

/** Star rating such as "★ 4.97 (88)". Renders nothing when there's no rating. */
export default function Rating({
  value,
  count,
  countLabel,
  className = "",
}: {
  value: number | null | undefined;
  count?: number | null;
  /** Template with {n}, e.g. "({n})" or "{n} reviews". */
  countLabel?: string;
  className?: string;
}) {
  if (value == null) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Star className="h-4 w-4 fill-star text-star" aria-hidden="true" />
      <span className="font-semibold text-ink-900" dir="ltr">{Number(value.toFixed(2)).toString()}</span>
      {count != null && countLabel && <span>{countLabel.replace("{n}", count.toLocaleString())}</span>}
    </span>
  );
}

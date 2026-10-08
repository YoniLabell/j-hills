import {
  Armchair,
  ArrowUpDown,
  Baby,
  Car,
  ChefHat,
  Coffee,
  Flame,
  FlameKindling,
  Snowflake,
  Sparkles,
  Sun,
  Tv,
  WashingMachine,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  snowflake: Snowflake,
  flame: Flame,
  "chef-hat": ChefHat,
  "washing-machine": WashingMachine,
  wind: Wind,
  "arrow-up-down": ArrowUpDown,
  sun: Sun,
  car: Car,
  tv: Tv,
  baby: Baby,
  armchair: Armchair,
  "flame-kindling": FlameKindling,
  coffee: Coffee,
};

export default function AmenityIcon({ icon, className = "h-5 w-5" }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.6} />;
}

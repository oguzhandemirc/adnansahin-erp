import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Simge karesi tonları — index.css `.tile-<ton>` sınıfları (pastel zemin + doygun simge). */
export const ICON_TILE_TONES = ["violet", "blue", "sky", "teal", "green", "amber", "orange", "rose"] as const;
export type IconTileTone = (typeof ICON_TILE_TONES)[number] | "primary";

const SIZES = {
  xs: "h-6 w-6 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5",
  sm: "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4",
  md: "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-12 w-12 rounded-xl [&_svg]:h-6 [&_svg]:w-6",
} as const;

export interface IconTileProps {
  icon: LucideIcon;
  tone?: IconTileTone;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Renkli simge karesi. */
export function IconTile({ icon: Icon, tone = "primary", size = "md", className }: IconTileProps) {
  return (
    <span
      aria-hidden
      data-tone={tone}
      className={cn("icon-tile inline-flex shrink-0 items-center justify-center", `tile-${tone}`, SIZES[size], className)}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

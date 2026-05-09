import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  showCopper?: boolean;
  className?: string;
  title?: string;
}

/**
 * Claude Studio 로고 마크 — Mineral Atelier (simplified).
 *
 * 형태: 두꺼운 C 호 + 코퍼 사각형. (outer ring·측량 tick 없는 깨끗한 버전.)
 * 호는 currentColor를 따라가서 라이트/다크에 자동 적응한다.
 * 코퍼 사각형은 브랜드 고정색(--brand-copper, fallback #5C7C72).
 */
export function Logo({
  size = 32,
  showCopper = true,
  className,
  title = "Claude Studio",
}: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 320 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        d="M 250 82 A 92 92 0 1 0 250 238"
        stroke="currentColor"
        strokeWidth="42"
      />
      {showCopper && (
        <rect
          x="220"
          y="138"
          width="48"
          height="44"
          fill="var(--brand-copper, #5C7C72)"
        />
      )}
    </svg>
  );
}

import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "scan"
  | "history"
  | "user"
  | "package-plus"
  | "package-minus"
  | "shield-check"
  | "wrench"
  | "search"
  | "package"
  | "warehouse"
  | "chevron-right"
  | "chevron-left"
  | "check-circle"
  | "alert-triangle"
  | "x-circle"
  | "clock"
  | "copy"
  | "camera"
  | "flash"
  | "switch-camera"
  | "image"
  | "log-out"
  | "trash"
  | "filter"
  | "refresh"
  | "database"
  | "list-check"
  | "spark"
  | "keyboard"
  | "calendar"
  | "info";

const paths: Record<IconName, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M9.5 21v-6h5v6"],
  scan: [
    "M4 7V5a1 1 0 0 1 1-1h2",
    "M17 4h2a1 1 0 0 1 1 1v2",
    "M20 17v2a1 1 0 0 1-1 1h-2",
    "M7 20H5a1 1 0 0 1-1-1v-2",
    "M7 12h10",
  ],
  history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 7v6l4 2"],
  user: ["M20 21a8 8 0 0 0-16 0", "M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  "package-plus": [
    "M21 8.5 12 3 3 8.5 12 14l9-5.5Z",
    "M3 8.5V16l9 5 9-5V8.5",
    "M12 14v7",
    "M16 11h4",
    "M18 9v4",
  ],
  "package-minus": [
    "M21 8.5 12 3 3 8.5 12 14l9-5.5Z",
    "M3 8.5V16l9 5 9-5V8.5",
    "M12 14v7",
    "M16 11h4",
  ],
  "shield-check": [
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
    "m9 12 2 2 4-5",
  ],
  wrench: [
    "M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-3 3-2-2 3-3Z",
  ],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  package: [
    "M21 8.5 12 3 3 8.5 12 14l9-5.5Z",
    "M3 8.5V16l9 5 9-5V8.5",
    "M12 14v7",
  ],
  warehouse: ["M3 21V8l9-5 9 5v13", "M7 21v-7h10v7", "M9 10h6"],
  "chevron-right": ["m9 18 6-6-6-6"],
  "chevron-left": ["m15 18-6-6 6-6"],
  "check-circle": ["M22 11.1V12a10 10 0 1 1-5.9-9.1", "m9 11 3 3L22 4"],
  "alert-triangle": ["m12 3 10 18H2L12 3Z", "M12 9v4", "M12 17h.01"],
  "x-circle": [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    "m15 9-6 6",
    "m9 9 6 6",
  ],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  copy: [
    "M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z",
    "M4 16H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1",
  ],
  camera: [
    "M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z",
    "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  ],
  flash: ["M13 2 4 14h7l-1 8 9-12h-7l1-8Z"],
  "switch-camera": [
    "M4 7h10a4 4 0 0 1 4 4v1",
    "m15 9 3 3 3-3",
    "M20 17H10a4 4 0 0 1-4-4v-1",
    "m9 15-3-3-3 3",
  ],
  image: ["M4 5h16v14H4z", "m4 15 4-4 4 4 3-3 5 5", "M9 9h.01"],
  "log-out": ["M10 17l5-5-5-5", "M15 12H3", "M21 3v18"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 15h10l1-15", "M10 11v6", "M14 11v6"],
  filter: ["M4 5h16", "M7 12h10", "M10 19h4"],
  refresh: [
    "M21 12a9 9 0 0 1-15.2 6.5",
    "M3 12A9 9 0 0 1 18.2 5.5",
    "M18 3v4h-4",
    "M6 21v-4h4",
  ],
  database: [
    "M12 3c5 0 9 1.8 9 4s-4 4-9 4-9-1.8-9-4 4-4 9-4Z",
    "M3 7v5c0 2.2 4 4 9 4s9-1.8 9-4V7",
    "M3 12v5c0 2.2 4 4 9 4s9-1.8 9-4v-5",
  ],
  "list-check": [
    "m4 6 1.5 1.5L8 5",
    "M11 6h9",
    "m4 12 1.5 1.5L8 11",
    "M11 12h9",
    "m4 18 1.5 1.5L8 17",
    "M11 18h9",
  ],
  spark: [
    "M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z",
    "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  ],
  keyboard: [
    "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
    "M6 10h.01",
    "M10 10h.01",
    "M14 10h.01",
    "M18 10h.01",
    "M7 14h10",
  ],
  calendar: [
    "M4 5h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
    "M16 3v4",
    "M8 3v4",
    "M2 10h20",
  ],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 10v6", "M12 7h.01"],
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  className,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  const iconPaths = paths[name] || paths["alert-triangle"];

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPaths.map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

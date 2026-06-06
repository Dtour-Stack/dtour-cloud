import type { SVGProps } from "react";

/** Dependency-free icon set (lucide-style, 1.75 stroke, currentColor). */
function Icon({ children, size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PanelLeft = (p: { size?: number }) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></Icon>
);
export const PanelRight = (p: { size?: number }) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></Icon>
);
export const LogOut = (p: { size?: number }) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
);
export const X = (p: { size?: number }) => (
  <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>
);
export const Plus = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
);
export const Coins = (p: { size?: number }) => (
  <Icon {...p}><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></Icon>
);
export const Bot = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></Icon>
);
export const Activity = (p: { size?: number }) => (
  <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Icon>
);
export const Brain = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" /><path d="M17.599 6.5A3 3 0 0 0 20 9v1" /><path d="M6.401 6.5A3 3 0 0 1 4 9v1" /></Icon>
);
export const Globe = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></Icon>
);
export const ArrowUpRight = (p: { size?: number }) => (
  <Icon {...p}><path d="M7 7h10v10" /><path d="M7 17 17 7" /></Icon>
);
export const ArrowLeft = (p: { size?: number }) => (
  <Icon {...p}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Icon>
);
export const ChevronDown = (p: { size?: number }) => (
  <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
);
export const Check = (p: { size?: number }) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const Settings = (p: { size?: number }) => (
  <Icon {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Icon>
);
export const Megaphone = (p: { size?: number }) => (
  <Icon {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></Icon>
);
export const List = (p: { size?: number }) => (
  <Icon {...p}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></Icon>
);
export const ArrowUp = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Icon>
);
export const ArrowDown = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Icon>
);
export const Paperclip = (p: { size?: number }) => (
  <Icon {...p}><path d="M13.234 20.252 21 12.3a4 4 0 0 0-5.657-5.657l-8.485 8.485a6 6 0 0 0 8.485 8.485l6.5-6.5" /></Icon>
);
export const Image = (p: { size?: number }) => (
  <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></Icon>
);
export const BookOpen = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></Icon>
);
export const Sparkles = (p: { size?: number }) => (
  <Icon {...p}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></Icon>
);
export const Mic = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></Icon>
);
export const Search = (p: { size?: number }) => (
  <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>
);
export const SquarePen = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></Icon>
);
export const Palette = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></Icon>
);
export const LayoutGrid = (p: { size?: number }) => (
  <Icon {...p}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></Icon>
);
export const Wand = (p: { size?: number }) => (
  <Icon {...p}><path d="m3 21 9-9" /><path d="M15 4V2" /><path d="M15 10V8" /><path d="M12.5 6.5h-2" /><path d="M19.5 6.5h-2" /><path d="m17 9 1.5 1.5" /><path d="M17 4 18.5 2.5" /><path d="m13 8 1-1" /></Icon>
);
export const MousePointer = (p: { size?: number }) => (
  <Icon {...p}><path d="M12.586 12.586 19 19" /><path d="M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z" /></Icon>
);
export const Frame = (p: { size?: number }) => (
  <Icon {...p}><path d="M22 6H2" /><path d="M22 18H2" /><path d="M6 2v20" /><path d="M18 2v20" /></Icon>
);
export const Square = (p: { size?: number }) => (
  <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" /></Icon>
);
export const Circle = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /></Icon>
);
export const Type = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 4v16" /><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /><path d="M9 20h6" /></Icon>
);
export const Play = (p: { size?: number }) => (
  <Icon {...p}><path d="M6 3.5v17a1 1 0 0 0 1.5.87l13-8.5a1 1 0 0 0 0-1.74l-13-8.5A1 1 0 0 0 6 3.5z" /></Icon>
);
export const Wallet = (p: { size?: number }) => (
  <Icon {...p}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></Icon>
);
export const Zap = (p: { size?: number }) => (
  <Icon {...p}><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></Icon>
);
export const Plug = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></Icon>
);
export const Copy = (p: { size?: number }) => (
  <Icon {...p}><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>
);
export const Home = (p: { size?: number }) => (
  <Icon {...p}><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" /></Icon>
);
export const Shield = (p: { size?: number }) => (
  <Icon {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" /></Icon>
);
export const Trash = (p: { size?: number }) => (
  <Icon {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>
);
export const User = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
);
export const Flag = (p: { size?: number }) => (
  <Icon {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22V4" /></Icon>
);

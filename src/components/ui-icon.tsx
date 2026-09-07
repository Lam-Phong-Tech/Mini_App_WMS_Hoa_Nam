import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  Clock3,
  Construction,
  FileText,
  FolderOpen,
  Hammer,
  House,
  ImageOff,
  Info,
  LayoutGrid,
  Layers3,
  MessageCircle,
  Package,
  PackageX,
  PhoneCall,
  Phone,
  Ruler,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  WifiOff,
  Wrench,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

const ICONS = {
  alert: TriangleAlert,
  arrowLeft: ArrowLeft,
  arrowUpRight: ArrowUpRight,
  check: Check,
  checkCircle: CircleCheck,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  clock: Clock3,
  construction: Construction,
  fileText: FileText,
  folder: FolderOpen,
  grid: LayoutGrid,
  hammer: Hammer,
  home: House,
  imageOff: ImageOff,
  info: Info,
  layers: Layers3,
  message: MessageCircle,
  package: Package,
  packageX: PackageX,
  phone: Phone,
  phoneCall: PhoneCall,
  play: CirclePlay,
  ruler: Ruler,
  search: Search,
  share: Share2,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  wifiOff: WifiOff,
  wrench: Wrench,
  zap: Zap,
} as const satisfies Record<string, LucideIcon>;

export type UiIconName = keyof typeof ICONS;

interface UiIconProps extends LucideProps {
  name: UiIconName;
}

/** The only visual icon set used by the Mini App: Lucide line icons. */
export const UiIcon = ({ name, size = 24, strokeWidth = 1.9, ...props }: UiIconProps) => {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" size={size} strokeWidth={strokeWidth} {...props} />;
};

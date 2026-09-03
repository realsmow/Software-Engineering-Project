import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  Building2,
  CheckCircle,
  CheckSquare,
  Clock,
  DoorOpen,
  Download,
  File,
  FilePlus2,
  FileText,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Server,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  UserX,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the string icon names used in NAV_CONFIG (from the reference HTML)
 * to lucide-react components. Keeps navigation.ts free of JSX.
 */
const NAV_ICON: Record<string, LucideIcon> = {
  home: Home,
  "layout-dashboard": LayoutDashboard,
  grid: LayoutGrid,
  building: Building2,
  "door-open": DoorOpen,
  file: File,
  "file-plus": FilePlus2,
  clock: Clock,
  award: Award,
  shield: Shield,
  inbox: Inbox,
  package: Package,
  "check-square": CheckSquare,
  "check-circle": CheckCircle,
  users: Users,
  "user-x": UserX,
  sliders: SlidersHorizontal,
  "trending-up": TrendingUp,
  download: Download,
  activity: Activity,
  "file-text": FileText,
  server: Server,
  "bar-chart": BarChart3,
  bell: Bell,
  // Used by the notification bell rather than by NAV_CONFIG: a rejection and
  // a credit deduction need to read as bad news at a glance, and every icon
  // above is either neutral or positive.
  "x-circle": XCircle,
  "alert-triangle": AlertTriangle,
};

export function NavIcon({ name, size = 15 }: { name: string; size?: number }) {
  const Icon = NAV_ICON[name] ?? File;
  return <Icon size={size} strokeWidth={2} />;
}

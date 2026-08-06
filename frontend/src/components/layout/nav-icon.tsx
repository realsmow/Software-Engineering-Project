import {
  Activity,
  Award,
  BarChart3,
  Bell,
  CheckCircle,
  CheckSquare,
  Clock,
  Download,
  File,
  FileText,
  Home,
  Inbox,
  LayoutGrid,
  Package,
  Server,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the string icon names used in NAV_CONFIG (from the reference HTML)
 * to lucide-react components. Keeps navigation.ts free of JSX.
 */
const NAV_ICON: Record<string, LucideIcon> = {
  home: Home,
  grid: LayoutGrid,
  file: File,
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
};

export function NavIcon({ name, size = 15 }: { name: string; size?: number }) {
  const Icon = NAV_ICON[name] ?? File;
  return <Icon size={size} strokeWidth={2} />;
}

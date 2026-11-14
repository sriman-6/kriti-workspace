import {
  LayoutDashboard,
  ListTodo,
  Layers,
  Users,
  CalendarDays,
  MessagesSquare,
  Lightbulb,
} from 'lucide-react';
export const WORKSPACE_NAV = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Work', href: '/work', icon: ListTodo },
  { label: 'Programmes', href: '/programmes', icon: Layers },
  { label: 'People', href: '/people', icon: Users },
  { label: 'Meetings', href: '/meetings', icon: CalendarDays },
  { label: 'Ideas', href: '/ideas', icon: Lightbulb },
  { label: 'Groups', href: '/groups', icon: MessagesSquare },
];

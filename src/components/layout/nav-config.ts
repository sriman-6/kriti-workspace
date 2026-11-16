import {
  LayoutDashboard,
  ListTodo,
  Layers,
  Users,
  CalendarDays,
  MessagesSquare,
} from 'lucide-react';
export const WORKSPACE_NAV = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Master Tracker', href: '/programmes', icon: Layers },
  { label: 'My Work', href: '/work', icon: ListTodo },
  { label: 'People', href: '/people', icon: Users },
  { label: 'Meetings', href: '/meetings', icon: CalendarDays },
  { label: 'Groups', href: '/groups', icon: MessagesSquare },
];

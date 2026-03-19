import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, BarChart3, Network, Upload, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { NavLink } from "@/components/NavLink";

interface AppSidebarProps {
  onUploadClick: () => void;
}

const navItems = [
  { title: "Chat", path: "/", icon: MessageSquare },
  { title: "Insights", path: "/insights", icon: BarChart3 },
  { title: "Network", path: "/network", icon: Network },
];

export function AppSidebar({ onUploadClick }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2 }}
      className="h-screen flex flex-col border-r border-border bg-sidebar"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <Shield className="h-6 w-6 text-primary shrink-0" />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm font-semibold text-foreground whitespace-nowrap"
            >
              AI Forensic Assistant
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm"
            activeClassName="bg-sidebar-accent text-primary font-medium"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Upload button */}
      <div className="px-2 pb-2">
        <button
          onClick={onUploadClick}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm"
        >
          <Upload className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Upload Files</span>}
        </button>
      </div>

      {/* Collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </motion.aside>
  );
}

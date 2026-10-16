"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GraduationCap, LayoutDashboard, Layers3, LogOut, Menu, MessageSquareText, Settings2, ShieldCheck, UsersRound, X } from "lucide-react";
import { Avatar, Badge } from "@/app/components/ui";

type User = { name: string; role: "HOD" | "TEACHER"; section?: string; testMode: boolean };
type NavigationItem = { label: string; href: string };
const iconMap = { Dashboard: LayoutDashboard, Sections: Layers3, Students: GraduationCap, Teachers: UsersRound, Messages: MessageSquareText, Settings: Settings2, "My Class": GraduationCap };

export function Sidebar({ nav, path, user, open, onNavigate, onLogout }: { nav: NavigationItem[]; path: string; user: User | null; open: boolean; onNavigate: () => void; onLogout: () => void }) {
  const brandHref = user?.role === "TEACHER" ? "/my-class" : "/dashboard";
  return <>
    <button className={`sidebar-backdrop ${open ? "is-visible" : ""}`} aria-label="Close navigation" tabIndex={open ? 0 : -1} onClick={onNavigate} />
    <aside id="primary-navigation" className={`app-sidebar ${open ? "is-open" : ""}`} aria-label="Main navigation">
      <Link href={brandHref} className="brand-lockup" onClick={onNavigate}><span className="brand-mark"><Image src="/smart-attendance-mark.png" width={40} height={40} alt="" priority /></span><span><b>Smart Attendance</b><small>PORTAL</small></span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="sidebar-nav">{nav.map(({ label, href }) => {
        const Icon = iconMap[label as keyof typeof iconMap];
        const active = path === href || href !== "/dashboard" && path.startsWith(`${href}/`);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={onNavigate} className={`sidebar-link ${active ? "active" : ""}`}><Icon size={18} aria-hidden="true" /><span>{label}</span>{active && <span className="nav-active-dot" aria-hidden="true" />}</Link>;
      })}</nav>
      <div className="sidebar-bottom"><div className="security-note"><span><ShieldCheck size={17} aria-hidden="true" /></span><div><b>Private workspace</b><small>Student data stays protected</small></div></div>
        <div className="profile-card"><Avatar name={user?.name ?? "Loading account"} className="profile-avatar" /><div className="profile-info"><b>{user?.name ?? "Loading account…"}</b><small>{user?.role === "HOD" ? "Head of Department" : "Class Teacher"}{user?.section ? ` · ${user.section}` : ""}</small></div><button type="button" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={17} aria-hidden="true" /></button></div>
      </div>
    </aside>
  </>;
}

export function TopBar({ title, testMode, menuOpen, onOpenMenu, onLogout }: { title: string; testMode: boolean; menuOpen: boolean; onOpenMenu: () => void; onLogout: () => void }) {
  return <header className="topbar"><button type="button" className="mobile-menu-button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={onOpenMenu}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><div className="mobile-brand"><span className="brand-mark"><Image src="/smart-attendance-mark.png" width={31} height={31} alt="" /></span><b>Smart Attendance</b></div><div className="topbar-title"><span>Workspace</span><b>{title}</b></div><div className="topbar-actions">{testMode && <Badge tone="danger" dot className="test-mode-badge">TEST MODE ON</Badge>}<span className="topbar-date">Smart attendance · parent follow-up</span><button className="mobile-logout" type="button" onClick={onLogout} aria-label="Sign out"><LogOut size={17} /></button></div></header>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const isLoginPage = path === "/login";
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isLoginPage) return;
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => {
      if (!controller.signal.aborted) {
        if (!data) router.replace("/login");
        else setUser(data);
      }
    }).catch(() => { if (!controller.signal.aborted) router.replace("/login"); });
    return () => controller.abort();
  }, [isLoginPage, router]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeAfterNavigation = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(closeAfterNavigation);
  }, [path, menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [menuOpen]);

  if (path === "/login") return <>{children}</>;
  const nav: NavigationItem[] = user?.role === "HOD"
    ? [{ label: "Dashboard", href: "/dashboard" }, { label: "Sections", href: "/sections" }, { label: "Students", href: "/students" }, { label: "Teachers", href: "/teachers" }, { label: "Messages", href: "/messages" }, { label: "Settings", href: "/settings" }]
    : [{ label: "My Class", href: "/my-class" }, { label: "Messages", href: "/messages" }, { label: "Settings", href: "/settings" }];
  const title = nav.find(item => item.href === path)?.label ?? nav.find(item => path.startsWith(`${item.href}/`))?.label ?? "Smart Attendance";
  async function logout() { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { setMenuOpen(false); router.replace("/login"); } }

  return <div className="app-frame"><Sidebar nav={nav} path={path} user={user} open={menuOpen} onNavigate={() => setMenuOpen(false)} onLogout={() => void logout()} /><div className="app-content"><TopBar title={title} testMode={user?.testMode ?? false} menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(open => !open)} onLogout={() => void logout()} /><main className="app-main">{children}</main></div></div>;
}

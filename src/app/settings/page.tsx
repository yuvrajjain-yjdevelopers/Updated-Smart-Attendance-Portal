import SettingsClient from "./settings-client";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function SettingsPage() { const user = await currentUser(); if (!user) redirect("/login"); return <SettingsClient name={user.name} role={user.role} mobile={user.mobile ?? ""} />; }

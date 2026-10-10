"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

export function PageHeader({ eyebrow, title, subtitle, actions, className = "" }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={`ui-page-header ${className}`}><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle && <p className="ui-page-subtitle">{subtitle}</p>}</div>{actions && <div className="ui-page-actions">{actions}</div>}</header>;
}

export function Card({ children, title, description, icon, actions, accent = "teal", className = "" }: { children: ReactNode; title?: ReactNode; description?: ReactNode; icon?: ReactNode; actions?: ReactNode; accent?: "teal" | "rose" | "blue" | "amber"; className?: string }) {
  return <section className={`ui-card accent-${accent} ${className}`}><span className="ui-card-orb" aria-hidden="true" />{(title || description || icon || actions) && <div className="ui-card-heading">{icon && <IconChip icon={icon} tone={accent === "rose" ? "danger" : accent === "blue" ? "info" : accent === "amber" ? "warning" : "brand"} />}<div className="ui-card-heading-copy">{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions && <div className="ui-card-heading-actions">{actions}</div>}</div>}<div className="ui-card-content">{children}</div></section>;
}

export function IconChip({ icon, tone = "brand", children, className = "" }: { icon?: ReactNode; tone?: Tone; children?: ReactNode; className?: string }) {
  return <span className={`ui-icon-chip tone-${tone} ${className}`} aria-hidden={!children && !icon}>{icon ?? children}</span>;
}

export function StatCard({ label, value, note, icon, accent = "teal" }: { label: string; value: ReactNode; note?: ReactNode; icon: ReactNode; accent?: "teal" | "rose" | "blue" | "amber" }) {
  return <article className={`metric-card ${accent}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><b className="metric-value">{value}</b>{note && <small>{note}</small>}</article>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { href?: string; variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg" };
export function Button({ href, variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  const classes = `ui-button variant-${variant} size-${size} ${className}`;
  if (href) return <Link href={href} className={classes} aria-disabled={props.disabled || undefined} tabIndex={props.disabled ? -1 : undefined}>{children}</Link>;
  return <button {...props} className={classes}>{children}</button>;
}

export function Badge({ children, tone = "neutral", dot = false, className = "" }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return <span className={`ui-badge tone-${tone} ${className}`}>{dot && <i aria-hidden="true" />}{children}</span>;
}

export function Avatar({ name, size = "md", className = "" }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
  return <span className={`ui-avatar size-${size} ${className}`} aria-label={name} title={name}>{initials}</span>;
}

type FieldProps = { label: string; hint?: string; error?: string; className?: string };
export function Input({ label, hint, error, className = "", id, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generatedId = useId(); const inputId = id ?? generatedId;
  return <label className={`ui-field ${className}`} htmlFor={inputId}><span>{label}</span><input {...props} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined} />{error ? <small className="field-error" id={`${inputId}-error`}>{error}</small> : hint ? <small id={`${inputId}-hint`}>{hint}</small> : null}</label>;
}

export function Select({ label, hint, error, className = "", id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const generatedId = useId(); const inputId = id ?? generatedId;
  return <label className={`ui-field ${className}`} htmlFor={inputId}><span>{label}</span><select {...props} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}>{children}</select>{error ? <small className="field-error" id={`${inputId}-error`}>{error}</small> : hint ? <small id={`${inputId}-hint`}>{hint}</small> : null}</label>;
}

export function Checkbox({ label, description, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string; className?: string }) {
  return <label className={`ui-check ${className}`}><input {...props} type="checkbox" /><span><b>{label}</b>{description && <small>{description}</small>}</span></label>;
}

export function Switch({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <label className={`ui-switch ${disabled ? "is-disabled" : ""}`} htmlFor={id}><span className="ui-switch-copy"><b>{label}</b>{description && <small>{description}</small>}</span><input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

export function Chip({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`ui-chip tone-${tone} ${className}`}>{children}</span>;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="ui-empty-state"><span className="ui-empty-icon" aria-hidden="true">{icon ?? <svg viewBox="0 0 48 48" fill="none"><rect x="7" y="9" width="34" height="30" rx="8" stroke="currentColor" strokeWidth="2"/><path d="M15 19h18M15 25h13M15 31h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}</span><h3>{title}</h3>{description && <p>{description}</p>}{action && <div>{action}</div>}</div>;
}

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return <div className={`ui-skeleton ${className}`} aria-label="Loading" role="status">{Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: index === lines - 1 ? "62%" : "100%" }} />)}</div>;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return <ol className="ui-stepper" aria-label="Progress">{steps.map((step, index) => <li key={step} className={index < current ? "is-complete" : index === current ? "is-current" : ""} aria-current={index === current ? "step" : undefined}><span>{index < current ? "✓" : String(index + 1).padStart(2, "0")}</span><b>{step}</b></li>)}</ol>;
}

export function ProgressBar({ value, max = 100, label, tone = "brand" }: { value: number; max?: number; label?: string; tone?: Tone }) {
  const percent = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return <div className={`ui-progress tone-${tone}`}><div className="ui-progress-track" role="progressbar" aria-label={label ?? "Progress"} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(max, Math.max(0, value))}><span style={{ width: `${percent}%` }} /></div>{label && <span>{label}</span>}</div>;
}

export function ProgressRing({ value, max = 100, label, size = 56 }: { value: number; max?: number; label?: string; size?: number }) {
  const radius = 21; const circumference = 2 * Math.PI * radius; const percent = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return <span className="ui-progress-ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(percent)}% complete`}><svg viewBox="0 0 48 48"><circle className="ring-track" cx="24" cy="24" r={radius} /><circle className="ring-value" cx="24" cy="24" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} /></svg><b>{Math.round(percent)}%</b></span>;
}

export function Tabs({ items, value, onChange, ariaLabel = "Tabs", pill = false }: { items: { value: string; label: ReactNode; count?: ReactNode }[]; value: string; onChange: (value: string) => void; ariaLabel?: string; pill?: boolean }) {
  return <div className={`ui-tabs ${pill ? "is-pill" : ""}`} role="tablist" aria-label={ariaLabel}>{items.map(item => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>;
}

export type DataColumn<Row> = { key: string; header: ReactNode; render: (row: Row) => ReactNode; className?: string };
export function DataTable<Row>({ rows, columns, rowKey, empty, loading = false, pageSize = 10, selectable = false, selectedKeys = [], onSelectionChange }: { rows: Row[]; columns: DataColumn<Row>[]; rowKey: (row: Row) => string; empty?: ReactNode; loading?: boolean; pageSize?: number; selectable?: boolean; selectedKeys?: string[]; onSelectionChange?: (keys: string[]) => void }) {
  const [page, setPage] = useState(0); const pageCount = Math.max(1, Math.ceil(rows.length / pageSize)); const visible = useMemo(() => rows.slice(page * pageSize, (page + 1) * pageSize), [rows, page, pageSize]);
  const pageKeys = visible.map(rowKey); const allSelected = pageKeys.length > 0 && pageKeys.every(key => selectedKeys.includes(key));
  function selectPage(checked: boolean) { if (!onSelectionChange) return; const rest = selectedKeys.filter(key => !pageKeys.includes(key)); onSelectionChange(checked ? [...rest, ...pageKeys] : rest); }
  return <div className="ui-table-card"><div className="ui-table-scroll"><table className="ui-data-table"><thead><tr>{selectable && <th className="selection-cell"><input aria-label="Select all rows on this page" type="checkbox" checked={allSelected} onChange={event => selectPage(event.target.checked)} /></th>}{columns.map(column => <th key={column.key} className={column.className}>{column.header}</th>)}</tr></thead><tbody>{loading ? Array.from({ length: Math.min(pageSize, 5) }, (_, row) => <tr key={`loading-${row}`}><td colSpan={columns.length + (selectable ? 1 : 0)}><Skeleton lines={1} /></td></tr>) : visible.map(item => <tr key={rowKey(item)}>{selectable && <td className="selection-cell"><input aria-label={`Select row ${rowKey(item)}`} type="checkbox" checked={selectedKeys.includes(rowKey(item))} onChange={event => onSelectionChange?.(event.target.checked ? [...selectedKeys, rowKey(item)] : selectedKeys.filter(key => key !== rowKey(item)))} /></td>}{columns.map(column => <td key={column.key} className={column.className}>{column.render(item)}</td>)}</tr>)}</tbody></table>{!loading && rows.length === 0 && <div className="ui-table-empty">{empty ?? <EmptyState title="No records yet" description="New records will appear here." />}</div>}</div>{rows.length > pageSize && <div className="ui-table-pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}</span><div><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div></div>}</div>;
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  useEffect(() => { if (!open) return; const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [open, onClose]);
  if (!open) return null;
  return <div className="ui-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className={`ui-modal size-${size}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header><div className="ui-modal-content">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmationText, confirmLabel = "Confirm", danger = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmationText?: string; confirmLabel?: string; danger?: boolean }) {
  const [typed, setTyped] = useState(""); const allowed = !confirmationText || typed === confirmationText;
  const close = () => { setTyped(""); onClose(); };
  const confirm = () => { if (!allowed) return; setTyped(""); onConfirm(); };
  return <Modal open={open} onClose={close} title={title} footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant={danger ? "danger" : "primary"} disabled={!allowed} onClick={confirm}>{confirmLabel}</Button></>}><div className="ui-confirm-copy">{description && <p>{description}</p>}{confirmationText && <Input label={`Type ${confirmationText} to continue`} value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" />}</div></Modal>;
}

export function Toast({ children, tone = "info", onDismiss }: { children: ReactNode; tone?: Tone; onDismiss?: () => void }) {
  return <div className={`ui-toast tone-${tone}`} role={tone === "danger" ? "alert" : "status"}><span>{children}</span>{onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>}</div>;
}

"use client";
import { useState, type ReactNode } from "react";
export default function SectionTabs({students,messaging}: {students:ReactNode;messaging:ReactNode}){const [tab,setTab]=useState<"students"|"messages">("students");return <><div className="flex gap-2 border-b">{(["students","messages"] as const).map(value=><button key={value} onClick={()=>setTab(value)} className={`px-4 py-2 capitalize ${tab===value?"border-b-2 border-indigo-600 font-semibold text-indigo-700":"text-slate-600"}`}>{value}</button>)}</div>{tab==="students"?students:messaging}</>}

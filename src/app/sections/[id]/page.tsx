import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect,notFound } from "next/navigation";
import ClassMessaging from "@/app/components/class-messaging";
import DetentionUploader from "@/app/components/detention-uploader";
import SectionStudents from "@/app/components/section-students";
import SectionTabs from "@/app/components/section-tabs";
import Link from "next/link";
export const dynamic="force-dynamic";
export default async function SectionPage({params}:{params:Promise<{id:string}>}){const user=await currentUser();if(!user)redirect("/login");if(user.role!=="HOD")redirect("/my-class");const {id}=await params;const section=await db.section.findUnique({where:{id},include:{students:{where:{isDetained:true},orderBy:{avgAtt:"asc"}},uploads:{orderBy:{uptoDate:"desc"},take:1}}});if(!section)notFound();return <main className="space-y-6 p-8"><div><Link href="/sections" className="text-sm text-indigo-700 underline">← Sections</Link><h1 className="mt-2 text-3xl font-bold">Section {section.name}</h1><p className="mt-2 text-slate-600">Data as of {section.uploads[0]?.uptoDate.toLocaleDateString("en-GB")??"no applied list"}</p></div><DetentionUploader sectionId={section.id} sectionName={section.name}/><SectionTabs students={<SectionStudents sectionId={section.id}/>} messaging={<section><h2 className="text-xl font-semibold">Detained students · {section.students.length}</h2><ClassMessaging students={section.students} senderName={user.name} canSend/></section>}/></main>}

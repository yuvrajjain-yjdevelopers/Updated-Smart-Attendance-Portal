import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,{params}:Context){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id}=await params;const parsed=z.object({status:z.enum(["SENT","SKIPPED"])}).safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid message status"},{status:400});const log=await db.messageLog.findUnique({where:{id},select:{id:true,sentById:true}});if(!log)return NextResponse.json({error:"Message not found"},{status:404});if(user.role!=="HOD"&&log.sentById!==user.id)return NextResponse.json({error:"Forbidden"},{status:403});await db.messageLog.update({where:{id},data:{status:parsed.data.status}});return NextResponse.json({ok:true,status:parsed.data.status});}

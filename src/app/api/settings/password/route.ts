import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export async function PUT(request:Request){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const parsed=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(12).max(128)}).safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Enter your current password and a new password of at least 12 characters"},{status:400});if(!await bcrypt.compare(parsed.data.currentPassword,user.passwordHash))return NextResponse.json({error:"Current password is incorrect"},{status:403});await db.user.update({where:{id:user.id},data:{passwordHash:await bcrypt.hash(parsed.data.newPassword,12)}});return NextResponse.json({ok:true});}

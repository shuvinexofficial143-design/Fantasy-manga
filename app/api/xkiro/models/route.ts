import {NextResponse} from "next/server";
import {listXkiroModels} from "@/lib/xkiro";

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const modality=url.searchParams.get("modality")||"chat";
    const models=await listXkiroModels(modality);
    return NextResponse.json({models});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"xKiro model catalog failed."},{status:502});
  }
}

import {NextResponse} from "next/server";
import {imageProviderConfigured} from "@/lib/image-providers";
export async function GET(){
  return NextResponse.json({configured:{sensenova:imageProviderConfigured("sensenova"),gemini:imageProviderConfigured("gemini"),xkiro:imageProviderConfigured("xkiro")}}, {headers:{"Cache-Control":"no-store"}});
}

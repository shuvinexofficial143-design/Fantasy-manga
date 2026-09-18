import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import {NextResponse} from "next/server";

export const runtime="nodejs";

type SourceLock={locked?:boolean;sourceOrigin?:string;nextChapterUrl?:string;chapterUrlTemplate?:string};
type Body={novelTitle?:unknown;chapterNumber?:unknown;chapterUrl?:unknown;source?:unknown};

const MAX_HTML_BYTES=4_000_000;
const USER_AGENT="FantasyCinematicStudio/1.0 (+chapter-import; respects source access controls)";

function stringValue(value:unknown){return typeof value==="string"?value.trim():""}

function privateIpv4(ip:string){
  const parts=ip.split(".").map(Number);
  if(parts.length!==4||parts.some((part)=>!Number.isFinite(part)))return false;
  return parts[0]===10||parts[0]===127||parts[0]===0||(parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168);
}
function privateIp(ip:string){
  if(isIP(ip)===4)return privateIpv4(ip);
  if(isIP(ip)===6){const value=ip.toLowerCase();return value==="::1"||value==="::"||value.startsWith("fc")||value.startsWith("fd")||value.startsWith("fe80:")}
  return false;
}

async function validatePublicUrl(value:string,lockedOrigin?:string){
  let url:URL;
  try{url=new URL(value)}catch{throw new Error("Invalid chapter URL.")}
  if(!["http:","https:"].includes(url.protocol))throw new Error("Only http/https chapter URLs are supported.");
  if(url.username||url.password)throw new Error("URLs with embedded credentials are not supported.");
  const hostname=url.hostname.toLowerCase();
  if(hostname==="localhost"||hostname.endsWith(".local")||privateIp(hostname))throw new Error("Private/local network URLs are blocked.");
  if(lockedOrigin&&url.origin!==lockedOrigin)throw new Error("Source is locked to "+lockedOrigin+". This chapter points to a different website.");
  const addresses=await lookup(hostname,{all:true,verbatim:true}).catch(()=>[]);
  if(!addresses.length)throw new Error("Could not resolve the chapter website.");
  if(addresses.some((item)=>privateIp(item.address)))throw new Error("Chapter URL resolves to a private/local network address.");
  return url;
}

async function fetchPublicHtml(initial:string,lockedOrigin?:string){
  let url=await validatePublicUrl(initial,lockedOrigin);
  for(let redirectCount=0;redirectCount<5;redirectCount+=1){
    const response=await fetch(url,{method:"GET",redirect:"manual",headers:{"User-Agent":USER_AGENT,Accept:"text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.2"},cache:"no-store"});
    if(response.status>=300&&response.status<400){
      const location=response.headers.get("location");
      if(!location)throw Object.assign(new Error("Website returned redirect "+response.status+" without a destination."),{statusCode:response.status,attemptedUrl:url.toString()});
      url=await validatePublicUrl(new URL(location,url).toString(),lockedOrigin);
      continue;
    }
    if(!response.ok){
      const message=response.status===401||response.status===403?"Website denied access. Login/paywall/anti-bot protection is not bypassed.":response.status===404?"Chapter page was not found (404).":"Website returned HTTP "+response.status+".";
      throw Object.assign(new Error(message),{statusCode:response.status,attemptedUrl:url.toString()});
    }
    const contentType=(response.headers.get("content-type")||"").toLowerCase();
    if(!contentType.includes("text/html")&&!contentType.includes("application/xhtml")&&!contentType.includes("text/plain"))throw Object.assign(new Error("Unsupported chapter content type: "+(contentType||"unknown")+"."),{statusCode:415,attemptedUrl:url.toString()});
    const length=Number(response.headers.get("content-length")||0);
    if(length>MAX_HTML_BYTES)throw Object.assign(new Error("Chapter page is too large to scan safely."),{statusCode:413,attemptedUrl:url.toString()});
    const text=await response.text();
    if(Buffer.byteLength(text,"utf8")>MAX_HTML_BYTES)throw Object.assign(new Error("Chapter page is too large to scan safely."),{statusCode:413,attemptedUrl:url.toString()});
    return {html:text,finalUrl:url.toString(),contentType};
  }
  throw Object.assign(new Error("Too many redirects while opening the chapter."),{statusCode:508,attemptedUrl:initial});
}

function decodeEntities(value:string){
  const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:"\"",apos:"'",nbsp:" ",ldquo:"“",rdquo:"”",lsquo:"‘",rsquo:"’",mdash:"—",ndash:"–",hellip:"…"};
  return value.replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16))).replace(/&([a-z]+);/gi,(full,name)=>named[name.toLowerCase()]??full);
}
function stripMarkup(value:string){
  return decodeEntities(value.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/(p|div|section|article|li|h[1-6]|blockquote)>/gi,"\n").replace(/<[^>]+>/g," ")).replace(/[ \t]+/g," ").replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}
function removeNoise(html:string){return html.replace(/<!--[\s\S]*?-->/g," ").replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|button)[^>]*>[\s\S]*?<\/\1>/gi," ")}
function extractChapterText(html:string){
  const cleaned=removeNoise(html),candidates:string[]=[];
  for(const regex of [/<article\b[^>]*>([\s\S]*?)<\/article>/gi,/<main\b[^>]*>([\s\S]*?)<\/main>/gi,/<(?:div|section)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:chapter[-_ ]?(?:content|text)|reading[-_ ]?content|entry[-_ ]?content|post[-_ ]?content|novel[-_ ]?content|chapter-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi]){
    let match:RegExpExecArray|null;while((match=regex.exec(cleaned)))candidates.push(stripMarkup(match[1]));
  }
  candidates.push(stripMarkup(cleaned));
  return candidates.map((value)=>value.trim()).filter((value)=>value.length>=120).sort((a,b)=>b.length-a.length)[0]||"";
}
function extractTitle(html:string,chapterNumber:number){const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];return stripMarkup(h1||title||"")||"Chapter "+chapterNumber}
function safeSameOriginLink(href:string,baseUrl:string){try{const target=new URL(href,baseUrl),base=new URL(baseUrl);return target.origin===base.origin?target.toString():undefined}catch{return undefined}}
function extractNextUrl(html:string,baseUrl:string){
  const candidates:Array<{url:string;score:number}>=[];
  for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const attrs=match[1],href=attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
    const url=safeSameOriginLink(href,baseUrl);if(!url)continue;
    const text=stripMarkup(match[2]).toLowerCase(),rel=attrs.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()||"";
    let score=0;if(/\bnext\b/.test(rel))score+=100;if(/next\s*chapter|chapter\s*next|next\s*[›»→]/i.test(text))score+=80;else if(/^next$/i.test(text))score+=45;
    if(score)candidates.push({url,score});
  }
  return candidates.sort((a,b)=>b.score-a.score)[0]?.url;
}
function buildTemplate(urlValue:string,chapterNumber:number){
  const escaped=String(chapterNumber).replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
  const chapterPattern=new RegExp("(chapter|chap|ch)([-_/.=?]*?)"+escaped+"(?=\\D|$)","i");
  if(chapterPattern.test(urlValue))return urlValue.replace(chapterPattern,"$1$2{chapter}");
  try{
    const url=new URL(urlValue),segmentPattern=new RegExp("(^|[/_-])"+escaped+"(?=([/_-]|$))");
    if(segmentPattern.test(url.pathname)){url.pathname=url.pathname.replace(segmentPattern,"$1{chapter}");return url.toString()}
    for(const key of ["chapter","chap","ch"]){if(url.searchParams.get(key)===String(chapterNumber)){url.searchParams.set(key,"{chapter}");return url.toString().replace("%7Bchapter%7D","{chapter}")}}
  }catch{}
  return undefined;
}
function resolveRequestedUrl(chapterNumber:number,explicitUrl:string,source:SourceLock){
  if(explicitUrl)return explicitUrl;
  if(source.nextChapterUrl)return source.nextChapterUrl;
  if(source.chapterUrlTemplate)return source.chapterUrlTemplate.replace("{chapter}",String(chapterNumber));
  throw new Error("Chapter URL could not be determined. Paste this chapter URL manually.");
}

export async function POST(req:Request){
  let attemptedUrl="";
  try{
    const body=await req.json() as Body,chapterNumber=Math.max(1,Math.trunc(Number(body.chapterNumber)||1)),explicitUrl=stringValue(body.chapterUrl),source=(body.source&&typeof body.source==="object"?body.source:{}) as SourceLock;
    attemptedUrl=resolveRequestedUrl(chapterNumber,explicitUrl,source);
    const lockedOrigin=source.locked&&source.sourceOrigin?source.sourceOrigin:undefined,fetched=await fetchPublicHtml(attemptedUrl,lockedOrigin),finalUrl=new URL(fetched.finalUrl);
    const text=fetched.contentType.includes("text/plain")?fetched.html.trim():extractChapterText(fetched.html);
    if(text.length<120)throw Object.assign(new Error("Chapter text could not be extracted. The site layout may be unsupported or the chapter may be protected."),{statusCode:422,attemptedUrl:fetched.finalUrl});
    const nextUrl=fetched.contentType.includes("text/html")?extractNextUrl(fetched.html,fetched.finalUrl):undefined,chapterUrlTemplate=source.chapterUrlTemplate||buildTemplate(fetched.finalUrl,chapterNumber);
    return NextResponse.json({chapter:{number:chapterNumber,title:fetched.contentType.includes("text/html")?extractTitle(fetched.html,chapterNumber):"Chapter "+chapterNumber,url:fetched.finalUrl,sourceText:text,nextUrl},source:{locked:true,sourceOrigin:source.sourceOrigin||finalUrl.origin,firstChapterUrl:source.firstChapterUrl||fetched.finalUrl,nextChapterUrl:nextUrl,chapterUrlTemplate}});
  }catch(error){
    const value=error as Error&{statusCode?:number;attemptedUrl?:string},status=value.statusCode&&value.statusCode>=400&&value.statusCode<600?value.statusCode:502;
    return NextResponse.json({error:value.message||"Chapter scan failed.",attemptedUrl:value.attemptedUrl||attemptedUrl,statusCode:value.statusCode},{status});
  }
}

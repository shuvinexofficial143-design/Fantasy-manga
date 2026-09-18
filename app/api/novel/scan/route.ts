import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import {NextResponse} from "next/server";

export const runtime="nodejs";
export const maxDuration=60;

type SourceLock={locked?:boolean;sourceOrigin?:string;firstChapterUrl?:string;nextChapterUrl?:string;chapterUrlTemplate?:string};
type Body={novelTitle?:unknown;chapterNumber?:unknown;chapterUrl?:unknown;storyUrl?:unknown;source?:unknown};

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

function decodeScriptString(value:string){
  try{
    const parsed=JSON.parse("\""+value+"\"");
    if(typeof parsed==="string")return parsed;
  }catch{}
  return value
    .replace(/\\u003c/gi,"<")
    .replace(/\\u003e/gi,">")
    .replace(/\\u0026/gi,"&")
    .replace(/\\u002f/gi,"/")
    .replace(/\\u0022/gi,"\"")
    .replace(/\\u0027/gi,"'")
    .replace(/\\n/g,"\n")
    .replace(/\\r/g,"\n")
    .replace(/\\t/g," ")
    .replace(/\\\//g,"/")
    .replace(/\\"/g,"\"");
}

function proseScore(value:string){
  const words=value.split(/\s+/).filter(Boolean).length;
  const sentences=(value.match(/[.!?]["'”’)]?(?:\s|$)/g)||[]).length;
  const codeHits=(value.match(/\b(?:function|const|let|var|webpack|__next|classname|javascript|stylesheet)\b/gi)||[]).length;
  const syntaxHits=(value.match(/[{}[\];=]/g)||[]).length;
  return words+sentences*5+Math.min(value.length/25,500)-codeHits*90-syntaxHits*0.6;
}

function pushCandidate(candidates:Array<{text:string;priority:number}>,raw:string,priority:number){
  const text=stripMarkup(decodeScriptString(raw))
    .replace(/\\+"/g,"\"")
    .replace(/\s+\n/g,"\n")
    .replace(/\n\s+/g,"\n")
    .trim();
  if(text.length>=120&&proseScore(text)>40)candidates.push({text,priority});
}

function extractEmbeddedCandidates(html:string){
  const candidates:Array<{text:string;priority:number}>=[];
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

  for(const match of scripts){
    const attrs=match[1]||"",script=match[2]||"";
    const isStructured=/__NEXT_DATA__|application\/(?:ld\+)?json/i.test(attrs);

    if(isStructured){
      try{
        const parsed=JSON.parse(decodeEntities(script.trim()));
        const walk=(value:unknown,key="",depth=0)=>{
          if(depth>14||value===null||value===undefined)return;
          if(typeof value==="string"){
            const important=/(?:chapter|article|story|body|content|text)/i.test(key);
            if(value.length>=120)pushCandidate(candidates,value,important?120:35);
            return;
          }
          if(Array.isArray(value)){for(const item of value)walk(item,key,depth+1);return}
          if(typeof value==="object"){
            for(const [childKey,child] of Object.entries(value as Record<string,unknown>))walk(child,childKey,depth+1);
          }
        };
        walk(parsed);
      }catch{}
    }

    const fields=/"(?:articleBody|chapterContent|chapter_content|chapterText|chapter_text|storyContent|story_content|content|body|text)"\s*:\s*"((?:\\.|[^"\\]){120,})"/gi;
    let field:RegExpExecArray|null;
    while((field=fields.exec(script)))pushCandidate(candidates,field[1],150);

    const quoted=/"((?:\\.|[^"\\]){220,})"/g;
    let quote:RegExpExecArray|null,count=0;
    while((quote=quoted.exec(script))&&count<80){
      pushCandidate(candidates,quote[1],30);
      count+=1;
    }

    const decoded=decodeScriptString(script);
    if(decoded!==script&&decoded.length>=120)pushCandidate(candidates,decoded,20);
  }

  return candidates;
}

function extractNetworkPayloadText(payload:string){
  const candidates:Array<{text:string;priority:number}>=[];
  try{
    const parsed=JSON.parse(payload) as unknown;
    const walk=(value:unknown,key="",depth=0)=>{
      if(depth>18||value===null||value===undefined)return;
      if(typeof value==="string"){
        if(value.length<120)return;
        const important=/(?:chapter|article|story|body|content|text|paragraph|novel|description)/i.test(key);
        pushCandidate(candidates,value,important?220:45);
        return;
      }
      if(Array.isArray(value)){for(const item of value)walk(item,key,depth+1);return}
      if(typeof value==="object"){
        for(const [childKey,child] of Object.entries(value as Record<string,unknown>))walk(child,childKey,depth+1);
      }
    };
    walk(parsed);
  }catch{
    pushCandidate(candidates,payload,25);
  }
  return candidates.sort((a,b)=>(b.priority+proseScore(b.text)/10)-(a.priority+proseScore(a.text)/10))[0]?.text||"";
}

function extractChapterText(html:string){
  const candidates:Array<{text:string;priority:number}>=[];
  const cleaned=removeNoise(html);
  for(const regex of [
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<main\b[^>]*>([\s\S]*?)<\/main>/gi,
    /<(?:div|section)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:chapter[-_ ]?(?:content|text)|reading[-_ ]?content|entry[-_ ]?content|post[-_ ]?content|novel[-_ ]?content|chapter-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi
  ]){
    let match:RegExpExecArray|null;
    while((match=regex.exec(cleaned)))pushCandidate(candidates,match[1],180);
  }

  pushCandidate(candidates,cleaned,5);
  candidates.push(...extractEmbeddedCandidates(html));

  return candidates
    .filter((item)=>item.text.length>=120)
    .sort((a,b)=>(b.priority+proseScore(b.text)/10)-(a.priority+proseScore(a.text)/10))[0]?.text||"";
}
function extractTitle(html:string,chapterNumber:number){const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];return stripMarkup(h1||title||"")||"Chapter "+chapterNumber}
function safeSameOriginLink(href:string,baseUrl:string){try{const target=new URL(href,baseUrl),base=new URL(baseUrl);return target.origin===base.origin?target.toString():undefined}catch{return undefined}}

function extractChapterUrlFromEmbedded(html:string,baseUrl:string,chapterNumber:number){
  const decoded=decodeScriptString(html)
    .replace(/\\u002F/gi,"/")
    .replace(/\\\//g,"/");
  const needle=new RegExp("Chapter[-_ ]?"+chapterNumber+"(?:_|[-/])","i");

  for(const match of decoded.matchAll(/["']([^"']{1,1200})["']/g)){
    const raw=match[1];
    if(!needle.test(raw))continue;
    const url=safeSameOriginLink(raw,baseUrl);
    if(url)return url;
  }

  const pathPattern=new RegExp("((?:https?:\\/\\/[^\\s\"'<>]+)?\\/[^\\s\"'<>]*Chapter[-_ ]?"+chapterNumber+"_[A-Za-z0-9_-]+)","i");
  const direct=decoded.match(pathPattern)?.[1];
  return direct?safeSameOriginLink(direct,baseUrl):undefined;
}

function extractNextUrl(html:string,baseUrl:string,nextChapterNumber:number){
  const candidates:Array<{url:string;score:number}>=[];
  for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const attrs=match[1],href=attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
    const url=safeSameOriginLink(href,baseUrl);if(!url)continue;
    const text=stripMarkup(match[2]).toLowerCase(),rel=attrs.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()||"";
    let score=0;
    if(/\bnext\b/.test(rel))score+=100;
    if(/next\s*chapter|chapter\s*next|next\s*[›»→]/i.test(text))score+=80;
    else if(/^next$/i.test(text))score+=45;
    if(new RegExp("chapter[-_ ]?0*"+nextChapterNumber+"(?:\\D|$)","i").test(url))score+=70;
    if(score)candidates.push({url,score});
  }
  const anchor=candidates.sort((a,b)=>b.score-a.score)[0]?.url;
  return anchor||extractChapterUrlFromEmbedded(html,baseUrl,nextChapterNumber);
}

function findChapterUrlOnPage(html:string,baseUrl:string,chapterNumber:number){
  const candidates:Array<{url:string;score:number}>=[];
  const chapterLabel=new RegExp("\\bchapter\\s*0*"+chapterNumber+"\\b","i");
  const chapterHref=new RegExp("(?:chapter|chap|ch)[-_ /=?]*0*"+chapterNumber+"(?:\\D|$)","i");

  for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const attrs=match[1],href=attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if(!href)continue;
    const url=safeSameOriginLink(href,baseUrl);
    if(!url)continue;
    const text=stripMarkup(match[2]);
    let score=0;
    if(chapterLabel.test(text))score+=120;
    if(chapterHref.test(url))score+=90;
    if(new RegExp("chapter[-_ ]?0*"+chapterNumber+"(?:\\D|$)","i").test(url))score+=60;
    if(score)candidates.push({url,score});
  }

  return candidates.sort((a,b)=>b.score-a.score)[0]?.url
    ||extractChapterUrlFromEmbedded(html,baseUrl,chapterNumber);
}

async function resolveChapterFromStoryPage(storyUrl:string,chapterNumber:number){
  const story=await fetchPublicHtml(storyUrl);
  let found=findChapterUrlOnPage(story.html,story.finalUrl,chapterNumber);
  if(found)return found;

  if(story.contentType.includes("text/html")){
    try{
      const rendered=await renderPublicPage(story.finalUrl);
      found=findChapterUrlOnPage(rendered.html,rendered.finalUrl,chapterNumber);
      if(found)return found;
    }catch{}
  }

  throw Object.assign(new Error("Chapter "+chapterNumber+" link could not be found on the supplied novel/story page. Paste a direct chapter URL or paste the chapter text instead."),{statusCode:422,attemptedUrl:story.finalUrl});
}

function storyIndexUrl(chapterUrl:string){
  try{
    const url=new URL(chapterUrl);
    const match=url.pathname.match(/^(.*?\/story\/[^/]+)\/Chapter[-_ ][^/]+$/i)||url.pathname.match(/^(.*?\/story\/[^/]+)\/Chapter[^/]+$/i);
    if(!match)return undefined;
    url.pathname=match[1];
    url.search="";
    url.hash="";
    return url.toString();
  }catch{return undefined}
}

async function discoverNextChapter(html:string,currentUrl:string,nextChapterNumber:number,lockedOrigin?:string){
  const direct=extractNextUrl(html,currentUrl,nextChapterNumber);
  if(direct)return direct;

  const indexUrl=storyIndexUrl(currentUrl);
  if(!indexUrl||indexUrl===currentUrl)return undefined;

  try{
    const index=await fetchPublicHtml(indexUrl,lockedOrigin||new URL(currentUrl).origin);
    return extractNextUrl(index.html,index.finalUrl,nextChapterNumber)
      ||extractChapterUrlFromEmbedded(index.html,index.finalUrl,nextChapterNumber);
  }catch{
    return undefined;
  }
}

async function renderPublicPage(initialUrl:string,lockedOrigin?:string){
  const [{default:chromium},{default:puppeteer}]=await Promise.all([import("@sparticuz/chromium"),import("puppeteer-core")]);
  const browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});
  try{
    const page=await browser.newPage();
    const sourceHost=new URL(initialUrl).hostname.toLowerCase();
    const rootDomain=sourceHost.split(".").slice(-2).join(".");
    const networkBodies:string[]=[];
    const pending=new Set<Promise<void>>();

    await page.setViewport({width:1280,height:900});
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36");
    await page.setRequestInterception(true);

    page.on("request",(request)=>{void (async()=>{
      const value=request.url();
      if(value.startsWith("data:")||value.startsWith("blob:")||value.startsWith("about:")){await request.continue().catch(()=>{});return}
      if(!/^https?:/i.test(value)){await request.abort().catch(()=>{});return}
      try{await validatePublicUrl(value);await request.continue().catch(()=>{})}catch{await request.abort().catch(()=>{})}
    })()});

    page.on("response",(response)=>{
      const task=(async()=>{
        try{
          const responseUrl=response.url();
          if(!/^https?:/i.test(responseUrl))return;
          const parsed=new URL(responseUrl);
          const sameSite=parsed.hostname===sourceHost||parsed.hostname.endsWith("."+rootDomain)||sourceHost.endsWith("."+parsed.hostname);
          const looksRelevant=/chapter|story|novel|read|content|book|episode/i.test(parsed.pathname+parsed.search);
          if(!sameSite&&!looksRelevant)return;

          const headers=response.headers();
          const contentType=(headers["content-type"]||"").toLowerCase();
          if(!contentType.includes("json")&&!contentType.includes("text")&&!contentType.includes("javascript"))return;
          const length=Number(headers["content-length"]||0);
          if(length>2_000_000)return;
          const body=await response.text().catch(()=>"");
          if(body.length>=120&&Buffer.byteLength(body,"utf8")<=2_000_000)networkBodies.push(body);
        }catch{}
      })();
      pending.add(task);
      void task.finally(()=>pending.delete(task));
    });

    await page.goto(initialUrl,{waitUntil:"domcontentloaded",timeout:30_000});
    await page.waitForNetworkIdle({idleTime:800,timeout:12_000}).catch(()=>{});
    await new Promise((resolve)=>setTimeout(resolve,1800));
    if(pending.size)await Promise.allSettled([...pending]);

    const finalUrl=page.url();
    await validatePublicUrl(finalUrl,lockedOrigin);
    return {html:await page.content(),finalUrl,title:await page.title(),networkBodies:networkBodies.slice(0,40)};
  }finally{
    await browser.close().catch(()=>{});
  }
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
    const body=await req.json() as Body,chapterNumber=Math.max(1,Math.trunc(Number(body.chapterNumber)||1)),explicitUrl=stringValue(body.chapterUrl),storyUrl=stringValue(body.storyUrl),source=(body.source&&typeof body.source==="object"?body.source:{}) as SourceLock;
    if(explicitUrl){
      attemptedUrl=explicitUrl;
    }else if(source.nextChapterUrl||source.chapterUrlTemplate){
      attemptedUrl=resolveRequestedUrl(chapterNumber,"",source);
    }else if(storyUrl){
      attemptedUrl=await resolveChapterFromStoryPage(storyUrl,chapterNumber);
    }else{
      attemptedUrl=resolveRequestedUrl(chapterNumber,"",source);
    }
    const lockedOrigin=source.locked&&source.sourceOrigin?source.sourceOrigin:undefined;
    const fetched=await fetchPublicHtml(attemptedUrl,lockedOrigin);
    let effectiveUrl=fetched.finalUrl;
    let html=fetched.html;
    let title=fetched.contentType.includes("text/html")?extractTitle(html,chapterNumber):"Chapter "+chapterNumber;
    let text=fetched.contentType.includes("text/plain")?html.trim():extractChapterText(html);

    if(text.length<120&&fetched.contentType.includes("text/html")){
      try{
        const rendered=await renderPublicPage(fetched.finalUrl,lockedOrigin);
        effectiveUrl=rendered.finalUrl;
        html=rendered.html;
        title=extractTitle(html,chapterNumber)||rendered.title||title;
        text=extractChapterText(html);
        if(text.length<120){
          const networkCandidates=rendered.networkBodies
            .map((body)=>extractNetworkPayloadText(body))
            .filter((value)=>value.length>=120)
            .sort((a,b)=>proseScore(b)-proseScore(a));
          text=networkCandidates[0]||"";
        }
      }catch(browserError){
        console.warn("Browser-render chapter fallback failed",browserError);
      }
    }

    if(text.length<120)throw Object.assign(new Error("Chapter page opened, but readable chapter text was not found in HTML, JavaScript-rendered DOM, or the page's public text/JSON responses. The chapter may require login/payment or use protected/private data that this importer will not bypass."),{statusCode:422,attemptedUrl:effectiveUrl});

    const finalUrl=new URL(effectiveUrl);
    const nextUrl=await discoverNextChapter(html,effectiveUrl,chapterNumber+1,source.sourceOrigin||finalUrl.origin);
    const chapterUrlTemplate=source.chapterUrlTemplate||buildTemplate(effectiveUrl,chapterNumber);
    return NextResponse.json({chapter:{number:chapterNumber,title,url:effectiveUrl,sourceText:text,nextUrl},source:{locked:true,sourceOrigin:source.sourceOrigin||finalUrl.origin,firstChapterUrl:source.firstChapterUrl||effectiveUrl,nextChapterUrl:nextUrl,chapterUrlTemplate}});
  }catch(error){
    const value=error as Error&{statusCode?:number;attemptedUrl?:string},status=value.statusCode&&value.statusCode>=400&&value.statusCode<600?value.statusCode:502;
    return NextResponse.json({error:value.message||"Chapter scan failed.",attemptedUrl:value.attemptedUrl||attemptedUrl,statusCode:value.statusCode},{status});
  }
}

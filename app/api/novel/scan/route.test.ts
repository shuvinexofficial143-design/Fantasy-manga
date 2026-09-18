import {describe,expect,it} from "vitest";
import {POST,assertChapterIdentity,extractChapterText,extractGoodNovelChapter,extractNetworkPayloadText,extractNextUrl,findChapterUrlOnPage,resolveRequestedUrl} from "./route";

const prose="Mira entered the observatory while rain fell through the broken roof. She kept the brass compass in her right hand and the bandage on her left hand. Arin remained beside the western telescope, watching the doorway and warning her not to cross the center line.";

describe("real-world chapter extraction shapes",()=>{
  it("extracts a semantic HTML chapter without navigation noise",()=>{
    const html=`<nav>${"menu ".repeat(80)}</nav><article><h1>Chapter 1</h1><p>${prose}</p></article><footer>${"legal ".repeat(80)}</footer>`;
    const text=extractChapterText(html);
    expect(text).toContain("brass compass");
    expect(text).not.toContain("legal legal");
  });

  it("extracts only GoodNovel read-content instead of the full hydration payload",()=>{
    const html=`<h1>2: Dong Hai, Trinity Sect</h1><div class="read-content fontSize20 en"><p>${prose}</p></div><script>window.__DATA__=${JSON.stringify({recommendations:Array(200).fill(prose)})}</script>`;
    const text=extractChapterText(html);
    expect(text).toContain("brass compass");
    expect(text.length).toBeLessThan(1000);
  });

  it("prioritizes GoodNovel chapterData.content from its initial state",()=>{
    const state={bookCapter:{chapterData:{chapterName:"2: Dong Hai, Trinity Sect",content:prose,prev:{content:prose.repeat(20)}}},recommendations:Array(100).fill(prose)};
    const html=`<script>window.__INITIAL_STATE__=${JSON.stringify(state)};(function(){})()</script>`;
    expect(extractGoodNovelChapter(html)).toEqual({title:"2: Dong Hai, Trinity Sect",text:prose});
  });

  it("supports GoodNovel's INITIAL_STATE name without underscores",()=>{
    const state={bookCapter:{chapterData:{chapterName:"2: Dong Hai, Trinity Sect",content:prose,prev:{content:prose.repeat(20)}}}};
    const html=`<script>window.INITIAL_STATE=${JSON.stringify(state)};(function(){})()</script>`;
    expect(extractGoodNovelChapter(html)).toEqual({title:"2: Dong Hai, Trinity Sect",text:prose});
  });

  it("extracts client-rendered chapter data from embedded Next.js JSON",()=>{
    const html=`<div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{chapter:{chapterContent:`<p>${prose}</p>`}}}})}</script>`;
    expect(extractChapterText(html)).toContain("western telescope");
  });

  it("extracts chapter prose from a public JSON network response",()=>{
    const payload=JSON.stringify({data:{chapter:{content:`<p>${prose}</p>`}},tracking:{script:"const x = {};"}});
    expect(extractNetworkPayloadText(payload)).toContain("broken roof");
  });

  it("discovers an exact chapter on a story page",()=>{
    const html='<a href="/book/chapter-1">Chapter 1</a><a href="/book/chapter-10">Chapter 10</a>';
    expect(findChapterUrlOnPage(html,"https://fiction.example/book",1)).toBe("https://fiction.example/book/chapter-1");
  });

  it("prefers a same-origin next-chapter link",()=>{
    const html='<a rel="next" href="/book/chapter-2">Next Chapter</a><a href="https://tracker.example/next">Next</a>';
    expect(extractNextUrl(html,"https://fiction.example/book/chapter-1",2)).toBe("https://fiction.example/book/chapter-2");
  });
});

describe("locked-source sequential chapter resolution",()=>{
  it("uses the detected next link for the immediately following chapter",()=>{
    expect(resolveRequestedUrl(2,"",{
      locked:true,
      lastChapterNumber:1,
      nextChapterUrl:"https://en.wikisource.org/wiki/Book/Chapter_2"
    })).toContain("Chapter_2");
  });

  it("does not silently label a stale next URL as a later chapter",()=>{
    expect(()=>resolveRequestedUrl(5,"",{
      locked:true,
      lastChapterNumber:1,
      nextChapterUrl:"https://en.wikisource.org/wiki/Book/Chapter_2"
    })).toThrow(/only auto-scan Chapter 2 next/i);
  });

  it("uses an URL template when the user intentionally jumps chapters",()=>{
    expect(resolveRequestedUrl(5,"",{
      locked:true,
      lastChapterNumber:1,
      nextChapterUrl:"https://example.com/book/chapter-2",
      chapterUrlTemplate:"https://example.com/book/chapter-{chapter}"
    })).toBe("https://example.com/book/chapter-5");
  });
});

describe("scan route source lock",()=>{
  it("blocks switching a locked Wikisource origin before fetching it",async()=>{
    const response=await POST(new Request("http://test/api/novel/scan",{
      method:"POST",
      body:JSON.stringify({
        chapterNumber:2,
        chapterUrl:"https://fr.wikisource.org/wiki/Example/Chapter_2",
        source:{locked:true,sourceOrigin:"https://en.wikisource.org"}
      })
    }));
    const body=await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toMatch(/locked to https:\/\/en\.wikisource\.org/i);
  });

  it("returns a client error for blocked private URLs",async()=>{
    const response=await POST(new Request("http://test/api/novel/scan",{
      method:"POST",
      body:JSON.stringify({chapterNumber:1,chapterUrl:"http://127.0.0.1/chapter-1",source:{}})
    }));
    const body=await response.json();
    expect(response.status).toBe(400);
    expect(body.statusCode).toBe(400);
  });
});

describe("resolved chapter identity",()=>{
  it("accepts the requested chapter",()=>{
    expect(()=>assertChapterIdentity(2,"https://example.com/book/chapter-2","Chapter 2")).not.toThrow();
  });

  it("rejects a source URL that resolves to a different chapter",()=>{
    expect(()=>assertChapterIdentity(5,"https://example.com/book/chapter-2","Chapter 2")).toThrow(/resolved to Chapter 2/i);
  });

  it("recognizes GoodNovel numeric chapter paths and titles",()=>{
    const url="https://www.goodnovel.com/book/Novel_123/2-Mr-Dong-Hai_456";
    expect(()=>assertChapterIdentity(2,url,"2: Dong Hai, Trinity Sect")).not.toThrow();
    expect(()=>assertChapterIdentity(1,url,"2: Dong Hai, Trinity Sect")).toThrow(/resolved to Chapter 2/i);
  });

  it("does not guess when a source has no chapter number",()=>{
    expect(()=>assertChapterIdentity(3,"https://example.com/read/abc","The Long Road")).not.toThrow();
  });
});

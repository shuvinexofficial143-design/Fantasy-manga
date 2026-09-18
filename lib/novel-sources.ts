export type NovelSourceStatus="supported"|"conditional"|"unsupported";

export type NovelSourceProfile={
  id:string;
  name:string;
  domains:string[];
  status:NovelSourceStatus;
  method:string;
  note:string;
};

export const NOVEL_SOURCES:NovelSourceProfile[]=[
  {
    id:"wikisource",
    name:"Wikisource",
    domains:["wikisource.org"],
    status:"supported",
    method:"Official MediaWiki API",
    note:"Best built-in source. Public-domain / freely licensed texts can be read through the official API."
  },
  {
    id:"generic-public-html",
    name:"Public HTML / JSON websites",
    domains:[],
    status:"conditional",
    method:"HTML + JSON + rendered page",
    note:"Works when the site exposes readable public chapter text and permits automated access."
  },
  {
    id:"goodnovel",
    name:"GoodNovel",
    domains:["goodnovel.com"],
    status:"conditional",
    method:"Public chapter HTML + embedded chapter state",
    note:"Works for free public chapters when GoodNovel exposes chapterData/content. Paid, login-only, removed, or access-blocked chapters are not bypassed."
  },
  {
    id:"standard-ebooks",
    name:"Standard Ebooks",
    domains:["standardebooks.org"],
    status:"conditional",
    method:"Public-domain ebook pages / feeds",
    note:"Public-domain source, but chapter import depends on the page/feed being publicly accessible."
  },
  {
    id:"project-gutenberg",
    name:"Project Gutenberg main website",
    domains:["gutenberg.org"],
    status:"unsupported",
    method:"Use approved mirror/robot workflow instead",
    note:"The main website is intended for human access; automated access should use their approved robot/mirror methods."
  },
  {
    id:"goodnovel",
    name:"GoodNovel",
    domains:["goodnovel.com"],
    status:"unsupported",
    method:"Manual text / permitted source only",
    note:"GoodNovel's current Terms prohibit bots, spiders, and other automated means of accessing the platform, so URL crawling is not enabled."
  },
  {
    id:"royal-road",
    name:"Royal Road",
    domains:["royalroad.com"],
    status:"unsupported",
    method:"Not automated",
    note:"Automated scraping/crawling is not supported by this importer."
  },
  {
    id:"inkitt",
    name:"Inkitt",
    domains:["inkitt.com"],
    status:"unsupported",
    method:"Not automated",
    note:"Automated access is not supported by this importer."
  },
  {
    id:"novelnow",
    name:"NovelNow",
    domains:["novelnow.com"],
    status:"unsupported",
    method:"Paste text / another permitted source",
    note:"Current public page responses do not expose readable chapter text to the importer."
  }
];

export function sourceForHostname(hostname:string){
  const host=hostname.toLowerCase().replace(/^www\./,"");
  return NOVEL_SOURCES.find((source)=>source.domains.some((domain)=>host===domain||host.endsWith("."+domain)));
}

export function sourceForUrl(value:string){
  try{return sourceForHostname(new URL(value).hostname)}catch{return undefined}
}

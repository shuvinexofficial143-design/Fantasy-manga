// Run against a local production server. All generation calls are intercepted;
// this test never calls an image provider or spends generation credits.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
const dir=await mkdtemp(join(tmpdir(),'fantasy-ui-'));
const image='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
const scene=(id,number,sourceText)=>({id,sceneNumber:number,chapterNumber:2,title:id,sourceText,prompt:'',negativePrompt:'',status:'idle',cameraShot:'medium',cameraAngle:'eye level',cameraDirection:'right',continuityNotes:'',continuityStrength:92,usePreviousImage:true,characterStates:[]});
const scenes=[{...scene('ready',1,'A castle.'),image,status:'completed'},scene('blocked',2,"Someone thrust a sword into Lucien's chest."),scene('after-block',3,'Lucien walks through the hall.'),scene('final',4,'Lucien opens a window.')];
const stamp=new Date().toISOString();
const project={id:'ui-fixture',name:'UI Fixture',storyTitle:'Fixture',story:'Source story untouched',visualStyle:'Cinematic Painting',aspectRatio:'16:9',worldNotes:'',continuityMode:'strict',visualDensity:'standard',imageStylePreset:'reference-video',imageProvider:'sensenova',imageModel:'sensenova-u1.5-lite',analysisProvider:'vertex',analysisModel:'fixture',styleReferences:[],characters:[],locations:[],images:scenes,createdAt:stamp,updatedAt:stamp,novelImport:{novelTitle:'Fixture',locked:false,currentChapter:2,autoGenerate:false,chapters:[{number:2,title:'Second chapter',url:'',sourceText:'Original second chapter',sceneIds:scenes.map(s=>s.id),scannedAt:stamp,status:'analyzed'}],errorLog:[]}};
const server=process.env.TEST_START_SERVER?spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3002'],{stdio:'ignore'}):null;
const origin=process.env.TEST_ORIGIN||(server?'http://127.0.0.1:3002':'http://127.0.0.1:3001');
if(server){for(let attempt=0;attempt<80;attempt++){try{if((await fetch(origin+'/api/image-models')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}}
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluateOnNewDocument(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fantasy-cinematic-studio-v3',JSON.stringify(state));sessionStorage.setItem('seeded','yes')}},{activeProjectId:project.id,projects:[project]});
 const requests=[];let rejectNext=true;
 await page.setRequestInterception(true);
 page.on('request',request=>{
  if(request.url().endsWith('/api/image-models'))return request.respond({status:200,contentType:'application/json',body:JSON.stringify({configured:{sensenova:true,gemini:false,xkiro:false}})});
  if(request.url().endsWith('/api/generate')){
   requests.push(JSON.parse(request.postData()));
   if(rejectNext){rejectNext=false;return request.respond({status:422,contentType:'application/json',body:JSON.stringify({error:'Visual review blocked this scene; review visual and references.',code:'VISUAL_PREFLIGHT_BLOCKED',retryable:false})})}
   return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image,provider:'sensenova',model:'sensenova-u1.5-lite',seed:1,referenceCount:requests.at(-1).referenceImages.length,effectivePrompt:requests.at(-1).prompt,safety:{promptChecked:true,promptAdjusted:true,referencesChecked:requests.at(-1).referenceImages.length,outputChecked:true,redactedRegions:1,coverMode:'flowers',checkedAt:stamp}})});
  }
  return request.continue();
 });
 await page.goto(origin+'/images',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.innerText.includes('Chapter 2'));
 const clickText=async text=>{const handle=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes(text)),text);assert.ok(handle.asElement(),text+' exists');await handle.asElement().click();await handle.dispose()};
 await page.select('select:has(option[value=flowers])','flowers');
 await clickText('Generate Remaining');
 await page.waitForFunction(()=>document.body.innerText.includes('3 / 4 images ready'));
 assert.equal(requests.length,3,'batch continued after safety rejection');
 assert.ok(requests.every(request=>request.visualCoverMode==='flowers'));
 await page.waitForFunction(()=>document.body.innerText.includes('1 region(s) covered'));
 assert.ok(requests.every(body=>!body.prompt.includes('thrust a sword')),'final outbound prompts are non-graphic');
 const saved=async()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result.projects[0])};q.onerror=reject};r.onerror=reject}));
 await page.waitForFunction(()=>!document.querySelector('button[disabled]'));
 const textarea=await page.$('textarea[aria-label="Visual description for scene 2"]');assert.ok(textarea);
 await textarea.click({clickCount:3});await page.keyboard.type('Lucien watches sunrise through the castle window.');
 await clickText('Retry Failed');await page.waitForFunction(()=>document.body.innerText.includes('4 / 4 images ready'));
 assert.equal(requests.length,4);assert.ok(requests.at(-1).prompt.includes('Lucien watches sunrise'));
 // Upload is available on Images, and the selected style persists after refresh.
 const file=join(dir,'style.png');await sharp({create:{width:400,height:300,channels:3,background:'purple'}}).png().toFile(file);
 await (await page.$('input[type=file]')).uploadFile(file);
 await page.waitForFunction(()=>document.body.innerText.includes('1/4 saved'));
 await page.select('section[aria-label="Image style and references"] select','anime-2d');
 const toggles=await page.$$('section[aria-label="Image style and references"] input[type=checkbox]');
 await toggles[0].click(); // reference-only
 await toggles[2].click(); // no automatic character/previous-frame references
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{const p=q.result.projects[0];db.close();resolve(p.useStylePreset===false&&p.useContinuityReferences===false&&p.styleReferences.length===1)}}}));
 await page.reload({waitUntil:'networkidle0'});
 const restored=await saved();assert.equal(restored.images.filter(s=>s.image).length,4);assert.equal(restored.imageStylePreset,'anime-2d');assert.equal(restored.useStylePreset,false);assert.equal(restored.useStyleReferences,true);assert.equal(restored.visualCoverMode,'flowers');assert.equal(restored.useContinuityReferences,false);assert.equal(restored.images[1].sourceText,scenes[1].sourceText);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false,'mobile layout does not overflow');
 if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile UI, upload, preset/reference-only persistence, manual scene editing, batch continuation and original story preservation. Four mocked generations; zero provider calls.');
}finally{server?.kill();await browser.close();await rm(dir,{recursive:true,force:true})}

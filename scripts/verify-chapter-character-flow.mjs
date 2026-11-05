// Production-browser regression fixture. Generation and analysis calls are mocked.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
const image='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
const otherImage='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'green'}}).png().toBuffer()).toString('base64');
const stamp=new Date().toISOString(),hero={id:'hero',name:'Lucien',role:'lead',appearance:'An adult traveler with dark hair and brown eyes',outfit:'Blue coat and brown boots'},friend={...hero,id:'friend',name:'Friend',outfit:'Green coat and black boots'};
const states=[hero,friend].map(c=>({characterId:c.id,position:'left',action:'talking',direction:'right',expression:'calm',stateNotes:''}));
const scene=(id,chapterNumber)=>({id,sceneNumber:chapterNumber,chapterNumber,title:id,sourceText:'Two adult friends talk in the castle garden.',prompt:'',negativePrompt:'',status:'idle',cameraShot:'medium',cameraAngle:'eye level',cameraDirection:'right',continuityNotes:'',continuityStrength:92,usePreviousImage:true,characterStates:states});
const keep=scene('keep',1),remove={...scene('remove',2),image,status:'completed'};
const chapter=(number,sourceText,sceneIds,status)=>({number,title:'Chapter '+number,url:'',sourceText,sceneIds,scannedAt:stamp,status});
const source='This is the old chapter waiting for background analysis. The traveler speaks with his friend and walks through the castle garden at sunrise.';
const project={id:'fixture',name:'Fixture',storyTitle:'Fixture',story:'Kept story',visualStyle:'Cinematic Painting',aspectRatio:'16:9',worldNotes:'',continuityMode:'strict',visualDensity:'standard',imageStylePreset:'anime-2d',imageProvider:'sensenova',imageModel:'sensenova-u1.5-lite',analysisProvider:'xkiro',analysisModel:'fixture',styleReferences:[],characters:[hero,friend],locations:[],images:[keep,remove],createdAt:stamp,updatedAt:stamp,novelImport:{novelTitle:'Fixture',locked:false,currentChapter:1,autoGenerate:true,chapters:[chapter(1,'Kept story',['keep'],'analyzed'),chapter(2,source,['remove'],'scanned')],errorLog:[]}};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3003'],{stdio:'ignore'});
const origin='http://127.0.0.1:3003';
for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/image-models')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fantasy-cinematic-studio-v3',JSON.stringify(state));localStorage.setItem('fantasy-manga:story-draft:v1:fixture:2','Old unsaved draft');sessionStorage.setItem('seeded','yes')}},{activeProjectId:'fixture',projects:[project]});
 let heldAnalysis;const requests=[];await page.setRequestInterception(true);
 page.on('request',request=>{
  if(request.url().endsWith('/api/novel/analyze')){heldAnalysis=request;return}
  if(request.url().endsWith('/api/image-models'))return request.respond({status:200,contentType:'application/json',body:'{"configured":{"sensenova":true,"xkiro":true}}'});
  if(request.url().includes('/api/xkiro/models'))return request.respond({status:200,contentType:'application/json',body:'{"models":[]}'});
  if(request.url().endsWith('/api/generate')){
   const body=JSON.parse(request.postData());requests.push(body);
   return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image:requests.length===2?otherImage:image,provider:'sensenova',model:'sensenova-u1.5-lite',seed:1,referenceCount:body.referenceImages.length,effectivePrompt:body.prompt,...(body.purpose==='character-sheet'?{characterSheet:{layout:'four-view',views:['front','back','left-profile','right-profile']}}:{})})});
  }
  return request.continue();
 });
 await page.goto(origin+'/chapters',{waitUntil:'domcontentloaded'});await page.waitForSelector('[aria-label="Delete Chapter 2"]');
 await page.waitForFunction(()=>document.body.innerText.includes('ANALYZING'));
 assert.ok(heldAnalysis,'background analysis is running');
 await page.click('[aria-label="Delete Chapter 2"]');await page.waitForSelector('[role=dialog]');
 await page.evaluate(()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancel').click());
 assert.ok(await page.$('[aria-label="Delete Chapter 2"]'),'Cancel preserves chapter');
 await page.click('[aria-label="Delete Chapter 2"]');await page.evaluate(()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Delete Chapter').click());
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Delete Chapter 2"]'));
 await page.click('[aria-label="Create new chapter"]');await page.waitForSelector('[aria-label="Delete Chapter 2"]');
 await heldAnalysis.respond({status:200,contentType:'application/json',body:JSON.stringify({summary:'Late result',explainer:'Late result',characters:[],locations:[],scenes:[{title:'LATE RESULT',sourceText:'This scene must never return',locationName:'',cameraShot:'wide',cameraAngle:'eye',cameraDirection:'right',continuityNotes:'',imagePrompt:'',characters:[]}]})});
 const read=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result.projects[0])}}}));
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{const p=q.result?.projects[0];db.close();resolve(p?.novelImport.chapterRevisions?.[2]===1&&p.novelImport.chapters.find(c=>c.number===2)?.sourceText==='')}}}));
 await page.click('[aria-label="Select Chapter 1"]');await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{const p=q.result?.projects[0];db.close();resolve(p?.novelImport.currentChapter===1)}}}));await page.goto(origin+'/characters',{waitUntil:'networkidle0'});
 await page.click('[aria-label="Generate sheet for Lucien"]');await page.waitForFunction(()=>document.body.innerText.includes('✓ चारों full-body views verified'));
 assert.equal(requests.length,1);assert.equal(requests[0].purpose,'character-sheet');
 for(const token of ['FOUR full-body','FRONT VIEW','BACK VIEW','LEFT PROFILE','RIGHT PROFILE'])assert.ok(requests[0].prompt.includes(token));
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{const p=q.result?.projects[0];db.close();resolve(p?.characters.find(c=>c.id==='hero')?.referenceSheet?.layout==='four-view')}}}));
 await page.goto(origin+'/images',{waitUntil:'networkidle0'});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generate Remaining')).click());
 await page.waitForFunction(()=>document.body.innerText.includes('1 / 1 images ready'));
 assert.equal(requests.length,2,'one manually requested sheet, then story scene; no automatic sheet');
 assert.ok(!requests[1].purpose);
 assert.ok(requests[1].referenceLabels.some(label=>label.includes('Lucien')));assert.ok(!requests[1].referenceLabels.some(label=>label.includes('Friend')),'first appearance uses canonical text, not a paid extra sheet');
 assert.ok(requests[1].referenceLabels.every(label=>label.includes('do not duplicate')));
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{const p=q.result?.projects[0];db.close();resolve(p?.characters.find(c=>c.id==='hero')?.referenceSheet?.layout==='four-view'&&p.images.find(i=>i.id==='keep')?.image)}}}));
 await page.reload({waitUntil:'networkidle0'});const saved=await read();
 assert.equal(saved.novelImport.chapters.find(c=>c.number===2).sourceText,'');assert.deepEqual(saved.novelImport.chapters.find(c=>c.number===2).sceneIds,[]);
 assert.ok(!saved.images.some(i=>i.id==='remove'||i.title==='LATE RESULT'));
 assert.equal(saved.characters.length,2);assert.ok(saved.characters[0].referenceImage);assert.ok(!saved.characters[1].referenceImage);
 assert.equal(await page.evaluate(()=>localStorage.getItem('fantasy-manga:story-draft:v1:fixture:2')),null);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(process.env.CHARACTER_REQUEST_PATH)await writeFile(process.env.CHARACTER_REQUEST_PATH,JSON.stringify(requests[0]));
 assert.deepEqual(errors,[]);console.log('PASS: delete/cancel, draft cleanup, no resurrection from late analysis, number reuse, four-view sheet generation, no automatic sheet for a missing character, saved master in scene request, and persistence after reload. Two mocked generations, no provider calls.');
}finally{await browser.close();server.kill()}

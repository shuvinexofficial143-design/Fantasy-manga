// Regression tests use mocked services and never consume image-provider credits.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
const stamp=new Date().toISOString(),image='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
const character={id:'hero',name:'Lucien',role:'12-year-old child',appearance:'Dark hair, brown eyes',outfit:'Fully clothed in a blue tunic and boots'};
const doctor={...character,id:'doctor',name:'Dr. Kaizen Veyr',role:'Adult doctor',outfit:'A long coat and boots'};
const scene=(id,n,chars=[])=>({id,sceneNumber:n,chapterNumber:2,title:id,sourceText:id==='blocked'?"Lucien raises his hand. I'm fine.":'A quiet castle courtyard.',prompt:'',negativePrompt:'',status:'idle',cameraShot:'medium',cameraAngle:'eye level',cameraDirection:'right',continuityNotes:'',continuityStrength:92,usePreviousImage:true,characterStates:chars.map(characterId=>({characterId,position:'left',action:'stands',direction:'right',expression:'calm',stateNotes:''}))});
const scenes=[{...scene('ready',64),image,status:'completed'},scene('blocked',65,['hero']),scene('ordinary',66,['hero']),scene('future-doctor',67,['doctor'])];
const project={id:'diagnostic',name:'Fixture',storyTitle:'Fixture',story:'Original narration remains',visualStyle:'Cinematic Painting',aspectRatio:'16:9',worldNotes:'',continuityMode:'strict',visualDensity:'standard',imageStylePreset:'anime-2d',imageProvider:'sensenova',imageModel:'sensenova-u1.5-lite',analysisProvider:'xkiro',analysisModel:'fixture',styleReferences:[],characters:[character,doctor],locations:[],images:scenes,createdAt:stamp,updatedAt:stamp,novelImport:{novelTitle:'Fixture',locked:false,currentChapter:2,autoGenerate:false,chapters:[{number:2,title:'Second chapter',sourceText:'Original narration remains',sceneIds:scenes.map(s=>s.id),url:'',scannedAt:stamp,status:'analyzed'}],errorLog:[]}};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3004'],{stdio:'ignore'}),origin='http://127.0.0.1:3004';
for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/image-models')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluateOnNewDocument(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fantasy-cinematic-studio-v3',JSON.stringify(state));sessionStorage.setItem('seeded','yes')}},{activeProjectId:'diagnostic',projects:[project]});
 let characterAttempts=0,sceneAttempts=0,checks=0;const calls=[];
 const diag=(target,stage,kind)=>({requestId:'fixture-request',target,stage,kind,referenceLabels:['Stored reference from refused request'],imageGenerated:stage!=='generation',providerPrompt:'EXACT PROVIDER PROMPT FROM THIS REQUEST'});
 await page.setRequestInterception(true);page.on('request',request=>{
  if(request.url().endsWith('/api/image-models'))return request.respond({status:200,contentType:'application/json',body:'{"configured":{"sensenova":true}}'});
  if(request.url().endsWith('/api/visual-review')){checks++;return request.respond({status:200,contentType:'application/json',body:JSON.stringify({decision:'allow',reason:'Current application review: ordinary fully clothed scene.',reviewedPrompt:'A safe scene.',providerPolicyKnown:false})})}
  if(request.url().endsWith('/api/generate')){
   const body=JSON.parse(request.postData());calls.push(body);
   if(body.purpose==='character-sheet'){
    characterAttempts++;
    if(characterAttempts===1||body.prompt.includes('CHARACTER: Dr. Kaizen'))return request.respond({status:503,contentType:'application/json',body:JSON.stringify({error:'Visual review अधूरी: timeout। यह अपने आप content violation का प्रमाण नहीं है।',code:'VISUAL_SAFETY_UNAVAILABLE',diagnostics:{...diag('character-sheet','character-quality','infrastructure'),reviewFailure:{reason:'timeout',attempts:2}}})});
    return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image,provider:'sensenova',model:'sensenova-u1.5-lite',characterSheet:{layout:'four-view',views:['front','back','left-profile','right-profile']}})});
   }
   sceneAttempts++;
   if(body.prompt.includes("I'm fine"))return request.respond({status:422,contentType:'application/json',body:JSON.stringify({error:'SenseNova ने scene या reference को sensitive बताकर रोका।',code:'SENSENOVA_SENSITIVE_IMAGE',diagnostics:{...diag('scene','generation','provider-policy'),providerCode:'18'}})});
   return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image,provider:'sensenova',model:'sensenova-u1.5-lite',effectivePrompt:body.prompt})});
  }
  return request.continue();
 });
 const click=async(text,scope='button')=>{await page.evaluate((text,scope)=>{const b=[...document.querySelectorAll(scope)].find(b=>b.textContent.includes(text));if(!b)throw new Error('Missing '+text);b.click()},text,scope)};
 const saved=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result.projects[0])}}}));
 await page.goto(origin+'/characters',{waitUntil:'networkidle0'});await page.click('[aria-label="Generate sheet for Lucien"]');
 await page.waitForFunction(()=>document.body.innerText.includes('Review: timeout (2 attempt(s))'));
 assert.ok((await page.$eval('body',e=>e.innerText)).includes('Lucien: Visual review'));
 await click('Prompt/References जाँचें');await page.waitForFunction(()=>document.body.innerText.includes('Current application review'));
 assert.equal(calls.length,1,'diagnostic check does not regenerate');assert.equal(checks,1);
 await page.click('[aria-label="Generate sheet for Lucien"]');await page.waitForFunction(()=>document.body.innerText.includes('चारों full-body views verified'));
 // Wait for persistence before navigating across a full page load.
 for(let i=0;i<30;i++){if((await saved()).characters[0].referenceSheet)break;await new Promise(r=>setTimeout(r,100))}
 await page.goto(origin+'/images',{waitUntil:'networkidle0'});await click('Generate Remaining');
 await page.waitForFunction(()=>document.body.innerText.includes('Batch रुका:')&&document.body.innerText.includes('Dr. Kaizen'));
 assert.equal(sceneAttempts,2,'normal scene generated before a future unrelated character sheet failed');
 assert.equal(characterAttempts,3);assert.equal(calls.length,5);
 const text=await page.$eval('body',e=>e.innerText);assert.ok(text.includes('exact policy category'));assert.ok(text.includes('Stored reference from refused request'));
 await click('Final provider prompt','summary');assert.ok((await page.$eval('body',e=>e.innerText)).includes('EXACT PROVIDER PROMPT FROM THIS REQUEST'));
 for(let i=0;i<30;i++){const p=await saved();if(p.images.find(s=>s.id==='ordinary')?.image&&p.images.find(s=>s.id==='blocked')?.failureDiagnostics)break;await new Promise(r=>setTimeout(r,100))}
 await page.reload({waitUntil:'networkidle0'});const p=await saved();
 assert.equal(p.images.find(s=>s.id==='blocked').failureDiagnostics.providerCode,'18');assert.ok(p.images.find(s=>s.id==='ordinary').image);assert.equal(p.story,'Original narration remains');
 assert.equal(p.characters[1].sheetFailure.diagnostics.target,'character-sheet');assert.ok(!p.images.find(s=>s.id==='future-doctor').image);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS: red review failure classification, read-only diagnosis without generation, explicit character retry, stored yellow diagnostics, no automatic policy retry, scene-specific sheets before a future-character failure, persistence, original story and mobile layout. Five mocked generations, zero provider calls.');
}finally{await browser.close();server.kill()}

// All provider/reviewer requests are mocked; crypto and server guards have unit coverage.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
const image='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
const stamp=new Date().toISOString(),doctor={id:'doctor',name:'Dr. Kaizen Veyr',role:'Adult doctor',appearance:'30 years old, sharp facial features, calm and observant eyes, short neat dark hair, slim but fit build.',outfit:"White doctor's coat with small bloodstains, dark trousers and black shoes"};
const scene={id:'scene',sceneNumber:1,chapterNumber:2,title:'Courtyard',sourceText:'A peaceful castle courtyard.',prompt:'',negativePrompt:'',status:'idle',cameraShot:'wide',cameraAngle:'eye level',cameraDirection:'right',continuityNotes:'',continuityStrength:92,usePreviousImage:true,characterStates:[]};
const project={id:'resume',name:'Fixture',storyTitle:'Fixture',story:'Original story',visualStyle:'Cinematic Painting',aspectRatio:'16:9',worldNotes:'',continuityMode:'strict',visualDensity:'standard',imageStylePreset:'anime-2d',imageProvider:'sensenova',imageModel:'sensenova-u1.5-lite',analysisProvider:'xkiro',analysisModel:'fixture',styleReferences:[{id:'style',name:'Style',dataUrl:image}],characters:[doctor],locations:[],images:[scene],createdAt:stamp,updatedAt:stamp,novelImport:{novelTitle:'Fixture',locked:false,currentChapter:2,autoGenerate:false,chapters:[{number:2,title:'Chapter 2',sourceText:'Original story',sceneIds:['scene'],url:'',scannedAt:stamp,status:'analyzed'}],errorLog:[]}};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3005'],{stdio:'ignore'}),origin='http://127.0.0.1:3005';
for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/image-models')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fantasy-cinematic-studio-v3',JSON.stringify(state));sessionStorage.setItem('seeded','yes')}},{activeProjectId:'resume',projects:[project]});
 const requests=[];let generations=0;await page.setRequestInterception(true);page.on('request',request=>{
  if(request.url().endsWith('/api/image-models'))return request.respond({status:200,contentType:'application/json',body:'{"configured":{"sensenova":true}}'});
  if(request.url().endsWith('/api/generate')){
   const body=JSON.parse(request.postData());requests.push(body);
   if(body.reviewToken)return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image,provider:'sensenova',model:'sensenova-u1.5-lite',effectivePrompt:'Reviewed output',...(body.reviewToken==='held-character'?{characterSheet:{layout:'four-view',views:['front','back','left-profile','right-profile']}}:{})})});
   generations++;const target=body.purpose==='character-sheet'?'character-sheet':'scene';
   return request.respond({status:503,contentType:'application/json',body:JSON.stringify({error:'Review service timeout',code:'VISUAL_SAFETY_UNAVAILABLE',reviewToken:target==='character-sheet'?'held-character':'held-scene',reviewExpiresAt:Date.now()+3600000,diagnostics:{requestId:target,target,stage:'output-review',kind:'infrastructure',referenceLabels:body.referenceLabels,imageGenerated:true,reviewFailure:{reason:'timeout',attempts:2,httpStatus:504}}})});
  }
  return request.continue();
 });
 const saved=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result.projects[0])}}}));
 const waitSave=async(fn)=>{for(let i=0;i<40;i++){if(fn(await saved()))return;await new Promise(r=>setTimeout(r,100))}throw new Error('Persistence timeout')};
 await page.goto(origin+'/characters',{waitUntil:'networkidle0'});await page.click('[aria-label="Generate sheet for Dr. Kaizen Veyr"]');
 await page.waitForFunction(()=>document.body.innerText.includes('Retry Review · Image ready'));
 assert.ok(requests[0].prompt.includes('30 years old'));assert.ok(!requests[0].prompt.includes('with small bloodstains'));
 await waitSave(p=>p.characters[0].sheetFailure?.reviewSession?.token==='held-character');await page.reload({waitUntil:'networkidle0'});
 assert.ok((await page.$eval('body',e=>e.innerText)).includes('नई image generation नहीं होगी'));
 await page.click('[aria-label="Generate sheet for Dr. Kaizen Veyr"]');await page.waitForFunction(()=>document.body.innerText.includes('चारों full-body views verified'));
 assert.deepEqual(requests[1],{reviewToken:'held-character'});assert.equal(generations,1);
 await waitSave(p=>p.characters[0].referenceSheet?.layout==='four-view'&&!p.characters[0].sheetFailure);
 await page.goto(origin+'/images',{waitUntil:'networkidle0'});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generate Image')).click());
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry Review'));
 await waitSave(p=>p.images[0].reviewSession?.token==='held-scene');await page.reload({waitUntil:'networkidle0'});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Retry Review').click());
 await page.waitForFunction(()=>document.body.innerText.includes('1 / 1 images ready'));
 assert.deepEqual(requests[3],{reviewToken:'held-scene'});assert.equal(generations,2,'one character generation and one scene generation; both retries only review');
 await waitSave(p=>p.images[0].image&&!p.images[0].reviewSession);const p=await saved();assert.equal(p.characters[0].outfit,doctor.outfit);assert.equal(p.story,'Original story');
 if(process.env.REVIEW_REQUEST_PATH)await writeFile(process.env.REVIEW_REQUEST_PATH,JSON.stringify(requests[0]));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS: exact doctor age/outfit preservation, clean reference depiction, encrypted-session persistence after reload, character and scene review-only retry payloads, two generations for four HTTP requests, safe completion and mobile layout. No provider calls.');
}finally{await browser.close();server.kill()}

// Production-browser regression fixture. Generation and analysis calls are mocked.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
const image='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
const otherImage='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'green'}}).png().toBuffer()).toString('base64');
const stamp=new Date().toISOString();
const characters=[{id:'lead',name:'Arin Veyr',role:'protagonist',appearance:'Adult traveler with black hair',outfit:'Blue coat'},{id:'guard',name:'Knight 4',role:'background-extra',appearance:'Adult armored guard',outfit:'Steel armor'},{id:'visitor',name:'Passing Messenger',role:'named-support',appearance:'Adult messenger',outfit:'Brown coat'},{id:'saved',name:'Saved Friend',role:'named-support',appearance:'Adult friend',outfit:'Green coat',referenceImage:image}];
const scenes=Array.from({length:3},(_,i)=>({id:'scene-'+i,sceneNumber:i+1,chapterNumber:1,title:'Garden meeting '+i,sourceText:'Adult friends have a peaceful meeting in a garden.',prompt:'',negativePrompt:'',status:'idle',cameraShot:'wide',cameraAngle:'eye level',cameraDirection:'right',continuityNotes:'',continuityStrength:92,usePreviousImage:true,characterStates:characters.filter(c=>i===0||c.id!=='visitor').map(c=>({characterId:c.id,position:c.id==='guard'?'background':'left',action:'talking',direction:'right',expression:'calm',stateNotes:''}))}));
const project={id:'fixture',name:'Fixture',storyTitle:'Fixture',story:'Kept story',visualStyle:'Cinematic Painting',aspectRatio:'16:9',worldNotes:'',continuityMode:'strict',visualDensity:'standard',imageStylePreset:'anime-2d',imageProvider:'sensenova',imageModel:'sensenova-u1.5-lite',analysisProvider:'xkiro',analysisModel:'fixture',styleReferences:[{id:'style',name:'Style',dataUrl:image}],characters,locations:[],images:scenes,createdAt:stamp,updatedAt:stamp,novelImport:{novelTitle:'Fixture',locked:false,currentChapter:1,autoGenerate:false,chapters:[{number:1,title:'Chapter 1',url:'',sourceText:'Kept story',sceneIds:scenes.map(s=>s.id),scannedAt:stamp,status:'analyzed'}],errorLog:[]}};
const responses=await Promise.all(scenes.map(async(_,i)=>'data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:{r:120,g:40+i*30,b:90}}}).png().toBuffer()).toString('base64')));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3008'],{stdio:'ignore'});
const origin='http://127.0.0.1:3008';
for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/image-models')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});const errors=[],requests=[];let storyCalls=0;page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fantasy-cinematic-studio-v3',JSON.stringify(state));sessionStorage.setItem('seeded','yes')}},{activeProjectId:'fixture',projects:[project]});
 await page.setRequestInterception(true);page.on('request',request=>{
  if(request.url().endsWith('/api/image-models'))return request.respond({status:200,contentType:'application/json',body:'{"configured":{"sensenova":true,"xkiro":true}}'});
  if(request.url().endsWith('/api/generate')){const body=JSON.parse(request.postData());requests.push(body);const isSheet=body.purpose==='character-sheet';return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image:isSheet?otherImage:responses[storyCalls++],provider:'sensenova',model:'sensenova-u1.5-lite',seed:1,referenceCount:body.referenceImages.length,effectivePrompt:body.prompt,...(isSheet?{characterSheet:{layout:'four-view',views:['front','back','left-profile','right-profile']}}:{})})})}
  return request.continue();
 });
 await page.goto(origin+'/characters',{waitUntil:'networkidle0'});await page.waitForSelector('[aria-label="Reference plan for Arin Veyr"]');
 assert.equal(await page.$$eval('input[type=checkbox]',nodes=>nodes.length),0,'no character selection required');
 assert.equal(await page.$eval('[aria-label="Generate needed character sheets"]',b=>b.disabled),false,'system recognizes one needed principal sheet');
 assert.ok((await page.$eval('[aria-label="Reference plan for Knight 4"]',node=>node.innerText)).includes('Background/extra'));
 assert.equal(requests.length,0,'no unused sheets created on page load');
 await page.goto(origin+'/images',{waitUntil:'networkidle0'});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Generate Image').click());
 await page.waitForFunction(()=>document.body.innerText.includes('1 / 3 images ready'));
 assert.equal(requests.length,2,'single-scene action prepares only one principal sheet then its frame');assert.equal(requests[0].purpose,'character-sheet');assert.ok(requests[0].prompt.includes('Arin Veyr'));assert.ok(!requests[0].prompt.includes('Knight 4'));assert.ok(requests[1].referenceImages.includes(otherImage));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generate Remaining')).click());
 await page.waitForFunction(()=>document.body.innerText.includes('3 / 3 images ready'));
 assert.equal(requests.length,4);assert.equal(requests.filter(r=>r.purpose==='character-sheet').length,1);assert.equal(storyCalls,3);
 assert.ok(requests[2].referenceImages.includes(responses[0]));assert.ok(requests[2].referenceLabels.some(label=>label.includes('containing Knight 4')),'background identity reuses its first scene');
 assert.ok(requests.slice(1).every(r=>r.referenceImages.includes(otherImage)&&r.referenceImages.includes(image)),'generated principal master and saved friend portrait both reused');
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result?.projects[0].images.filter(s=>s.image).length===3)}}}));
 await page.reload({waitUntil:'networkidle0'});
 const saved=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result.projects[0])}}}));
 assert.equal(saved.characters.find(c=>c.id==='lead').referenceImage,otherImage);assert.ok(saved.characters.find(c=>c.id==='lead').referenceSheet);assert.ok(!saved.characters.find(c=>c.id==='guard').referenceImage);assert.ok(!saved.characters.find(c=>c.id==='visitor').referenceImage);assert.equal(saved.characters.find(c=>c.id==='saved').referenceImage,image);assert.equal(saved.images.filter(s=>s.image).length,3);assert.deepEqual(saved.styleReferences,project.styleReferences);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 if(process.env.REFERENCE_ECONOMY_SCREENSHOT)await page.screenshot({path:process.env.REFERENCE_ECONOMY_SCREENSHOT,fullPage:true});
 console.log('PASS: automatic principal four-view reference before a single scene, no background/one-off sheets, legacy reference reuse, one master for all three story frames, background first-scene anchor, batch continuation and reload persistence. Four mocked generations.');
}finally{await browser.close();server.kill()}

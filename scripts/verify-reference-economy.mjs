// Production-browser regression fixture. Generation and analysis calls are mocked.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
const image='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
const otherImage='data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:'green'}}).png().toBuffer()).toString('base64');
const stamp=new Date().toISOString();
const characters=Array.from({length:6},(_,i)=>({id:'known-'+i,name:'Knight '+(i+1),role:'support',appearance:'Adult armored guard',outfit:'Blue uniform',referenceImage:i%2?image:otherImage}));
// Distinct saved URLs are required to exercise the complete cast; use unique PNG bytes.
for(let i=0;i<characters.length;i++)characters[i].referenceImage='data:image/png;base64,'+(await sharp({create:{width:160,height:240,channels:3,background:{r:25+i*30,g:70,b:140}}}).png().toBuffer()).toString('base64');
characters.push({id:'recurring',name:'Recurring Guest',role:'support',appearance:'Adult traveler',outfit:'Green coat'},{id:'one-off',name:'Passing Messenger',role:'extra',appearance:'Adult messenger',outfit:'Brown coat'});
const scenes=Array.from({length:4},(_,i)=>({id:'scene-'+i,sceneNumber:i+1,chapterNumber:1,title:'Garden meeting '+i,sourceText:'Adult friends have a peaceful meeting in a garden.',prompt:'',negativePrompt:'',status:'idle',cameraShot:'wide',cameraAngle:'eye level',cameraDirection:'right',continuityNotes:'',continuityStrength:92,usePreviousImage:true,characterStates:characters.filter(c=>i===0||c.id!=='one-off').map(c=>({characterId:c.id,position:'left',action:'talking',direction:'right',expression:'calm',stateNotes:''}))}));
const project={id:'fixture',name:'Fixture',storyTitle:'Fixture',story:'Kept story',visualStyle:'Cinematic Painting',aspectRatio:'16:9',worldNotes:'',continuityMode:'strict',visualDensity:'standard',imageStylePreset:'anime-2d',imageProvider:'sensenova',imageModel:'sensenova-u1.5-lite',analysisProvider:'xkiro',analysisModel:'fixture',styleReferences:[{id:'style',name:'Style',dataUrl:image}],characters,locations:[],images:scenes,createdAt:stamp,updatedAt:stamp,novelImport:{novelTitle:'Fixture',locked:false,currentChapter:1,autoGenerate:false,chapters:[{number:1,title:'Chapter 1',url:'',sourceText:'Kept story',sceneIds:scenes.map(s=>s.id),scannedAt:stamp,status:'analyzed'}],errorLog:[]}};
const responses=await Promise.all(scenes.map(async(_,i)=>'data:image/png;base64,'+(await sharp({create:{width:320,height:240,channels:3,background:{r:120,g:40+i*30,b:90}}}).png().toBuffer()).toString('base64')));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3007'],{stdio:'ignore'});
const origin='http://127.0.0.1:3007';
for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/image-models')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fantasy-cinematic-studio-v3',JSON.stringify(state));sessionStorage.setItem('seeded','yes')}},{activeProjectId:'fixture',projects:[project]});
 await page.setRequestInterception(true);page.on('request',request=>{
  if(request.url().endsWith('/api/image-models'))return request.respond({status:200,contentType:'application/json',body:'{"configured":{"sensenova":true,"xkiro":true}}'});
  if(request.url().endsWith('/api/generate')){const body=JSON.parse(request.postData());requests.push(body);return request.respond({status:200,contentType:'application/json',body:JSON.stringify({image:responses[requests.length-1],provider:'sensenova',model:'sensenova-u1.5-lite',seed:1,referenceCount:5,effectivePrompt:body.prompt})})}
  return request.continue();
 });
 await page.goto(origin+'/characters',{waitUntil:'networkidle0'});await page.waitForSelector('[aria-label="Select sheet for Knight 1"]');
 assert.equal(await page.$$eval('input[type=checkbox]',nodes=>nodes.filter(n=>n.checked).length),0,'no default bulk selection');
 assert.equal(await page.$eval('[aria-label="Generate selected character sheets"]',b=>b.disabled),true);
 assert.equal(requests.length,0,'opening Characters never generates sheets');
 await page.goto(origin+'/images',{waitUntil:'networkidle0'});await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generate Remaining')).click());
 await page.waitForFunction(()=>document.body.innerText.includes('4 / 4 images ready'));
 assert.equal(requests.length,4);assert.ok(requests.every(r=>r.purpose!=='character-sheet'));
 for(const request of requests)for(const character of characters.slice(0,6))assert.ok(request.referenceImages.includes(character.referenceImage),'every saved master retained, including Knight 4');
 assert.equal(requests[0].referenceImages.length,7,'six saved masters plus uploaded style');
 assert.ok(requests[1].referenceImages.includes(responses[0]));assert.ok(requests[1].referenceLabels.some(label=>label.includes('containing Recurring Guest')),'first story image becomes identity anchor');
 assert.ok(!requests[1].referenceLabels.some(label=>label.includes('Passing Messenger')),'one-off has no dedicated reference');
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result?.projects[0].images.filter(s=>s.image).length===4)}}}));
 await page.reload({waitUntil:'networkidle0'});
 const saved=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('fantasy-cinematic-studio',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>{db.close();resolve(q.result.projects[0])}}}));
 assert.equal(saved.characters.length,characters.length);for(const original of characters){const actual=saved.characters.find(c=>c.id===original.id);for(const key of Object.keys(original))assert.equal(actual[key],original[key]);if(!original.referenceImage)assert.ok(!actual.referenceImage)}assert.equal(saved.images.filter(s=>s.image).length,4);assert.deepEqual(saved.styleReferences,project.styleReferences);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 if(process.env.REFERENCE_ECONOMY_SCREENSHOT)await page.screenshot({path:process.env.REFERENCE_ECONOMY_SCREENSHOT,fullPage:true});
 console.log('PASS: eight-character cast, six legacy masters plus style retained, zero auto sheets, empty default selection, recurring first-scene anchor, one-off without sheet, four story generations and reload persistence. Mocked provider calls.');
}finally{await browser.close();server.kill()}

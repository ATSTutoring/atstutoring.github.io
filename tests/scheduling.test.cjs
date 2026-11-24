const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
class Timestamp {constructor(ms){this.ms=ms;}toMillis(){return this.ms;}static fromDate(d){return new Timestamp(d.getTime());}}
function clone(v){if(v instanceof Timestamp)return new Timestamp(v.ms);if(Array.isArray(v))return v.map(clone);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]));return v;}
const db=new Map([['settings/review',{reviewerEmail:'reviewer@ats.edu.mx',reviewUrl:'https://example.com/?review=1'}]]);
let observer,tail=Promise.resolve(),listeners=[];
const makeUser=(uid)=>({uid,email:uid+'@ats.edu.mx',emailVerified:true,displayName:uid,getIdTokenResult:async()=>({signInProvider:'google.com',claims:{picture:'https://lh3.googleusercontent.com/example'}})});
const auth={currentUser:makeUser('reviewer')};function snap(key){return{exists:()=>db.has(key),data:()=>clone(db.get(key))};}
const context={console,Date,Timestamp,alert(){},window:{handleAuthStateChanged(){}},initializeApp(){},getFirestore(){},getAuth:()=>auth,GoogleAuthProvider:class{setCustomParameters(){}},onAuthStateChanged:(_,cb)=>observer=cb,signOut(){},signInWithPopup(){},doc:(base,...p)=>p.length?p.join('/'):{id:'A'.repeat(19)+String(db.size%10),path:base+'/'+'A'.repeat(19)+String(db.size%10)},collection:(_,key)=>key,where:(...p)=>p,query:(...p)=>p,serverTimestamp:()=>new Timestamp(Date.now()),getDocFromServer:async key=>snap(key),
getDocsFromServer:async q=>({docs:[...db].filter(([key])=>key.startsWith((typeof q==='string'?q:q[0])+'/')).map(([key])=>({...snap(key),id:key.split('/')[1]}))}),
onSnapshot:(q,cb)=>{listeners.push(q);cb({docs:[]});return()=>listeners.pop();},runTransaction:(_,work)=>{const job=tail.then(async()=>{let wrote=false,writes=[];const result=await work({get:async key=>{assert.equal(wrote,false,'all transaction reads precede writes');return snap(key);},set:(key,data)=>{wrote=true;writes.push(()=>db.set(key.path || key,clone(data)));},update:(key,data)=>{wrote=true;writes.push(()=>db.set(key,{...db.get(key),...clone(data)}));},delete:key=>{wrote=true;writes.push(()=>db.delete(key));}});writes.forEach(f=>f());return result;});tail=job.catch(()=>{});return job;}};
const ctx=vm.createContext(context);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','firebase.js'),'utf8').replace(/import\s*\{[^}]+\}\s*from\s*"[^"]+";\s*/g,''),ctx);
const api=ctx.window;const application={firstName:'Test',lastName:'Tutor',grade:'11',bio:'I help students with biology.',subjects:['Biology'],formats:['Online'],rateType:'free',hourlyRate:null,maxStudents:2,availability:Object.fromEntries(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d=>[d,['7:00 PM','3:00 PM']])),contactMethod:'School email',shareSchoolEmail:true,contactConsent:true,contactPhone:null,profilePhotoURL:null};
async function login(uid){auth.currentUser=makeUser(uid);await observer(auth.currentUser);}
const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
(async()=>{
 await login('tutor'); await api.submitTutorApplication(application);
 assert.equal(db.get('tutorApplications/tutor').status,'pending');
 await login('reviewer');await api.updateTutorApplicationDecision('tutor',{Biology:'approved'});
 assert.equal(db.get('tutors/tutor').userId,'tutor'); assert.equal('contactEmail' in db.get('tutors/tutor'),false);
 await login('student');
 assert.equal(api.makeSchoolSlot(future,'7:00 PM').start.getUTCHours(),1,'evening timezone works across UTC midnight');
 assert.throws(()=>api.makeSchoolSlot(future,'13:00 PM'),/available/);
 await assert.rejects(api.submitTutorApplication(application,'tutor'),/own/);
 const request={tutorId:'tutor',date:future,time:'7:00 PM',subject:'Biology',format:'Online',topic:'I need help understanding cell division.'};
 const id=await api.requestTutoringSession(request);assert.equal(db.get('sessionRequests/'+id).tutorContactEmail,null);
 await assert.rejects(api.requestTutoringSession(request),/already/);
 await assert.rejects(api.decideSessionRequest(id,'accepted','Online room link'),/Only/);
 await login('other');await assert.rejects(api.decideSessionRequest(id,'cancelled'),/not yours/);
 const id2=await api.requestTutoringSession(request);
 await login('tutor');await assert.rejects(api.requestTutoringSession(request),/yourself/);
 await assert.rejects(api.decideSessionRequest(id,'accepted',''),/meeting/);
 const race=await Promise.allSettled([api.decideSessionRequest(id,'accepted','School online room A'),api.decideSessionRequest(id2,'accepted','School online room A')]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'only one concurrent acceptance per tutor slot');
 assert.equal(db.get('sessionRequests/'+id).status,'accepted');assert.equal(db.get('sessionRequests/'+id).tutorContactEmail,'tutor@ats.edu.mx');
 await login('student');await api.decideSessionRequest(id,'cancelled');assert.equal(db.get('sessionRequests/'+id).tutorContactEmail,null);assert.equal([...db.keys()].some(k=>k.startsWith('scheduleLocks/')),false);
 await login('tutor');await api.decideSessionRequest(id2,'accepted','School online room A');
 const created=db.get('tutorApplications/tutor').createdAt.toMillis();
 db.delete('mail/tutor');
 await api.submitTutorApplication({...application,bio:'Updated profile'},'tutor');
 assert.equal(db.has('mail/tutor'),false,'approved edits do not queue reviewer email');
 await api.submitTutorApplication({...application,subjects:['Biology','Chemistry'],bio:'Updated profile'},'tutor');
 assert.equal(db.get('tutors/tutor').subjects.includes('Chemistry'),true,'new subjects go live for approved tutors');
 assert.equal(db.get('tutorApplications/tutor').subjectStatuses.Chemistry,'approved');
 assert.equal(db.has('tutors/tutor'),true);assert.equal(db.get('tutorApplications/tutor').status,'approved');assert.equal(db.get('tutors/tutor').bio,'Updated profile');assert.equal(db.get('tutorApplications/tutor').createdAt.toMillis(),created);assert.equal(db.get('sessionRequests/'+id2).status,'accepted');
 db.get('tutorApplications/tutor').status='removed';await assert.rejects(api.submitTutorApplication(application,'tutor'),/reviewer/);
 await login('reviewer'); db.get('tutorApplications/tutor').status='pending';await api.updateTutorApplicationDecision('tutor',{Biology:'approved',Chemistry:'approved'});
 await login('student');const next=await api.requestTutoringSession({...request,time:'3:00 PM'});
 await login('tutor');await api.decideSessionRequest(next,'declined');assert.equal(db.get('sessionRequests/'+next).status,'declined');
 db.set('tutors/tutor-two',{...db.get('tutors/tutor'),userId:'tutor-two'});
 db.set('tutorApplications/tutor-two',{...db.get('tutorApplications/tutor'),userId:'tutor-two',applicantEmail:'tutor-two@ats.edu.mx'});
 await login('other');const conflict=await api.requestTutoringSession({...request,tutorId:'tutor-two'});
 await login('tutor-two');await assert.rejects(api.decideSessionRequest(conflict,'accepted','School online room B'),/already/);
 assert.equal(db.get('sessionRequests/'+conflict).status,'pending');
 await login('reporter');
 await assert.rejects(api.submitHelpReport('Invalid','A valid test message.'),/category/);
 await assert.rejects(api.submitHelpReport('General help','short'),/characters/);
 for(let i=0;i<3;i++)await api.submitHelpReport('General help','A fictional test report with no personal details.');
 assert.equal(db.get('supportLimits/reporter').count,3);
 const reports=[...db].filter(([key])=>key.startsWith('supportReports/'));
 assert.equal(reports.length,3);
 for(const [,value] of reports)assert.deepEqual(Object.keys(value).sort(),['category','createdAt','message']);
 await assert.rejects(api.submitHelpReport('General help','Another fictional test message.'),/limit/);
 db.get('supportLimits/reporter').day=new Timestamp(Date.now()-3*86400000);
 await api.submitHelpReport('Suggestion','A fictional suggestion for tomorrow.');
 assert.equal(db.get('supportLimits/reporter').count,1);
 auth.currentUser=null;await assert.rejects(api.submitHelpReport('General help','A fictional logged out test.'),/Sign in/);
 await login('tutor');
 const off=api.watchMySessions(()=>{},()=>{});assert.equal(listeners.length,2);off();assert.equal(listeners.length,0);
 console.log('PASS: report identity omission, authentication, validation, daily limits and reset; private contacts; ownership; immediate approved profile and subject edits without reviewer email; removed-account restriction; request validation; evening school time; duplicate requests; concurrent acceptance; cancellation and slot release; decline; live listener cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});

import {firebaseConfig} from './firebase-config.js';
import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import {getFirestore,collection,getDocs,doc,setDoc} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
export async function connect(){
  const app=getApps().find(a=>a.name==='sakura-writing')||initializeApp(firebaseConfig,'sakura-writing');
  const auth=getAuth(app);await auth.authStateReady();if(!auth.currentUser)await signInAnonymously(auth);
  const uid=auth.currentUser.uid,db=getFirestore(app);
  const path=['artifacts','gept-writing-mock-v1-essay-generator','users',uid,'SakuraEntries'];
  return {uid,async load(){const result=await getDocs(collection(db,...path));return Object.fromEntries(result.docs.map(d=>[d.id,d.data()]));},async save(record){await setDoc(doc(db,...path,record.id),record);}};
}

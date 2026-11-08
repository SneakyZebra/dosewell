import {prepareLog} from './dose-log.js';
const key='dosewell.planner.v1';
const empty=()=>({version:1,meds:[],taken:{},fired:{},snoozes:{},supplies:{},history:{},settings:{advance:15,sound:true,notifications:false}});
let memory=empty(),volatile=false,broken=false;
export function read(){
  if(volatile)return memory;
  let raw;
  try{raw=localStorage.getItem(key)}catch{volatile=true;return memory}
  if(!raw)return memory=empty();
  try{
    const data=JSON.parse(raw);
    if(data.version!==1||!Array.isArray(data.meds)||!data.settings||!data.taken||!data.fired)throw Error();
    return memory=prepareLog(data);
  }catch{broken=true;return memory}
}
export function storageStatus(){return broken?'Saved data could not be read. Changes are paused to protect your existing medication list.':volatile?'This browser cannot save your changes. Your plan will be lost when you leave.':''}
export async function change(update){
  const write=()=>{
    const data=read();
    if(broken)throw Error(storageStatus());
    update(data);
    memory=data;
    if(!volatile)try{localStorage.setItem(key,JSON.stringify(data))}catch{volatile=true}
    return data;
  };
  return navigator.locks?await navigator.locks.request(key,write):write();
}
export function onLocalChange(fn){window.addEventListener('storage',e=>{if(e.key===key||e.key===null)fn()})}


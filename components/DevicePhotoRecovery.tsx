import React,{forwardRef,useEffect,useImperativeHandle,useState} from 'react';
import {pushWithPhotoRecovery} from '@/services/PhotoRecoveryWorkflow';
import {scanPhotoRecovery,recoverPhotos,RecoveryScan,RecoveryPhoto,PhotoProgress} from '@/services/PhotoRecoveryService';

export type PhotoRecoveryControl={push:()=>Promise<void>};
type Props={projectId?:string;pushProject:(metadataOnly:boolean)=>Promise<unknown>;onBusy:(busy:boolean)=>void;syncProgress?:{message:string;percent:number}};
const DevicePhotoRecovery=forwardRef<PhotoRecoveryControl,Props>(function DevicePhotoRecovery({projectId,pushProject,onBusy,syncProgress},ref) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[scan,setScan]=useState<RecoveryScan|null>(null),[progress,setProgress]=useState<PhotoProgress|null>(null),[error,setError]=useState('');
  const refresh=async()=>{if(!projectId)return;setBusy(true);setError('');setProgress({message:'Checking photos on server…',completed:0,total:0,percent:0});try{setScan(await scanPhotoRecovery(projectId));setProgress(null);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  useEffect(()=>{setScan(null);setError('');setProgress(null);},[projectId]);
  useEffect(()=>{onBusy(busy);},[busy,onBusy]);
  useImperativeHandle(ref,()=>({push:async()=>{
    if(!projectId||busy)return;
    setOpen(true);setBusy(true);setError('');setProgress(null);
    try{const result=await pushWithPhotoRecovery(projectId,pushProject,setProgress);setScan(result);setError(result.pushError||'');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }}));
  if(!projectId)return null;
  const retry=async(photos:RecoveryPhoto[])=>{setBusy(true);setError('');try{if(!await pushProject(true))throw new Error('Pins and comments did not finish syncing. Retry before uploading photos.');const selected=new Set(photos.map(p=>p.image.id));const current=await scanPhotoRecovery(projectId);const failures=await recoverPhotos(projectId,current.photos.filter(p=>selected.has(p.image.id)),setProgress);setError(failures.map(f=>f.error).join('\n'));setScan(await scanPhotoRecovery(projectId));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const pending=scan?.photos.filter(p=>p.state!=='confirmed')||[];
  const grouped=pending.reduce<Record<string,RecoveryPhoto[]>>((rows,p)=>{(rows[p.image.point_id]??=[]).push(p);return rows;},{});
  const shownProgress=syncProgress?{message:syncProgress.message,percent:syncProgress.percent,total:0,completed:0,photo:undefined}:progress;
  const missing=pending.length;
  return <>
    {scan&&<button className="w-full border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-left text-amber-900" onClick={()=>{setOpen(true);refresh();}}>{missing?`${missing} missing photos`:"Photos confirmed"}<span className="block text-xs mt-1">{scan.confirmed} of {scan.photos.length} photos confirmed - View details</span></button>}
    {open&&<div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center"><div role="dialog" aria-modal="true" aria-label="Photo upload status" className="bg-white text-gray-900 w-full max-w-xl max-h-[92vh] rounded-t-2xl sm:rounded-xl flex flex-col shadow-xl">
      <div className="p-4 border-b flex justify-between"><h2 className="font-semibold text-lg">Photo upload status</h2><button aria-label="Close photo status" onClick={()=>setOpen(false)}>✕</button></div>
      <div className="p-4 space-y-4 overflow-auto"><p className="text-xs text-amber-800 bg-amber-50 rounded p-2">Keep the app open during uploads. Your local photos are retained until their server links are confirmed.</p>
        {shownProgress&&<div role="status" aria-live="polite"><div className="text-xs text-gray-600 mb-1 flex gap-2 items-center">{busy&&<span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>}{shownProgress.message}</div>{shownProgress.photo&&<p className="text-xs text-gray-500 mb-2">{shownProgress.photo}</p>}<div role="progressbar" aria-label="Photos checked" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shownProgress.percent} className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{width:`${shownProgress.percent}%`}}/></div>{shownProgress.total>0&&<p className="text-xs text-gray-400 mt-1 text-right">{shownProgress.completed} of {shownProgress.total} checked · {shownProgress.percent}%</p>}</div>}
        {scan&&<p className="text-sm font-semibold">{missing?`${missing} missing photos across ${Object.keys(grouped).length} pins on ${new Set(pending.map(p=>p.plan)).size} plans`:`Photos confirmed - ${scan.confirmed} photos confirmed`}</p>}
        {error&&<p role="alert" className="text-sm text-red-700 whitespace-pre-line">{error}</p>}
        <div className="flex gap-2"><button disabled={busy} onClick={refresh} className="border rounded-lg p-2 text-sm disabled:opacity-50">Refresh status</button><button disabled={busy||!scan?.pending} onClick={()=>retry(pending)} className="bg-blue-600 text-white rounded-lg p-2 flex-1 text-sm disabled:bg-gray-300">{busy?'Working…':`Retry ${scan?.pending||0} missing photos`}</button></div>
        {Object.entries(grouped).map(([pinId,photos])=><section key={pinId} className="border rounded-lg p-3"><strong className="text-sm">{photos[0].plan} · Pin {photos[0].pin}</strong><p className="text-xs text-gray-500 my-2">{scan?.photos.filter(p=>p.image.point_id===pinId&&p.state==='confirmed').length} of {scan?.photos.filter(p=>p.image.point_id===pinId).length} local photos confirmed</p>{photos.map(p=><div key={p.image.id} className="border-t py-2 text-xs"><p>{p.image.comment||p.image.id}</p>{p.error&&<p className="text-red-700">{p.error}</p>}<button disabled={busy||p.state==='blocked'} onClick={()=>retry([p])} className="text-blue-600 mt-2 disabled:opacity-40">Retry this photo</button></div>)}</section>)}
        {scan&&pending.length===0&&<p className="text-sm text-green-700">All photos saved on this device are confirmed on the server.</p>}
        {!!scan?.emptyPins.length&&<section className="border-t pt-3"><h3 className="text-sm font-semibold">Pins without any photo records</h3><p className="text-xs text-gray-500 mt-1">These need checking; an image may never have been taken. Open the pin in its plan to add a photo, then refresh this list.</p>{scan.emptyPins.map(p=><p key={`${p.plan}:${p.pin}`} className="text-xs mt-2">{p.plan} · Pin {p.pin}</p>)}</section>}
      </div>
    </div></div>}
  </>;
});
export default DevicePhotoRecovery;

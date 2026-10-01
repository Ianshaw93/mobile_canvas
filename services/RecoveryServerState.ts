import type {SyncPullResponse} from './SyncService';
const API='https://web-production-44b8.up.railway.app';

// The normal project view omits deletions. The pull endpoint includes tombstones.
export async function readRecoveryServerState(projectId:string):Promise<SyncPullResponse> {
  if(!projectId)throw new Error('Select a project before syncing photos.');
  const response=await fetch(`${API}/api/mobile/sync/pull?project_id=${encodeURIComponent(projectId)}`);
  if(!response.ok)throw new Error(`Could not check server deletion records (${response.status}). Your local work is retained.`);
  const data:SyncPullResponse=await response.json();
  for(const key of ['projects','plans','pins','pin_comments','attachments'] as const){
    if(!Array.isArray(data[key]))throw new Error('Server recovery response is incomplete. Retry before uploading.');
  }
  if(data.projects.some(p=>p.id!==projectId)||data.plans.some(p=>p.project_id!==projectId))throw new Error('Server project identity does not match the selected project.');
  // Older servers can return unrelated children when a project has no plans.
  // Scope every descendant through its parent rather than trusting those arrays.
  const planIds=new Set(data.plans.map(p=>p.id));
  const pins=data.pins.filter(p=>planIds.has(p.plan_id));
  const pinIds=new Set(pins.map(p=>p.id));
  return {...data,pins,pin_comments:data.pin_comments.filter(c=>pinIds.has(c.pin_id)),attachments:data.attachments.filter(a=>!!a.pin_id&&pinIds.has(a.pin_id))};
}

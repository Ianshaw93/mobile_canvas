// Opt-in local browser fixture. No import runs in the normal mobile build.
import { database } from '@/services/database';
import useSiteStore from '@/store/useSiteStore';

const dataUrl = async (url: string): Promise<string> => {
  if (!url.startsWith('/recovery-api/')) throw new Error('Only local fixture assets allowed');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load local asset: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve,reject) => {const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
};

export async function loadRecoveryFixture(progress: (message:string)=>void) {
  const response = await fetch('/recovery-api/api/fixture');
  if (!response.ok) throw new Error('Local recovery server unavailable');
  const project=await response.json();
  const now=new Date().toISOString();
  if (!await database.getProject(project.id)) await database.createProject({id:project.id,name:'LOCAL COPY — '+project.name,client_name:project.client_name,engineer_name:project.engineer_name,site_visit_number:1,created_at:project.created_at,updated_at:project.updated_at});
  for (const plan of project.plans) {
    progress(`Loading ${plan.name} and its photos…`);
    if (!await database.getPlan(plan.id)) await database.createPlan({id:plan.id,project_id:project.id,name:plan.name,url:await dataUrl(plan.pdf_url),thumbnail:'',width:plan.width,height:plan.height,display_scale:plan.display_scale||1.5,display_order:plan.display_order??0,site_visit_number:1,created_at:plan.created_at,updated_at:plan.updated_at});
    for (const pin of plan.pins) {
      if (!await database.getPoint(pin.id)) await database.createPoint({id:pin.id,plan_id:plan.id,x:pin.x,y:pin.y,status:pin.status,comment:pin.comments?.[0]?.comment||pin.attributes?.legacy_comment,site_visit_number:pin.site_visit_number||1,created_at:pin.created_at,updated_at:pin.updated_at});
      const existing=new Set((await database.getImagesByPoint(pin.id)).map(a=>a.id));
      for (const image of pin.attachments) if (!existing.has(image.id)) await database.createImage({id:image.id,point_id:pin.id,url:await dataUrl(image.url),comment:image.comment,site_visit_number:image.site_visit_number||1,created_at:image.created_at||now,updated_at:image.created_at||now});
    }
  }
  await useSiteStore.getState().loadProjects();
  useSiteStore.getState().setSelectedProjectId(project.id);
}

import { env } from "cloudflare:workers";

const initial={children:[{id:"c1",name:"小宇",gender:"boy",avatar:"boy",stars:0}],entries:[],rewards:[{id:"r1",icon:"🍦",name:"冰淇淋",cost:12,stock:0},{id:"r2",icon:"🎮",name:"遊戲 30 分鐘",cost:20,stock:0}],specialRewards:[],templates:[{id:"t1",title:"主動整理書包",amount:3,type:"star"},{id:"t2",title:"幫忙做家事",amount:2,type:"star"}],redemptions:[],rewardIconLibrary:[],passwordHash:""};

type JsonRecord=Record<string,any>;
const asRecord=(value:unknown):JsonRecord=>value&&typeof value==="object"&&!Array.isArray(value)?{...(value as JsonRecord)}:{};
const imageIdentity=(value:string)=>value.replace(/([?&])v=[^&]*/g,"").replace(/[?&]$/,"");

function normalizeRewards(value:unknown){return Array.isArray(value)?value.map(raw=>{const reward=asRecord(raw),icon=typeof reward.icon==="string"&&reward.icon.trim()?reward.icon:"🎁",image=typeof reward.image==="string"&&reward.image.trim()?reward.image:undefined;return image?{...reward,icon,image}:{...reward,icon,image:undefined}}):[]}

function normalizeState(value:unknown){
    const state=asRecord(value),legacyRewards=Array.isArray(state.rewards)?state.rewards:[];
    if(!Array.isArray(state.specialRewards)){
        state.specialRewards=legacyRewards.filter((reward:JsonRecord)=>Number(reward?.stock)>0).map((reward:JsonRecord)=>({...reward,cost:0}));
        state.rewards=legacyRewards.filter((reward:JsonRecord)=>Number(reward?.cost)>0).map((reward:JsonRecord)=>({...reward,stock:0}));
    }
    state.rewards=normalizeRewards(state.rewards);
    state.specialRewards=normalizeRewards(state.specialRewards);
    const library:JsonRecord[]=[],seen=new Set<string>();
    const addAsset=(raw:unknown,fallbackName="自訂圖片")=>{const asset=asRecord(raw),image=typeof asset.image==="string"&&asset.image.trim()?asset.image.trim():"",identity=imageIdentity(image);if(!image||seen.has(identity))return;seen.add(identity);library.push({id:typeof asset.id==="string"&&asset.id?asset.id:crypto.randomUUID(),name:typeof asset.name==="string"&&asset.name.trim()?asset.name.trim():fallbackName,image,...(typeof asset.hash==="string"&&asset.hash?{hash:asset.hash}:{}),...(typeof asset.createdAt==="string"&&asset.createdAt?{createdAt:asset.createdAt}:{})})};
    if(Array.isArray(state.rewardIconLibrary))for(const asset of state.rewardIconLibrary)addAsset(asset);
    for(const reward of [...state.rewards,...state.specialRewards])if(typeof reward.image==="string"&&reward.image)addAsset({image:reward.image,name:`${typeof reward.name==="string"&&reward.name.trim()?reward.name.trim():"獎品"}圖片`});
    state.rewardIconLibrary=library;
    return state;
}

async function setup(){
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
    const row=await env.DB.prepare("SELECT data FROM app_state WHERE id = ?").bind("family").first<{data:string}>();
    if(!row){const state=normalizeState(initial);await env.DB.prepare("INSERT INTO app_state (id,data,updated_at) VALUES (?,?,?)").bind("family",JSON.stringify(state),Date.now()).run();return state}
    const parsed=JSON.parse(row.data),state=normalizeState(parsed),serialized=JSON.stringify(state);
    if(serialized!==row.data)await env.DB.prepare("UPDATE app_state SET data=?,updated_at=? WHERE id=?").bind(serialized,Date.now(),"family").run();
    return state;
}

async function hash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(item=>item.toString(16).padStart(2,"0")).join("")}

export async function GET(){try{const state=await setup();const {passwordHash,...safe}=state;return Response.json({state:safe,passwordSet:Boolean(passwordHash)},{headers:{"Cache-Control":"no-store, no-cache, must-revalidate"}})}catch(error){return Response.json({error:String(error)},{status:500,headers:{"Cache-Control":"no-store"}})}}

export async function POST(req:Request){
    try{
        const body=await req.json() as {action:string;password?:string;newPassword?:string;state?:Record<string,unknown>;record?:Record<string,unknown>},old=await setup();
        if(body.action==="child_entry"){const record=body.record;if(!record||record.status!=="pending"||!old.children.some((child:JsonRecord)=>child.id===record.childId))return Response.json({error:"無效的待確認紀錄"},{status:400});old.entries=[record,...old.entries];await env.DB.prepare("UPDATE app_state SET data=?, updated_at=? WHERE id=?").bind(JSON.stringify(old),Date.now(),"family").run();return Response.json({ok:true})}
        if(body.action==="child_redemption"){const record=body.record;if(!record||record.status!=="pending"||!old.children.some((child:JsonRecord)=>child.id===record.childId))return Response.json({error:"無效的兌換申請"},{status:400});old.redemptions=[record,...old.redemptions];await env.DB.prepare("UPDATE app_state SET data=?, updated_at=? WHERE id=?").bind(JSON.stringify(old),Date.now(),"family").run();return Response.json({ok:true})}
        if(old.passwordHash&&await hash(body.password||"")!==old.passwordHash)return Response.json({error:"密碼錯誤"},{status:403});
        if(body.action==="verify")return Response.json({ok:true});
        if(body.action!=="save"||!body.state)return Response.json({error:"無效的儲存內容"},{status:400});
        const passwordHash=body.newPassword?await hash(body.newPassword):old.passwordHash,next=normalizeState({...old,...body.state,passwordHash});
        await env.DB.prepare("UPDATE app_state SET data=?, updated_at=? WHERE id=?").bind(JSON.stringify(next),Date.now(),"family").run();
        return Response.json({ok:true,passwordSet:Boolean(passwordHash)});
    }catch(error){return Response.json({error:String(error)},{status:500})}
}

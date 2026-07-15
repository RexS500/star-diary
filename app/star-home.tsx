"use client";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { buildAnalyticsWorkbook } from "./excel-export";
type Child = {
    id: string;
    name: string;
    gender: "boy" | "girl";
    avatar: string;
    stars: number;
};
type Entry = {
    id: string;
    childId: string;
    title: string;
    amount: number;
    type: "star" | "deduct" | "special";
    date: string;
    status?: "pending" | "completed";
    source?: "star" | "special";
    createdAt?: string;
};
type Reward = {
    id: string;
    icon: string;
    name: string;
    cost: number;
    stock: number;
    image?: string;
    source?: "star" | "special";
};
type Template = {
    id: string;
    title: string;
    amount: number;
    type: "star" | "deduct" | "special";
};
type Redeem = {
    id: string;
    childId: string;
    reward: string;
    cost: number;
    date: string;
    status?: "pending" | "completed";
    source?: "star" | "special";
};
type State = {
    children: Child[];
    entries: Entry[];
    rewards: Reward[];
    templates: Template[];
    redemptions: Redeem[];
    specialRewards: Reward[];
};
type CropTarget = { file: File; url: string; kind: "avatar" | "reward"; targetId: string };
type AnalysisFilter = "all" | "star" | "deduct";
const fallback: State = { children: [{ id: "c1", name: "小宇", gender: "boy", avatar: "boy", stars: 0 }], entries: [], rewards: [{ id: "r1", icon: "🍦", name: "冰淇淋", cost: 12, stock: 0 }], templates: [{ id: "t1", title: "主動整理書包", amount: 3, type: "star" }], redemptions: [],specialRewards:[] };
const now = () => new Date().toLocaleString("zh-TW", { hour12: false });
const positiveInt = (value:unknown) => Math.max(1,Math.abs(Math.floor(Number(value)||1)));
const inputDate = (offset=0) => { const d=new Date();d.setDate(d.getDate()+offset);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10) };
const entryTime = (value:string) => { if(/^\d{4}-\d{2}-\d{2}T/.test(value))return Date.parse(value);const m=value.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);return m?new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime():new Date(value).getTime() };
const entryDay = (value:string) => { if(/^\d{4}-\d{2}-\d{2}T/.test(value)){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}const m=value.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:"未知日期" };

function CropModal({target,onCancel,onError,onConfirm}:{target:CropTarget;onCancel:()=>void;onError:()=>void;onConfirm:(file:File)=>Promise<void>}){
    const [natural,setNatural]=useState({w:0,h:0}),[frameSize,setFrameSize]=useState({w:0,h:0}),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[busy,setBusy]=useState(false);
    const frameRef=useRef<HTMLDivElement>(null),imageRef=useRef<HTMLImageElement>(null),drag=useRef<{id:number;x:number;y:number;ox:number;oy:number}|null>(null);
    const isAvatar=target.kind==="avatar";
    useEffect(()=>{const update=()=>{const r=frameRef.current?.getBoundingClientRect();if(r)setFrameSize({w:r.width,h:r.height})};update();window.addEventListener("resize",update);return()=>window.removeEventListener("resize",update)},[natural.w,isAvatar]);
    const base=natural.w&&frameSize.w?(isAvatar?Math.max(frameSize.w/natural.w,frameSize.h/natural.h):Math.min(frameSize.w/natural.w,frameSize.h/natural.h)):0;
    const imageSize={w:natural.w*base*zoom,h:natural.h*base*zoom};
    const limits={x:Math.abs(imageSize.w-frameSize.w)/2,y:Math.abs(imageSize.h-frameSize.h)/2};
    const clamp=(x:number,y:number)=>({x:Math.max(-limits.x,Math.min(limits.x,x)),y:Math.max(-limits.y,Math.min(limits.y,y))});
    function pointerDown(e:ReactPointerEvent<HTMLDivElement>){e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y}}
    function pointerMove(e:ReactPointerEvent<HTMLDivElement>){if(!drag.current||drag.current.id!==e.pointerId)return;setOffset(clamp(drag.current.ox+e.clientX-drag.current.x,drag.current.oy+e.clientY-drag.current.y))}
    function changeZoom(next:number){const previous=zoom||1,nextSize={w:natural.w*base*next,h:natural.h*base*next},nextLimits={x:Math.abs(nextSize.w-frameSize.w)/2,y:Math.abs(nextSize.h-frameSize.h)/2};setZoom(next);setOffset(current=>{const scaled={x:current.x*next/previous,y:current.y*next/previous};return{x:Math.max(-nextLimits.x,Math.min(nextLimits.x,scaled.x)),y:Math.max(-nextLimits.y,Math.min(nextLimits.y,scaled.y))}})}
    async function finish(){const image=imageRef.current,frame=frameRef.current;if(!image||!frame||!natural.w)return;setBusy(true);try{
        const output=isAvatar?512:900,outH=isAvatar?512:420,rect=frame.getBoundingClientRect(),ratio=output/rect.width,drawBase=(isAvatar?Math.max(rect.width/natural.w,rect.height/natural.h):Math.min(rect.width/natural.w,rect.height/natural.h))*zoom*ratio;
        const canvas=document.createElement("canvas");canvas.width=output;canvas.height=outH;const context=canvas.getContext("2d");if(!context)throw new Error("無法處理圖片");
        context.fillStyle="#f0f4fa";context.fillRect(0,0,output,outH);
        if(isAvatar){context.save();context.beginPath();context.arc(output/2,outH/2,output/2,0,Math.PI*2);context.clip()}
        context.drawImage(image,output/2+offset.x*ratio-natural.w*drawBase/2,outH/2+offset.y*ratio-natural.h*drawBase/2,natural.w*drawBase,natural.h*drawBase);
        if(isAvatar)context.restore();
        const mime=isAvatar?"image/png":"image/jpeg",blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("無法輸出圖片")),mime,0.9));
        await onConfirm(new File([blob],`${target.kind}-${Date.now()}.${isAvatar?"png":"jpg"}`,{type:mime,lastModified:Date.now()}));
    }finally{setBusy(false)}}
    return <div className="modal-back"><section className="modal crop-modal"><button className="close" onClick={onCancel}>×</button><h2>{isAvatar?"選取大頭照範圍":"選取獎品圖片範圍"}</h2><p className="crop-help">拖曳圖片調整位置，使用下方滑桿放大或縮小。</p><div ref={frameRef} className={`crop-frame ${isAvatar?"circle":"rectangle"}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
        <img ref={imageRef} src={target.url} alt="待裁切圖片" onError={onError} onLoad={e=>setNatural({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})} style={base?{width:imageSize.w,height:imageSize.h,left:`calc(50% + ${offset.x}px)`,top:`calc(50% + ${offset.y}px)`}:undefined}/>{isAvatar&&<span className="circle-guide"/>}
    </div><label className="zoom-control">圖片大小<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={e=>changeZoom(+e.target.value)}/></label>{!isAvatar&&<p className="crop-note">直式照片會保留完整比例，左右自動使用網頁底色留白。</p>}<div className="crop-actions"><button onClick={onCancel}>取消</button><button className="primary" disabled={busy||!natural.w} onClick={finish}>{busy?"處理中…":"使用這個範圍"}</button></div></section></div>;
}

function Analytics({entries,child}:{entries:Entry[];child:Child}){
    const [from,setFrom]=useState(inputDate(-29)),[to,setTo]=useState(inputDate()),[filter,setFilter]=useState<AnalysisFilter>("all");
    const rows=useMemo(()=>{const start=new Date(`${from}T00:00:00`).getTime(),end=new Date(`${to}T23:59:59.999`).getTime();return entries.filter(e=>e.childId===child.id&&e.status!=="pending"&&(e.type==="star"||e.type==="deduct")&&(filter==="all"||e.type===filter)).filter(e=>{const time=entryTime(e.createdAt||e.date);return Number.isFinite(time)&&time>=start&&time<=end}).sort((a,b)=>entryTime(a.createdAt||a.date)-entryTime(b.createdAt||b.date))},[entries,child.id,from,to,filter]);
    const daily=useMemo(()=>{const map=new Map<string,{day:string;add:number;deduct:number}>();for(const row of rows){const day=entryDay(row.createdAt||row.date),item=map.get(day)||{day,add:0,deduct:0};if(row.type==="star")item.add+=row.amount;else item.deduct+=row.amount;map.set(day,item)}return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day))},[rows]);
    const added=rows.filter(x=>x.type==="star").reduce((sum,x)=>sum+x.amount,0),deducted=rows.filter(x=>x.type==="deduct").reduce((sum,x)=>sum+x.amount,0),maximum=Math.max(1,...daily.flatMap(x=>[x.add,x.deduct]));
    function exportExcel(){
        const filterName=filter==="all"?"全部":filter==="star"?"只看加星":"只看扣星",workbook=buildAnalyticsWorkbook({child:child.name,from,to,filter:filterName,rows:rows.map(x=>({date:x.date,type:x.type as "star"|"deduct",title:x.title,amount:x.amount})),daily,added,deducted});
        const url=URL.createObjectURL(new Blob([workbook],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),link=document.createElement("a");link.href=url;link.download=`星星分析_${child.name.replace(/[\\/:*?"<>|]/g,"_")}_${from}_${to}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    return <div className="analytics"><section className="analytics-panel"><div className="analytics-title"><div><h2>📊 {child.name} 的星星分析</h2><p>以每日長條圖比較加星與扣星，適合找出獎勵或扣分集中的日期。</p></div><button className="primary" disabled={!rows.length} onClick={exportExcel}>匯出 Excel</button></div><div className="analytics-filters"><label>開始日期<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>結束日期<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><label>紀錄類型<select value={filter} onChange={e=>setFilter(e.target.value as AnalysisFilter)}><option value="all">加星＋扣星</option><option value="star">只看加星</option><option value="deduct">只看扣星</option></select></label></div></section><div className="summary-grid"><article><span>加星</span><strong className="summary-add">＋{added} ★</strong></article><article><span>扣星</span><strong className="summary-deduct">−{deducted} ★</strong></article><article><span>淨星星</span><strong>{added-deducted>=0?"＋":""}{added-deducted} ★</strong></article><article><span>紀錄數</span><strong>{rows.length} 筆</strong></article></div><section className="analytics-panel"><div className="chart-legend"><b>每日星星變化</b><span><i className="legend-add"/>加星</span><span><i className="legend-deduct"/>扣星</span></div>{daily.length?<div className="bar-chart">{daily.map(day=><div className="chart-day" key={day.day} title={`${day.day}：加 ${day.add}、扣 ${day.deduct}`}><div className="chart-half chart-up">{day.add>0&&<span style={{height:`${Math.max(5,day.add/maximum*100)}%`}}><b>{day.add}</b></span>}</div><div className="chart-half chart-down">{day.deduct>0&&<span style={{height:`${Math.max(5,day.deduct/maximum*100)}%`}}><b>{day.deduct}</b></span>}</div><small>{day.day.slice(5).replace("-","/")}</small></div>)}</div>:<p className="empty">這個條件下沒有已完成的加扣星紀錄</p>}</section><section className="analytics-panel"><h2>分析明細</h2><div className="analytics-table"><div className="analytics-row header"><span>日期時間</span><span>類型</span><span>內容</span><span>星星</span></div>{rows.slice().reverse().map(row=><div className="analytics-row" key={row.id}><span>{row.date}</span><span className={row.type==="deduct"?"summary-deduct":"summary-add"}>{row.type==="star"?"加星":"扣星"}</span><span>{row.title}</span><strong>{row.type==="star"?"＋":"−"}{row.amount}</strong></div>)}</div></section></div>;
}
export default function App() {
    const [data, setData] = useState(fallback), [cid, setCid] = useState("c1"), [tab, setTab] = useState("首頁"), [role, setRole] = useState("孩子"), [password, setPassword] = useState(""), [passwordSet, setPasswordSet] = useState(false), [login, setLogin] = useState(false), [record, setRecord] = useState(false), [redeem, setRedeem] = useState<Reward | null>(null), [toast, setToast] = useState(""), [loading, setLoading] = useState(true);
    const [crop,setCrop]=useState<CropTarget|null>(null);
    const child = data.children.find(c => c.id === cid) || data.children[0];
    useEffect(() => { fetch("/api/state").then(r => r.json()).then(x => { if (x.state) {
        setData(x.state);
        setCid(x.state.children[0]?.id);
        setPasswordSet(x.passwordSet);
    } }).finally(() => setLoading(false)); }, []);
    const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2500); };
    async function persist(next: State, newPassword?: string) { setData(next); const r = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", state: next, password, newPassword }) }); if (!r.ok) {
        const x = await r.json();
        say(x.error || "儲存失敗");
        return false;
    } if (newPassword) {
        setPassword(newPassword);
        setPasswordSet(true);
    } say("已儲存"); return true; }
    async function submitPending(action:"child_entry"|"child_redemption",record:Entry|Redeem,next:State){setData(next);const r=await fetch("/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,record})});if(!r.ok){const x=await r.json();say(x.error||"送出失敗");return false}say("已送出，等待家長確認");return true}
    async function enterParent() { if (!passwordSet) {
        setRole("家長");
        setTab("家庭設定");
        return;
    } setLogin(true); }
    async function verify() { const r = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", password }) }); if (r.ok) {
        setRole("家長");
        setLogin(false);
        say("已進入家長模式");
    }
    else
        say("密碼錯誤"); }
    ;
    if (loading)
        return <main className="loading">正在載入家庭資料…</main>;
    return <main><header className="topbar"><button type="button" className="brand" aria-label="返回首頁｜星星日記" onClick={() => setTab("首頁")}><img className="brand-logo" src="/star-diary-logo.jpg" alt="" width={48} height={48}/><span className="brand-label">星星日記</span></button><nav>{["首頁", "星星紀錄", ...(role === "家長" ? ["資料分析"] : []), "星星寶庫", "兌換紀錄", ...(role === "家長" ? ["家庭設定"] : [])].map(x => <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>)}</nav><div className="role-switch"><button className={role === "家長" ? "on" : ""} onClick={enterParent}>家長</button><button className={role === "孩子" ? "on" : ""} onClick={() => { setRole("孩子"); setTab("首頁"); }}>孩子</button></div></header><section className="shell"><div className="hello"><div><p className="eyebrow">FAMILY STAR JOURNAL</p><h1>{tab === "首頁" ? `嗨，${child.name}！今天也很棒 👋` : tab}</h1><p>每位孩子都有自己的星星與完整紀錄。</p></div><label className="child-pill"><Avatar c={child}/><select value={cid} onChange={e => setCid(e.target.value)}>{data.children.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div>
    {tab === "首頁" && <><section className="hero-grid"><article className="balance-card"><p>我的星星</p><div className="big-star"><span>★</span><strong>{child.stars}</strong></div><small>每一次努力，都值得被看見</small></article><article className="week-card"><p>快速選取指標</p><div className="template-picks">{data.templates.map(t => <button key={t.id} className={t.type==="deduct"?"deduct-pick":""} onClick={() => quick(t)}>{t.type === "star" ? "＋" : t.type==="deduct"?"−":"🎉"}{Math.max(1,Math.abs(Math.floor(Number(t.amount)||1)))}　{t.title}</button>)}</div></article><article className="quick-card"><p>新增紀錄</p><strong>今天發生什麼事？</strong><div><button onClick={() => setRecord(true)}><span>＋★</span>加星／扣星／特殊</button></div></article></section><Title text="最近紀錄"/><Entries /></>}
    {tab === "星星紀錄" && <><div className="record-tools"><span>日期與時間皆會自動記錄</span>{role === "家長" && <button className="primary" onClick={() => setRecord(true)}>＋ 新增紀錄</button>}</div><Entries /></>}
    {tab === "星星寶庫" && <><div className="reward-top"><div><span>★</span><p>{child.name}目前有 <b>{child.stars}</b> 顆星星</p></div></div><Title text="星星獎品"/><div className="reward-grid">{data.rewards.map(r => {const cost=positiveInt(r.cost);return <article className="reward-card" key={r.id}><div className="reward-icon">{r.image?<img src={r.image} alt={r.name}/>:r.icon}</div><h3>{r.name}</h3><p><span>★</span> {cost} 顆</p><button onClick={() => { if (child.stars < cost)return say(`星星不足，還差 ${cost - child.stars} 顆`); setRedeem({...r,cost,source:"star"}); }}>使用星星兌換</button></article>})}</div><Title text="特殊獎勵倉庫"/><p className="warehouse-note">獲得特殊獎勵會自動進貨；家長確認兌換後出貨，庫存為 0 時自動下架。</p><div className="reward-grid">{data.specialRewards.filter(r=>r.stock>0).map(r=><article className="reward-card special-card" key={r.id}><div className="reward-icon">{r.image?<img src={r.image} alt={r.name}/>:r.icon}</div><h3>{r.name}</h3><p>庫存 <b>{r.stock}</b> 個</p><button onClick={()=>setRedeem({...r,source:"special"})}>直接兌換</button></article>)}</div>{!data.specialRewards.some(r=>r.stock>0)&&<p className="empty">目前沒有特殊獎勵庫存</p>}</>}
    {tab === "兌換紀錄" && <><Title text="兌換歷史"/><div className="entries">{data.redemptions.filter(x => x.childId === cid).map(x => <article key={x.id}><div className="entry-icon">🎁</div><div className="entry-copy"><h3>{x.reward}</h3><small>{x.date} · {x.status==="pending"?"等待家長確認":"已完成"}</small></div><strong>{x.status==="pending"?"待確認":x.cost ? `−${x.cost} ★` : "直接兌換"}</strong>{role==="家長"&&x.status==="pending"&&<button className="primary" onClick={()=>confirmRedemption(x)}>確認已執行</button>}</article>)}{!data.redemptions.some(x => x.childId === cid) && <p className="empty">目前還沒有兌換紀錄</p>}</div></>}
    {tab === "資料分析" && role === "家長" && <Analytics entries={data.entries} child={child}/>}
    {tab === "家庭設定" && role === "家長" && Settings()}</section>{record && <RecordModal />}{redeem && <RedeemModal />}{crop&&<CropModal target={crop} onCancel={cancelCrop} onError={cropError} onConfirm={saveCrop}/>} {login && <div className="modal-back"><section className="modal"><button className="close" onClick={() => setLogin(false)}>×</button><h2>輸入家長密碼</h2><input className="full-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus/><button className="save" onClick={verify}>進入家長模式</button></section></div>}{toast && <div className="toast">{toast}</div>}</main>;
    function quick(t: Template) { const count=Math.max(1,Math.abs(Math.floor(Number(t.amount)||1))),amount = t.type === "deduct" ? -count : count; addEntry(t.title, amount, t.type); }
    function specialStock(list:Reward[],title:string,amount:number){const found=list.find(r=>r.name.trim()===title.trim());const next=found?list.map(r=>r.id===found.id?{...r,stock:Math.max(0,r.stock+amount)}:r):amount>0?[...list,{id:crypto.randomUUID(),icon:"🎁",name:title.trim(),cost:0,stock:amount,source:"special" as const}]:list;return next.filter(r=>r.stock>0)}
    function addEntry(title: string, amount: number, type: Entry["type"]) { const count=positiveInt(amount),signed=type==="deduct"?-count:count,pending=role==="孩子",e:Entry = { id: crypto.randomUUID(), childId: cid, title, amount: count, type, date: now(),createdAt:new Date().toISOString(),status:pending?"pending":"completed" }, delta=pending||type==="special"?0:signed, next = { ...data, entries: [e, ...data.entries], children: data.children.map(c => c.id === cid ? { ...c, stars: Math.max(0, c.stars + delta) } : c),specialRewards:!pending&&type==="special"?specialStock(data.specialRewards,title,count):data.specialRewards }; if(pending)submitPending("child_entry",e,next);else persist(next); }
    async function normalizeJpeg(f:File){
        const bitmap=await createImageBitmap(f,{imageOrientation:"from-image"});
        const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
        const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
        const context=canvas.getContext("2d");if(!context){bitmap.close();throw new Error("無法處理圖片")}
        context.drawImage(bitmap,0,0,width,height);bitmap.close();
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("無法轉換圖片")),"image/jpeg",0.86));
        const base=f.name.replace(/\.[^.]+$/,"")||"photo";
        return new File([blob],`${base}.jpg`,{type:"image/jpeg",lastModified:Date.now()});
    }
    async function uploadImage(f:File,kind:"avatar"|"reward"){
        const extension=f.name.split(".").pop()?.toLowerCase()||"",inferredType:{[key:string]:string}={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"};
        if((f.type&&!f.type.startsWith("image/"))||(!f.type&&!inferredType[extension])){say("請選擇 JPG、JPEG、PNG 或 WebP 圖片");return null}
        let uploadFile=f.type?f:new File([f],f.name,{type:inferredType[extension],lastModified:f.lastModified});
        const isJpeg=uploadFile.type==="image/jpeg"||uploadFile.type==="image/jpg"||extension==="jpg"||extension==="jpeg";
        if(isJpeg){
            say("正在處理 JPEG 圖片…");
            try{uploadFile=await normalizeJpeg(uploadFile)}catch{say("這張 JPEG 無法讀取，請換一張圖片再試");return null}
        }
        if(uploadFile.size>8*1024*1024){say("圖片請小於 8 MB");return null}
        say("圖片上傳中…");
        try{
            const fd=new FormData();fd.append("file",uploadFile);fd.append("kind",kind);
            const res=await fetch("/api/media",{method:"POST",body:fd});
            const x=await res.json().catch(()=>({}));
            if(!res.ok||typeof x.url!=="string"){say(x.error||"圖片上傳失敗");return null}
            return x.url as string;
        }catch{say("圖片上傳失敗，請檢查網路後再試");return null}
    }
    async function uploadReward(f:File,id:string){const url=await uploadImage(f,"reward");if(!url)return;const ok=await persist({...data,rewards:data.rewards.map(r=>r.id===id?{...r,image:url}:r)});if(ok)say("獎品圖片已更新")}
    function startCrop(file:File,kind:CropTarget["kind"],targetId:string){const extension=file.name.split(".").pop()?.toLowerCase()||"",allowed=["jpg","jpeg","png","webp"],allowedTypes=["image/jpeg","image/jpg","image/pjpeg","image/png","image/webp"],type=file.type.toLowerCase();if((type&&!allowedTypes.includes(type))||(!type&&!allowed.includes(extension)))return say("請選擇 JPG、JPEG、PNG 或 WebP 圖片");if(file.size>40*1024*1024)return say("原始圖片請小於 40 MB");setCrop({file,kind,targetId,url:URL.createObjectURL(file)})}
    function cancelCrop(){if(crop)URL.revokeObjectURL(crop.url);setCrop(null)}
    function cropError(){cancelCrop();say("這張圖片無法讀取，請改用 JPG、PNG 或 WebP")}
    async function saveCrop(file:File){const target=crop;if(!target)return;URL.revokeObjectURL(target.url);setCrop(null);if(target.kind==="reward")return uploadReward(file,target.targetId);const url=await uploadImage(file,"avatar");if(!url)return;const ok=await persist({...data,children:data.children.map(item=>item.id===target.targetId?{...item,avatar:url}:item)});if(ok)say("大頭照已更新")}
    function removeEntry(e: Entry) { const delta = e.type === "star" ? e.amount : e.type === "deduct" ? -e.amount : 0; persist({ ...data, entries: data.entries.filter(x => x.id !== e.id), children: data.children.map(c => c.id === e.childId ? { ...c, stars: Math.max(0, c.stars - delta) } : c),specialRewards:e.type==="special"&&e.status!=="pending"?specialStock(data.specialRewards,e.title,-e.amount):data.specialRewards }); }
    function approveEntry(e:Entry){const delta=e.type==="star"?e.amount:e.type==="deduct"?-e.amount:0;persist({...data,entries:data.entries.map(x=>x.id===e.id?{...x,status:"completed"}:x),children:data.children.map(x=>x.id===e.childId?{...x,stars:Math.max(0,x.stars+delta)}:x),specialRewards:e.type==="special"?specialStock(data.specialRewards,e.title,e.amount):data.specialRewards})}
    function confirmRedemption(red:Redeem){const special=red.source==="special",item=data.specialRewards.find(x=>x.name===red.reward),cost=special?0:positiveInt(red.cost),current=data.children.find(x=>x.id===red.childId);if(special&&(!item||item.stock<1))return say("特殊獎勵庫存不足");if(!current||(!special&&current.stars<cost))return say("星星不足，無法確認");persist({...data,redemptions:data.redemptions.map(x=>x.id===red.id?{...x,status:"completed",cost}:x),children:data.children.map(x=>x.id===red.childId?{...x,stars:x.stars-cost}:x),specialRewards:special?specialStock(data.specialRewards,red.reward,-1):data.specialRewards})}
    function Entries() { const rows = data.entries.filter(x => x.childId === cid); return <div className="entries">{rows.map(e => <article key={e.id}><div className="entry-icon">{e.type === "special" ? "🎉" : e.type === "star" ? "✨" : "📝"}</div><div className="entry-copy"><h3>{e.title}{e.type==="special"&&` × ${e.amount}`}</h3><small>{e.date} · {e.status==="pending"?"等待家長確認":"已完成"}</small></div><strong className={e.type === "deduct" ? "red" : ""}>{e.status==="pending"?"待確認":e.type === "special" ? "特殊獎勵" : `${e.type === "star" ? "+" : "−"}${e.amount} ★`}</strong>{role === "家長"&&e.status==="pending"&&<button className="primary" onClick={()=>approveEntry(e)}>確認</button>}{role === "家長" && <button className="delete" onClick={() => confirm("確定刪除這筆紀錄？") && removeEntry(e)}>刪除</button>}</article>)}{!rows.length && <p className="empty">尚無紀錄</p>}</div>; }
    function RecordModal() {
        const [t, setT] = useState("star"), [name, setName] = useState(""), [n, setN] = useState(0);
        const picks=data.templates.filter(x=>x.type===t);
        return <div className="modal-back"><section className="modal"><button className="close" onClick={() => setRecord(false)}>×</button><h2>新增紀錄</h2><div className="toggle three">{[["star", "加星"], ["deduct", "扣星"], ["special", "特殊獎勵"]].map(x => <button key={x[0]} className={t === x[0] ? "chosen" : ""} onClick={() => {setT(x[0]);setN(x[0]==="special"?1:0)}}>{x[1]}</button>)}</div>{picks.length>0&&<div className="quick-picks"><b>快速選取</b>{picks.map(x=>{const count=Math.max(1,Math.abs(Math.floor(Number(x.amount)||1)));return <button key={x.id} className={x.type==="deduct"?"deduct-pick":""} onClick={()=>{setName(x.title);setN(count)}}>{x.title} × {count}</button>})}</div>}<label>{t === "special" ? "獎勵內容" : "發生了什麼事？"}<input value={name} onChange={e => setName(e.target.value)} placeholder={t === "special" ? "例如：冰淇淋" : "例如：主動收好玩具"}/></label>{t==="special"?<label>獎勵數量<input type="number" min="1" value={n} onChange={e => setN(Math.max(0,Math.floor(+e.target.value)))}/></label>:<div className="star-amount"><b>星星數量</b><div className={`star-picker ${t==="deduct"?"deduct":"add"}`} role="group" aria-label="選擇星星數量">{[1,2,3,4,5].map(value=><button type="button" key={value} className={n>=value?"filled":""} aria-label={`${value} 顆星星`} aria-pressed={n>=value} onClick={()=>setN(value)}>{n>=value?"★":"☆"}</button>)}</div><label>其他數量<input type="number" min="1" inputMode="numeric" value={n||""} placeholder="可輸入 6 顆以上" onChange={e=>setN(Math.max(0,Math.floor(+e.target.value)))}/></label>{n>0&&<small>目前選擇 {n} 顆</small>}</div>}<div className="record-actions"><button className="save" onClick={() => { if (!name)return say("請填寫內容");if(!Number.isFinite(n)||n<1)return say(t==="special"?"請填寫獎勵數量":"請選擇星星數量"); addEntry(name, t === "deduct" ? -n : n, t as Entry["type"]); setRecord(false); }}>儲存紀錄</button><button type="button" className="cancel-action" onClick={() => setRecord(false)}>取消</button></div></section></div>;
    }
    function RedeemModal() { const r = redeem!, special=r.source==="special",cost=special?0:r.cost,remain=child.stars-cost; return <div className="modal-back"><section className="modal"><button className="close" onClick={() => setRedeem(null)}>×</button><h2>{role==="孩子"?"提出兌換申請":"確認兌換"} {r.icon}</h2><div className="confirm-box"><p>兌換項目<strong>{r.name}</strong></p><p>兌換方式<strong>{special?"特殊獎勵庫存":"使用星星"}</strong></p><p>本次使用<strong>{special?"庫存 1 個":`${cost} 顆`}</strong></p><p>確認後剩餘<strong>{special?`${Math.max(0,r.stock-1)} 個`:`${remain} 顆`}</strong></p></div><button className="save" onClick={() => { const red:Redeem = { id: crypto.randomUUID(), childId: cid, reward: r.name, cost, date: now(),status:role==="孩子"?"pending":"completed",source:special?"special":"star" }, next = role==="孩子"?{...data,redemptions:[red,...data.redemptions]}:{ ...data, redemptions: [red, ...data.redemptions], children: data.children.map(c => c.id === cid ? { ...c, stars: remain } : c),specialRewards:special?specialStock(data.specialRewards,r.name,-1):data.specialRewards }; if(role==="孩子")submitPending("child_redemption",red,next);else persist(next); setRedeem(null); setTab("兌換紀錄"); }}>{role==="孩子"?"送出，等待家長確認":"確認已出貨"}</button></section></div>; }
    function Settings() { const c = child; return <div className="settings-grid"><section className="settings-card"><h2>🧒🏻 孩子資料</h2><label>姓名<input value={c.name} onChange={e => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, name: e.target.value } : x) })}/></label><label>性別<select value={c.gender} onChange={e => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, gender: e.target.value as Child["gender"], avatar: e.target.value } : x) })}><option value="boy">男生</option><option value="girl">女生</option></select></label><div className="avatar-options"><button onClick={() => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, avatar: "boy" } : x) })}>👦🏻 男生頭像</button><button onClick={() => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, avatar: "girl" } : x) })}>👧🏻 女生頭像</button><label className="upload" htmlFor={`avatar-upload-${cid}`}>{c.avatar!=="boy"&&c.avatar!=="girl"?<img className="upload-preview" src={c.avatar} alt="目前的大頭照"/>:"📷"} 上傳大頭照</label><input id={`avatar-upload-${cid}`} className="file-input" type="file" accept="image/*" onChange={e => {const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)startCrop(file,"avatar",cid)}}/></div><button className="add-line" onClick={() => { const n = { id: crypto.randomUUID(), name: `孩子 ${data.children.length + 1}`, gender: "boy" as const, avatar: "boy", stars: 0 }; setData({ ...data, children: [...data.children, n] }); setCid(n.id); }}>＋ 新增孩子</button><button className="delete-child" disabled={data.children.length === 1} onClick={() => { if (confirm("刪除孩子也會刪除他的所有紀錄，確定嗎？")) {
        const rest = data.children.filter(x => x.id !== cid);
        setCid(rest[0].id);
        persist({ ...data, children: rest, entries: data.entries.filter(x => x.childId !== cid), redemptions: data.redemptions.filter(x => x.childId !== cid) });
    } }}>刪除這位孩子</button></section><section className="settings-card"><h2>🔐 家長密碼</h2><label>設定新密碼<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 4 個字元"/></label><button className="add-line" onClick={() => password.length >= 4 ? persist(data, password) : say("密碼至少 4 個字元")}>更新家長密碼</button></section>
    <section className="settings-card wide"><h2>✨ 常用快速指標</h2><div className="table-head"><span>類型</span><span>指標／獎勵內容</span><span>數量</span><span>操作</span></div><div className="edit-list">{data.templates.map(t => <div key={t.id}><select value={t.type} onChange={e => setData({ ...data, templates: data.templates.map(x => x.id === t.id ? { ...x, type: e.target.value as Template["type"] } : x) })}><option value="star">加星</option><option value="deduct">扣星</option><option value="special">特殊獎勵</option></select><input value={t.title} onChange={e => setData({ ...data, templates: data.templates.map(x => x.id === t.id ? { ...x, title: e.target.value } : x) })}/><input type="number" min="1" value={t.amount} onChange={e => setData({ ...data, templates: data.templates.map(x => x.id === t.id ? { ...x, amount: Math.max(1,Math.floor(+e.target.value||1)) } : x) })}/><button onClick={() => setData({ ...data, templates: data.templates.filter(x => x.id !== t.id) })}>刪除</button></div>)}</div><button className="add-line" onClick={() => setData({ ...data, templates: [...data.templates, { id: crypto.randomUUID(), title: "新指標", amount: 1, type: "star" }] })}>＋ 新增快速指標</button></section>
    <section className="settings-card wide"><h2>🎁 星星寶庫</h2><div className="table-head"><span>圖示／圖片</span><span>獎品名稱</span><span>星星</span><span>操作</span></div><div className="edit-list">{data.rewards.map(r => <div key={r.id}><label className="reward-upload" htmlFor={`reward-upload-${r.id}`}>{r.image?<img src={r.image} alt={`${r.name}圖片`}/>:r.icon} 📷</label><input id={`reward-upload-${r.id}`} className="file-input" type="file" accept="image/*" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)startCrop(file,"reward",r.id)}}/><input value={r.name} onChange={e => setData({ ...data, rewards: data.rewards.map(x => x.id === r.id ? { ...x, name: e.target.value } : x) })}/><input type="number" min="1" step="1" value={positiveInt(r.cost)} onChange={e => setData({ ...data, rewards: data.rewards.map(x => x.id === r.id ? { ...x, cost: positiveInt(e.target.value) } : x) })}/><button className="delete" onClick={()=>confirm(`確定刪除「${r.name}」？`)&&setData({...data,rewards:data.rewards.filter(x=>x.id!==r.id)})}>刪除</button></div>)}</div><button className="add-line" onClick={() => setData({ ...data, rewards: [...data.rewards, { id: crypto.randomUUID(), icon: "🎁", name: "新獎品", cost: 10, stock: 0 }] })}>＋ 新增獎品</button></section><button className="settings-save" onClick={() => persist(data)}>儲存所有設定</button></div>; }
}
function Avatar({ c }: {
    c: Child;
}) { return c.avatar!=="boy"&&c.avatar!=="girl" ? <img className="headshot" src={c.avatar} alt={c.name}/> : <span>{c.avatar === "girl" ? "👧🏻" : "👦🏻"}</span>; }
function Title({ text }: {
    text: string;
}) { return <div className="section-head"><h2>{text}</h2></div>; }

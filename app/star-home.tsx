"use client";
import { useEffect, useMemo, useState } from "react";
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
const fallback: State = { children: [{ id: "c1", name: "小宇", gender: "boy", avatar: "boy", stars: 0 }], entries: [], rewards: [{ id: "r1", icon: "🍦", name: "冰淇淋", cost: 12, stock: 0 }], templates: [{ id: "t1", title: "主動整理書包", amount: 3, type: "star" }], redemptions: [],specialRewards:[] };
const now = () => new Date().toLocaleString("zh-TW", { hour12: false });
export default function App() {
    const [data, setData] = useState(fallback), [cid, setCid] = useState("c1"), [tab, setTab] = useState("首頁"), [role, setRole] = useState("孩子"), [password, setPassword] = useState(""), [passwordSet, setPasswordSet] = useState(false), [login, setLogin] = useState(false), [record, setRecord] = useState(false), [redeem, setRedeem] = useState<Reward | null>(null), [toast, setToast] = useState(""), [loading, setLoading] = useState(true);
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
    return <main><header className="topbar"><button className="brand" onClick={() => setTab("首頁")}><span>★</span>星星日記</button><nav>{["首頁", "星星紀錄", "星星寶庫", "兌換紀錄", ...(role === "家長" ? ["家庭設定"] : [])].map(x => <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>)}</nav><div className="role-switch"><button className={role === "家長" ? "on" : ""} onClick={enterParent}>家長</button><button className={role === "孩子" ? "on" : ""} onClick={() => { setRole("孩子"); setTab("首頁"); }}>孩子</button></div></header><section className="shell"><div className="hello"><div><p className="eyebrow">FAMILY STAR JOURNAL</p><h1>{tab === "首頁" ? `嗨，${child.name}！今天也很棒 👋` : tab}</h1><p>每位孩子都有自己的星星與完整紀錄。</p></div><label className="child-pill"><Avatar c={child}/><select value={cid} onChange={e => setCid(e.target.value)}>{data.children.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div>
    {tab === "首頁" && <><section className="hero-grid"><article className="balance-card"><p>我的星星</p><div className="big-star"><span>★</span><strong>{child.stars}</strong></div><small>每一次努力，都值得被看見</small></article><article className="week-card"><p>快速選取指標</p><div className="template-picks">{data.templates.map(t => <button key={t.id} onClick={() => quick(t)}>{t.type === "star" ? "＋" : t.type==="deduct"?"−":"🎉"}{t.amount}　{t.title}</button>)}</div></article><article className="quick-card"><p>新增紀錄</p><strong>今天發生什麼事？</strong><div><button onClick={() => setRecord(true)}><span>＋★</span>加星／扣星／特殊</button></div></article></section><Title text="最近紀錄"/><Entries /></>}
    {tab === "星星紀錄" && <><div className="record-tools"><span>日期與時間皆會自動記錄</span>{role === "家長" && <button className="primary" onClick={() => setRecord(true)}>＋ 新增紀錄</button>}</div><Entries /></>}
    {tab === "星星寶庫" && <><div className="reward-top"><div><span>★</span><p>{child.name}目前有 <b>{child.stars}</b> 顆星星</p></div></div><Title text="星星獎品"/><div className="reward-grid">{data.rewards.map(r => <article className="reward-card" key={r.id}><div className="reward-icon">{r.image?<img src={r.image} alt={r.name}/>:r.icon}</div><h3>{r.name}</h3><p><span>★</span> {r.cost} 顆</p><button onClick={() => { if (child.stars < r.cost)return say(`星星不足，還差 ${r.cost - child.stars} 顆`); setRedeem({...r,source:"star"}); }}>使用星星兌換</button></article>)}</div><Title text="特殊獎勵倉庫"/><p className="warehouse-note">獲得特殊獎勵會自動進貨；家長確認兌換後出貨，庫存為 0 時自動下架。</p><div className="reward-grid">{data.specialRewards.filter(r=>r.stock>0).map(r=><article className="reward-card special-card" key={r.id}><div className="reward-icon">{r.image?<img src={r.image} alt={r.name}/>:r.icon}</div><h3>{r.name}</h3><p>庫存 <b>{r.stock}</b> 個</p><button onClick={()=>setRedeem({...r,source:"special"})}>直接兌換</button></article>)}</div>{!data.specialRewards.some(r=>r.stock>0)&&<p className="empty">目前沒有特殊獎勵庫存</p>}</>}
    {tab === "兌換紀錄" && <><Title text="兌換歷史"/><div className="entries">{data.redemptions.filter(x => x.childId === cid).map(x => <article key={x.id}><div className="entry-icon">🎁</div><div className="entry-copy"><h3>{x.reward}</h3><small>{x.date} · {x.status==="pending"?"等待家長確認":"已完成"}</small></div><strong>{x.status==="pending"?"待確認":x.cost ? `−${x.cost} ★` : "直接兌換"}</strong>{role==="家長"&&x.status==="pending"&&<button className="primary" onClick={()=>confirmRedemption(x)}>確認已執行</button>}</article>)}{!data.redemptions.some(x => x.childId === cid) && <p className="empty">目前還沒有兌換紀錄</p>}</div></>}
    {tab === "家庭設定" && role === "家長" && Settings()}</section>{record && <RecordModal />}{redeem && <RedeemModal />}{login && <div className="modal-back"><section className="modal"><button className="close" onClick={() => setLogin(false)}>×</button><h2>輸入家長密碼</h2><input className="full-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus/><button className="save" onClick={verify}>進入家長模式</button></section></div>}{toast && <div className="toast">{toast}</div>}</main>;
    function quick(t: Template) { const amount = t.type === "deduct" ? -t.amount : t.amount; addEntry(t.title, amount, t.type); }
    function specialStock(list:Reward[],title:string,amount:number){const found=list.find(r=>r.name.trim()===title.trim());const next=found?list.map(r=>r.id===found.id?{...r,stock:Math.max(0,r.stock+amount)}:r):amount>0?[...list,{id:crypto.randomUUID(),icon:"🎁",name:title.trim(),cost:0,stock:amount,source:"special" as const}]:list;return next.filter(r=>r.stock>0)}
    function addEntry(title: string, amount: number, type: Entry["type"]) { const pending=role==="孩子",e:Entry = { id: crypto.randomUUID(), childId: cid, title, amount: Math.abs(amount), type, date: now(),status:pending?"pending":"completed" }, delta=pending||type==="special"?0:amount, next = { ...data, entries: [e, ...data.entries], children: data.children.map(c => c.id === cid ? { ...c, stars: Math.max(0, c.stars + delta) } : c),specialRewards:!pending&&type==="special"?specialStock(data.specialRewards,title,Math.abs(amount)):data.specialRewards }; if(pending)submitPending("child_entry",e,next);else persist(next); }
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
    function removeEntry(e: Entry) { const delta = e.type === "star" ? e.amount : e.type === "deduct" ? -e.amount : 0; persist({ ...data, entries: data.entries.filter(x => x.id !== e.id), children: data.children.map(c => c.id === e.childId ? { ...c, stars: Math.max(0, c.stars - delta) } : c),specialRewards:e.type==="special"&&e.status!=="pending"?specialStock(data.specialRewards,e.title,-e.amount):data.specialRewards }); }
    function approveEntry(e:Entry){const delta=e.type==="star"?e.amount:e.type==="deduct"?-e.amount:0;persist({...data,entries:data.entries.map(x=>x.id===e.id?{...x,status:"completed"}:x),children:data.children.map(x=>x.id===e.childId?{...x,stars:Math.max(0,x.stars+delta)}:x),specialRewards:e.type==="special"?specialStock(data.specialRewards,e.title,e.amount):data.specialRewards})}
    function confirmRedemption(red:Redeem){const special=red.source==="special",item=data.specialRewards.find(x=>x.name===red.reward),cost=special?0:red.cost,current=data.children.find(x=>x.id===red.childId);if(special&&(!item||item.stock<1))return say("特殊獎勵庫存不足");if(!current||(!special&&current.stars<cost))return say("星星不足，無法確認");persist({...data,redemptions:data.redemptions.map(x=>x.id===red.id?{...x,status:"completed"}:x),children:data.children.map(x=>x.id===red.childId?{...x,stars:x.stars-cost}:x),specialRewards:special?specialStock(data.specialRewards,red.reward,-1):data.specialRewards})}
    function Entries() { const rows = data.entries.filter(x => x.childId === cid); return <div className="entries">{rows.map(e => <article key={e.id}><div className="entry-icon">{e.type === "special" ? "🎉" : e.type === "star" ? "✨" : "📝"}</div><div className="entry-copy"><h3>{e.title}{e.type==="special"&&` × ${e.amount}`}</h3><small>{e.date} · {e.status==="pending"?"等待家長確認":"已完成"}</small></div><strong className={e.type === "deduct" ? "red" : ""}>{e.status==="pending"?"待確認":e.type === "special" ? "特殊獎勵" : `${e.type === "star" ? "+" : "−"}${e.amount} ★`}</strong>{role === "家長"&&e.status==="pending"&&<button className="primary" onClick={()=>approveEntry(e)}>確認</button>}{role === "家長" && <button className="delete" onClick={() => confirm("確定刪除這筆紀錄？") && removeEntry(e)}>刪除</button>}</article>)}{!rows.length && <p className="empty">尚無紀錄</p>}</div>; }
    function RecordModal() { const [t, setT] = useState("star"), [name, setName] = useState(""), [n, setN] = useState(1); const picks=data.templates.filter(x=>x.type===t); return <div className="modal-back"><section className="modal"><button className="close" onClick={() => setRecord(false)}>×</button><h2>新增紀錄</h2><div className="toggle three">{[["star", "加星"], ["deduct", "扣星"], ["special", "特殊獎勵"]].map(x => <button key={x[0]} className={t === x[0] ? "chosen" : ""} onClick={() => setT(x[0])}>{x[1]}</button>)}</div>{picks.length>0&&<div className="quick-picks"><b>快速選取</b>{picks.map(x=><button key={x.id} onClick={()=>{setName(x.title);setN(x.amount)}}>{x.title} × {x.amount}</button>)}</div>}<label>{t === "special" ? "獎勵內容" : "發生了什麼事？"}<input value={name} onChange={e => setName(e.target.value)} placeholder={t === "special" ? "例如：冰淇淋" : "例如：主動收好玩具"}/></label><label>{t === "special" ? "獎勵數量" : "星星數量"}<input type="number" min="1" value={n} onChange={e => setN(+e.target.value)}/></label><button className="save" onClick={() => { if (!name)
        return say("請填寫內容"); addEntry(name, t === "deduct" ? -n : n, t as Entry["type"]); setRecord(false); }}>儲存紀錄</button></section></div>; }
    function RedeemModal() { const r = redeem!, special=r.source==="special",cost=special?0:r.cost,remain=child.stars-cost; return <div className="modal-back"><section className="modal"><button className="close" onClick={() => setRedeem(null)}>×</button><h2>{role==="孩子"?"提出兌換申請":"確認兌換"} {r.icon}</h2><div className="confirm-box"><p>兌換項目<strong>{r.name}</strong></p><p>兌換方式<strong>{special?"特殊獎勵庫存":"使用星星"}</strong></p><p>本次使用<strong>{special?"庫存 1 個":`${cost} 顆`}</strong></p><p>確認後剩餘<strong>{special?`${Math.max(0,r.stock-1)} 個`:`${remain} 顆`}</strong></p></div><button className="save" onClick={() => { const red:Redeem = { id: crypto.randomUUID(), childId: cid, reward: r.name, cost, date: now(),status:role==="孩子"?"pending":"completed",source:special?"special":"star" }, next = role==="孩子"?{...data,redemptions:[red,...data.redemptions]}:{ ...data, redemptions: [red, ...data.redemptions], children: data.children.map(c => c.id === cid ? { ...c, stars: remain } : c),specialRewards:special?specialStock(data.specialRewards,r.name,-1):data.specialRewards }; if(role==="孩子")submitPending("child_redemption",red,next);else persist(next); setRedeem(null); setTab("兌換紀錄"); }}>{role==="孩子"?"送出，等待家長確認":"確認已出貨"}</button></section></div>; }
    function Settings() { const c = child; async function upload(f: File) { const url=await uploadImage(f,"avatar");if(!url)return;const ok=await persist({ ...data, children: data.children.map(v => v.id === cid ? { ...v, avatar: url } : v) });if(ok)say("大頭照已更新"); } return <div className="settings-grid"><section className="settings-card"><h2>🧒🏻 孩子資料</h2><label>姓名<input value={c.name} onChange={e => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, name: e.target.value } : x) })}/></label><label>性別<select value={c.gender} onChange={e => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, gender: e.target.value as Child["gender"], avatar: e.target.value } : x) })}><option value="boy">男生</option><option value="girl">女生</option></select></label><div className="avatar-options"><button onClick={() => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, avatar: "boy" } : x) })}>👦🏻 男生頭像</button><button onClick={() => setData({ ...data, children: data.children.map(x => x.id === cid ? { ...x, avatar: "girl" } : x) })}>👧🏻 女生頭像</button><label className="upload" htmlFor={`avatar-upload-${cid}`}>{c.avatar!=="boy"&&c.avatar!=="girl"?<img className="upload-preview" src={c.avatar} alt="目前的大頭照"/>:"📷"} 上傳大頭照</label><input id={`avatar-upload-${cid}`} className="file-input" type="file" accept="image/*" onChange={e => {const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)upload(file)}}/></div><button className="add-line" onClick={() => { const n = { id: crypto.randomUUID(), name: `孩子 ${data.children.length + 1}`, gender: "boy" as const, avatar: "boy", stars: 0 }; setData({ ...data, children: [...data.children, n] }); setCid(n.id); }}>＋ 新增孩子</button><button className="delete-child" disabled={data.children.length === 1} onClick={() => { if (confirm("刪除孩子也會刪除他的所有紀錄，確定嗎？")) {
        const rest = data.children.filter(x => x.id !== cid);
        setCid(rest[0].id);
        persist({ ...data, children: rest, entries: data.entries.filter(x => x.childId !== cid), redemptions: data.redemptions.filter(x => x.childId !== cid) });
    } }}>刪除這位孩子</button></section><section className="settings-card"><h2>🔐 家長密碼</h2><label>設定新密碼<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 4 個字元"/></label><button className="add-line" onClick={() => password.length >= 4 ? persist(data, password) : say("密碼至少 4 個字元")}>更新家長密碼</button></section>
    <section className="settings-card wide"><h2>✨ 常用快速指標</h2><div className="table-head"><span>類型</span><span>指標／獎勵內容</span><span>數量</span><span>操作</span></div><div className="edit-list">{data.templates.map(t => <div key={t.id}><select value={t.type} onChange={e => setData({ ...data, templates: data.templates.map(x => x.id === t.id ? { ...x, type: e.target.value as Template["type"] } : x) })}><option value="star">加星</option><option value="deduct">扣星</option><option value="special">特殊獎勵</option></select><input value={t.title} onChange={e => setData({ ...data, templates: data.templates.map(x => x.id === t.id ? { ...x, title: e.target.value } : x) })}/><input type="number" value={t.amount} onChange={e => setData({ ...data, templates: data.templates.map(x => x.id === t.id ? { ...x, amount: +e.target.value } : x) })}/><button onClick={() => setData({ ...data, templates: data.templates.filter(x => x.id !== t.id) })}>刪除</button></div>)}</div><button className="add-line" onClick={() => setData({ ...data, templates: [...data.templates, { id: crypto.randomUUID(), title: "新指標", amount: 1, type: "star" }] })}>＋ 新增快速指標</button></section>
    <section className="settings-card wide"><h2>🎁 星星寶庫</h2><div className="table-head"><span>圖示／圖片</span><span>獎品名稱</span><span>星星</span><span>操作</span></div><div className="edit-list">{data.rewards.map(r => <div key={r.id}><label className="reward-upload" htmlFor={`reward-upload-${r.id}`}>{r.image?<img src={r.image} alt={`${r.name}圖片`}/>:r.icon} 📷</label><input id={`reward-upload-${r.id}`} className="file-input" type="file" accept="image/*" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)uploadReward(file,r.id)}}/><input value={r.name} onChange={e => setData({ ...data, rewards: data.rewards.map(x => x.id === r.id ? { ...x, name: e.target.value } : x) })}/><input type="number" value={r.cost} onChange={e => setData({ ...data, rewards: data.rewards.map(x => x.id === r.id ? { ...x, cost: +e.target.value } : x) })}/><button className="delete" onClick={()=>confirm(`確定刪除「${r.name}」？`)&&setData({...data,rewards:data.rewards.filter(x=>x.id!==r.id)})}>刪除</button></div>)}</div><button className="add-line" onClick={() => setData({ ...data, rewards: [...data.rewards, { id: crypto.randomUUID(), icon: "🎁", name: "新獎品", cost: 10, stock: 0 }] })}>＋ 新增獎品</button></section><button className="settings-save" onClick={() => persist(data)}>儲存所有設定</button></div>; }
}
function Avatar({ c }: {
    c: Child;
}) { return c.avatar!=="boy"&&c.avatar!=="girl" ? <img className="headshot" src={c.avatar} alt={c.name}/> : <span>{c.avatar === "girl" ? "👧🏻" : "👦🏻"}</span>; }
function Title({ text }: {
    text: string;
}) { return <div className="section-head"><h2>{text}</h2></div>; }

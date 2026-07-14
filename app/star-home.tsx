"use client";

import { useMemo, useState } from "react";

type Entry = { id:number; title:string; note:string; delta:number; time:string; author:string; icon:string; locked?:boolean };
const initial: Entry[] = [
  { id:1, title:"主動整理書包", note:"睡前自己檢查明天的課本", delta:3, time:"今天 19:20", author:"媽媽", icon:"🎒" },
  { id:2, title:"游泳比賽完成 50 公尺", note:"勇敢完成比賽，刷新自己的紀錄！", delta:8, time:"昨天 16:45", author:"爸爸", icon:"🏊", locked:true },
  { id:3, title:"和同學發生衝突", note:"午休時推了同學，已經一起道歉和討論", delta:-2, time:"7月12日 13:10", author:"媽媽", icon:"💬", locked:true },
];
const rewards = [
  { icon:"🍦", name:"選一份小點心", cost:12, color:"#ffe4d2" },
  { icon:"🎮", name:"週末遊戲 30 分鐘", cost:20, color:"#dceeff" },
  { icon:"🎬", name:"家庭電影選片權", cost:35, color:"#e9e1ff" },
  { icon:"🧩", name:"挑一個新玩具", cost:80, color:"#dff3df" },
];

export default function StarHome() {
  const [tab,setTab] = useState("首頁");
  const [role,setRole] = useState<"家長"|"孩子">("家長");
  const [entries,setEntries] = useState(initial);
  const [open,setOpen] = useState(false);
  const [kind,setKind] = useState<"reward"|"deduct">("reward");
  const [amount,setAmount] = useState(3);
  const [title,setTitle] = useState("");
  const [toast,setToast] = useState("");
  const balance = useMemo(()=>42 + entries.slice(initial.length).reduce((n,e)=>n+e.delta,0),[entries]);
  const announce=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(""),2600)};
  const save=()=>{
    if(!title.trim()) return;
    const delta=kind==="reward"?amount:-amount;
    setEntries([{id:Date.now(),title,note:"剛剛新增的家庭紀錄",delta,time:"剛剛",author:"媽媽",icon:kind==="reward"?"✨":"📝"},...entries]);
    setTitle("");setOpen(false);announce(`已記錄 ${delta>0?"+":""}${delta} 顆星星`);
  };
  const redeem=(name:string,cost:number)=>{if(role==="孩子") return announce("請家長確認後再兌換"); if(balance<cost)return announce("星星還不夠喔，再加油！"); setEntries([{id:Date.now(),title:`兌換：${name}`,note:"獎品兌換紀錄",delta:-cost,time:"剛剛",author:"媽媽",icon:"🎁"},...entries]);announce("兌換成功，已加入紀錄");};

  return <main>
    <header className="topbar">
      <button className="brand" onClick={()=>setTab("首頁")}><span>★</span> 星星日記</button>
      <nav>{["首頁","星星紀錄","獎品池"].map(x=><button className={tab===x?"active":""} key={x} onClick={()=>setTab(x)}>{x}</button>)}</nav>
      <div className="role-switch"><button className={role==="家長"?"on":""} onClick={()=>setRole("家長")}>家長</button><button className={role==="孩子"?"on":""} onClick={()=>setRole("孩子")}>孩子</button></div>
      <div className="avatar">林<span>媽媽</span></div>
    </header>

    <section className="shell">
      <div className="hello"><div><p className="eyebrow">WEDNESDAY · 15 JULY</p><h1>{tab==="首頁"?"嗨，小宇！今天也很棒 👋":tab}</h1><p>{tab==="獎品池"?"看看下一個想努力兌換的獎品吧。":"每一顆星星，都是努力留下的證明。"}</p></div><div className="child-pill"><span>🧒🏻</span><div><small>目前查看</small><b>林小宇⌄</b></div></div></div>

      {tab==="首頁" && <>
        <section className="hero-grid">
          <article className="balance-card"><div className="spark one">✦</div><div className="spark two">✦</div><p>我的星星</p><div className="big-star"><span>★</span><strong>{balance}</strong></div><small>距離「家庭電影選片權」已經達成！</small><div className="progress"><i style={{width:`${Math.min(100,balance/35*100)}%`}} /></div></article>
          <article className="week-card"><div className="card-title"><div><p>本週表現</p><strong>持續進步中</strong></div><span className="up">↗ +12</span></div><div className="bars">{[5,8,3,10,7,2,6].map((v,i)=><div key={i}><span style={{height:v*9}} className={i===3?"today":""}></span><small>{"一二三四五六日"[i]}</small></div>)}</div></article>
          <article className="quick-card"><p>快速記一筆</p><strong>今天發生什麼好事？</strong><div><button onClick={()=>{setKind("reward");setOpen(true)}}><span>＋★</span>加星星</button><button className="minus" onClick={()=>{setKind("deduct");setOpen(true)}}><span>−★</span>扣星星</button></div><small>可自由調整顆數，也能附上照片</small></article>
        </section>
        <div className="section-head"><div><h2>最近紀錄</h2><p>全家人新增的星星動態</p></div><button onClick={()=>setTab("星星紀錄")}>查看全部 →</button></div>
        <EntryList entries={entries.slice(0,3)} role={role} announce={announce}/>
      </>}

      {tab==="星星紀錄" && <><div className="record-tools"><div><button className="selected">全部</button><button>加星</button><button>扣星</button><button>兌換</button></div>{role==="家長"&&<button className="primary" onClick={()=>setOpen(true)}>＋ 新增紀錄</button>}</div><EntryList entries={entries} role={role} announce={announce}/></>}

      {tab==="獎品池" && <><div className="reward-top"><div><span>★</span><p>小宇目前有 <b>{balance}</b> 顆星星</p></div><small>兌換會自動留下日期、獎品與使用星數</small></div><div className="reward-grid">{rewards.map(r=><article key={r.name} className="reward-card"><div className="reward-icon" style={{background:r.color}}>{r.icon}</div><h3>{r.name}</h3><p><span>★</span> {r.cost} 顆</p><button disabled={balance<r.cost} onClick={()=>redeem(r.name,r.cost)}>{balance>=r.cost?"兌換獎品":"還差一些星星"}</button></article>)}</div><div className="history"><h2>最近兌換</h2><div><span className="round">🎨</span><p><b>新盒彩色筆</b><small>7月6日 · 媽媽確認</small></p><strong>−30 ★</strong></div></div></>}
    </section>

    {open&&<div className="modal-back" onMouseDown={()=>setOpen(false)}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setOpen(false)}>×</button><p className="eyebrow">新增星星紀錄</p><h2>{kind==="reward"?"為努力加顆星":"一起記下要改進的事"}</h2><div className="toggle"><button className={kind==="reward"?"chosen":""} onClick={()=>setKind("reward")}>＋ 加星星</button><button className={kind==="deduct"?"chosen bad":""} onClick={()=>setKind("deduct")}>− 扣星星</button></div><label>發生了什麼事？<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：主動收好玩具" autoFocus /></label><label>星星數量<div className="counter"><button onClick={()=>setAmount(Math.max(1,amount-1))}>−</button><b>{amount} ★</b><button onClick={()=>setAmount(amount+1)}>＋</button></div></label><button className="photo">📷 加入照片佐證（選填）</button><div className="rule">🔒 送出後 12 小時內可修改，之後需家長超級權限。</div><button className="save" onClick={save}>儲存這筆紀錄</button></section></div>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>
}

function EntryList({entries,role,announce}:{entries:Entry[];role:string;announce:(s:string)=>void}){return <div className="entries">{entries.map(e=><article key={e.id}><div className={`entry-icon ${e.delta<0?"negative":""}`}>{e.icon}</div><div className="entry-copy"><h3>{e.title}</h3><p>{e.note}</p><small>{e.time} · {e.author}記錄 {e.locked&&"· 🔒 已鎖定"}</small></div><strong className={e.delta<0?"red":""}>{e.delta>0?"+":""}{e.delta} <span>★</span></strong>{role==="家長"&&<button className="more" onClick={()=>announce(e.locked?"已超過 12 小時，需超級權限才能修改":"這筆紀錄仍可修改")}>•••</button>}</article>)}</div>}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { signOut } from "next-auth/react";
import { buildAnalyticsWorkbook } from "./excel-export";
import {
    buildAnalyticsReport,
    earliestAnalyticsDate,
    resolveAnalyticsDateRange,
    splitAnalyticsRangeIntoWeekPeriods,
    type AnalyticsRangePreset,
} from "./analytics-report";
import { clonePersistedState, settingsSignature } from "./settings-draft";
import { acceptsEditableIntegerDraft, normalizeEditableInteger, validEditableInteger } from "./integer-input-logic";
import { formatTaipeiOccurrence, isFutureTaipeiDateTime, taipeiDateTimeInput, taipeiLocalToIso } from "./record-time";
import { validatePasswordPair, validateSecuritySetup } from "./security-logic";
import {
    DEFAULT_DAILY_TASK_SETTINGS,
    addCalendarDays,
    calculateTaskStreak,
    compareDailyTaskDefinitions,
    dailyTaskDayView,
    formatTaipeiDate,
    formatTaipeiTime,
    goalResult,
    taipeiDateKey,
    taskGoalSettingsForRecords,
    taskSettingsForChild,
    weeklyTaskProgress,
    type DailyTaskDefinition,
    type DailyTaskRecord,
    type DailyTaskSettings,
    type DailyTaskSettingsMap,
    type DailyTaskSortMode,
} from "./daily-task-logic";
import { OfficialTaskLibrary, type OfficialTaskAddConfig } from "./official-task-library-modal";
import { TIME_SLOT_META, type OfficialTaskTimeSlot } from "./official-task-library";
import { changeTemplateType, moveTemplateWithinType, normalizeTemplateSortOrders, orderedTemplatesByType, type QuickTemplateType } from "./quick-template-logic";
import { EVERY_DAY, WEEKDAYS, WEEKDAY_OPTIONS, WEEKEND, normalizeWeekdays, weekdayPreset } from "./weekday-selection";
import { calculateChildStarBalance, logStarBalanceDebug, reconcileChildStarBalances } from "./star-balance";
import { AccountManagement } from "./account-management";
import {
    formatWeekRange,
    getWeeklyRedemptionSummary,
    getWeeklyStarAnalytics,
    sortRedemptionSummary,
    type RedemptionSortKey,
    type SortDirection,
    type StarCategory,
    type WeeklyStarAnalytics,
} from "./analytics-logic";
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
    status?: "pending" | "completed" | "revoked";
    source?: "star" | "special";
    sourceType?: "daily_task" | "quick_add" | "quick_deduct" | "special_reward" | "manual";
    sourceId?: string;
    occurredAt?: string;
    createdAt?: string;
    revokedAt?: string;
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
type RewardIconAsset = {
    id: string;
    name: string;
    image: string;
    hash?: string;
    createdAt?: string;
};
type Template = {
    id: string;
    title: string;
    amount: number;
    type: "star" | "deduct" | "special";
    sortOrder?: number;
};
type Redeem = {
    id: string;
    childId: string;
    reward: string;
    cost: number;
    date: string;
    status?: "pending" | "completed" | "cancelled" | "rejected" | "failed";
    source?: "star" | "special";
    rewardNameSnapshot?: string;
    costSnapshot?: number;
    totalCost?: number;
    quantity?: number;
    completedAt?: string;
    createdAt?: string;
    updatedAt?: string;
};
type State = {
    children: Child[];
    entries: Entry[];
    rewards: Reward[];
    templates: Template[];
    redemptions: Redeem[];
    specialRewards: Reward[];
    rewardIconLibrary: RewardIconAsset[];
    dailyTasks: DailyTaskDefinition[];
    dailyTaskRecords: DailyTaskRecord[];
    dailyTaskSettings: DailyTaskSettingsMap;
    favoriteOfficialTaskIds: string[];
    dailyTaskSortMode: DailyTaskSortMode;
};
function withCalculatedStarBalances(state:State):State{
    return {...state,children:reconcileChildStarBalances(state.children,state.entries,state.redemptions)};
}
type CropTarget = { file: File; url: string; kind: "avatar" | "reward"; targetId: string };
type AnalysisFilter = "all" | "star" | "deduct";
type SettingsIntent =
    | { kind: "tab"; value: string }
    | { kind: "child"; value: string }
    | { kind: "childMode" };
type SettingsTabKey = "children" | "security" | "dailyTasks" | "quickActions" | "rewards";
const SETTINGS_TABS: Array<{ key: SettingsTabKey; icon: string; label: string }> = [
    { key: "children", icon: "👦", label: "孩子資料" },
    { key: "security", icon: "🔐", label: "安全設定" },
    { key: "dailyTasks", icon: "📋", label: "每日任務" },
    { key: "quickActions", icon: "✨", label: "快速指標" },
    { key: "rewards", icon: "🎁", label: "星星寶庫" },
];
function settingsTabFromHash(hash: string): SettingsTabKey | null {
    const value = hash.replace(/^#/, "");
    return SETTINGS_TABS.some(item => item.key === value) ? value as SettingsTabKey : null;
}
type PersistOptions = {
    preserveDraftOnFailure?: boolean;
    optimistic?: boolean;
    successMessage?: string;
    draftForRebase?: State;
};
type SecurityInfo = {
    configured: boolean;
    questionType: string;
    questionText: string;
    hint: string;
    lockedUntil?: string;
};
type SignedInAccount = {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: "owner" | "parent" | "child";
    boundChildId: string | null;
    childAccountMode: "personal" | "shared" | null;
};
type AccountAccessInfo = {
    role: SignedInAccount["role"];
    boundChildId: string | null;
    childAccountMode: SignedInAccount["childAccountMode"];
    permissions: Array<{ childId: string; canView: boolean; canOperate: boolean }>;
};
const SESSION_EXPIRED_EVENT = "star-diary:session-expired";

async function authenticatedFetch(input:RequestInfo|URL,init?:RequestInit){
    const response=await fetch(input,init);
    if(response.status===401&&typeof window!=="undefined")window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return response;
}

function applyEditableSettings(base:State,settings:State):State{
    const starsByChild=new Map(base.children.map(child=>[child.id,child.stars]));
    return {
        ...base,
        children:clonePersistedState(settings.children).map(child=>({...child,stars:starsByChild.get(child.id)??child.stars})),
        templates:clonePersistedState(settings.templates),
        rewards:clonePersistedState(settings.rewards),
        rewardIconLibrary:clonePersistedState(settings.rewardIconLibrary),
        dailyTasks:clonePersistedState(settings.dailyTasks),
        dailyTaskSettings:clonePersistedState(settings.dailyTaskSettings),
        favoriteOfficialTaskIds:clonePersistedState(settings.favoriteOfficialTaskIds),
        dailyTaskSortMode:settings.dailyTaskSortMode,
    };
}

function prepareSettingsForSave(draft:State):State{
    const childIds=new Set(draft.children.map(child=>child.id));
    return {
        ...clonePersistedState(draft),
        dailyTasks:draft.dailyTasks.map(task=>{const applicableChildIds=task.applicableChildIds.filter(childId=>childIds.has(childId));return{...task,applicableChildIds,weekdays:normalizeWeekdays(task.weekdays),enabled:task.enabled&&applicableChildIds.length>0}}),
        dailyTaskSettings:Object.fromEntries(Object.entries(draft.dailyTaskSettings).filter(([childId])=>childIds.has(childId))),
    };
}
const fallback: State = { children: [], entries: [], rewards: [], templates: [], redemptions: [],specialRewards:[],rewardIconLibrary:[],dailyTasks:[],dailyTaskRecords:[],dailyTaskSettings:{},favoriteOfficialTaskIds:[],dailyTaskSortMode:"flow" };
const emptyChild:Child={id:"",name:"孩子",gender:"boy",avatar:"boy",stars:0};
const BUILTIN_REWARD_ICONS=[
    {value:"🎁",name:"禮物"},{value:"🍦",name:"冰淇淋"},{value:"🍭",name:"糖果"},{value:"🍔",name:"漢堡"},{value:"🍕",name:"披薩"},{value:"🧋",name:"飲料"},{value:"🎮",name:"遊戲"},{value:"📱",name:"手機／3C"},{value:"🎬",name:"電影"},{value:"📷",name:"相機"},{value:"🧸",name:"玩具"},{value:"⚽",name:"運動"},{value:"🏊",name:"游泳"},{value:"🚲",name:"腳踏車"},{value:"🎡",name:"遊樂園"},{value:"✈️",name:"旅行"},{value:"📚",name:"書籍"},{value:"⭐",name:"星星"},{value:"❤️",name:"愛心"},{value:"💰",name:"零用錢"}
];
const BUILTIN_TASK_ICONS=[{value:"🎒",name:"整理書包"},{value:"📚",name:"功課"},{value:"🪥",name:"刷牙"},{value:"🛏️",name:"整理房間"},{value:"🏊",name:"游泳"},{value:"🧹",name:"家事"},{value:"🍽️",name:"收拾餐具"},{value:"🛁",name:"洗澡"},{value:"👕",name:"整理衣物"},{value:"⭐",name:"其他"}];
const RECORD_TYPES:{value:Entry["type"];label:string}[]=[{value:"star",label:"加星"},{value:"deduct",label:"扣星"},{value:"special",label:"特殊獎勵"}];
const SECURITY_QUESTIONS=[
    {value:"pet",label:"我的第一隻寵物叫什麼名字？"},
    {value:"school",label:"我就讀的第一所小學是？"},
    {value:"food",label:"我最喜歡的食物是？"},
    {value:"nickname",label:"我的童年綽號是？"},
    {value:"city",label:"我出生的城市是？"},
    {value:"custom",label:"自訂問題"},
];
const rewardImageIdentity=(value:string)=>value.replace(/([?&])v=[^&]*/g,"").replace(/[?&]$/,"");
const now = () => new Date().toLocaleString("zh-TW", { hour12: false,timeZone:"Asia/Taipei" });
const positiveInt = (value:unknown) => Math.max(1,Math.abs(Math.floor(Number(value)||1)));
const inputDate = (offset=0) => addCalendarDays(taipeiDateKey(),offset);
const entryTime = (value:string) => { if(/^\d{4}-\d{2}-\d{2}T/.test(value))return Date.parse(value);const m=value.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0)-8,+(m[5]||0),+(m[6]||0)):new Date(value).getTime() };
const entryDay = (value:string) => { if(/^\d{4}-\d{2}-\d{2}T/.test(value)){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}const m=value.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:"未知日期" };
const entryTimestamp = (entry:Entry) => {
    const occurred=entry.occurredAt?entryTime(entry.occurredAt):Number.NaN;
    if(Number.isFinite(occurred))return occurred;
    const created=entry.createdAt?entryTime(entry.createdAt):Number.NaN;
    return Number.isFinite(created)?created:entryTime(entry.date);
};
const entryDateKey = (entry:Entry) => {const time=entryTimestamp(entry);return Number.isFinite(time)?taipeiDateKey(time):entryDay(entry.date)};
const normalizeSeriesTitle = (value:string) => value.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("zh-TW")||"未命名項目";
const seriesColor = (key:string) => {let hash=2166136261;for(let index=0;index<key.length;index++)hash=Math.imul(hash^key.charCodeAt(index),16777619);const value=hash>>>0;return `hsl(${200+value%88} ${62+(value>>>8)%13}% ${42+(value>>>16)%8}%)`};

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

function UnsavedSettingsModal({returnFocus,onContinue,onDiscard}:{returnFocus:HTMLElement|null;onContinue:()=>void;onDiscard:()=>void}){
    const dialogRef=useRef<HTMLElement>(null),continueRef=useRef<HTMLButtonElement>(null);
    useEffect(()=>{
        const previousOverflow=document.body.style.overflow;
        document.body.style.overflow="hidden";
        const focusTimer=window.setTimeout(()=>continueRef.current?.focus(),0);
        return()=>{
            window.clearTimeout(focusTimer);
            document.body.style.overflow=previousOverflow;
            window.requestAnimationFrame(()=>returnFocus?.focus());
        };
    },[returnFocus]);
    function keyDown(event:ReactKeyboardEvent<HTMLElement>){
        if(event.key==="Escape"){event.preventDefault();onContinue();return}
        if(event.key!=="Tab")return;
        const focusable=[...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')||[])];
        if(!focusable.length){event.preventDefault();dialogRef.current?.focus();return}
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    return <div className="modal-back unsaved-settings-backdrop"><section ref={dialogRef} className="modal unsaved-settings-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-settings-title" aria-describedby="unsaved-settings-description" tabIndex={-1} onKeyDown={keyDown}><h2 id="unsaved-settings-title">尚有未儲存的設定</h2><p id="unsaved-settings-description">離開後，尚未儲存的修改將會遺失。</p><div className="unsaved-settings-actions"><button type="button" ref={continueRef} className="continue-settings" onClick={onContinue}>繼續編輯</button><button type="button" className="discard-settings" onClick={onDiscard}>放棄修改</button></div></section></div>;
}

type EditableIntegerProps={value:number;onChange:(value:number)=>void;min?:number;max?:number;unit?:string;disabled?:boolean;fieldKey:string;onValidityChange?:(key:string,invalid:boolean)=>void;stepper?:boolean;resetSignal?:number};

function EditableIntegerDraft({value,onChange,min=1,max,unit,disabled=false,fieldKey,onValidityChange,stepper=true}:EditableIntegerProps){
    const [draft,setDraft]=useState(String(value));
    const key=fieldKey;
    const valid=(text:string)=>validEditableInteger(text,min,max);
    useEffect(()=>()=>onValidityChange?.(key,false),[key,onValidityChange]);
    function edit(text:string){
        if(!acceptsEditableIntegerDraft(text))return;
        setDraft(text);
        const isValid=valid(text);
        onValidityChange?.(key,!isValid);
        if(isValid)onChange(Number(text));
    }
    function normalize(){const next=normalizeEditableInteger(draft,min,max);setDraft(String(next));onValidityChange?.(key,false);if(next!==value)onChange(next)}
    function step(delta:number){const base=valid(draft)?Number(draft):value,next=Math.min(max??Number.MAX_SAFE_INTEGER,Math.max(min,base+delta));setDraft(String(next));onValidityChange?.(key,false);if(next!==value)onChange(next)}
    const input=<input type="text" inputMode="numeric" pattern="[0-9]*" min={min} max={max} step="1" value={draft} disabled={disabled} aria-invalid={!valid(draft)} onChange={event=>edit(event.target.value)} onBlur={normalize}/>;
    return <div className={`editable-integer${stepper?" has-stepper":""}`}><div className="integer-control">{stepper&&<button type="button" disabled={disabled||normalizeEditableInteger(draft,min,max)<=min} aria-label="減少 1" onClick={()=>step(-1)}>−</button>}{input}{stepper&&<button type="button" disabled={disabled||normalizeEditableInteger(draft,min,max)>=(max??Number.MAX_SAFE_INTEGER)} aria-label="增加 1" onClick={()=>step(1)}>＋</button>}</div>{unit&&<span className="integer-unit">{unit}</span>}</div>;
}

function EditableIntegerInput({resetSignal=0,...props}:EditableIntegerProps){return <EditableIntegerDraft key={resetSignal} {...props}/>}

function RecordModal({templates,allowBackdate,onClose,onSave,onValidationError}:{templates:Template[];allowBackdate:boolean;onClose:()=>void;onSave:(title:string,amount:number,type:Entry["type"],occurredAt?:string)=>Promise<boolean>;onValidationError:(message:string)=>void}){
    const [t,setT]=useState<Entry["type"]>("star"),[name,setName]=useState(""),[n,setN]=useState(0),[amountInvalid,setAmountInvalid]=useState(false),[amountReset,setAmountReset]=useState(0),[saving,setSaving]=useState(false),[recordDate,setRecordDate]=useState(()=>taipeiDateTimeInput().date),[recordTime,setRecordTime]=useState(()=>taipeiDateTimeInput().time);
    const recordValidity=useCallback((_:string,invalid:boolean)=>setAmountInvalid(invalid),[]);
    const backdropRef=useRef<HTMLDivElement>(null),focusedFieldRef=useRef<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null>(null),focusTimerRef=useRef<number|null>(null);
    const picks=templates.filter(item=>item.type===t);
    useEffect(()=>{
        const viewport=window.visualViewport,previousBodyOverflow=document.body.style.overflow,previousHtmlOverflow=document.documentElement.style.overflow;
        document.body.style.overflow="hidden";
        document.documentElement.style.overflow="hidden";
        const updateViewport=()=>{
            const backdrop=backdropRef.current;
            if(!backdrop)return;
            backdrop.style.setProperty("--record-viewport-height",`${viewport?.height??window.innerHeight}px`);
            backdrop.style.setProperty("--record-viewport-top",`${viewport?.offsetTop??0}px`);
            if(focusTimerRef.current!==null)window.clearTimeout(focusTimerRef.current);
            focusTimerRef.current=window.setTimeout(()=>{
                const field=focusedFieldRef.current;
                if(field&&document.activeElement===field)field.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});
            },180);
        };
        updateViewport();
        viewport?.addEventListener("resize",updateViewport);
        viewport?.addEventListener("scroll",updateViewport);
        return()=>{
            if(focusTimerRef.current!==null)window.clearTimeout(focusTimerRef.current);
            viewport?.removeEventListener("resize",updateViewport);
            viewport?.removeEventListener("scroll",updateViewport);
            document.body.style.overflow=previousBodyOverflow;
            document.documentElement.style.overflow=previousHtmlOverflow;
        };
    },[]);
    function focusField(event:ReactFocusEvent<HTMLElement>){
        const field=event.target;
        if(!(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement))return;
        focusedFieldRef.current=field;
        if(focusTimerRef.current!==null)window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current=window.setTimeout(()=>{
            if(document.activeElement===field)field.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});
        },220);
    }
    async function save(){
        if(saving)return;
        if(!name.trim())return onValidationError("請填寫內容");
        if(amountInvalid||!Number.isFinite(n)||n<1)return onValidationError(t==="special"?"請填寫至少 1 個獎勵":"請輸入至少 1 顆星");
        const occurredAt=allowBackdate?taipeiLocalToIso(recordDate,recordTime):undefined;
        if(allowBackdate&&!occurredAt)return onValidationError("請選擇有效的紀錄日期與時間");
        if(allowBackdate&&isFutureTaipeiDateTime(recordDate,recordTime))return onValidationError("紀錄時間不可晚於現在");
        setSaving(true);
        try{if(await onSave(name,t==="deduct"?-n:n,t,occurredAt))onClose()}finally{setSaving(false)}
    }
    function setNow(){
        const value=taipeiDateTimeInput();
        setRecordDate(value.date);
        setRecordTime(value.time);
    }
    return <div ref={backdropRef} className="modal-back record-modal-back">
        <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title" aria-busy={saving} onFocusCapture={focusField}>
            <button type="button" className="close" aria-label="關閉新增紀錄" disabled={saving} onClick={onClose}>×</button>
            <h2 id="record-modal-title">新增紀錄</h2>
            <div className="toggle three">{RECORD_TYPES.map(item=><button type="button" key={item.value} className={t===item.value?"chosen":""} disabled={saving} onClick={()=>{setT(item.value);setN(item.value==="special"?1:0);setAmountInvalid(false);setAmountReset(value=>value+1)}}>{item.label}</button>)}</div>
            {picks.length>0&&<div className="quick-picks"><b>快速選取</b>{picks.map(item=>{const count=Math.max(1,Math.abs(Math.floor(Number(item.amount)||1)));return <button type="button" key={item.id} className={item.type==="deduct"?"deduct-pick":""} disabled={saving} onClick={()=>{setName(item.title);setN(count);setAmountInvalid(false);setAmountReset(value=>value+1)}}>{item.title} × {count}</button>})}</div>}
            <label>{t==="special"?"獎勵內容":"發生了什麼事？"}<input value={name} disabled={saving} onChange={event=>setName(event.target.value)} placeholder={t==="special"?"例如：冰淇淋":"例如：主動收好玩具"}/></label>
            {t==="special"?<label>獎勵數量<EditableIntegerInput key={`record-special-${amountReset}`} value={n||1} onChange={setN} disabled={saving} fieldKey="record-special" onValidityChange={recordValidity} unit="個"/></label>:<div className="star-amount"><b>星星數量</b><div className={`star-picker ${t==="deduct"?"deduct":"add"}`} role="group" aria-label="選擇星星數量">{[1,2,3,4,5].map(value=><button type="button" key={value} className={n>=value?"filled":""} disabled={saving} aria-label={`${value} 顆星星`} aria-pressed={n>=value} onClick={()=>{setN(value);setAmountInvalid(false);setAmountReset(current=>current+1)}}>{n>=value?"★":"☆"}</button>)}</div><label>其他數量<EditableIntegerInput key={`record-stars-${amountReset}`} value={n||1} onChange={setN} disabled={saving} fieldKey="record-stars" onValidityChange={recordValidity} unit="顆"/></label>{n>0&&<small>目前選擇 {n} 顆</small>}</div>}
            {allowBackdate&&<fieldset className="record-time-field">
                <legend>紀錄日期與時間</legend>
                <div className="record-time-inputs">
                    <label>日期<input type="date" value={recordDate} max={taipeiDateKey()} disabled={saving} onChange={event=>setRecordDate(event.target.value)}/></label>
                    <label>時間<input type="time" value={recordTime} disabled={saving} onChange={event=>setRecordTime(event.target.value)}/></label>
                </div>
                <div className="record-time-help"><small>依台灣時間記錄；可補登今天或過去發生的紀錄。</small><button type="button" disabled={saving} onClick={setNow}>現在</button></div>
            </fieldset>}
            <div className="record-actions"><button type="button" className="save" disabled={saving} onClick={()=>void save()}>{saving?"儲存中…":"儲存紀錄"}</button><button type="button" className="cancel-action" disabled={saving} onClick={onClose}>取消</button></div>
        </section>
    </div>;
}

function SecretField({label,name,value,onChange,autoComplete="off",error,initialFocus=false,disabled=false}:{label:string;name:string;value:string;onChange:(value:string)=>void;autoComplete?:string;error?:string;initialFocus?:boolean;disabled?:boolean;[key:string]:unknown}){
    const [visible,setVisible]=useState(false),inputRef=useRef<HTMLInputElement>(null);
    useEffect(()=>{if(!initialFocus)return;const timer=window.setTimeout(()=>inputRef.current?.focus(),0);return()=>window.clearTimeout(timer)},[initialFocus]);
    function toggle(){
        const input=inputRef.current,start=input?.selectionStart??value.length,end=input?.selectionEnd??value.length;
        setVisible(current=>!current);
        window.requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(start,end)});
    }
    return <label className="secret-field"><span>{label}</span><span className="secret-input-wrap"><input ref={inputRef} name={name} type={visible?"text":"password"} value={value} autoComplete={autoComplete} disabled={disabled} aria-invalid={Boolean(error)} onChange={event=>onChange(event.target.value)}/><button type="button" disabled={disabled} aria-label={visible?`隱藏${label}`:`顯示${label}`} aria-pressed={visible} onClick={toggle}>{visible?"🙈":"👁️"}</button></span>{error&&<small className="field-error">{error}</small>}</label>;
}

function SecurityQuestionFields({questionType,setQuestionType,customQuestion,setCustomQuestion,answer,setAnswer,confirmAnswer,setConfirmAnswer,hint,setHint,disabled=false}:{questionType:string;setQuestionType:(value:string)=>void;customQuestion:string;setCustomQuestion:(value:string)=>void;answer:string;setAnswer:(value:string)=>void;confirmAnswer:string;setConfirmAnswer:(value:string)=>void;hint:string;setHint:(value:string)=>void;disabled?:boolean}){
    return <div className="security-question-fields">
        <label>安全提示問題<select value={questionType} disabled={disabled} onChange={event=>{setQuestionType(event.target.value);if(event.target.value!=="custom")setCustomQuestion("")}}>{SECURITY_QUESTIONS.map(question=><option value={question.value} key={question.value}>{question.label}</option>)}</select></label>
        {questionType==="custom"&&<label>自訂安全問題<input value={customQuestion} disabled={disabled} onChange={event=>setCustomQuestion(event.target.value)} placeholder="請輸入只有家長熟悉的問題"/></label>}
        <SecretField label="安全問題答案" name="security-answer" value={answer} onChange={setAnswer} disabled={disabled}/>
        <SecretField label="確認安全問題答案" name="security-answer-confirmation" value={confirmAnswer} onChange={setConfirmAnswer} disabled={disabled}/>
        <label>答案提示（選填）<input value={hint} disabled={disabled} onChange={event=>setHint(event.target.value)} placeholder="例如：兩個中文字、英文小寫"/></label>
    </div>;
}

function ParentSecuritySettings({passwordSet,security,onPayload,onMessage}:{passwordSet:boolean;security:SecurityInfo;onPayload:(payload:{state?:Partial<State>;revision?:number;passwordSet?:boolean;security?:SecurityInfo},newPassword?:string)=>void;onMessage:(message:string)=>void}){
    const defaultQuestion=SECURITY_QUESTIONS.find(question=>question.value===security.questionType)?.value||"pet";
    const [currentPassword,setCurrentPassword]=useState(""),[securityCurrentPassword,setSecurityCurrentPassword]=useState(""),[newPassword,setNewPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState(""),[questionType,setQuestionType]=useState(defaultQuestion),[customQuestion,setCustomQuestion]=useState(security.questionType==="custom"?security.questionText:""),[answer,setAnswer]=useState(""),[confirmAnswer,setConfirmAnswer]=useState(""),[hint,setHint]=useState(security.hint||""),[busy,setBusy]=useState(false),[passwordError,setPasswordError]=useState(""),[securityError,setSecurityError]=useState(""),[editingSecurity,setEditingSecurity]=useState(!security.configured);
    const questionText=questionType==="custom"?customQuestion:(SECURITY_QUESTIONS.find(question=>question.value===questionType)?.label||"");
    async function post(body:Record<string,unknown>){
        const response=await authenticatedFetch("/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),result=await response.json();
        if(!response.ok)throw new Error(result.error||"更新失敗");
        return result;
    }
    async function setInitialPassword(){
        setPasswordError("");
        const passwordValidation=validatePasswordPair(newPassword,confirmPassword);
        if(passwordValidation){setPasswordError(passwordValidation);return}
        setBusy(true);
        try{
            const result=await post({action:"set_parent_password",newPassword,confirmPassword});
            onPayload(result,newPassword);setNewPassword("");setConfirmPassword("");onMessage("家長密碼已設定");
        }catch(error){setPasswordError(error instanceof Error?error.message:"設定失敗")}finally{setBusy(false)}
    }
    async function changePassword(){
        setPasswordError("");
        if(!currentPassword){setPasswordError("請輸入原始密碼");return}
        const validation=validatePasswordPair(newPassword,confirmPassword,currentPassword);
        if(validation){setPasswordError(validation);return}
        setBusy(true);
        try{
            const result=await post({action:"change_parent_password",currentPassword,newPassword,confirmPassword});
            onPayload(result,newPassword);setCurrentPassword("");setNewPassword("");setConfirmPassword("");onMessage("家長密碼已更新");
        }catch(error){setPasswordError(error instanceof Error?error.message:"更新失敗")}finally{setBusy(false)}
    }
    async function updateSecurity(){
        setSecurityError("");
        if(!securityCurrentPassword){setSecurityError("請輸入原始家長密碼");return}
        const validation=validateSecuritySetup(questionType,questionText,answer,confirmAnswer);
        if(validation){setSecurityError(validation);return}
        setBusy(true);
        try{
            const result=await post({action:"update_security_question",currentPassword:securityCurrentPassword,securityQuestionType:questionType,securityQuestionText:questionText,securityAnswer:answer,confirmSecurityAnswer:confirmAnswer,securityAnswerHint:hint});
            onPayload(result);setSecurityCurrentPassword("");setAnswer("");setConfirmAnswer("");setEditingSecurity(false);onMessage("安全提示問題已更新");
        }catch(error){setSecurityError(error instanceof Error?error.message:"更新失敗")}finally{setBusy(false)}
    }
    function resetPasswordDraft(){
        setCurrentPassword("");setNewPassword("");setConfirmPassword("");setPasswordError("");
    }
    function resetSecurityDraft(){
        const savedQuestion=SECURITY_QUESTIONS.find(question=>question.value===security.questionType)?.value||"pet";
        setSecurityCurrentPassword("");setQuestionType(savedQuestion);setCustomQuestion(security.questionType==="custom"?security.questionText:"");setAnswer("");setConfirmAnswer("");setHint(security.hint||"");setSecurityError("");setEditingSecurity(!security.configured);
    }
    return <>
        <section className="settings-card parent-password-card"><h2>{passwordSet?"🔐 修改家長密碼":"🔐 設定家長密碼"}</h2>
            {passwordSet&&<SecretField label="原始密碼" name="current-parent-password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" disabled={busy}/>}
            <SecretField label="新密碼" name="new-parent-password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" disabled={busy}/>
            <SecretField label={passwordSet?"確認新密碼":"確認密碼"} name="confirm-parent-password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={busy}/>
            {passwordError&&<p className="security-form-error" role="alert">{passwordError}</p>}
            {!passwordSet&&<p className="security-guidance">家長密碼與忘記密碼設定會分開儲存。完成密碼設定後，即可設定安全提示問題。</p>}
            <div className="security-form-actions">
                <button type="button" className="secondary-security-button" disabled={busy} onClick={resetPasswordDraft}>取消</button>
                <button type="button" className="primary security-submit" disabled={busy} onClick={()=>void (passwordSet?changePassword():setInitialPassword())}>{busy?(passwordSet?"更新中…":"設定中…"):passwordSet?"確認更新":"確認設定"}</button>
            </div>
        </section>
        <section className="settings-card parent-recovery-card"><h2>🔑 忘記密碼設定</h2>
            {passwordSet&&security.configured&&!editingSecurity?<div className="security-summary"><span>目前安全問題</span><strong>{security.questionText}</strong>{security.hint&&<small>提示：{security.hint}</small>}<button type="button" className="secondary-security-button" onClick={()=>setEditingSecurity(true)}>修改安全提示問題</button></div>:<>
                {!passwordSet&&<p className="legacy-security-notice">請先完成上方的家長密碼設定，再設定忘記密碼的安全提示問題。</p>}
                {passwordSet&&!security.configured&&<p className="legacy-security-notice">尚未設定忘記密碼的安全提示問題。請立即設定，日後才能自行重設密碼。</p>}
                {passwordSet&&<SecretField label="原始家長密碼" name="security-current-password" value={securityCurrentPassword} onChange={setSecurityCurrentPassword} autoComplete="current-password" disabled={busy}/>}
                <SecurityQuestionFields questionType={questionType} setQuestionType={setQuestionType} customQuestion={customQuestion} setCustomQuestion={setCustomQuestion} answer={answer} setAnswer={setAnswer} confirmAnswer={confirmAnswer} setConfirmAnswer={setConfirmAnswer} hint={hint} setHint={setHint} disabled={busy||!passwordSet}/>
                {securityError&&<p className="security-form-error" role="alert">{securityError}</p>}
                <div className="security-form-actions">
                    <button type="button" className="secondary-security-button" disabled={busy} onClick={resetSecurityDraft}>取消</button>
                    <button type="button" className="primary security-submit" disabled={busy||!passwordSet} onClick={()=>void updateSecurity()}>{busy?"處理中…":security.configured?"確認更新":"確認設定"}</button>
                </div>
            </>}
        </section>
    </>;
}

function ForgotPasswordModal({security,onClose,onPayload,onMessage}:{security:SecurityInfo;onClose:()=>void;onPayload:(payload:{state?:Partial<State>;revision?:number;passwordSet?:boolean;security?:SecurityInfo},newPassword:string)=>void;onMessage:(message:string)=>void}){
    const [stage,setStage]=useState<"answer"|"reset">("answer"),[answer,setAnswer]=useState(""),[newPassword,setNewPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState(""),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
    async function request(body:Record<string,unknown>){
        const response=await authenticatedFetch("/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),result=await response.json();
        if(!response.ok)throw new Error(result.error||"驗證失敗");
        return result;
    }
    async function verifyAnswer(){
        setError("");
        if(!answer.trim()){setError("請輸入安全問題答案");return}
        setBusy(true);
        try{const result=await request({action:"verify_security_answer",securityAnswer:answer});setToken(result.recoveryToken||"");setAnswer("");setStage("reset")}catch(value){setError(value instanceof Error?value.message:"驗證失敗")}finally{setBusy(false)}
    }
    async function resetPassword(){
        setError("");
        const validation=validatePasswordPair(newPassword,confirmPassword);
        if(validation){setError(validation);return}
        setBusy(true);
        try{const result=await request({action:"reset_parent_password",recoveryToken:token,newPassword,confirmPassword});onPayload(result,newPassword);onMessage("家長密碼已重新設定");onClose()}catch(value){setError(value instanceof Error?value.message:"重設失敗")}finally{setBusy(false)}
    }
    return <div className="modal-back"><section className="modal forgot-password-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title" aria-busy={busy}><button type="button" className="close" aria-label="關閉忘記密碼流程" disabled={busy} onClick={onClose}>×</button>
        <h2 id="forgot-password-title">{stage==="answer"?"🔑 驗證安全問題":"設定新密碼"}</h2>
        {!security.configured?<div className="forgot-unavailable"><p>目前尚未設定安全提示問題，無法使用此方式重設密碼。</p><button type="button" className="cancel-action" onClick={onClose}>返回</button></div>:stage==="answer"?<>
            <div className="security-challenge"><span>問題</span><strong>{security.questionText}</strong>{security.hint&&<small>提示：{security.hint}</small>}</div>
            <SecretField label="答案" name="forgot-security-answer" value={answer} onChange={setAnswer} initialFocus disabled={busy}/>
            {error&&<p className="security-form-error" role="alert">{error}</p>}
            <button type="button" className="save" disabled={busy} onClick={()=>void verifyAnswer()}>{busy?"驗證中…":"驗證答案"}</button>
        </>:<>
            <SecretField label="新密碼" name="forgot-new-password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" initialFocus disabled={busy}/>
            <SecretField label="確認新密碼" name="forgot-confirm-password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={busy}/>
            {error&&<p className="security-form-error" role="alert">{error}</p>}
            <button type="button" className="save" disabled={busy} onClick={()=>void resetPassword()}>{busy?"重設中…":"重設密碼"}</button>
        </>}
    </section></div>;
}

function LegacyAnalytics({entries,child,onRefresh}:{entries:Entry[];child:Child;onRefresh:()=>Promise<boolean>}){
    const [from,setFrom]=useState(inputDate(-29)),[to,setTo]=useState(inputDate()),[filter,setFilter]=useState<AnalysisFilter>("all"),[refreshing,setRefreshing]=useState(false),[lastUpdated,setLastUpdated]=useState("");
    const rows=useMemo(()=>entries.filter(e=>e.childId===child.id&&(e.status??"completed")==="completed"&&(e.type==="star"||e.type==="deduct")&&(filter==="all"||e.type===filter)).filter(e=>{const day=entryDateKey(e);return day>=from&&day<=to}).sort((a,b)=>entryTimestamp(a)-entryTimestamp(b)),[entries,child.id,from,to,filter]);
    const daily=useMemo(()=>{const map=new Map<string,{day:string;add:number;deduct:number;items:Map<string,{label:string;amount:number}>}>();for(const row of rows){const day=entryDateKey(row),item=map.get(day)||{day,add:0,deduct:0,items:new Map()};if(row.type==="star"){const key=normalizeSeriesTitle(row.title),seriesItem=item.items.get(key)||{label:row.title.trim()||"未命名項目",amount:0};seriesItem.amount+=row.amount;item.items.set(key,seriesItem);item.add+=row.amount}else item.deduct+=row.amount;map.set(day,item)}return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(item=>({...item,items:[...item.items.entries()].map(([key,value])=>({key,...value,color:seriesColor(key)})).sort((a,b)=>a.label.localeCompare(b.label,"zh-TW"))}))},[rows]);
    const series=useMemo(()=>{const map=new Map<string,string>();for(const row of rows)if(row.type==="star"){const key=normalizeSeriesTitle(row.title);if(!map.has(key))map.set(key,row.title.trim()||"未命名項目")}return [...map.entries()].map(([key,label])=>({key,label,color:seriesColor(key)})).sort((a,b)=>a.label.localeCompare(b.label,"zh-TW"))},[rows]);
    const added=rows.filter(x=>x.type==="star").reduce((sum,x)=>sum+x.amount,0),deducted=rows.filter(x=>x.type==="deduct").reduce((sum,x)=>sum+x.amount,0),maximum=Math.max(1,...daily.flatMap(x=>[x.add,x.deduct]));
    async function refresh(){const today=inputDate();setTo(today);if(from>today)setFrom(today);setRefreshing(true);try{if(await onRefresh())setLastUpdated(new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}))}finally{setRefreshing(false)}}
    function exportExcel(){
        const filterName=filter==="all"?"全部":filter==="star"?"只看加星":"只看扣星",workbook=buildAnalyticsWorkbook({child:child.name,from,to,filter:filterName,rows:rows.map(x=>({date:x.date,type:x.type as "star"|"deduct",title:x.title,amount:x.amount})),daily:daily.map(x=>({day:x.day,add:x.add,deduct:x.deduct})),added,deducted});
        const url=URL.createObjectURL(new Blob([workbook],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),link=document.createElement("a");link.href=url;link.download=`星星分析_${child.name.replace(/[\\/:*?"<>|]/g,"_")}_${from}_${to}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    return <div className="analytics"><section className="analytics-panel"><div className="analytics-title"><div><h2>📊 {child.name} 的星星分析</h2><p>每日加星依項目固定分色，扣星固定使用紅色；可按刷新取得跨日及其他裝置的新紀錄。</p></div><div className="analytics-title-actions"><button className="refresh-button" disabled={refreshing} onClick={refresh}>{refreshing?"刷新中…":"↻ 刷新資料"}</button><button className="primary" disabled={!rows.length} onClick={exportExcel}>匯出 Excel</button>{lastUpdated&&<small>最後更新 {lastUpdated}</small>}</div></div><div className="analytics-filters"><label>開始日期<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>結束日期<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><label>紀錄類型<select value={filter} onChange={e=>setFilter(e.target.value as AnalysisFilter)}><option value="all">加星＋扣星</option><option value="star">只看加星</option><option value="deduct">只看扣星</option></select></label></div></section><div className="summary-grid"><article><span>加星</span><strong className="summary-add">＋{added} ★</strong></article><article><span>扣星</span><strong className="summary-deduct">−{deducted} ★</strong></article><article><span>淨星星</span><strong>{added-deducted>=0?"＋":""}{added-deducted} ★</strong></article><article><span>紀錄數</span><strong>{rows.length} 筆</strong></article></div><section className="analytics-panel"><div className="chart-legend"><b>每日星星變化</b>{series.map(item=><span key={item.key}><i style={{backgroundColor:item.color}}/>{item.label}</span>)}{deducted>0&&<span><i className="legend-deduct"/>扣星</span>}</div>{daily.length?<div className="bar-chart">{daily.map(day=>{const details=day.items.map(item=>`${item.label}加 ${item.amount}`).join("、");return <div className="chart-day" key={day.day} title={`${day.day}：${details||"無加星"}、扣 ${day.deduct}`} aria-label={`${day.day}，${details||"無加星"}，扣星 ${day.deduct}`}><div className="chart-half chart-up">{day.add>0&&<div className="add-stack" style={{height:`${Math.max(5,day.add/maximum*100)}%`}}>{day.items.map(item=><span className="add-segment" key={item.key} title={`${item.label}：${item.amount}`} style={{height:`${item.amount/day.add*100}%`,backgroundColor:item.color}}/>)}<b>{day.add}</b></div>}</div><div className="chart-half chart-down">{day.deduct>0&&<span className="deduct-bar" style={{height:`${Math.max(5,day.deduct/maximum*100)}%`}}><b>{day.deduct}</b></span>}</div><small>{day.day.slice(5).replace("-","/")}</small></div>})}</div>:<p className="empty">這個條件下沒有已完成的加扣星紀錄</p>}</section><section className="analytics-panel"><h2>分析明細</h2><div className="analytics-table"><div className="analytics-row header"><span>日期時間</span><span>類型</span><span>內容</span><span>星星</span></div>{rows.slice().reverse().map(row=><div className="analytics-row" key={row.id}><span>{row.date}</span><span className={row.type==="deduct"?"summary-deduct":"summary-add"}>{row.type==="star"?"加星":"扣星"}</span><span>{row.title}</span><strong>{row.type==="star"?"＋":"−"}{row.amount}</strong></div>)}</div></section></div>;
}
void LegacyAnalytics;

type AnalyticsDetail = { date?: string; item: StarCategory; pinned?: boolean };

const shortAnalyticsDate = (date:string) => `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
const signedStars = (value:number,type:"star"|"deduct") => `${type==="star"?"+":"−"}${value} ⭐`;

function WeeklySummaryCard({week,redemptionCost}:{week:WeeklyStarAnalytics;redemptionCost:number}){
    return <article className="weekly-summary-card" aria-label={`${week.period.label}摘要`}>
        <div className="weekly-summary-head"><div><b>{week.period.label}</b><small>{formatWeekRange(week.period)}</small></div><strong className={week.net<0?"is-negative":""}>{week.net>=0?"+":""}{week.net} ⭐</strong></div>
        <div className="weekly-summary-metrics"><span><small>加星總數</small><b className="analytics-positive">+{week.starTotal}</b></span><span><small>扣星總數</small><b className="analytics-negative">−{week.deductTotal}</b></span><span><small>淨星星</small><b>{week.net>=0?"+":""}{week.net}</b></span><span><small>兌換消耗</small><b>{redemptionCost}</b></span></div>
    </article>;
}

function WeeklyDivergingBarChart({week,scaleMaximum}:{week:WeeklyStarAnalytics;scaleMaximum?:number}){
    const [detail,setDetail]=useState<AnalyticsDetail|null>(null);
    const maximum=scaleMaximum??Math.max(1,...week.days.flatMap(day=>[day.starTotal,day.deductTotal]));
    const legend=[...week.starItems,...week.deductItems].sort((a,b)=>b.amount-a.amount||b.count-a.count).slice(0,8);
    function show(date:string,item:StarCategory,pinned=false){setDetail(current=>current?.pinned&&!pinned?current:{date,item,pinned})}
    function leave(){setDetail(current=>current?.pinned?current:null)}
    return <article className="weekly-chart-card">
        <div className="analytics-card-heading"><div><h3>{week.period.label}</h3><p>{formatWeekRange(week.period)}</p></div><div className="week-chart-totals"><span className="analytics-positive">+{week.starTotal}</span><span className="analytics-negative">−{week.deductTotal}</span></div></div>
        {legend.length>0&&<div className="weekly-chart-legend" aria-label="主要項目圖例">{legend.map(item=><span key={item.key}><i style={{background:item.color}}/>{item.label}</span>)}{week.starItems.length+week.deductItems.length>legend.length&&<span>其餘項目請點柱段查看</span>}</div>}
        <div className="weekly-diverging-chart" style={{gridTemplateColumns:`repeat(${Math.max(1,week.days.length)}, minmax(0, 1fr))`}} aria-label={`${week.period.label}每日加扣星發散式堆疊直條圖`}>
            {week.days.map(day=><div className={`weekly-day-column ${day.isFuture?"is-future":""}`} key={day.date}>
                <div className="weekly-chart-half is-positive">
                    {day.starTotal>0&&<div className="weekly-bar-stack positive-stack" style={{height:`${Math.max(7,day.starTotal/maximum*100)}%`}}>{day.starItems.map(item=><button type="button" key={item.key} style={{background:item.color,flexGrow:item.amount}} aria-label={`${day.date} 加星 ${item.label} ${item.amount} 顆，共 ${item.count} 筆`} onMouseEnter={()=>show(day.date,item)} onMouseLeave={leave} onFocus={()=>show(day.date,item)} onBlur={leave} onClick={()=>show(day.date,item,true)}/>)}</div>}
                    <b>{day.starTotal||0}</b>
                </div>
                <div className="weekly-zero-axis" aria-hidden="true"/>
                <div className="weekly-chart-half is-negative">
                    {day.deductTotal>0&&<div className="weekly-bar-stack negative-stack" style={{height:`${Math.max(7,day.deductTotal/maximum*100)}%`}}>{day.deductItems.map(item=><button type="button" key={item.key} style={{background:item.color,flexGrow:item.amount}} aria-label={`${day.date} 扣星 ${item.label} ${item.amount} 顆，共 ${item.count} 筆`} onMouseEnter={()=>show(day.date,item)} onMouseLeave={leave} onFocus={()=>show(day.date,item)} onBlur={leave} onClick={()=>show(day.date,item,true)}/>)}</div>}
                    <b>{day.deductTotal?`−${day.deductTotal}`:"0"}</b>
                </div>
                <div className="weekly-day-label"><strong>{day.weekday}</strong><small>{shortAnalyticsDate(day.date)}</small>{day.isFuture&&<em>未來</em>}</div>
            </div>)}
        </div>
        {detail&&<div className="analytics-tooltip" role="status" aria-live="polite"><div><strong>{shortAnalyticsDate(detail.date!)}・星期{week.days.find(day=>day.date===detail.date)?.weekday}</strong><span>{detail.item.type==="star"?"加星":"扣星"}・{detail.item.label}</span></div><div><b className={detail.item.type==="star"?"analytics-positive":"analytics-negative"}>{signedStars(detail.item.amount,detail.item.type)}</b><small>共 {detail.item.count} 筆紀錄</small></div><button type="button" aria-label="關閉圖表提示" onClick={()=>setDetail(null)}>×</button></div>}
        {!week.recordCount&&<p className="analytics-inline-empty">{week.period.label}沒有加星或扣星紀錄，所選日期仍固定顯示為 0。</p>}
    </article>;
}

function DonutBreakdownCard({week,type}:{week:WeeklyStarAnalytics;type:"star"|"deduct"}){
    const items=type==="star"?week.starItems:week.deductItems,total=type==="star"?week.starTotal:week.deductTotal,label=type==="star"?"加星":"扣星";
    const [detail,setDetail]=useState<{item:StarCategory;pinned:boolean}|null>(null);
    const gradient=useMemo(()=>{
        const result=items.reduce<{offset:number;stops:string[]}>((state,item)=>{
            const end=state.offset+item.amount/Math.max(1,total)*100;
            return {offset:end,stops:[...state.stops,`${item.color} ${state.offset}% ${end}%`]};
        },{offset:0,stops:[]});
        return `conic-gradient(${result.stops.join(",")})`;
    },[items,total]);
    function itemFromPointer(event:ReactPointerEvent<HTMLDivElement>){
        const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-(rect.left+rect.width/2),y=event.clientY-(rect.top+rect.height/2),radius=Math.hypot(x,y);
        if(radius<rect.width*.25||radius>rect.width*.52)return null;
        const angle=(Math.atan2(y,x)*180/Math.PI+90+360)%360;
        let end=0;
        return items.find(item=>{end+=item.amount/Math.max(1,total)*360;return angle<=end})??items.at(-1)??null;
    }
    function pointerMove(event:ReactPointerEvent<HTMLDivElement>){if(detail?.pinned)return;const item=itemFromPointer(event);setDetail(item?{item,pinned:false}:null)}
    function pointerClick(event:ReactPointerEvent<HTMLDivElement>){const item=itemFromPointer(event);if(item)setDetail({item,pinned:true})}
    const medals=["🥇","🥈","🥉"];
    return <article className={`donut-breakdown-card ${type}`}>
        <div className="donut-card-head"><div><h4>{label}來源</h4><p>{week.period.label}共 {total} 顆</p></div><b className={type==="star"?"analytics-positive":"analytics-negative"}>{type==="star"?"+":"−"}{total} ⭐</b></div>
        {!items.length?<p className="analytics-inline-empty">{week.period.label}沒有{label}紀錄</p>:<>
            <div className="donut-content"><div className="donut-chart-wrap"><div className="donut-chart" role="img" aria-label={`${week.period.label}${label}來源圓環圖，合計 ${total} 顆`} style={{background:gradient}} onPointerMove={pointerMove} onPointerLeave={()=>setDetail(current=>current?.pinned?current:null)} onPointerDown={pointerClick}><div><small>{week.period.label}{label}</small><strong>{total} ⭐</strong></div></div></div>
            <ol className="top-three-list" aria-label={`${week.period.label}${label} Top 3`}>{items.slice(0,3).map((item,index)=><li key={item.key}><button type="button" onMouseEnter={()=>setDetail({item,pinned:false})} onMouseLeave={()=>setDetail(current=>current?.pinned?current:null)} onFocus={()=>setDetail({item,pinned:false})} onBlur={()=>setDetail(current=>current?.pinned?current:null)} onClick={()=>setDetail({item,pinned:true})}><span>{medals[index]} <i style={{background:item.color}}/>{item.label}</span><b>{type==="star"?"":"−"}{item.amount} ⭐</b><small>{item.count} 次</small></button></li>)}</ol></div>
            {detail&&<div className="donut-tooltip" role="status" aria-live="polite"><span><i style={{background:detail.item.color}}/>{detail.item.label}</span><b className={type==="star"?"analytics-positive":"analytics-negative"}>{signedStars(detail.item.amount,type)}</b><small>佔{week.period.label}{label} {Math.round(detail.item.amount/total*100)}%・共 {detail.item.count} 筆</small><button type="button" aria-label="關閉來源提示" onClick={()=>setDetail(null)}>×</button></div>}
        </>}
    </article>;
}

function WeeklyBreakdownSection({week}:{week:WeeklyStarAnalytics}){
    return <section className="weekly-breakdown-group"><div className="weekly-breakdown-heading"><h3>{week.period.label}</h3><span>{formatWeekRange(week.period)}</span></div><div className="donut-card-grid"><DonutBreakdownCard week={week} type="star"/><DonutBreakdownCard week={week} type="deduct"/></div></section>;
}

type RedemptionDisplaySortKey=Exclude<RedemptionSortKey,"latestAt">;
const redemptionSortLabels:Record<RedemptionDisplaySortKey,string>={name:"商品",quantity:"次數",totalCost:"消耗星星"};
const redemptionSortKeys=Object.keys(redemptionSortLabels) as RedemptionDisplaySortKey[];
const defaultRedemptionDirection=(key:RedemptionDisplaySortKey):SortDirection=>key==="name"?"asc":"desc";

function WeeklyRedemptionTable({label,range,items}:{label:string;range:string;items:ReturnType<typeof getWeeklyRedemptionSummary>}){
    const [sort,setSort]=useState<{key:RedemptionDisplaySortKey;direction:SortDirection}>({key:"totalCost",direction:"desc"});
    const sorted=useMemo(()=>sortRedemptionSummary(items,sort.key,sort.direction),[items,sort]);
    function changeSort(key:RedemptionDisplaySortKey){setSort(current=>current.key===key?{key,direction:current.direction==="asc"?"desc":"asc"}:{key,direction:defaultRedemptionDirection(key)})}
    const arrow=(key:RedemptionDisplaySortKey)=>sort.key===key?(sort.direction==="asc"?" ↑":" ↓"):"";
    const ariaSort=(key:RedemptionDisplaySortKey)=>sort.key===key?(sort.direction==="asc"?"ascending":"descending"):"none";
    return <article className="redemption-week-card">
        <div className="redemption-week-head"><div><h3>{label}</h3><p>{range}</p></div><strong>共消耗 {items.reduce((sum,item)=>sum+item.totalCost,0)} 顆星</strong></div>
        {!items.length?<p className="analytics-inline-empty">{label}沒有已完成的兌換紀錄</p>:<>
            <h4 className="redemption-ranking-title">兌換排行榜</h4>
            <div className="mobile-redemption-sort"><label>排序<select value={sort.key} onChange={event=>{const key=event.target.value as RedemptionDisplaySortKey;setSort({key,direction:defaultRedemptionDirection(key)})}}>{redemptionSortKeys.map(key=><option key={key} value={key}>{redemptionSortLabels[key]}</option>)}</select></label><button type="button" onClick={()=>setSort(current=>({...current,direction:current.direction==="asc"?"desc":"asc"}))}>{sort.direction==="asc"?"升冪 ↑":"降冪 ↓"}</button></div>
            <div className="redemption-table-wrap"><table className="redemption-table"><thead><tr>{redemptionSortKeys.map(key=><th key={key} aria-sort={ariaSort(key)}><button type="button" onClick={()=>changeSort(key)}>{redemptionSortLabels[key]}{arrow(key)}</button></th>)}</tr></thead><tbody>{sorted.map(item=><tr key={item.key}><td>{item.name}</td><td>{item.quantity}</td><td><strong>{item.totalCost} ⭐</strong></td></tr>)}</tbody></table></div>
            <div className="mobile-redemption-cards">{sorted.map(item=><article key={item.key}><strong>{item.name}</strong><dl><div><dt>次數</dt><dd>{item.quantity}</dd></div><div><dt>消耗星星</dt><dd>{item.totalCost} ⭐</dd></div></dl></article>)}</div>
        </>}
    </article>;
}

function EmptyFamilyOnboarding({account,onCreate,onMessage}:{account:SignedInAccount;onCreate:(name:string)=>Promise<boolean>;onMessage:(message:string)=>void}){
    const [name,setName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[showAccount,setShowAccount]=useState(false);
    async function submit(){const clean=name.trim();if(!clean){setError("請輸入孩子姓名");return}setBusy(true);setError("");try{if(!await onCreate(clean))setError("建立失敗，請檢查網路後再試")}finally{setBusy(false)}}
    return <main className="family-onboarding-page"><header className="onboarding-account-bar"><div>{account.image&&<img src={account.image} alt="" referrerPolicy="no-referrer"/>}<span><strong>{account.name||"Google 使用者"}</strong><small>{account.email}</small></span></div><button type="button" onClick={()=>void signOut({callbackUrl:"/"})}>登出</button></header>{showAccount?<section className="onboarding-account-management"><button type="button" className="onboarding-account-management-back" onClick={()=>setShowAccount(false)}>← 返回建立孩子</button><AccountManagement onMessage={message=>{setError(message);onMessage(message)}}/></section>:<section className="family-onboarding-card"><img src="/star-diary-logo.jpg" alt="" width={92} height={92}/><p className="eyebrow">WELCOME TO STAR DIARY</p><h1>建立你的家庭日記</h1><p>這是全新的空白家庭。先加入第一位孩子，之後即可設定任務、星星與獎品。</p><label>孩子姓名<input value={name} maxLength={40} autoFocus autoComplete="off" placeholder="例如：Vanessa" onChange={event=>{setName(event.target.value);setError("")}} onKeyDown={event=>{if(event.key==="Enter")void submit()}}/></label>{error&&<p className="account-login-error" role="alert">{error}</p>}<button type="button" className="primary" disabled={busy} onClick={()=>void submit()}>{busy?"建立中…":"開始使用星星日記"}</button><button type="button" className="empty-family-account-button" onClick={()=>setShowAccount(true)}>帳號管理／刪除空白家庭</button></section>}</main>;
}

function FamilyLoadError({account,onRetry}:{account:SignedInAccount;onRetry:()=>Promise<boolean>}){
    const [busy,setBusy]=useState(false);
    async function retry(){setBusy(true);try{await onRetry()}finally{setBusy(false)}}
    return <main className="family-onboarding-page"><header className="onboarding-account-bar"><div>{account.image&&<img src={account.image} alt="" referrerPolicy="no-referrer"/>}<span><strong>{account.name||"Google 使用者"}</strong><small>{account.email}</small></span></div><button type="button" onClick={()=>void signOut({callbackUrl:"/"})}>登出</button></header><section className="family-onboarding-card"><img src="/star-diary-logo.jpg" alt="" width={92} height={92}/><h1>暫時無法讀取家庭資料</h1><p>你的登入仍然有效，但目前無法連上資料庫。請檢查網路後重試；我們不會用空白資料覆蓋原有家庭。</p><button type="button" className="primary" disabled={busy} onClick={()=>void retry()}>{busy?"重新連線中…":"重新讀取資料"}</button></section></main>;
}

function Analytics({data,child,onRefresh,todayKey}:{data:State;child:Child;onRefresh:()=>Promise<State|null>;todayKey:string}){
    const defaultRange=useMemo(()=>resolveAnalyticsDateRange({preset:"two_weeks",todayKey}),[todayKey]);
    const [preset,setPreset]=useState<AnalyticsRangePreset>("two_weeks"),[customStart,setCustomStart]=useState(defaultRange.start),[customEnd,setCustomEnd]=useState(defaultRange.end);
    const [refreshing,setRefreshing]=useState(false),[exporting,setExporting]=useState(false),[lastUpdated,setLastUpdated]=useState("");
    const earliest=useMemo(()=>earliestAnalyticsDate(child.id,data.entries,data.redemptions,data.dailyTaskRecords,todayKey),[child.id,data.entries,data.redemptions,data.dailyTaskRecords,todayKey]);
    const range=useMemo(()=>resolveAnalyticsDateRange({preset,todayKey,earliestDate:earliest,customStart,customEnd}),[preset,todayKey,earliest,customStart,customEnd]);
    const report=useMemo(()=>buildAnalyticsReport({childId:child.id,childName:child.name,range,todayKey,entries:data.entries,redemptions:data.redemptions,templates:data.templates,dailyTasks:data.dailyTasks,dailyTaskRecords:data.dailyTaskRecords,dailyTaskSettings:data.dailyTaskSettings}),[child.id,child.name,range,todayKey,data.entries,data.redemptions,data.templates,data.dailyTasks,data.dailyTaskRecords,data.dailyTaskSettings]);
    const chartPeriods=useMemo(()=>splitAnalyticsRangeIntoWeekPeriods(range,todayKey),[range,todayKey]);
    const chartWeeks=useMemo(()=>chartPeriods.map(item=>getWeeklyStarAnalytics(data.entries,child.id,item,todayKey)),[chartPeriods,data.entries,child.id,todayKey]);
    const chartMaximum=Math.max(1,...chartWeeks.flatMap(week=>week.days.flatMap(day=>[day.starTotal,day.deductTotal])));
    const weeklyRedemptions=useMemo(()=>chartPeriods.map(period=>({period,items:getWeeklyRedemptionSummary(data.redemptions,child.id,period)})),[chartPeriods,data.redemptions,child.id]);
    const summaryCosts=useMemo(()=>weeklyRedemptions.map(week=>week.items.reduce((sum,row)=>sum+row.totalCost,0)),[weeklyRedemptions]);
    const hasAnyData=report.starAnalysis.recordCount+report.starDetails.filter(item=>item.type==="特殊獎勵").length+report.taskRows.length+report.redemptionRows.length>0;
    const updateTime=()=>setLastUpdated(new Date().toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}));
    async function refresh(){setRefreshing(true);try{if(await onRefresh())updateTime()}finally{setRefreshing(false)}}
    async function exportExcel(){
        setExporting(true);
        try{
            const latest=await onRefresh();
            if(!latest)return;
            const latestChild=latest.children.find(item=>item.id===child.id)||child,latestEarliest=earliestAnalyticsDate(latestChild.id,latest.entries,latest.redemptions,latest.dailyTaskRecords,todayKey),latestRange=resolveAnalyticsDateRange({preset,todayKey,earliestDate:latestEarliest,customStart,customEnd});
            const latestReport=buildAnalyticsReport({childId:latestChild.id,childName:latestChild.name,range:latestRange,todayKey,entries:latest.entries,redemptions:latest.redemptions,templates:latest.templates,dailyTasks:latest.dailyTasks,dailyTaskRecords:latest.dailyTaskRecords,dailyTaskSettings:latest.dailyTaskSettings});
            const workbook=buildAnalyticsWorkbook(latestReport),url=URL.createObjectURL(new Blob([workbook],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),link=document.createElement("a");
            link.href=url;link.download=`星星日記_${latestChild.name.replace(/[\\/:*?"<>|]/g,"_")}_${latestRange.start}_至_${latestRange.end}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);updateTime();
        }finally{setExporting(false)}
    }
    return <div className="analytics weekly-analytics">
        <section className="analytics-panel analytics-overview"><div className="analytics-title"><div><h2>📊 {child.name} 的資料分析</h2><p>所有圖表、統計與 Excel 共用同一日期範圍；日期與跨日均採 Asia/Taipei。兌換消耗與行為扣星分開統計。</p><small>{range.label}・{range.start} 至 {range.end}</small></div><div className="analytics-title-actions"><button type="button" className="refresh-button" disabled={refreshing||exporting} onClick={()=>void refresh()}>{refreshing?"刷新中…":"↻ 刷新資料"}</button><button type="button" className="primary" disabled={refreshing||exporting} onClick={()=>void exportExcel()}>{exporting?"刷新並匯出中…":"匯出 Excel"}</button>{lastUpdated&&<small>最後更新 {lastUpdated}</small>}</div></div><div className="analytics-range-controls"><label>日期範圍<select value={preset} onChange={event=>setPreset(event.target.value as AnalyticsRangePreset)}><option value="two_weeks">上週＋本週</option><option value="current_month">本月</option><option value="previous_month">上個月</option><option value="last_30_days">最近 30 天</option><option value="custom">自訂日期</option><option value="all">全部紀錄</option></select></label>{preset==="custom"&&<><label>開始日期<input type="date" value={customStart} max={customEnd} onChange={event=>setCustomStart(event.target.value)}/></label><label>結束日期<input type="date" value={customEnd} min={customStart} onChange={event=>setCustomEnd(event.target.value)}/></label></>}</div></section>
        {!hasAnyData&&<section className="analytics-no-data"><span>📊</span><h2>這個日期範圍尚無紀錄</h2><p>每日統計與 Excel 仍會保留每一天並顯示 0，或可切換其他日期範圍。</p></section>}
        <section aria-labelledby="weekly-summary-title"><div className="analytics-section-title"><div><h2 id="weekly-summary-title">日期範圍摘要</h2><p>兌換是消費紀錄，不會算成扣星。</p></div></div><div className={`weekly-summary-grid ${chartWeeks.length===1?"is-single":"is-stacked"}`}>{chartWeeks.map((week,index)=><WeeklySummaryCard key={week.period.key} week={week} redemptionCost={summaryCosts[index]??0}/>)}</div></section>
        <section className="analytics-panel" aria-labelledby="weekly-chart-title"><div className="analytics-section-title"><div><h2 id="weekly-chart-title">📊 每日星星變化</h2><p>每週各自固定在完整寬度中；加星在 0 軸上方，扣星在下方，同項目跨週維持相同顏色。</p></div></div><div className="weekly-chart-list">{chartWeeks.map(week=><WeeklyDivergingBarChart key={week.period.key} week={week} scaleMaximum={chartMaximum}/>)}</div></section>
        <section className="analytics-panel" aria-labelledby="source-title"><div className="analytics-section-title"><div><h2 id="source-title">🥧 星星來源分析</h2><p>上週與本週各自統計總數、來源與 Top 3；點擊或觸碰項目可查看比例與紀錄筆數。</p></div></div><div className="weekly-breakdown-list">{chartWeeks.map(week=><WeeklyBreakdownSection key={week.period.key} week={week}/>)}</div></section>
        <section className="analytics-panel" aria-labelledby="redemption-title"><div className="analytics-section-title"><div><h2 id="redemption-title">🎁 兌換統計</h2><p>上週與本週各自排序；兌換依當時的名稱與實際消耗快照合併，不受目前獎品價格或刪除影響。</p></div></div><div className="redemption-week-list">{weeklyRedemptions.map(week=><WeeklyRedemptionTable key={week.period.key} label={week.period.label} range={formatWeekRange(week.period)} items={week.items}/>)}</div></section>
    </div>;
}
export default function App({account}:{account:SignedInAccount}) {
    const [data, setData] = useState(fallback), [cid, setCid] = useState(""), [tab, setTab] = useState("首頁"), [role, setRole] = useState("孩子"), [password, setPassword] = useState(""), [passwordSet, setPasswordSet] = useState(false), [securityInfo,setSecurityInfo]=useState<SecurityInfo>({configured:false,questionType:"",questionText:"",hint:""}), [login, setLogin] = useState(false), [forgotPassword,setForgotPassword]=useState(false), [record, setRecord] = useState(false), [redeem, setRedeem] = useState<Reward | null>(null), [quickConfirm, setQuickConfirm] = useState<Template | null>(null), [toast, setToast] = useState(""), [loading, setLoading] = useState(true),[loadFailed,setLoadFailed]=useState(false);
    const [crop,setCrop]=useState<CropTarget|null>(null),[todayKey,setTodayKey]=useState(taipeiDateKey()),[taskBusy,setTaskBusy]=useState(""),[taskConfirm,setTaskConfirm]=useState<DailyTaskRecord|null>(null),[taskSyncError,setTaskSyncError]=useState(false),[officialLibraryOpen,setOfficialLibraryOpen]=useState(false);
    const [savedSettingsSignature,setSavedSettingsSignature]=useState(""),[savingSettings,setSavingSettings]=useState(false),[imageUploading,setImageUploading]=useState(false),[keyboardOpen,setKeyboardOpen]=useState(false),[pendingSettingsIntent,setPendingSettingsIntent]=useState<SettingsIntent|null>(null);
    const [invalidIntegerFields,setInvalidIntegerFields]=useState<Set<string>>(()=>new Set()),[integerResetSignal,setIntegerResetSignal]=useState(0);
    const [settingsTab,setSettingsTab]=useState<SettingsTabKey>("children");
    const [accountAccess,setAccountAccess]=useState<AccountAccessInfo>({
        role:account.role,
        boundChildId:account.boundChildId,
        childAccountMode:account.childAccountMode,
        permissions:account.boundChildId?[{childId:account.boundChildId,canView:true,canOperate:true}]:[],
    });
    const setIntegerValidity=useCallback((key:string,invalid:boolean)=>{setInvalidIntegerFields(current=>{const next=new Set(current);if(invalid)next.add(key);else next.delete(key);return next.size===current.size&&[...next].every(item=>current.has(item))?current:next})},[]);
    const revisionRef=useRef(0),settingsDirtyRef=useRef(false),settingsBusyRef=useRef(false),savingSettingsRef=useRef(false),savedStateRef=useRef<State|null>(null),intentTriggerRef=useRef<HTMLElement|null>(null),toastTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
    const mainNavigationRef=useRef<HTMLElement|null>(null);
    const settingsPanelRef=useRef<HTMLDivElement|null>(null),settingsTabButtonRefs=useRef<Partial<Record<SettingsTabKey,HTMLButtonElement>>>({}),settingsTabScrollPositions=useRef<Partial<Record<SettingsTabKey,number>>>({});
    const child = data.children.find(c => c.id === cid) || data.children[0] || emptyChild;
    const canOperateSelectedChild=account.role!=="child"||Boolean(accountAccess.permissions.find(permission=>permission.childId===child.id)?.canOperate);
    const childBalance=useMemo(()=>calculateChildStarBalance(data.entries,data.redemptions,child.id),[data.entries,data.redemptions,child.id]);
    useEffect(()=>{
        const parameters=new URLSearchParams(window.location.search),debugEnabled=process.env.NODE_ENV==="development"||parameters.get("debugStars")==="1"||window.localStorage.getItem("star-diary:debug-stars")==="1";
        if(debugEnabled)logStarBalanceDebug({childName:child.name,report:childBalance,cachedTotal:Number(child.stars)||0,displayedTotal:childBalance.total});
    },[child.id,child.name,child.stars,childBalance]);
    const quickTemplatesByType=useMemo(()=>({star:orderedTemplatesByType(data.templates,"star"),deduct:orderedTemplatesByType(data.templates,"deduct"),special:orderedTemplatesByType(data.templates,"special")}),[data.templates]);
    const currentSettingsSignature=useMemo(()=>settingsSignature(data,""),[data]);
    const hasUnsavedChanges=Boolean(savedSettingsSignature)&&currentSettingsSignature!==savedSettingsSignature;
    const showSettingsSaveBar=role==="家長"&&tab==="家庭設定"&&(hasUnsavedChanges||invalidIntegerFields.size>0||imageUploading||savingSettings);
    useEffect(() => { reloadState().then(result=>setLoadFailed(!result)).finally(() => setLoading(false)); }, []);
    useEffect(()=>{
        const expired=()=>{setData(fallback);setCid("");setPassword("");setLoadFailed(false);setLoading(true);window.location.replace("/")};
        window.addEventListener(SESSION_EXPIRED_EVENT,expired);
        return()=>window.removeEventListener(SESSION_EXPIRED_EVENT,expired);
    },[]);
    useEffect(()=>{
        if(loading)return;
        document.documentElement.dataset.starDiaryReady="true";
        const frame=window.requestAnimationFrame(()=>window.dispatchEvent(new Event("star-diary:ready")));
        return()=>window.cancelAnimationFrame(frame);
    },[loading]);
    useEffect(()=>{
        const navigation=mainNavigationRef.current,current=navigation?.querySelector<HTMLButtonElement>('button[aria-current="page"]');
        if(!current)return;
        const frame=window.requestAnimationFrame(()=>{
            try{current.scrollIntoView({block:"nearest",inline:"center"})}
            catch{current.scrollIntoView(false)}
        });
        return()=>window.cancelAnimationFrame(frame);
    },[loading,role,tab]);
    useEffect(()=>{
        const syncFromLocation=()=>{
            if(tab!=="家庭設定")return;
            const fromHash=settingsTabFromHash(window.location.hash);
            if(fromHash&&fromHash!==settingsTab){settingsTabScrollPositions.current[settingsTab]=window.scrollY;setSettingsTab(fromHash)}
        };
        if(tab==="家庭設定"){
            const fromHash=settingsTabFromHash(window.location.hash);
            if(fromHash)setSettingsTab(fromHash);
            else window.history.replaceState(window.history.state,"",`${window.location.pathname}${window.location.search}#children`);
        }
        window.addEventListener("popstate",syncFromLocation);
        window.addEventListener("hashchange",syncFromLocation);
        return()=>{window.removeEventListener("popstate",syncFromLocation);window.removeEventListener("hashchange",syncFromLocation)};
    },[settingsTab,tab]);
    useEffect(()=>{
        if(tab!=="家庭設定")return;
        if(settingsTab!=="dailyTasks"&&officialLibraryOpen)setOfficialLibraryOpen(false);
        if(crop&&((crop.kind==="avatar"&&settingsTab!=="children")||(crop.kind==="reward"&&settingsTab!=="rewards"))){URL.revokeObjectURL(crop.url);setCrop(null)}
    },[crop,officialLibraryOpen,settingsTab,tab]);
    useEffect(()=>{
        if(tab!=="家庭設定")return;
        const frame=window.requestAnimationFrame(()=>{
            settingsTabButtonRefs.current[settingsTab]?.scrollIntoView({block:"nearest",inline:"center"});
            const saved=settingsTabScrollPositions.current[settingsTab];
            const panelTop=settingsPanelRef.current?window.scrollY+settingsPanelRef.current.getBoundingClientRect().top-16:window.scrollY;
            window.scrollTo({top:saved??Math.max(0,panelTop),behavior:"auto"});
        });
        return()=>window.cancelAnimationFrame(frame);
    },[settingsTab,tab]);
    useEffect(()=>{if(!hasUnsavedChanges)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=""};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn)},[hasUnsavedChanges]);
    useEffect(()=>{settingsDirtyRef.current=hasUnsavedChanges;settingsBusyRef.current=hasUnsavedChanges||savingSettings||imageUploading},[hasUnsavedChanges,savingSettings,imageUploading]);
    useEffect(()=>{const refreshDay=()=>setTodayKey(current=>{const next=taipeiDateKey();if(next!==current&&!settingsBusyRef.current)void reloadState();return next});const timer=setInterval(refreshDay,60000);window.addEventListener("focus",refreshDay);return()=>{clearInterval(timer);window.removeEventListener("focus",refreshDay)}},[]);
    useEffect(()=>{
        const viewport=window.visualViewport;
        if(!viewport)return;
        let frame=0;
        const update=()=>{
            window.cancelAnimationFrame(frame);
            frame=window.requestAnimationFrame(()=>{
                const active=document.activeElement,isField=active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement;
                setKeyboardOpen(isField&&window.innerHeight-viewport.height>140);
            });
        };
        let focusTimer=0;
        const focusUpdate=()=>{window.clearTimeout(focusTimer);focusTimer=window.setTimeout(update,40)};
        viewport.addEventListener("resize",update);window.addEventListener("focusin",focusUpdate);window.addEventListener("focusout",focusUpdate);
        return()=>{window.cancelAnimationFrame(frame);window.clearTimeout(focusTimer);viewport.removeEventListener("resize",update);window.removeEventListener("focusin",focusUpdate);window.removeEventListener("focusout",focusUpdate)};
    },[]);
    const say = (s: string) => { if(toastTimerRef.current)clearTimeout(toastTimerRef.current);setToast(s);toastTimerRef.current=setTimeout(() => setToast(""), 2800); };
    function normalizedClientState(loaded:Partial<State>):State{const normalized:State={...fallback,...loaded,children:Array.isArray(loaded.children)?loaded.children:fallback.children,entries:Array.isArray(loaded.entries)?loaded.entries:[],rewards:Array.isArray(loaded.rewards)?loaded.rewards:[],templates:normalizeTemplateSortOrders(Array.isArray(loaded.templates)?loaded.templates:[]),redemptions:Array.isArray(loaded.redemptions)?loaded.redemptions:[],specialRewards:Array.isArray(loaded.specialRewards)?loaded.specialRewards:[],rewardIconLibrary:Array.isArray(loaded.rewardIconLibrary)?loaded.rewardIconLibrary:[],dailyTasks:Array.isArray(loaded.dailyTasks)?loaded.dailyTasks:[],dailyTaskRecords:Array.isArray(loaded.dailyTaskRecords)?loaded.dailyTaskRecords:[],dailyTaskSettings:loaded.dailyTaskSettings&&typeof loaded.dailyTaskSettings==="object"?loaded.dailyTaskSettings:{},favoriteOfficialTaskIds:Array.isArray(loaded.favoriteOfficialTaskIds)?loaded.favoriteOfficialTaskIds:[],dailyTaskSortMode:loaded.dailyTaskSortMode==="custom"?"custom":"flow"};return withCalculatedStarBalances(normalized)}
    function establishSettingsBaseline(next:State){const snapshot=clonePersistedState(next);savedStateRef.current=snapshot;setSavedSettingsSignature(settingsSignature(snapshot,""));setInvalidIntegerFields(new Set());setIntegerResetSignal(value=>value+1)}
    function applyServerPayload(result:{state?:Partial<State>;revision?:number;passwordSet?:boolean;security?:SecurityInfo;access?:AccountAccessInfo},options:{replaceSettings?:boolean;establishBaseline?:boolean}={}){const incoming=Number(result.revision);if(Number.isFinite(incoming)&&incoming<revisionRef.current)return false;if(result.state){const next=normalizedClientState(result.state),preserveDraft=settingsDirtyRef.current&&!options.replaceSettings;if(preserveDraft)setData(current=>applyEditableSettings(next,current));else{setData(next);setCid(current=>next.children.some(item=>item.id===current)?current:(next.children[0]?.id||current));if(options.establishBaseline!==false)establishSettingsBaseline(next)}}if(Number.isFinite(incoming))revisionRef.current=incoming;if(typeof result.passwordSet==="boolean")setPasswordSet(result.passwordSet);if(result.security)setSecurityInfo(result.security);if(result.access)setAccountAccess(result.access);return true}
    async function reloadState():Promise<State|null>{try{const response=await authenticatedFetch(`/api/state?t=${Date.now()}`,{cache:"no-store"}),result=await response.json();if(!response.ok||!result.state)throw new Error(result.error||"無法讀取資料");const next=normalizedClientState(result.state),applied=applyServerPayload(result);setTodayKey(taipeiDateKey());setLoadFailed(false);return applied?next:null}catch{return null}}
    async function refreshAnalytics(){const latest=await reloadState();say(latest?"分析資料已刷新":"刷新失敗，請檢查網路後再試");return latest}
    async function rebaseSettingsDraft(draft:State){try{const response=await authenticatedFetch(`/api/state?t=${Date.now()}`,{cache:"no-store"}),result=await response.json();if(!response.ok||!result.state)return false;const incoming=Number(result.revision);if(Number.isFinite(incoming))revisionRef.current=incoming;if(typeof result.passwordSet==="boolean")setPasswordSet(result.passwordSet);if(result.security)setSecurityInfo(result.security);const remote=normalizedClientState(result.state),merged=applyEditableSettings(remote,draft);establishSettingsBaseline(remote);setData(merged);setCid(current=>merged.children.some(item=>item.id===current)?current:(merged.children[0]?.id||current));setTodayKey(taipeiDateKey());return true}catch{return false}}
    async function persist(next: State,options:PersistOptions={}) {const balancedNext=withCalculatedStarBalances(next);if(options.optimistic!==false)setData(balancedNext);try{const r = await authenticatedFetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", state: balancedNext, password,expectedRevision:revisionRef.current }) }),x=await r.json();if(!r.ok){if(options.preserveDraftOnFailure){if(r.status===409&&options.draftForRebase&&await rebaseSettingsDraft(options.draftForRebase))say("其他裝置已有新資料，未儲存內容已保留，請確認後再次儲存");else say(x.error || "儲存失敗，未儲存內容仍為你保留");return false}await reloadState();say(x.error || "儲存失敗");return false}const applied=applyServerPayload(x,{replaceSettings:true,establishBaseline:true});if(!applied){say("收到較舊的儲存結果，請再試一次");return false}say(options.successMessage||"已儲存所有設定");return true}catch{if(!options.preserveDraftOnFailure)await reloadState();say(options.preserveDraftOnFailure?"儲存失敗，未儲存內容仍為你保留":"儲存失敗，請檢查網路後再試");return false}}
    async function submitPending(action:"child_entry"|"child_redemption",record:Entry|Redeem,next:State){setData(withCalculatedStarBalances(next));try{const r=await authenticatedFetch("/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,record})}),x=await r.json();if(!r.ok){await reloadState();say(x.error||"送出失敗");return false}applyServerPayload(x);say("已送出，等待家長確認");return true}catch{await reloadState();say("送出失敗，請檢查網路後再試");return false}}
    function editSettings(update:State|((current:State)=>State)){setData(current=>typeof update==="function"?(update as (value:State)=>State)(current):update)}
    function restoreSettingsSnapshot(showToast=true){const snapshot=savedStateRef.current;if(!snapshot)return null;setData(current=>applyEditableSettings(current,snapshot));setInvalidIntegerFields(new Set());setIntegerResetSignal(value=>value+1);settingsDirtyRef.current=false;setCid(current=>snapshot.children.some(item=>item.id===current)?current:(snapshot.children[0]?.id||current));if(showToast)say("已取消未儲存的變更");return snapshot}
    function performSettingsIntent(intent:SettingsIntent,availableState:State=data){
        if(intent.kind==="tab"){
            setTab(intent.value);
            if(intent.value==="任務挑戰")void syncDailyTasks();
        }else if(intent.kind==="child"){
            setCid(availableState.children.some(item=>item.id===intent.value)?intent.value:(availableState.children[0]?.id||cid));
            if(tab==="任務挑戰")void syncDailyTasks();
        }else{
            setRole("孩子");
            setTab("首頁");
        }
    }
    function requestSettingsIntent(intent:SettingsIntent,trigger?:HTMLElement|null){if(savingSettingsRef.current||imageUploading){say(imageUploading?"圖片上傳中，請稍候":"設定儲存中，請稍候");return}if(tab==="家庭設定"&&hasUnsavedChanges){intentTriggerRef.current=trigger||(document.activeElement instanceof HTMLElement?document.activeElement:null);setPendingSettingsIntent(intent);return}performSettingsIntent(intent)}
    function goTab(next:string,trigger?:HTMLElement|null){if(next===tab)return;requestSettingsIntent({kind:"tab",value:next},trigger)}
    function switchToChildMode(trigger?:HTMLElement|null){if(role==="孩子")return;requestSettingsIntent({kind:"childMode"},trigger)}
    function requestChildChange(next:string,trigger?:HTMLElement|null){if(next===cid)return;requestSettingsIntent({kind:"child",value:next},trigger)}
    function continueEditing(){setPendingSettingsIntent(null)}
    function discardAndContinue(){const intent=pendingSettingsIntent;if(!intent)return;const snapshot=restoreSettingsSnapshot(false);setPendingSettingsIntent(null);if(snapshot)performSettingsIntent(intent,snapshot);say("已取消未儲存的變更")}
    async function saveAllSettings(){if(savingSettingsRef.current||imageUploading)return false;if(invalidIntegerFields.size){say("請先修正空白或超出範圍的數字欄位");return false}if(!hasUnsavedChanges)return true;const invalidWeekdayTask=data.dailyTasks.find(task=>task.enabled&&!normalizeWeekdays(task.weekdays).length);if(invalidWeekdayTask){say(`「${invalidWeekdayTask.title}」請至少選擇一個執行星期`);return false}const invalidTask=data.dailyTasks.find(task=>task.enabled&&!task.applicableChildIds.length);if(invalidTask){say(`「${invalidTask.title}」請至少選擇一位適用孩子`);return false}savingSettingsRef.current=true;setSavingSettings(true);const draft=clonePersistedState(data),next=prepareSettingsForSave(draft);try{return await persist(next,{preserveDraftOnFailure:true,optimistic:false,successMessage:"✅ 已儲存",draftForRebase:draft})}finally{savingSettingsRef.current=false;setSavingSettings(false)}}
    async function enterParent() { if(account.role==="child"){say("Child 帳號無法進入家長模式");return}if(role==="家長")return;if (!passwordSet) {
        setRole("家長");
        goTab("家庭設定");
        return;
    } setLogin(true); }
    async function verify() { const r = await authenticatedFetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", password }) }); if (r.ok) {
        setRole("家長");
        setLogin(false);
        say("已進入家長模式");
    }
    else
        say("密碼錯誤"); }
    ;
    async function createFirstChild(name:string){const id=crypto.randomUUID(),next:State={...data,children:[{id,name,gender:"boy",avatar:"boy",stars:0}],dailyTaskSettings:{[id]:{...DEFAULT_DAILY_TASK_SETTINGS}}};const saved=await persist(next,{successMessage:"家庭已建立"});if(saved)setCid(id);return saved}
    if (loading)
        return <main className="loading" aria-label="正在載入家庭資料"><span className="visually-hidden">正在載入家庭資料</span></main>;
    if(loadFailed)return <FamilyLoadError account={account} onRetry={async()=>Boolean(await reloadState())}/>;
    if(!data.children.length)return account.role==="child"?<main className="family-onboarding-page"><section className="family-onboarding-card"><img src="/star-diary-logo.jpg" alt="" width={92} height={92}/><h1>目前沒有可查看的孩子</h1><p>請家庭 Owner 或 Parent 到「帳號管理」檢查你的 Child 綁定與查看權限，或在下方安全離開家庭。</p><button type="button" className="primary" onClick={()=>void signOut({callbackUrl:"/?switch=1"})}>切換 Google 帳號</button></section><section className="onboarding-account-management"><AccountManagement onMessage={say}/></section></main>:<EmptyFamilyOnboarding account={account} onCreate={createFirstChild} onMessage={say}/>;
    return <main className={showSettingsSaveBar?"has-settings-save-bar":undefined}><header className="topbar"><button type="button" className="brand" aria-label="返回首頁｜星星日記" onClick={event => goTab("首頁",event.currentTarget)}><img className="brand-logo" src="/star-diary-logo.jpg" alt="" width={48} height={48}/><span className="brand-label">星星日記</span></button><nav ref={mainNavigationRef} className="main-navigation" aria-label="主要導覽">{["首頁", "任務挑戰", "星星紀錄", "資料分析", "星星寶庫", "兌換紀錄", ...(role === "家長" ? ["家庭設定", "帳號管理"] : account.role==="child" ? ["帳號管理"] : [])].map(x => <button key={x} className={tab === x ? "active" : ""} aria-current={tab===x?"page":undefined} onClick={event => goTab(x,event.currentTarget)}>{x}</button>)}</nav><div className="role-switch">{account.role!=="child"&&<button className={role === "家長" ? "on" : ""} onClick={enterParent}>家長</button>}<button className={role === "孩子" ? "on" : ""} onClick={event=>switchToChildMode(event.currentTarget)}>孩子</button></div><div className="signed-in-account">{account.image?<img src={account.image} alt="" referrerPolicy="no-referrer"/>:<span aria-hidden="true">G</span>}<div><strong>{account.name||"Google 使用者"}</strong><small>{account.email}</small></div><button type="button" onClick={()=>{setData(fallback);setCid("");setLoading(true);void signOut({callbackUrl:"/?switch=1"})}}>切換帳號</button></div></header><section className="shell"><div className="hello"><div><p className="eyebrow">FAMILY STAR JOURNAL</p><h1>{tab === "首頁" ? `嗨，${child.name}！今天也很棒 👋` : tab}</h1><p>{account.role==="child"?canOperateSelectedChild?"你可以查看並操作這位孩子的任務與兌換。":"你可以查看這位孩子，但操作需由家長授權。":"每位孩子都有自己的星星與完整紀錄。"}</p></div><label className="child-pill"><Avatar c={child}/><select value={cid} onChange={event => requestChildChange(event.target.value,event.currentTarget)}>{data.children.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div>
    {tab === "首頁" && <><section className="hero-grid"><article className="balance-card"><p>我的星星</p><div className="big-star"><span>★</span><strong>{childBalance.total}</strong></div><small>每一次努力，都值得被看見</small></article>{account.role!=="child"&&<><QuickTemplateHomeCard/><article className="quick-card"><p>新增紀錄</p><strong>今天發生什麼事？</strong><div><button onClick={() => setRecord(true)}><span>＋★</span>加星／扣星／特殊</button></div></article></>}</section><Title text="最近紀錄"/><Entries /></>}
    {tab === "任務挑戰" && TaskChallenge()}
    {tab === "星星紀錄" && <><div className="record-tools"><span>{role==="家長"?"新增時可指定今天或過去的發生時間":"日期與時間會自動記錄"}</span>{role === "家長" && <button className="primary" onClick={() => setRecord(true)}>＋ 新增紀錄</button>}</div><Entries /></>}
    {tab === "星星寶庫" && <><div className="reward-top"><div><span>★</span><p>{child.name}目前有 <b>{childBalance.total}</b> 顆星星</p></div></div>{!canOperateSelectedChild&&<p className="child-readonly-notice">此帳號只有查看權限；兌換需由家長授予「可操作」。</p>}<Title text="星星獎品"/><div className="reward-grid">{data.rewards.map(r => {const cost=positiveInt(r.cost);return <article className="reward-card" key={r.id}><div className="reward-icon">{r.image?<img src={r.image} alt={r.name}/>:r.icon}</div><h3>{r.name}</h3><p><span>★</span> {cost} 顆</p><button disabled={!canOperateSelectedChild} onClick={() => { if(!canOperateSelectedChild)return say("這位孩子目前只有查看權限");if (childBalance.total < cost)return say(`星星不足，還差 ${cost - childBalance.total} 顆`); setRedeem({...r,cost,source:"star"}); }}>使用星星兌換</button></article>})}</div><Title text="特殊獎勵倉庫"/><p className="warehouse-note">獲得特殊獎勵會自動進貨；家長確認兌換後出貨，庫存為 0 時自動下架。</p><div className="reward-grid">{data.specialRewards.filter(r=>r.stock>0).map(r=><article className="reward-card special-card" key={r.id}><div className="reward-icon">{r.image?<img src={r.image} alt={r.name}/>:r.icon}</div><h3>{r.name}</h3><p>庫存 <b>{r.stock}</b> 個</p><button disabled={!canOperateSelectedChild} onClick={()=>{if(!canOperateSelectedChild)return say("這位孩子目前只有查看權限");setRedeem({...r,source:"special"})}}>直接兌換</button></article>)}</div>{!data.specialRewards.some(r=>r.stock>0)&&<p className="empty">目前沒有特殊獎勵庫存</p>}</>}
    {tab === "兌換紀錄" && <><Title text="兌換歷史"/><div className="entries">{data.redemptions.filter(x => x.childId === cid).map(x => <article key={x.id}><div className="entry-icon">🎁</div><div className="entry-copy"><h3>{x.reward}</h3><small>{x.date} · {x.status==="pending"?"等待家長確認":"已完成"}</small></div><strong>{x.status==="pending"?"待確認":x.cost ? `−${x.cost} ★` : "直接兌換"}</strong>{role==="家長"&&x.status==="pending"&&<button className="primary" onClick={()=>confirmRedemption(x)}>確認已執行</button>}</article>)}{!data.redemptions.some(x => x.childId === cid) && <p className="empty">目前還沒有兌換紀錄</p>}</div></>}
    {tab === "資料分析" && <Analytics data={data} child={child} onRefresh={refreshAnalytics} todayKey={todayKey}/>}
    {tab === "家庭設定" && role === "家長" && Settings()}
    {tab === "帳號管理" && (account.role==="child"||role === "家長") && <AccountManagement onMessage={say}/>}</section>{showSettingsSaveBar&&<aside className={`settings-save-bar${keyboardOpen?" is-keyboard-open":""}`} role="region" aria-label="設定儲存操作" aria-busy={savingSettings||imageUploading}><div className="settings-save-bar-inner"><div className="settings-save-status" role="status" aria-live="polite"><span aria-hidden="true">⚙️</span><strong>{imageUploading?"圖片上傳中…":savingSettings?"正在儲存設定…":invalidIntegerFields.size?"請修正空白或超出範圍的數字":"你有尚未儲存的設定"}</strong></div><div className="settings-save-actions"><button type="button" className="settings-save-cancel" disabled={savingSettings||imageUploading} onClick={()=>restoreSettingsSnapshot()}>取消</button><button type="button" className="settings-save-submit" disabled={savingSettings||imageUploading} onClick={()=>void saveAllSettings()}>{imageUploading?"圖片上傳中…":savingSettings?"儲存中…":"儲存"}</button></div></div></aside>}{record&&account.role!=="child"&&<RecordModal templates={data.templates} allowBackdate={role==="家長"} onClose={()=>setRecord(false)} onSave={addEntry} onValidationError={say}/>} {redeem && <RedeemModal />}{quickConfirm&&account.role!=="child" && <QuickConfirmModal />}{taskConfirm&&<div className="modal-back"><section className="modal quick-confirm-modal"><button className="close" onClick={()=>setTaskConfirm(null)}>×</button><h2>確認完成任務</h2><div className="confirm-box"><p>任務<strong>{taskConfirm.iconSnapshot} {taskConfirm.titleSnapshot}</strong></p><p>完成獎勵<strong>＋{taskConfirm.rewardStarsSnapshot} ⭐</strong></p><p>記錄對象<strong>{child.name}</strong></p><p>生效方式<strong>{taskSettingsForChild(data.dailyTaskSettings,cid).completionMode==="approval"?"送出後等待家長確認":"完成後立即加星"}</strong></p></div><div className="record-actions"><button className="save" disabled={Boolean(taskBusy)} onClick={()=>{const target=taskConfirm;setTaskConfirm(null);void runTaskAction(target,"complete")}}>確認完成</button><button type="button" className="cancel-action" onClick={()=>setTaskConfirm(null)}>取消</button></div></section></div>}{crop&&<CropModal target={crop} onCancel={cancelCrop} onError={cropError} onConfirm={saveCrop}/>} {login && <div className="modal-back"><section className="modal parent-login-modal"><button className="close" aria-label="關閉家長登入" onClick={() => setLogin(false)}>×</button><h2>輸入家長密碼</h2><SecretField label="家長密碼" name="parent-login-password" value={password} onChange={setPassword} autoComplete="current-password" autoFocus/><button type="button" className="save" onClick={()=>void verify()}>進入家長模式</button><button type="button" className="forgot-password-link" onClick={()=>{setLogin(false);setForgotPassword(true)}}>忘記密碼？</button></section></div>}{forgotPassword&&<ForgotPasswordModal security={securityInfo} onClose={()=>setForgotPassword(false)} onMessage={say} onPayload={(payload,newPassword)=>{applyServerPayload(payload,{replaceSettings:true,establishBaseline:true});setPassword(newPassword)}}/>}{pendingSettingsIntent&&<UnsavedSettingsModal returnFocus={intentTriggerRef.current} onContinue={continueEditing} onDiscard={discardAndContinue}/>} {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}</main>;
    async function runTaskAction(taskRecord:DailyTaskRecord,operation:"complete"|"approve"|"reject"|"skip"|"restore"|"undo"){
        if(taskBusy)return;setTaskBusy(taskRecord.id);
        try{
            const childAction=role==="孩子"&&operation==="complete",response=await authenticatedFetch("/api/state",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(childAction?{action:"child_daily_task_complete",recordId:taskRecord.id,childId:cid}:{action:"parent_daily_task_action",recordId:taskRecord.id,operation,password})}),result=await response.json();
            if(!response.ok)throw new Error(result.error||"任務更新失敗");
            applyServerPayload(result);
            setTaskSyncError(false);
            const updated=(result.state as State|undefined)?.dailyTaskRecords?.find(item=>item.id===taskRecord.id);
            if(childAction) say(updated?.status==="pending_approval"?"已送出，等待家長確認":"任務完成，星星已加入！");
            else say(operation==="skip"?"已標記今日不適用":operation==="restore"?"已恢復為待完成":operation==="undo"?"已撤銷完成並修正星星":operation==="reject"?"已退回給孩子":"任務已完成");
        }catch(error){setTaskSyncError(!await reloadState());say(error instanceof Error?error.message:"任務更新失敗")}finally{setTaskBusy("")}
    }
    async function syncDailyTasks(showFeedback=false){
        if(taskBusy)return false;
        if(showFeedback)setTaskBusy("sync");
        try{
            const ok=await reloadState();
            setTaskSyncError(!ok);
            if(showFeedback)say(ok?"今日任務已重新同步":"同步失敗，請檢查網路後再試");
            return ok;
        }finally{
            if(showFeedback)setTaskBusy("");
        }
    }
    function TaskChallenge(){
        const settings=taskSettingsForChild(data.dailyTaskSettings,cid),childRecords=data.dailyTaskRecords.filter(item=>item.childId===cid),today=dailyTaskDayView(data.dailyTaskRecords,data.dailyTasks,cid,todayKey),todayRecords=today.records,progress=today.progress,pending=today.pending,finished=today.finished,todayGoalSettings=taskGoalSettingsForRecords(todayRecords,settings),weekly=weeklyTaskProgress(childRecords,todayKey),goal=goalResult(progress,todayGoalSettings),streak=calculateTaskStreak(childRecords,settings,todayKey),completedEntries=data.entries.filter(entry=>entry.childId===cid&&(entry.status??"completed")==="completed"&&entryDateKey(entry)===todayKey),fixedStars=completedEntries.filter(entry=>entry.type==="star"&&entry.sourceType==="daily_task").reduce((sum,entry)=>sum+entry.amount,0),otherStars=completedEntries.filter(entry=>entry.type==="star"&&entry.sourceType!=="daily_task").reduce((sum,entry)=>sum+entry.amount,0),deductStars=completedEntries.filter(entry=>entry.type==="deduct").reduce((sum,entry)=>sum+entry.amount,0),net=fixedStars+otherStars-deductStars,approvalBacklog=childRecords.filter(item=>item.status==="pending_approval"&&item.date<todayKey).sort((a,b)=>a.date.localeCompare(b.date)),hasDefinitions=data.dailyTasks.some(task=>task.applicableChildIds.includes(cid)),remaining=Math.max(0,goal.required-progress.completed);
        const renderTaskCard=(item:DailyTaskRecord)=>{const busy=taskBusy===item.id,locked=Boolean(taskBusy),statusText=item.status==="completed"?"已完成":item.status==="skipped"?"今日不適用":item.status==="pending_approval"?"等待家長確認":"尚未完成";return <article key={item.id} className={`task-card task-${item.status}`} aria-busy={busy}><div className="task-card-copy"><span className="task-card-icon" aria-hidden="true">{item.status==="completed"?"✅":item.status==="skipped"?"⏭️":item.iconSnapshot}</span><div><h3>{item.titleSnapshot}</h3><p>{item.status==="completed"?`已獲得 ${item.rewardStarsSnapshot} ⭐`:`完成可得 ${item.rewardStarsSnapshot} ⭐`}</p><small>{item.date!==todayKey&&`${formatTaipeiDate(item.date)}・`}{statusText}{item.completedAt&&`・完成時間 ${formatTaipeiTime(item.completedAt)}`}{item.requestedAt&&item.status==="pending_approval"&&`・送出時間 ${formatTaipeiTime(item.requestedAt)}`}</small></div></div><div className="task-card-actions">{role==="孩子"&&item.status==="pending"&&canOperateSelectedChild&&<button className="task-primary" disabled={locked} onClick={()=>setTaskConfirm(item)}>{busy?"送出中…":"完成任務"}</button>}{role==="孩子"&&item.status==="pending"&&!canOperateSelectedChild&&<button disabled>僅可查看</button>}{role==="孩子"&&item.status==="pending_approval"&&<button disabled>⏳ 等待家長確認</button>}{role==="家長"&&item.status==="pending"&&<><button className="task-primary" disabled={locked} onClick={()=>runTaskAction(item,"complete")}>標記完成</button><button disabled={locked} onClick={()=>runTaskAction(item,"skip")}>今日不適用</button></>}{role==="家長"&&item.status==="pending_approval"&&<><button className="task-primary" disabled={locked} onClick={()=>runTaskAction(item,"approve")}>確認完成</button><button disabled={locked} onClick={()=>runTaskAction(item,"reject")}>退回</button><button disabled={locked} onClick={()=>runTaskAction(item,"skip")}>今日不適用</button></>}{role==="家長"&&item.status==="completed"&&<button className="task-undo" disabled={locked} onClick={()=>confirm(`確定撤銷「${item.titleSnapshot}」？星星也會同步扣回。`)&&runTaskAction(item,"undo")}>撤銷完成</button>}{role==="家長"&&item.status==="skipped"&&<button disabled={locked} onClick={()=>runTaskAction(item,"restore")}>恢復為待完成</button>}</div></article>};
        const progressMessage=!todayRecords.length?"今天沒有安排每日任務":!progress.total?"今日任務皆標記為不適用":`${progress.completed} / ${progress.total} 項完成`;
        return <div className="task-challenge">
            <section className="task-challenge-head">
                <div className="task-challenge-title"><p className="eyebrow">DAILY MISSION</p><h2>🎯 {child.name} 的今日任務</h2><p>{formatTaipeiDate(todayKey)}</p></div>
                <div className="task-summary-progress">
                    <div className="task-summary-progress-copy"><div><span>今日進度</span><strong>{progressMessage}</strong></div>{progress.percentage!==null&&<b>{progress.percentage}%</b>}</div>
                    {progress.percentage!==null&&<div className="task-progress-track" role="progressbar" aria-label={`${child.name} 的今日任務完成率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage}><i style={{width:`${progress.percentage}%`}}/></div>}
                    {!todayRecords.length&&<small>{hasDefinitions?"今日沒有符合星期排程的啟用任務，不影響連續達標。":"請家長到「家庭設定 → 每日任務設定」新增固定任務。"}</small>}
                </div>
                {taskSyncError&&<div className="task-sync-error" role="status"><span>今日任務尚未同步，請檢查網路。</span><button type="button" disabled={Boolean(taskBusy)} onClick={()=>void syncDailyTasks(true)}>{taskBusy==="sync"?"同步中…":"重新同步"}</button></div>}
            </section>
            <div className="task-stat-grid"><article><span>✨ 今日獲得</span><strong className={net<0?"summary-deduct":""}>{net>0?"＋":""}{net} ⭐</strong><small>固定任務 ＋{fixedStars}・其他獎勵 ＋{otherStars}・扣星 −{deductStars}</small></article><article><span>🔥 連續達標</span><strong>{streak} 天</strong><small>{!todayRecords.length?"今天沒有安排任務，不影響連續紀錄":!progress.total?"今天的任務皆不適用，不影響連續紀錄":goal.met?`今日已達標，連續第 ${streak} 天！`:`再完成 ${remaining} 項即可達標`}</small></article><article><span>📈 本週完成率</span><strong>{weekly.percentage===null?"—":`${weekly.percentage}%`}</strong><small>{weekly.total?`${weekly.completed} / ${weekly.total} 項（週一至今天）`:"本週尚無有效任務"}</small><div className="task-mini-progress"><i style={{width:`${weekly.percentage??0}%`}}/></div></article></div>
            {approvalBacklog.length>0&&<section><Title text="待家長確認（含過往）"/><div className="task-card-grid">{approvalBacklog.map(renderTaskCard)}</div></section>}
            {!todayRecords.length?!hasDefinitions&&<section className="task-empty"><div>🎯</div><h2>尚未建立每日任務</h2><p>請家長到「家庭設定 → 每日任務設定」新增固定任務。</p>{role==="家長"&&<button className="primary" onClick={()=>goTab("家庭設定")}>前往新增每日任務</button>}</section>:<><section><Title text="今日待完成"/>{pending.length?<div className="task-card-grid">{pending.map(renderTaskCard)}</div>:<p className="empty">今天的待辦任務都處理完成了！</p>}</section><section><Title text="今日已完成／不適用"/>{finished.length?<div className="task-card-grid">{finished.map(renderTaskCard)}</div>:<p className="empty">完成任務後會顯示在這裡</p>}</section></>}
        </div>;
    }
    function quick(t: Template) { const count=Math.max(1,Math.abs(Math.floor(Number(t.amount)||1))),amount = t.type === "deduct" ? -count : count,sourceType:Entry["sourceType"]=t.type==="deduct"?"quick_deduct":t.type==="special"?"special_reward":"quick_add"; void addEntry(t.title, amount, t.type,undefined,sourceType); }
    function QuickConfirmModal(){const t=quickConfirm!,count=positiveInt(t.amount),typeName=t.type==="star"?"加星":t.type==="deduct"?"扣星":"特殊獎勵",amount=t.type==="special"?`${count} 個`:`${t.type==="deduct"?"−":"＋"}${count} 顆`;return <div className="modal-back"><section className="modal quick-confirm-modal"><button className="close" onClick={()=>setQuickConfirm(null)}>×</button><h2>確認新增紀錄</h2><div className="confirm-box"><p>項目<strong>{t.title}</strong></p><p>類型<strong className={t.type==="deduct"?"summary-deduct":""}>{typeName}</strong></p><p>數量<strong>{amount}</strong></p><p>記錄對象<strong>{child.name}</strong></p></div><p className="confirmation-note">{role==="孩子"?"確認送出後，會等待家長確認才正式計入。":"確認後會立即加入星星紀錄。"}</p><div className="record-actions"><button className="save" onClick={()=>{const selected=t;setQuickConfirm(null);quick(selected)}}>確認新增</button><button type="button" className="cancel-action" onClick={()=>setQuickConfirm(null)}>取消</button></div></section></div>}
    function openQuickIndicatorSettings(){setSettingsTab("quickActions");window.history.replaceState(window.history.state,"",`${window.location.pathname}${window.location.search}#quickActions`);goTab("家庭設定")}
    function QuickTemplateHomeCard(){
        const renderGroup=(type:QuickTemplateType,title:string,empty:string)=>{const items=quickTemplatesByType[type];return <section className={`home-template-group home-template-${type}`} key={type}><h3>{title}</h3>{items.length?<div className="home-template-buttons">{items.map(template=><button type="button" key={template.id} className={type==="deduct"?"deduct-pick":type==="special"?"special-pick":undefined} onClick={()=>setQuickConfirm(template)}><span aria-hidden="true">{type==="star"?"＋":type==="deduct"?"−":"🎉"}{positiveInt(template.amount)}</span><span>{template.title}</span></button>)}</div>:<div className="home-template-empty"><span>{empty}</span>{role==="家長"&&<button type="button" onClick={openQuickIndicatorSettings}>前往設定</button>}</div>}</section>};
        return <article className="week-card"><p>快速選取指標</p><div className="home-template-groups">{renderGroup("star","⭐ 快速加星","尚未設定快速加星指標。")}{renderGroup("deduct","➖ 快速扣星","尚未設定快速扣星指標。")}{quickTemplatesByType.special.length>0&&renderGroup("special","🎁 快速特殊獎勵","尚未設定特殊獎勵。")}</div></article>;
    }
    function specialStock(list:Reward[],title:string,amount:number){const found=list.find(r=>r.name.trim()===title.trim());const next=found?list.map(r=>r.id===found.id?{...r,stock:Math.max(0,r.stock+amount)}:r):amount>0?[...list,{id:crypto.randomUUID(),icon:"🎁",name:title.trim(),cost:0,stock:amount,source:"special" as const}]:list;return next.filter(r=>r.stock>0)}
    async function addEntry(title: string, amount: number, type: Entry["type"], selectedOccurredAt?:string,sourceType:Entry["sourceType"]="manual") {
        const count=positiveInt(amount),pending=role==="孩子",createdAt=new Date().toISOString(),occurredAt=role==="家長"?(selectedOccurredAt||createdAt):undefined;
        if(occurredAt&&Date.parse(occurredAt)>Date.now()){say("紀錄時間不可晚於現在");return false}
        const e:Entry = { id: crypto.randomUUID(), childId: cid, title:title.trim(), amount: count, type, date: formatTaipeiOccurrence(occurredAt||createdAt),...(occurredAt?{occurredAt}:{}),createdAt,status:pending?"pending":"completed",...(pending?{}:{sourceType:type==="special"?"special_reward":sourceType}) };
        const next = { ...data, entries: [e, ...data.entries],specialRewards:!pending&&type==="special"?specialStock(data.specialRewards,title,count):data.specialRewards };
        return pending?submitPending("child_entry",e,next):persist(next);
    }
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
            const res=await authenticatedFetch("/api/media",{method:"POST",body:fd});
            const x=await res.json().catch(()=>({}));
            if(!res.ok||typeof x.url!=="string"){say(x.error||"圖片上傳失敗");return null}
            return x.url as string;
        }catch{say("圖片上傳失敗，請檢查網路後再試");return null}
    }
    async function rewardFileHash(file:File){try{const bytes=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,"0")).join("")}catch{return undefined}}
    async function uploadReward(file:File,id:string){const fingerprint=await rewardFileHash(file),reused=fingerprint?data.rewardIconLibrary.find(asset=>asset.hash===fingerprint):undefined,url=reused?.image||await uploadImage(file,"reward");if(!url)return;editSettings(current=>{const reward=current.rewards.find(item=>item.id===id);if(!reward)return current;const identity=rewardImageIdentity(url),exists=current.rewardIconLibrary.find(asset=>rewardImageIdentity(asset.image)===identity),asset=exists||{id:crypto.randomUUID(),name:reward.name.trim()?`${reward.name.trim()}圖片`:`自訂圖片 ${String(current.rewardIconLibrary.length+1).padStart(2,"0")}`,image:url,...(fingerprint?{hash:fingerprint}:{}),createdAt:new Date().toISOString()},library=exists?current.rewardIconLibrary:[...current.rewardIconLibrary,asset];return{...current,rewardIconLibrary:library,rewards:current.rewards.map(item=>item.id===id?{...item,image:url}:item)}});say(reused?"已套用圖示庫中的相同圖片，請按儲存":"圖片已加入「我的圖片」，請按儲存")}
    function startCrop(file:File,kind:CropTarget["kind"],targetId:string){if(imageUploading)return say("已有圖片正在上傳，請稍候");const extension=file.name.split(".").pop()?.toLowerCase()||"",allowed=["jpg","jpeg","png","webp"],allowedTypes=["image/jpeg","image/jpg","image/pjpeg","image/png","image/webp"],type=file.type.toLowerCase();if((type&&!allowedTypes.includes(type))||(!type&&!allowed.includes(extension)))return say("請選擇 JPG、JPEG、PNG 或 WebP 圖片");if(file.size>40*1024*1024)return say("原始圖片請小於 40 MB");setCrop({file,kind,targetId,url:URL.createObjectURL(file)})}
    function cancelCrop(){if(crop)URL.revokeObjectURL(crop.url);setCrop(null)}
    function cropError(){cancelCrop();say("這張圖片無法讀取，請改用 JPG、PNG 或 WebP")}
    async function saveCrop(file:File){const target=crop;if(!target)return;URL.revokeObjectURL(target.url);setCrop(null);setImageUploading(true);try{if(target.kind==="reward"){await uploadReward(file,target.targetId);return}const url=await uploadImage(file,"avatar");if(!url)return;editSettings(current=>({...current,children:current.children.map(item=>item.id===target.targetId?{...item,avatar:url}:item)}));say("大頭照已套用，請按儲存")}finally{setImageUploading(false)}}
    function chooseBuiltinRewardIcon(id:string,icon:string){editSettings(current=>({...current,rewards:current.rewards.map(reward=>reward.id===id?{...reward,icon,image:undefined}:reward)}))}
    function chooseUploadedRewardIcon(id:string,image:string){editSettings(current=>({...current,rewards:current.rewards.map(reward=>reward.id===id?{...reward,image}:reward)}))}
    function renderRewardIconPicker(reward:Reward){
        const uploadId=`reward-upload-${reward.id}`,selectedAsset=data.rewardIconLibrary.find(asset=>rewardImageIdentity(asset.image)===rewardImageIdentity(reward.image||"")),builtin=BUILTIN_REWARD_ICONS.find(item=>item.value===reward.icon),icons=builtin||!reward.icon?BUILTIN_REWARD_ICONS:[{value:reward.icon,name:"原有圖示"},...BUILTIN_REWARD_ICONS];
        return <div className="reward-media-control"><div className={`reward-current-preview${reward.image?" has-image":""}`}>{reward.image?<img src={reward.image} alt={`${reward.name}目前圖片`}/>:<span aria-label={builtin?.name||"目前圖示"}>{reward.icon||"🎁"}</span>}</div><div className="reward-media-actions"><details className="reward-icon-picker"><summary aria-label={`選擇「${reward.name}」的圖示`}><span className="picker-current">{reward.image?<img src={reward.image} alt=""/>:<b>{reward.icon||"🎁"}</b>}<span>{reward.image?(selectedAsset?.name||"我的圖片"):(builtin?.name||"原有圖示")}</span></span><span className="picker-prompt">選擇圖示⌄</span></summary><div className="reward-icon-menu"><h4>內建圖示</h4><div className="builtin-icon-options">{icons.map(item=><button type="button" key={item.value} aria-pressed={!reward.image&&reward.icon===item.value} onClick={event=>{chooseBuiltinRewardIcon(reward.id,item.value);event.currentTarget.closest("details")?.removeAttribute("open")}}><span className="builtin-option-icon" aria-hidden="true">{item.value}</span><span>{item.name}</span></button>)}</div><h4>我的圖片</h4>{data.rewardIconLibrary.length?<div className="uploaded-icon-options">{data.rewardIconLibrary.map(asset=><button type="button" key={asset.id} aria-pressed={rewardImageIdentity(reward.image||"")===rewardImageIdentity(asset.image)} onClick={event=>{chooseUploadedRewardIcon(reward.id,asset.image);event.currentTarget.closest("details")?.removeAttribute("open")}}><img src={asset.image} alt=""/><span>{asset.name}</span></button>)}</div>:<p className="icon-library-empty">上傳圖片後，會自動保存在這裡供所有獎品使用。</p>}</div></details><label className="reward-upload-action" htmlFor={uploadId}>＋ 上傳圖片</label><input id={uploadId} className="file-input" type="file" accept="image/*" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)startCrop(file,"reward",reward.id)}}/></div></div>;
    }
    function removeEntry(e: Entry) { if(e.sourceType==="daily_task")return say("每日任務紀錄請到「任務挑戰」撤銷，星星會同步修正");persist({ ...data, entries: data.entries.filter(x => x.id !== e.id),specialRewards:e.type==="special"&&e.status!=="pending"?specialStock(data.specialRewards,e.title,-e.amount):data.specialRewards }); }
    function approveEntry(e:Entry){persist({...data,entries:data.entries.map(x=>x.id===e.id?{...x,status:"completed"}:x),specialRewards:e.type==="special"?specialStock(data.specialRewards,e.title,e.amount):data.specialRewards})}
    function confirmRedemption(red:Redeem){const special=red.source==="special",item=data.specialRewards.find(x=>x.name===red.reward),cost=special?0:positiveInt(red.cost),balance=calculateChildStarBalance(data.entries,data.redemptions,red.childId);if(special&&(!item||item.stock<1))return say("特殊獎勵庫存不足");if(!special&&balance.total<cost)return say("星星不足，無法確認");persist({...data,redemptions:data.redemptions.map(x=>x.id===red.id?{...x,status:"completed",cost}:x),specialRewards:special?specialStock(data.specialRewards,red.reward,-1):data.specialRewards})}
    function addOfficialTasks(configs:OfficialTaskAddConfig[]){
        const instant=new Date().toISOString(),customStart=Math.max(-1,...data.dailyTasks.map(task=>task.customOrder??task.sortOrder))+1;
        const additions:DailyTaskDefinition[]=configs.map(({task,title,weekdays,applicableChildIds,enabled},index)=>({id:crypto.randomUUID(),title,icon:task.icon,rewardStars:task.suggestedStars,weekdays,applicableChildIds,enabled,sourceType:"official",sourceOfficialTaskId:task.id,timeSlot:task.timeSlot,sortOrder:TIME_SLOT_META[task.timeSlot].order*1000+task.sortOrder,customOrder:customStart+index,createdAt:instant,updatedAt:instant,scheduleStart:todayKey}));
        editSettings(current=>({...current,dailyTasks:[...current.dailyTasks,...additions]}));say(`已加入 ${additions.length} 項家庭每日任務，記得儲存設定`);
    }
    function Entries() {
        const rows=data.entries.filter(entry=>entry.childId===cid).sort((a,b)=>entryTimestamp(b)-entryTimestamp(a));
        return <div className="entries">{rows.map(entry=>{
            const created=entry.createdAt?Date.parse(entry.createdAt):Number.NaN,occurred=entry.occurredAt?Date.parse(entry.occurredAt):Number.NaN,backfilled=Number.isFinite(created)&&Number.isFinite(occurred)&&created-occurred>60_000;
            return <article key={entry.id} className={entry.status==="revoked"?"entry-revoked":""}><div className="entry-icon">{entry.sourceType==="daily_task"?"📋":entry.type === "special" ? "🎉" : entry.type === "star" ? "✨" : "📝"}</div><div className="entry-copy"><h3>{entry.title}{entry.type==="special"&&` × ${entry.amount}`}</h3><small>{entry.date} · {entry.status==="pending"?"等待家長確認":entry.status==="revoked"?"已撤銷":"已完成"}{backfilled&&<span className="backfilled-badge" title={`發生時間：${formatTaipeiOccurrence(entry.occurredAt!)}\n補登時間：${formatTaipeiOccurrence(entry.createdAt!)}`}>補登</span>}</small></div><strong className={entry.type === "deduct" ? "red" : ""}>{entry.status==="pending"?"待確認":entry.status==="revoked"?"已撤銷":entry.type === "special" ? "特殊獎勵" : `${entry.type === "star" ? "+" : "−"}${entry.amount} ★`}</strong>{role === "家長"&&entry.status==="pending"&&<button className="primary" onClick={()=>approveEntry(entry)}>確認</button>}{role === "家長"&&entry.sourceType!=="daily_task"&&entry.status!=="revoked"&&<button className="delete" onClick={() => confirm("確定刪除這筆紀錄？") && removeEntry(entry)}>刪除</button>}</article>;
        })}{!rows.length && <p className="empty">尚無紀錄</p>}</div>;
    }
    function RedeemModal() { const r = redeem!, special=r.source==="special",cost=special?0:r.cost,remain=childBalance.total-cost; return <div className="modal-back"><section className="modal"><button className="close" onClick={() => setRedeem(null)}>×</button><h2>{role==="孩子"?"提出兌換申請":"確認兌換"} {r.icon}</h2><div className="confirm-box"><p>兌換項目<strong>{r.name}</strong></p><p>兌換方式<strong>{special?"特殊獎勵庫存":"使用星星"}</strong></p><p>本次使用<strong>{special?"庫存 1 個":`${cost} 顆`}</strong></p><p>確認後剩餘<strong>{special?`${Math.max(0,r.stock-1)} 個`:`${remain} 顆`}</strong></p></div><button className="save" onClick={() => { const red:Redeem = { id: crypto.randomUUID(), childId: cid, reward: r.name, cost, date: now(),status:role==="孩子"?"pending":"completed",source:special?"special":"star" }, next = role==="孩子"?{...data,redemptions:[red,...data.redemptions]}:{ ...data, redemptions: [red, ...data.redemptions],specialRewards:special?specialStock(data.specialRewards,r.name,-1):data.specialRewards }; if(role==="孩子")submitPending("child_redemption",red,next);else persist(next); setRedeem(null); setTab("兌換紀錄"); }}>{role==="孩子"?"送出，等待家長確認":"確認已出貨"}</button></section></div>; }
    function SettingsContent() {
        const c=child,tasks=[...data.dailyTasks].sort((a,b)=>compareDailyTaskDefinitions(a,b,data.dailyTaskSortMode)),taskSettings=taskSettingsForChild(data.dailyTaskSettings,cid);
        const updateTask=(id:string,patch:Partial<DailyTaskDefinition>)=>editSettings(current=>({...current,dailyTasks:current.dailyTasks.map(task=>task.id===id?{...task,...patch}:task)}));
        const updateTaskSettings=(patch:Partial<DailyTaskSettings>)=>editSettings(current=>({...current,dailyTaskSettings:{...current.dailyTaskSettings,[cid]:{...taskSettingsForChild(current.dailyTaskSettings,cid),...patch}}}));
        const addTask=()=>{const instant=new Date().toISOString(),nextOrder=Math.max(-1,...data.dailyTasks.map(item=>item.customOrder??item.sortOrder))+1,task:DailyTaskDefinition={id:crypto.randomUUID(),applicableChildIds:[cid],title:"新每日任務",icon:"⭐",rewardStars:1,weekdays:[1,2,3,4,5,6,7],enabled:true,sourceType:"custom",timeSlot:"anytime",sortOrder:tasks.length,customOrder:nextOrder,createdAt:instant,updatedAt:instant,scheduleStart:todayKey};editSettings(current=>({...current,dailyTasks:[...current.dailyTasks,task]}))};
        const moveTask=(taskId:string,direction:-1|1)=>{const index=tasks.findIndex(task=>task.id===taskId),target=index+direction;if(index<0||target<0||target>=tasks.length)return;const left=tasks[index],right=tasks[target],leftOrder=left.customOrder??index,rightOrder=right.customOrder??target;editSettings(current=>({...current,dailyTaskSortMode:"custom",dailyTasks:current.dailyTasks.map(task=>task.id===left.id?{...task,customOrder:rightOrder}:task.id===right.id?{...task,customOrder:leftOrder}:task)}))};
        const setTaskSortMode=(mode:DailyTaskSortMode)=>editSettings(current=>{if(mode==="custom")return{...current,dailyTaskSortMode:mode};const ordered=[...current.dailyTasks].sort((a,b)=>compareDailyTaskDefinitions(a,b,"flow")),orders=new Map(ordered.map((task,index)=>[task.id,index]));return{...current,dailyTaskSortMode:mode,dailyTasks:current.dailyTasks.map(task=>({...task,customOrder:orders.get(task.id)??task.customOrder}))}});
        const goalDescription=taskSettings.goalMode==="all"?"每天完成所有有效任務即達標。":taskSettings.goalMode==="percentage"?`每天完成率達 ${taskSettings.goalValue}% 即達標。`:`每天至少完成 ${taskSettings.goalValue} 項即達標；若有效任務較少，完成全部即可。`;
        const moveTemplate=(id:string,direction:-1|1)=>editSettings(current=>({...current,templates:moveTemplateWithinType(current.templates,id,direction)}));
        const setTemplateType=(id:string,type:QuickTemplateType)=>editSettings(current=>({...current,templates:changeTemplateType(current.templates,id,type)}));
        const addTemplate=(type:QuickTemplateType)=>editSettings(current=>{const templates=normalizeTemplateSortOrders(current.templates),sortOrder=orderedTemplatesByType(templates,type).length,title=type==="star"?"新加星指標":type==="deduct"?"新扣星指標":"新特殊獎勵";return{...current,templates:[...templates,{id:crypto.randomUUID(),title,amount:1,type,sortOrder}]}});
        const renderTemplateGroup=(type:QuickTemplateType,title:string,icon:string)=>{const items=quickTemplatesByType[type],typeName=type==="star"?"加星指標":type==="deduct"?"扣星指標":"特殊獎勵";return <section className={`template-type-group template-type-${type}`} key={type}><header><div><h3><span aria-hidden="true">{icon}</span> {title} <small>{items.length}</small></h3><p>{type==="star"?"正向行為與鼓勵項目":type==="deduct"?"需要提醒與修正的行為":"可快速發放的非星星獎勵"}</p></div></header>{items.length?<div className="template-card-list">{items.map((template,index)=><article className={`template-settings-card template-${template.type}`} key={template.id}><h3><span aria-hidden="true">{icon}</span> {typeName} {String(index+1).padStart(2,"0")}</h3><div className="template-card-fields"><label className="template-field">類型<select value={template.type} onChange={event=>setTemplateType(template.id,event.target.value as QuickTemplateType)}><option value="star">加星</option><option value="deduct">扣星</option><option value="special">特殊獎勵</option></select></label><label className="template-field">指標／獎勵內容<input value={template.title} onChange={event=>editSettings(current=>({...current,templates:current.templates.map(item=>item.id===template.id?{...item,title:event.target.value}:item)}))}/></label><label className="template-field">數量<EditableIntegerInput value={template.amount} onChange={amount=>editSettings(current=>({...current,templates:current.templates.map(item=>item.id===template.id?{...item,amount}:item)}))} fieldKey={`template-amount-${template.id}`} resetSignal={integerResetSignal} onValidityChange={setIntegerValidity}/></label><div className="template-card-actions"><div className="template-order-actions"><button type="button" disabled={index===0} aria-label={`上移${template.title}`} onClick={()=>moveTemplate(template.id,-1)}>↑ 上移</button><button type="button" disabled={index===items.length-1} aria-label={`下移${template.title}`} onClick={()=>moveTemplate(template.id,1)}>↓ 下移</button></div><button type="button" className="template-delete" aria-label={`刪除${typeName} ${String(index+1).padStart(2,"0")}`} onClick={()=>editSettings(current=>({...current,templates:normalizeTemplateSortOrders(current.templates.filter(item=>item.id!==template.id))}))}>刪除此項 🗑</button></div></div></article>)}</div>:<p className="template-group-empty">尚未設定{typeName}。</p>}<button type="button" className={`add-line template-add-${type}`} onClick={()=>addTemplate(type)}>＋ 新增{typeName}</button></section>};
        return <div className="settings-grid"><section className="settings-card"><h2>🧒🏻 孩子資料</h2><label>姓名<input value={c.name} onChange={e=>editSettings(current=>({...current,children:current.children.map(item=>item.id===cid?{...item,name:e.target.value}:item)}))}/></label><label>性別<select value={c.gender} onChange={e=>editSettings(current=>({...current,children:current.children.map(item=>item.id===cid?{...item,gender:e.target.value as Child["gender"],avatar:e.target.value}:item)}))}><option value="boy">男生</option><option value="girl">女生</option></select></label><div className="avatar-options"><button onClick={()=>editSettings(current=>({...current,children:current.children.map(item=>item.id===cid?{...item,avatar:"boy"}:item)}))}>👦🏻 男生頭像</button><button onClick={()=>editSettings(current=>({...current,children:current.children.map(item=>item.id===cid?{...item,avatar:"girl"}:item)}))}>👧🏻 女生頭像</button><label className="upload" htmlFor={`avatar-upload-${cid}`}>{c.avatar!=="boy"&&c.avatar!=="girl"?<img className="upload-preview" src={c.avatar} alt="目前的大頭照"/>:"📷"} 上傳大頭照</label><input id={`avatar-upload-${cid}`} className="file-input" type="file" accept="image/*" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)startCrop(file,"avatar",cid)}}/></div><button className="add-line" onClick={()=>{const n={id:crypto.randomUUID(),name:`孩子 ${data.children.length+1}`,gender:"boy" as const,avatar:"boy",stars:0};editSettings(current=>({...current,children:[...current.children,n],dailyTaskSettings:{...current.dailyTaskSettings,[n.id]:{...DEFAULT_DAILY_TASK_SETTINGS}}}));setCid(n.id)}}>＋ 新增孩子</button><button className="delete-child" disabled={data.children.length===1} onClick={()=>{if(!confirm("確定刪除這位孩子？過去任務與星星紀錄會保留。"))return;const deletedId=cid,rest=data.children.filter(item=>item.id!==deletedId);setCid(rest[0].id);editSettings(current=>{const settings={...current.dailyTaskSettings};delete settings[deletedId];return{...current,children:current.children.filter(item=>item.id!==deletedId),dailyTasks:current.dailyTasks.map(task=>{const applicableChildIds=task.applicableChildIds.filter(id=>id!==deletedId);return{...task,applicableChildIds,enabled:applicableChildIds.length?task.enabled:false}}),dailyTaskSettings:settings}})}}>刪除這位孩子</button></section><ParentSecuritySettings passwordSet={passwordSet} security={securityInfo} onMessage={say} onPayload={(payload,newPassword)=>{applyServerPayload(payload);if(newPassword)setPassword(newPassword)}}/>
        <section className="settings-card wide daily-goal-settings daily-goal-settings-card"><h3>🔥 {c.name} 的每日達標條件</h3><div className="daily-goal-grid"><label>達標方式<select value={taskSettings.goalMode} onChange={e=>updateTaskSettings({goalMode:e.target.value as DailyTaskSettings["goalMode"]})}><option value="all">完成全部任務</option><option value="percentage">當日完成率達到指定百分比</option><option value="count">至少完成指定數量任務</option></select></label>{taskSettings.goalMode!=="all"&&<label>{taskSettings.goalMode==="percentage"?"指定完成率":"至少完成數量"}<EditableIntegerInput key={`daily-goal-${cid}-${taskSettings.goalMode}-${integerResetSignal}`} value={taskSettings.goalValue} min={1} max={taskSettings.goalMode==="percentage"?100:undefined} onChange={goalValue=>updateTaskSettings({goalValue})} fieldKey={`daily-goal-${cid}`} onValidityChange={setIntegerValidity} unit={taskSettings.goalMode==="percentage"?"%":"項"}/></label>}<label>任務完成方式<select value={taskSettings.completionMode} onChange={e=>updateTaskSettings({completionMode:e.target.value as DailyTaskSettings["completionMode"]})}><option value="instant">孩子完成後立即生效</option><option value="approval">孩子送出，家長確認後才加星</option></select></label></div><p>{goalDescription} 今日尚未結束前，未完成不會先中斷連續天數。</p></section>
        <section className="settings-card wide daily-task-settings">
            <div className="daily-task-settings-head"><div><h2>📋 每日任務設定</h2><p>建立一次任務，再選擇適用的孩子。每位孩子的完成狀態與星星獎勵會分開計算。</p></div><label className="daily-task-sort">排序<select value={data.dailyTaskSortMode} onChange={event=>setTaskSortMode(event.target.value as DailyTaskSortMode)}><option value="flow">依一天流程</option><option value="custom">自訂排序</option></select></label></div>
            {tasks.length?<div className="daily-task-settings-list">{tasks.map((task,index)=>{
                const missingChild=task.enabled&&!task.applicableChildIds.length,missingWeekday=task.enabled&&!normalizeWeekdays(task.weekdays).length,preset=weekdayPreset(task.weekdays);
                return <article className={`daily-task-settings-card${task.enabled?"":" is-disabled"}${missingChild||missingWeekday?" has-error":""}`} key={task.id}>
                    <h3>📋 每日任務 {String(index+1).padStart(2,"0")} {task.sourceType==="official"&&<span className="official-source-badge">📚 官方任務</span>}</h3>
                    <div className="daily-task-settings-fields">
                        <label>任務名稱<input value={task.title} onChange={e=>updateTask(task.id,{title:e.target.value})}/></label>
                        <label>任務圖示<select value={task.icon} onChange={e=>updateTask(task.id,{icon:e.target.value})}>{!BUILTIN_TASK_ICONS.some(icon=>icon.value===task.icon)&&<option value={task.icon}>{task.icon} 官方圖示</option>}{BUILTIN_TASK_ICONS.map(icon=><option value={icon.value} key={icon.value}>{icon.value} {icon.name}</option>)}</select></label>
                        <label>建議時段<select value={task.timeSlot||"anytime"} onChange={event=>updateTask(task.id,{timeSlot:event.target.value as OfficialTaskTimeSlot})}>{Object.entries(TIME_SLOT_META).map(([value,meta])=><option value={value} key={value}>{meta.icon} {meta.label}</option>)}</select></label>
                        <label>完成獎勵<EditableIntegerInput key={`task-reward-${task.id}-${integerResetSignal}`} value={task.rewardStars} onChange={rewardStars=>updateTask(task.id,{rewardStars})} fieldKey={`task-reward-${task.id}`} onValidityChange={setIntegerValidity} unit="顆星"/></label>
                        <div className="task-weekday-field"><span>執行星期</span><div className="weekday-buttons">{WEEKDAY_OPTIONS.map(day=><button type="button" key={day.value} aria-pressed={task.weekdays.includes(day.value)} onClick={()=>updateTask(task.id,{weekdays:normalizeWeekdays(task.weekdays.includes(day.value)?task.weekdays.filter(value=>value!==day.value):[...task.weekdays,day.value])})}>{day.label}</button>)}</div><div className="weekday-shortcuts" aria-label="執行星期快捷選取"><button type="button" aria-pressed={preset==="everyday"} onClick={()=>updateTask(task.id,{weekdays:[...EVERY_DAY]})}>每天</button><button type="button" aria-pressed={preset==="weekdays"} onClick={()=>updateTask(task.id,{weekdays:[...WEEKDAYS]})}>平日</button><button type="button" aria-pressed={preset==="weekend"} onClick={()=>updateTask(task.id,{weekdays:[...WEEKEND]})}>週末</button><button type="button" className="weekday-clear" onClick={()=>updateTask(task.id,{weekdays:[]})}>清除</button></div>{missingWeekday&&<p className="task-weekday-error" role="alert">請至少選擇一個執行星期</p>}</div>
                        <fieldset className="task-children-field"><legend>適用孩子</legend><div className="task-child-options">{data.children.map(childOption=>{const selected=task.applicableChildIds.includes(childOption.id);return <button type="button" key={childOption.id} aria-pressed={selected} onClick={()=>updateTask(task.id,{applicableChildIds:selected?task.applicableChildIds.filter(id=>id!==childOption.id):[...task.applicableChildIds,childOption.id]})}><span aria-hidden="true">{selected?"✓":""}</span>{childOption.name}</button>})}</div>{data.children.length>1&&<div className="task-child-shortcuts"><button type="button" onClick={()=>updateTask(task.id,{applicableChildIds:data.children.map(item=>item.id)})}>全選</button><button type="button" onClick={()=>updateTask(task.id,{applicableChildIds:[]})}>全部取消</button></div>}{missingChild&&<p className="task-child-error" role="alert">請至少選擇一位適用孩子</p>}</fieldset>
                        <label className="task-enabled"><input type="checkbox" checked={task.enabled} onChange={e=>{if(e.target.checked&&!task.applicableChildIds.length){say("請先選擇至少一位適用孩子");return}updateTask(task.id,{enabled:e.target.checked})}}/><span>啟用此任務</span></label>
                        <div className="daily-task-order-actions"><button type="button" disabled={index===0} onClick={()=>moveTask(task.id,-1)}>↑ 上移</button><button type="button" disabled={index===tasks.length-1} onClick={()=>moveTask(task.id,1)}>↓ 下移</button></div>
                        <div className="daily-task-delete-wrap"><button type="button" className="daily-task-delete" onClick={()=>confirm(`確定刪除「${task.title}」？過去紀錄會保留。`)&&editSettings(current=>({...current,dailyTasks:current.dailyTasks.filter(item=>item.id!==task.id)}))}>刪除此項 🗑</button></div>
                    </div>
                </article>
            })}</div>:<div className="daily-task-settings-empty"><strong>尚未建立每日任務</strong><p>設定固定任務後，系統才能計算完成率與連續達標天數。</p></div>}
            <div className="daily-task-add-actions"><button className="add-line" onClick={addTask}>＋ 自訂每日任務</button><button className="official-library-open" onClick={()=>setOfficialLibraryOpen(true)}>📚 從官方任務庫加入</button></div>
            {officialLibraryOpen&&<OfficialTaskLibrary familyChildren={data.children} currentChildId={cid} existingTasks={data.dailyTasks} favoriteIds={data.favoriteOfficialTaskIds} onFavoriteIdsChange={favoriteOfficialTaskIds=>editSettings(current=>({...current,favoriteOfficialTaskIds}))} onAdd={addOfficialTasks} onClose={()=>setOfficialLibraryOpen(false)}/>}
        </section>
        <section className="settings-card wide quick-indicator-settings"><h2>✨ 常用快速指標</h2><p className="quick-indicator-help">加星與扣星分開排列；首頁會依這裡的順序顯示。</p><div className="template-type-groups">{renderTemplateGroup("star","加星指標","⭐")}{renderTemplateGroup("deduct","扣星指標","➖")}{renderTemplateGroup("special","特殊獎勵","🎁")}</div></section>
        <section className="settings-card wide reward-settings"><h2>🎁 星星寶庫</h2><p className="reward-settings-help">可選擇內建圖示，或上傳圖片並保存到「我的圖片」重複使用。</p><div className="reward-settings-list">{data.rewards.map((reward,index)=>{const number=String(index+1).padStart(2,"0"),titleId=`reward-setting-${reward.id}`;return <article className="reward-settings-card" key={reward.id} aria-labelledby={titleId}><h3 id={titleId}>🎁 獎品 {number}</h3><div className="reward-settings-fields"><div className="reward-media-field"><span className="reward-control-label">圖示／圖片</span>{renderRewardIconPicker(reward)}</div><label>獎品名稱<input value={reward.name} onChange={event=>editSettings(current=>({...current,rewards:current.rewards.map(item=>item.id===reward.id?{...item,name:event.target.value}:item)}))}/></label><label>需要星星<EditableIntegerInput value={reward.cost} onChange={cost=>editSettings(current=>({...current,rewards:current.rewards.map(item=>item.id===reward.id?{...item,cost}:item)}))} fieldKey={`reward-cost-${reward.id}`} resetSignal={integerResetSignal} onValidityChange={setIntegerValidity} unit="顆"/></label><div className="reward-settings-actions"><button type="button" className="reward-settings-delete" aria-label={`刪除獎品 ${number}`} onClick={()=>confirm(`確定刪除「${reward.name}」？`)&&editSettings(current=>({...current,rewards:current.rewards.filter(item=>item.id!==reward.id)}))}>刪除此項 🗑</button></div></div></article>})}</div><button className="add-line" onClick={()=>editSettings(current=>({...current,rewards:[...current.rewards,{id:crypto.randomUUID(),icon:"🎁",name:"新獎品",cost:10,stock:0}]}))}>＋ 新增獎品</button></section></div>;
    }
    function Settings() {
        const counts:Partial<Record<SettingsTabKey,number>>={children:data.children.length,dailyTasks:data.dailyTasks.length,quickActions:data.templates.length,rewards:data.rewards.length};
        function selectSettingsTab(next:SettingsTabKey){
            if(next===settingsTab)return;
            settingsTabScrollPositions.current[settingsTab]=window.scrollY;
            setSettingsTab(next);
            window.history.pushState(window.history.state,"",`${window.location.pathname}${window.location.search}#${next}`);
        }
        function handleTabKeyDown(event:ReactKeyboardEvent<HTMLButtonElement>,current:SettingsTabKey){
            const currentIndex=SETTINGS_TABS.findIndex(item=>item.key===current);
            const targetIndex=event.key==="Home"?0:event.key==="End"?SETTINGS_TABS.length-1:event.key==="ArrowRight"?(currentIndex+1)%SETTINGS_TABS.length:event.key==="ArrowLeft"?(currentIndex-1+SETTINGS_TABS.length)%SETTINGS_TABS.length:-1;
            if(targetIndex<0)return;
            event.preventDefault();
            const next=SETTINGS_TABS[targetIndex].key;
            selectSettingsTab(next);
            window.requestAnimationFrame(()=>settingsTabButtonRefs.current[next]?.focus());
        }
        return <div className="family-settings-center" data-active-tab={settingsTab}>
            <p className="family-settings-intro">管理孩子、任務、獎勵與安全設定。</p>
            <div className="settings-tabs-shell">
                <div className="settings-tabs" role="tablist" aria-label="家庭設定分類">
                    {SETTINGS_TABS.map(item=><button type="button" role="tab" id={`settings-tab-${item.key}`} aria-controls="settings-active-panel" aria-selected={settingsTab===item.key} tabIndex={settingsTab===item.key?0:-1} className={settingsTab===item.key?"is-active":undefined} key={item.key} ref={element=>{settingsTabButtonRefs.current[item.key]=element||undefined}} onKeyDown={event=>handleTabKeyDown(event,item.key)} onClick={()=>selectSettingsTab(item.key)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span>{typeof counts[item.key]==="number"&&<small>{counts[item.key]}</small>}</button>)}
                </div>
            </div>
            {(settingsTab==="children"||settingsTab==="dailyTasks")&&<label className={`settings-tab-child-selector${settingsTab==="dailyTasks"?" is-compact":""}`}><span>{settingsTab==="children"?"目前編輯的孩子":"每日達標條件套用孩子"}</span><span className="settings-tab-child-control"><Avatar c={child}/><select value={cid} onChange={event=>requestChildChange(event.target.value,event.currentTarget)}>{data.children.map(childOption=><option value={childOption.id} key={childOption.id}>{childOption.name}</option>)}</select></span></label>}
            <div ref={settingsPanelRef} id="settings-active-panel" className="settings-active-panel" role="tabpanel" aria-labelledby={`settings-tab-${settingsTab}`}>
                {SettingsContent()}
            </div>
        </div>;
    }
}
function Avatar({ c }: {
    c: Child;
}) { return c.avatar!=="boy"&&c.avatar!=="girl" ? <img className="headshot" src={c.avatar} alt={c.name}/> : <span>{c.avatar === "girl" ? "👧🏻" : "👦🏻"}</span>; }
function Title({ text }: {
    text: string;
}) { return <div className="section-head"><h2>{text}</h2></div>; }

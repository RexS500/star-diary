"use client";

import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const DISMISS_KEY = "star-diary-install-dismissed-at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function installHelpDismissed() {
  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_FOR_MS;
}

export function PwaManager() {
  const [installEvent,setInstallEvent]=useState<BeforeInstallPromptEvent|null>(null);
  const [showIosHelp,setShowIosHelp]=useState(false);
  const [updateAvailable,setUpdateAvailable]=useState(false);
  const registrationRef=useRef<ServiceWorkerRegistration|null>(null);
  const reloadingRef=useRef(false);

  useEffect(()=>{
    const standalone=isStandaloneMode();
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    const safari=/safari/i.test(navigator.userAgent)&&!/crios|fxios|edgios|opios/i.test(navigator.userAgent);
    if(!standalone&&ios&&safari&&!installHelpDismissed())window.setTimeout(()=>setShowIosHelp(true),0);

    const beforeInstall=(event:Event)=>{
      event.preventDefault();
      if(!isStandaloneMode()&&!installHelpDismissed())setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const installed=()=>{setInstallEvent(null);setShowIosHelp(false);localStorage.removeItem(DISMISS_KEY)};
    window.addEventListener("beforeinstallprompt",beforeInstall);
    window.addEventListener("appinstalled",installed);

    if(!("serviceWorker" in navigator))return()=>{window.removeEventListener("beforeinstallprompt",beforeInstall);window.removeEventListener("appinstalled",installed)};

    const controllerChanged=()=>{if(reloadingRef.current)return;reloadingRef.current=true;window.location.reload()};
    navigator.serviceWorker.addEventListener("controllerchange",controllerChanged);

    const inspectRegistration=(registration:ServiceWorkerRegistration)=>{
      registrationRef.current=registration;
      if(registration.waiting&&navigator.serviceWorker.controller)setUpdateAvailable(true);
      registration.addEventListener("updatefound",()=>{
        const worker=registration.installing;
        worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)setUpdateAvailable(true)});
      });
    };
    const register=()=>navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(__APP_BUILD_ID__)}`,{scope:"/"}).then(inspectRegistration).catch(()=>undefined);
    if(document.readyState==="complete")void register();else window.addEventListener("load",register,{once:true});

    const checkVersion=()=>fetch("/api/version",{cache:"no-store",headers:{"cache-control":"no-cache"}}).then(response=>response.ok?response.json():null).then(value=>{if(value?.version&&value.version!==__APP_VERSION__)setUpdateAvailable(true)}).catch(()=>undefined);
    const visibilityChanged=()=>{if(document.visibilityState==="visible")void checkVersion()};
    void checkVersion();
    document.addEventListener("visibilitychange",visibilityChanged);
    const timer=window.setInterval(checkVersion,60*60*1000);

    return()=>{
      window.removeEventListener("beforeinstallprompt",beforeInstall);
      window.removeEventListener("appinstalled",installed);
      window.removeEventListener("load",register);
      navigator.serviceWorker.removeEventListener("controllerchange",controllerChanged);
      document.removeEventListener("visibilitychange",visibilityChanged);
      window.clearInterval(timer);
    };
  },[]);

  const dismissInstall=()=>{localStorage.setItem(DISMISS_KEY,String(Date.now()));setInstallEvent(null);setShowIosHelp(false)};
  const install=async()=>{if(!installEvent)return;await installEvent.prompt();const choice=await installEvent.userChoice;if(choice.outcome==="accepted")localStorage.removeItem(DISMISS_KEY);else localStorage.setItem(DISMISS_KEY,String(Date.now()));setInstallEvent(null)};
  const applyUpdate=()=>{const waiting=registrationRef.current?.waiting;if(waiting)waiting.postMessage({type:"SKIP_WAITING"});else window.location.reload()};

  return <div className="pwa-manager">
    {updateAvailable&&<aside className="pwa-notice pwa-update-notice" role="status" aria-live="polite"><div><strong>星星日記已更新</strong><span>點擊重新整理即可使用最新版本。</span></div><button type="button" onClick={applyUpdate}>重新整理</button></aside>}
    {!updateAvailable&&installEvent&&<aside className="pwa-notice pwa-install-notice" aria-label="安裝星星日記"><div><strong>安裝星星日記 App</strong><span>加入桌面後可全螢幕開啟，使用更快速。</span></div><div className="pwa-notice-actions"><button type="button" className="pwa-dismiss" onClick={dismissInstall}>稍後</button><button type="button" onClick={()=>void install()}>安裝 App</button></div></aside>}
    {!updateAvailable&&!installEvent&&showIosHelp&&<aside className="pwa-notice pwa-install-notice" aria-label="將星星日記加入 iPhone 主畫面"><div><strong>加入 iPhone 主畫面</strong><span>請點擊 Safari 的「分享」按鈕，再選擇「加入主畫面」。</span></div><button type="button" className="pwa-dismiss" onClick={dismissInstall}>知道了</button></aside>}
    <footer className="pwa-version" aria-label={`目前版本 ${__APP_VERSION__}`}>Version {__APP_VERSION__}</footer>
  </div>;
}

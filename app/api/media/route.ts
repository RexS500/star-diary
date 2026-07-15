import { env } from "cloudflare:workers";
export async function POST(req:Request){
    try {
        const form=await req.formData(),file=form.get("file"),kind=form.get("kind")==="reward"?"rewards":"avatars";
        if(!file||typeof file==="string"||typeof file.arrayBuffer!=="function")return Response.json({error:"請先選擇圖片"},{status:400});
        if(file.type&&!file.type.startsWith("image/"))return Response.json({error:"檔案必須是圖片"},{status:400});
        if(file.size>8*1024*1024)return Response.json({error:"圖片請小於 8 MB"},{status:400});
        const safeName=("name" in file&&typeof file.name==="string"?file.name:"image").replace(/[^a-zA-Z0-9._-]/g,"")||"image";
        const key=`${kind}/${crypto.randomUUID()}-${safeName}`;
        await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"image/jpeg"}});
        return Response.json({url:`/api/media?key=${encodeURIComponent(key)}&v=${Date.now()}`});
    }catch(error){
        console.error("media upload failed",error);
        return Response.json({error:"圖片上傳失敗，請稍後再試"},{status:500});
    }
}
export async function GET(req:Request){const key=new URL(req.url).searchParams.get("key");if(!key)return new Response("Not found",{status:404});const obj=await env.MEDIA.get(key);if(!obj)return new Response("Not found",{status:404});return new Response(obj.body,{headers:{"content-type":obj.httpMetadata?.contentType||"image/jpeg","cache-control":"public,max-age=86400"}})}

import { createServer } from 'node:http';
try {process.loadEnvFile('.env.local');} catch {}
const { handleRequest }=await import('../server/app.ts');
const server=createServer(async(req,res)=>{
  try {
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of req) {size+=chunk.length;if(size>4096){res.writeHead(413,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'QUESTION_TOO_LARGE',message:'The question is too long.'}}));return;}chunks.push(chunk);}
    const headers=new Headers();for(const [k,v]of Object.entries(req.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(','):v);}
    // Vite forwards the browser Host so origin validation matches the visible application.
    const origin=`http://${req.headers.host??'127.0.0.1:8787'}`;
    const request=new Request(origin+(req.url??'/'),{method:req.method,headers,...(['GET','HEAD'].includes(req.method??'GET')?{}:{body:Buffer.concat(chunks)})});
    const response=await handleRequest(request);
    res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'LOCAL_API_ERROR',message:'The local API could not complete this request.'}}));}
});
server.listen(8787,'127.0.0.1',()=>console.log('MatchSide API listening on 127.0.0.1:8787'));
process.on('SIGTERM',()=>server.close());
process.on('SIGINT',()=>server.close());

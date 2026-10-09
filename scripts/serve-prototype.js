// Small local-only static server for browser journey tests; no API side effects.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../src');
const port=Number(process.env.PORT||4177);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 if(pathname==='/')pathname='/index.html';
 const target=path.resolve(root,'.'+pathname);
 if(!(target===root||target.startsWith(root+path.sep))){res.writeHead(403);res.end();return;}
 fs.stat(target,(err,stat)=>{
  if(err||!stat?.isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  if(req.method==='HEAD'){res.end();return;}
  fs.createReadStream(target).pipe(res);
 });
});
server.listen(port,'127.0.0.1',()=>console.log('Mosigo browser QA at http://127.0.0.1:'+port));

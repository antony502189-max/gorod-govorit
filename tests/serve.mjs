import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('docs'),prefix='/gorod-govorit/';
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
  const file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const body=await readFile(file);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404).end('Not found');}
}).listen(4176,'127.0.0.1',()=>console.log('http://127.0.0.1:4176/gorod-govorit/'));

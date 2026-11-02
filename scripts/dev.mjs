import {spawn} from 'node:child_process';
const npx=process.platform==='win32'?'npx.cmd':'npx';
const children=[spawn(npx,['tsx','watch','scripts/dev-api.ts'],{stdio:'inherit'}),spawn(npx,['vite','--host','127.0.0.1',...process.argv.slice(2)],{stdio:'inherit'})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),200).unref();}
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>stop(code??0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());

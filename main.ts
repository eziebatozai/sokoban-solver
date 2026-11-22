import{mkdirSync as mk,readdirSync as rd,readFileSync as rf,writeFileSync as wf}from'node:fs';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output',D=[[0,-1,'u','U'],[0,1,'d','D'],[-1,0,'l','L'],[1,0,'r','R']];
function P(t){let r=t.split('\n').filter(x=>x.length),h=r.length,w=Math.max(...r.map(x=>x.length)),a=new Uint8Array(w*h).fill(1),G=[],B=[],p=-1;
r.forEach((s,y)=>{for(let x=0;x<s.length;x++){let c=s[x],i=y*w+x;if(c=='#')continue;a[i]=0;if(c=='.'||c=='*'||c=='+')G.push(i);if(c=='$'||c=='*')B.push(i);if(c=='@'||c=='+')p=i}});
for(let i=0;i<w*h;i++)if(i<w||i>=w*(h-1)||i%w==0||i%w==w-1)a[i]=1;
return{w,h,a,G,B:B.sort((x,y)=>x-y),p}}
function L(w,a,G){let v=new Uint8Array(a.length),q=[...G];for(let g of G)v[g]=1;
for(let i=0;i<q.length;i++){let x=q[i];for(let[dx,dy]of D){let d=dy*w+dx,y=x-d;if(!a[y]&&!a[y-d]&&!v[y]){v[y]=1;q.push(y)}}}
return v}
function N(w,a,o,f,s,t,n){let l=f,m=0;n[m++]=f;s[f]=t;
while(m){let p=n[--m];if(p<l)l=p;for(let[dx,dy]of D){let q=p+dy*w+dx;if(!a[q]&&!o[q]&&s[q]!=t){s[q]=t;n[m++]=q}}}
return l}
function F(w,a,o,g,t){for(let x of[t,t-1,t-w,t-w-1]){let b=x+1,c=x+w,d=c+1;
if((a[x]||o[x])&&(a[b]||o[b])&&(a[c]||o[c])&&(a[d]||o[d])&&((o[x]&&!g[x])||(o[b]&&!g[b])||(o[c]&&!g[c])||(o[d]&&!g[d])))return 1}
return 0}
function W(w,a,o,f,t){if(f==t)return'';let v=new Int32Array(a.length).fill(-1),h=new Array(a.length),q=[f];v[f]=f;
for(let i=0;i<q.length;i++){let p=q[i];if(p==t)break;for(let[dx,dy,l]of D){let n=p+dy*w+dx;if(a[n]||o[n]||v[n]!=-1)continue;v[n]=p;h[n]=l;q.push(n)}}
if(v[t]==-1)throw new Error('walk');
let s='';for(let p=t;p!=f;p=v[p])s=h[p]+s;
return s}
function H(w,a,G){return G.map(g=>{let d=new Int32Array(a.length).fill(-1),q=[g];d[g]=0;
for(let i=0;i<q.length;i++){let p=q[i];for(let[dx,dy]of D){let n=p+dy*w+dx;if(!a[n]&&d[n]<0){d[n]=d[p]+1;q.push(n)}}}
return d})}
function A(b,d){let n=b.length,u=new Array(n).fill(0),B=1/0;
(function s(i,c){if(c>=B)return;if(i==n){B=c;return}
for(let g=0;g<n;g++){if(u[g])continue;let z=d[g][b[i]];if(z<0)continue;u[g]=1;s(i+1,c+z);u[g]=0}})(0,0);
return B}
function K(b,l,s){let k=l;for(let x of b)k=k*s+x;return k}
function S(v,M,gr){let{w,a,G,B:b,p}=v,n=a.length,C=new Uint8Array(n);for(let x of G)C[x]=1;
let V=L(w,a,G),T=H(w,a,G),Y=x=>x.every(z=>C[z]);
if(b.some(z=>!V[z]))return null;
if(Y(b))return{pushes:0,moves:''};
let o=new Uint8Array(n),sn=new Int32Array(n),mk=new Int32Array(n),tk=new Int32Array(n),q=0;
let sb=[b.slice()],sp=[p],sg=[0],sr=[-1],sf=[-1],su=[-1],sk=[],bt=new Map;
for(let x of b)o[x]=1;
let l0=N(w,a,o,p,sn,++q,tk);
for(let x of b)o[x]=0;
let k0=K(b,l0,n);sk.push(k0);bt.set(k0,0);
let H2=[],ls=(x,y)=>x[0]<y[0]||x[0]==y[0]&&(x[1]>y[1]||x[1]==y[1]&&x[2]<y[2]),sw=(a,i,j)=>{let z=a[i];a[i]=a[j];a[j]=z};
function hp(e){let i=H2.length;H2.push(e);while(i>0){let j=(i-1)>>1;if(!ls(H2[i],H2[j]))break;sw(H2,i,j);i=j}}
function ho(){let r=H2[0],l=H2.pop();if(H2.length){H2[0]=l;for(let i=0;;){let c=2*i+1;if(c>=H2.length)break;if(c+1<H2.length&&ls(H2[c+1],H2[c]))c++;if(!ls(H2[c],H2[i]))break;sw(H2,i,c);i=c}}return r}
let h0=A(b,T);if(h0==1/0)return null;hp([h0,0,0]);
function rc(s){let z=[];for(let t=s;t>0;t=sr[t])z.push(t);z.reverse();let mv='',pl=p,bx=b.slice();
for(let t of z){let f=sf[t],u=su[t],d=u-f,dr=D.find(([x,y])=>y*w+x==d);
for(let x of bx)o[x]=1;mv+=W(w,a,o,pl,f-d);for(let x of bx)o[x]=0;mv+=dr[3];pl=f;let j=bx.indexOf(f);bx[j]=u;bx.sort((x,y)=>x-y)}
return{pushes:sg[s],moves:mv}}
while(H2.length){if(sb.length>=M)return null;let[,g,s]=ho();if(bt.get(sk[s])!==g)continue;let bs=sb[s];
if(Y(bs))return rc(s);
for(let x of bs)o[x]=1;let hr=++q;N(w,a,o,sp[s],sn,hr,tk);
for(let j=0;j<bs.length;j++){let b0=bs[j];
for(let[dx,dy]of D){let d=dy*w+dx,u=b0+d,v=b0-d;
if(sn[v]!==hr)continue;if(a[u]||o[u]||!V[u])continue;
o[b0]=0;o[u]=1;
if(F(w,a,o,C,u)){o[u]=0;o[b0]=1;continue}
let nx=bs.slice();nx[j]=u;nx.sort((x,y)=>x-y);
let lw=N(w,a,o,b0,mk,++q,tk),ky=K(nx,lw,n),g2=g+1,pv=bt.get(ky);
if(pv!==undefined&&pv<=g2){o[u]=0;o[b0]=1;continue}
let hh=A(nx,T);if(hh==1/0){o[u]=0;o[b0]=1;continue}
bt.set(ky,g2);let ix=sb.length;sb.push(nx);sp.push(b0);sg.push(g2);sr.push(s);sf.push(b0);su.push(u);sk.push(ky);
hp([gr?hh:g2+hh,g2,ix]);
o[u]=0;o[b0]=1}}
for(let x of bs)o[x]=0}
return null}
function Z(w,f,m){let p=f;for(let c of m){let x=c.toLowerCase();p+=x=='u'?-w:x=='d'?w:x=='l'?-1:1}return p}
function Mm(v){let{w,a,G,B:b,p}=v,V=L(w,a,G),r=Math.floor(p/w),c=new Uint8Array(a.length);
for(let i=r*w;i<(r+1)*w;i++)if(!a[i]&&!V[i])c[i]=1;
if(b.some(x=>c[x]))return null;
let pt=new Int32Array(a.length).fill(-1),R=[];
for(let s=0;s<a.length;s++){if(a[s]||c[s]||pt[s]>=0)continue;let q=[s];pt[s]=R.length;
for(let i=0;i<q.length;i++)for(let[dx,dy]of D){let n=q[i]+dy*w+dx;if(!a[n]&&!c[n]&&pt[n]<0){pt[n]=R.length;q.push(n)}}
R.push({q,b:[],g:[],d:0})}
for(let x of b)R[pt[x]].b.push(x);
for(let x of G)if(pt[x]>=0)R[pt[x]].g.push(x);
if(G.some(x=>pt[x]<0)||R.some(x=>x.b.length!=x.g.length))return null;
return R.filter(x=>x.b.length>0)}
function B(v){let R=Mm(v);if(!R)return S(v,250000,0);
let p=v.p,pu=0,mv='';
for(let r of R){let a=v.a.slice();
for(let o of R){if(o==r)continue;for(let x of o.d?o.g:o.b)a[x]=1}
let s={w:v.w,h:v.h,a,G:r.g.slice().sort((x,y)=>x-y),B:r.b.slice().sort((x,y)=>x-y),p};
let d=S(s,250000,0);if(!d)d=S(s,250000,1);if(!d)return null;
pu+=d.pushes;mv+=d.moves;p=Z(v.w,p,d.moves);r.d=1}
return{pushes:pu,moves:mv}}
function V(t){let v=P(t),d=B(v);return d?d.moves:''}
for(let id of rd(I).sort()){let m='';try{m=V(rf(I+'/'+id+'/level.txt','utf8'))}catch{m=''}mk(O+'/'+id,{recursive:true});wf(O+'/'+id+'/solution.txt',m+'\n')}

import {useState} from 'react';

export function PlatformGameMascot({game,className=''}:{game:'drawing'|'words';className?:string}){
 const [failed,setFailed]=useState(false);
 const base=game==='drawing'?'khatt-mascot':'haat-kalima-mascot';
 return <div className={'platform-mascot-slot '+className} aria-hidden="true">
 <img src={'/brand/games/'+base+(failed?'.svg':'.webp')} alt="" width={160} height={112}
 loading="lazy" decoding="async" onError={()=>setFailed(true)}
 style={{display:'block',width:'100%',height:'100%',maxWidth:'100%',maxHeight:'100%',minWidth:0,minHeight:0,objectFit:'contain',position:'absolute',inset:0,margin:'auto',background:'transparent',borderRadius:0}}/>
 </div>;
}

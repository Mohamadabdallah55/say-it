import {useState} from 'react';

export function PlatformGameMascot({game,className=''}:{game:'drawing'|'words';className?:string}){
 const [failed,setFailed]=useState(false);
 const isDrawing=game==='drawing';
 const file=isDrawing?'khatt-mascot.webp':'haat-kalima-mascot.webp';
 return <div className={'platform-mascot-slot '+className} aria-hidden="true">
 {failed?<img src={'/brand/games/'+(isDrawing?'khatt-mascot.svg':'haat-kalima-mascot.svg')} alt="" width={220} height={180} loading="lazy" decoding="async"/>:<img src={'/brand/games/'+file} alt="" width={220} height={180} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>}
 </div>;
}

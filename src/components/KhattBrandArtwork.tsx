import { useState } from 'react';
export const KHATT_BRAND_ART='/brand/games/khatt-mashbooh.webp';
export function KhattBrandArtwork({className='',compact=false}:{className?:string;compact?:boolean}){
  const [failed,setFailed]=useState(false);
  return failed ? <span className={className+' khatt-brand-fallback'} aria-label="خط مشبوه">{compact?'؟':'خط مشبوه'}</span> : <img className={className} src={KHATT_BRAND_ART} alt="خط مشبوه — خطّك بفضحك!" width={900} height={900} loading={compact?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>;
}

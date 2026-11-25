import type { RequestHandler } from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { usePaidPdfBridge } from './paidPdfBridge';

// In paid mode only explicitly approved adult staff accounts can spend PDF credits.
export const requirePaidPdfStaff:RequestHandler=async(req,res,next)=>{
  if(!usePaidPdfBridge()){next();return;}
  const approved=(process.env.YAZAN_PDF_STAFF_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const token=req.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!approved.length||!token||token.length>10000){res.status(403).json({error:'استوديو PDF المدفوع مخصص لحسابات المشرفين المعتمدة.'});return;}
  try{
    const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(firebaseConfig.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(7000),redirect:'error'});
    if(!response.ok)throw new Error('Invalid identity');
    const data=await response.json() as {users?:Array<{localId?:string;emailVerified?:boolean;disabled?:boolean}>};
    const user=data.users?.[0];
    if(!user?.localId||!user.emailVerified||user.disabled||!approved.includes(user.localId))throw new Error('Not approved');
    next();
  }catch{res.status(403).json({error:'حساب المشرف غير معتمد لاستوديو PDF المدفوع.'});}
};

import {useEffect,useState} from 'react';
import {Platform,Text,View} from 'react-native';
import Constants from 'expo-constants';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {PurchasesStoreProduct} from 'react-native-purchases';
import {useAuth} from './auth';
import {api} from './api';
import {simulatedPurchases,usePurchases} from './purchases';
import {Action,money,Notice,useShopStyles} from './shop-ui';

export type DigitalItem={key:string;title:string;kind:string;price_cents:number;product_ids:Record<string,string>;available:boolean;owned:boolean};
export function useDigitalCatalog(){const {user}=useAuth();return useQuery({queryKey:['digital-catalog',user?.user_id],queryFn:()=>api<{items:DigitalItem[];pdf_credits:number;server_ready:boolean;message:string|null}>('/api/digital/catalog'),enabled:!!user});}
export function useKitchen<T=any>(key:string,path:string,enabled=true){const {user}=useAuth();return useQuery({queryKey:['kitchen',key,user?.user_id],queryFn:()=>api<T>(path),enabled:!!user&&enabled});}
export function useKitchenAction(){const qc=useQueryClient();return useMutation({mutationFn:({path,body,method='POST',key}:{path:string;body?:unknown;method?:string;key?:string})=>api<any>(path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:key?{'Idempotency-Key':key}:undefined}),onSuccess:()=>{for(const k of ['kitchen','digital-catalog','pantry','courses','course-detail','my-courses','creator-dashboard','admin-shop'])qc.invalidateQueries({queryKey:[k]});}});}
export const newOperationKey=()=>`op_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export function DigitalOffer({itemKey}:{itemKey:string}){
  const q=useDigitalCatalog();const p=usePurchases();const s=useShopStyles();const item=q.data?.items.find(x=>x.key===itemKey);const [product,setProduct]=useState<PurchasesStoreProduct|null>(null);const [error,setError]=useState('');const [message,setMessage]=useState('');const [waiting,setWaiting]=useState(false);const [baseline,setBaseline]=useState(0);
  const native=Platform.OS!=='web'&&Constants.appOwnership!=='expo';const productId=item?.product_ids?.[simulatedPurchases?'test':Platform.OS];
  useEffect(()=>{let alive=true;setProduct(null);setError('');if(native&&item?.available&&productId&&p.identityReady)p.loadDigitalProduct(productId).then(x=>{if(alive)setProduct(x);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[native,item?.available,productId,p.identityReady,p.loadDigitalProduct]);
  useEffect(()=>{if(waiting&&(item?.owned||(q.data?.pdf_credits||0)>baseline)){setWaiting(false);setMessage('Acquisto verificato dal server. La funzione è disponibile.');}},[waiting,item?.owned,q.data?.pdf_credits,baseline]);
  const buy=async()=>{if(!product)return;setError('');setBaseline(q.data?.pdf_credits||0);try{await p.purchaseDigital(product);setWaiting(true);setMessage('Acquisto ricevuto dallo store. Attendo la conferma server: non acquistare nuovamente per riprovare.');await q.refetch();}catch(e:any){if(!e.userCancelled)setError(e.message);}};
  return <View testID={`digital-offer-${itemKey}`} style={s.card}>
    <Text testID={`digital-title-${itemKey}`} style={s.h3}>{item?.title||'Acquisto singolo'}</Text>
    {item?.owned?<Notice id={`digital-owned-${itemKey}`} text="Acquisto verificato · contenuto sbloccato"/>:<>
      <Text testID={`digital-price-${itemKey}`} style={s.h2}>{product?.priceString||(item?`${money(item.price_cents)} · prezzo previsto`:'Caricamento…')}{itemKey==='cookbook'?' / esportazione':''}</Text>
      {itemKey==='cookbook'&&<Text testID="digital-pdf-credits" style={s.body}>Crediti PDF disponibili: {q.data?.pdf_credits||0}</Text>}
      <Notice id={`digital-configuration-${itemKey}`} text={!q.data?.server_ready?q.data?.message:!item?.available?'Prodotto store non ancora attivato per questo contenuto.':!native?'L’acquisto singolo è disponibile nella build iOS/Android con gli store configurati, non nell’anteprima.':!product?'Prodotto non disponibile in questo store. Controlla configurazione e ambiente.':undefined}/>
      {native&&item?.available&&product&&<Action id={`digital-buy-${itemKey}`} label={itemKey==='cookbook'?'Acquista un’esportazione PDF':'Acquista e sblocca'} busy={p.busy} disabled={!p.identityReady||waiting} onPress={buy}/>}
      <Text testID={`digital-purchase-terms-${itemKey}`} style={s.muted}>{itemKey==='cookbook'?'Un credito permette di generare un ricettario; puoi riscaricare lo stesso PDF senza riacquistarlo.':'Acquisto singolo, senza rinnovo automatico.'} Il prezzo definitivo è quello mostrato dallo store. Lo sblocco richiede la conferma server.</Text>
    </>}
    <Notice id={`digital-error-${itemKey}`} error text={error||q.error?.message}/><Notice id={`digital-message-${itemKey}`} text={message}/>
    <Action id={`digital-refresh-${itemKey}`} secondary label="Aggiorna acquisti verificati" onPress={()=>q.refetch()}/>
    {native&&<Action id={`digital-restore-${itemKey}`} secondary label="Ripristina acquisti store" busy={p.busy} disabled={!p.identityReady} onPress={async()=>{try{await p.restore();await q.refetch();setMessage('Ripristino richiesto. Gli acquisti disponibili sono quelli confermati dal server; i crediti già consumati non vengono ricreati.');}catch(e:any){setError(e.message);}}}/>}
  </View>;
}
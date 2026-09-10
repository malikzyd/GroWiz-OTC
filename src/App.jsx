import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

const FOREX_PAIRS = {
  'EUR/USD':'eurusd','GBP/USD':'gbpusd','USD/JPY':'usdjpy','AUD/USD':'audusd',
  'USD/CAD':'usdcad','USD/CHF':'usdchf','EUR/GBP':'eurgbp','GBP/JPY':'gbpjpy',
  'EUR/JPY':'eurjpy','EUR/AUD':'euraud','GBP/AUD':'gbpaud','NZD/USD':'nzdusd',
}
const COMMODITY_PAIRS = { 'GOLD':'xauusd','SILVER':'xagusd','US OIL':'usoil' }
const CRYPTO_PAIRS = {
  'BTC/USD':'BTCUSDT','ETH/USD':'ETHUSDT','SOL/USD':'SOLUSDT','BNB/USD':'BNBUSDT',
  'XRP/USD':'XRPUSDT','DOGE/USD':'DOGEUSDT','ADA/USD':'ADAUSDT',
}

function getKillzone(){
  const h=new Date().getUTCHours()
  if(h>=7&&h<10) return 'London KZ - HIGH'
  if(h>=12&&h<15) return 'NY KZ - HIGH'
  if(h>=2&&h<5) return 'Asia - AVOID'
  return 'Off-hours - MED'
}
function isChoppy(c){
  const atr=c.slice(-14).reduce((a,x)=>a+(x.high-x.low),0)/14
  const l=c[c.length-1]
  return (l.high-l.low) < atr*0.55
}
async function fetchForexCandles(sym,int){
  const r=await fetch(`/api/candles?symbol=${sym}&interval=${int}`)
  const j=await r.json()
  return Array.isArray(j)?j:j.candles||[]
}
async function fetchCryptoCandles(sym,int){
  const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${int}m&limit=100`)
  const d=await r.json()
  return d.map(k=>({time:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}))
}

// ICT CONCEPTS
function findOB(c){
  for(let i=c.length-3;i>2;i--){
    const b=c[i]
    const body=Math.abs(b.close-b.open)
    if(body>(b.high-b.low)*0.6){
      const next=c[i+1],next2=c[i+2]
      if(b.close>b.open && next.close<next.open){
        return {type:'Bullish',top:b.high,bottom:b.low,level:(b.high+b.low)/2}
      }
      if(b.close<b.open && next.close>next.open){
        return {type:'Bearish',top:b.high,bottom:b.low,level:(b.high+b.low)/2}
      }
    }
  }
  return null
}
function findFVG(c){
  for(let i=c.length-2;i>1;i--){
    const a=c[i-1],b=c[i],d=c[i+1]
    if(a.high < d.low){
      return {type:'Bullish',top:d.low,bottom:a.high}
    }
    if(a.low > d.high){
      return {type:'Bearish',top:a.low,bottom:d.high}
    }
  }
  return null
}
function findLiquiditySweep(c){
  const look=20
  const recent=c.slice(-look)
  const high=Math.max(...recent.map(x=>x.high))
  const low=Math.min(...recent.map(x=>x.low))
  const l=c[c.length-1], p=c[c.length-2]
  if(p.high>high*0.999 && l.close<p.high && l.high>p.high){
    return {type:'BEARISH',level:p.high,desc:`SRM swept @ ${p.high.toFixed(5)}`}
  }
  if(p.low<low*1.001 && l.close>p.low && l.low<p.low){
    return {type:'BULLISH',level:p.low,desc:`BRM swept @ ${p.low.toFixed(5)}`}
  }
  return null
}
function marketStructure(c){
  const h=c.slice(-10).map(x=>x.high), l=c.slice(-10).map(x=>x.low)
  const hh=h[h.length-1]>Math.max(...h.slice(0,-1))
  const hl=l[l.length-1]>Math.min(...l.slice(0,-1))
  const lh=h[h.length-1]<Math.max(...h.slice(0,-1))
  const ll=l[l.length-1]<Math.min(...l.slice(0,-1))
  if(hh&&hl) return 'Bullish HH+HL'
  if(lh&&ll) return 'Bearish LH+LL'
  return 'Ranging'
}
function scoreSignal(c){
  let score=0, reasons=[]
  const ob=findOB(c), fvg=findFVG(c), liq=findLiquiditySweep(c), ms=marketStructure(c)
  let dir='NONE'
  if(ob){score+=25;reasons.push(`${ob.type} OB ${ob.bottom.toFixed(5)}-${ob.top.toFixed(5)}`)}
  if(fvg){score+=20;reasons.push(`${fvg.type} FVG ${fvg.bottom.toFixed(5)}-${fvg.top.toFixed(5)}`)}
  if(liq){score+=25;reasons.push(liq.desc)}
  if(ms.includes('Bullish')){score+=15;reasons.push('MS: '+ms)}
  if(ms.includes('Bearish')){score+=15;reasons.push('MS: '+ms)}
  const bull= (ob?.type==='Bullish'?1:0)+(fvg?.type==='Bullish'?1:0)+(liq?.type==='BULLISH'?1:0)
  const bear= (ob?.type==='Bearish'?1:0)+(fvg?.type==='Bearish'?1:0)+(liq?.type==='BEARISH'?1:0)
  if(score>=50){ dir = bull>=bear? 'CALL':'PUT' }
  return {direction:dir,confidence:Math.min(score,95),reasons,ob,fvg,liq,ms}
}

function MarketScanner(){
  const [scanning,setScanning]=useState(false)
  const [top3,setTop3]=useState([])
  const [lastScan,setLastScan]=useState(null)

  const scanAll=async()=>{
    const res=[]
    for(const [label,sym] of Object.entries({...FOREX_PAIRS,...COMMODITY_PAIRS})){
      try{
        const cd=await fetchForexCandles(sym,'5')
        if(!cd||cd.length<20||isChoppy(cd)) continue
        const s=scoreSignal(cd)
        if(s.direction==='NONE') continue
        const last=cd[cd.length-1]
        res.push({pair:label,...s,timeframe:'5 MIN',
          volume:`${last.close>last.open?'Buyside':'Sellside'} Vol:${last.volume||'n/a'}`})
      }catch(e){}
    }
    for(const [label,sym] of Object.entries(CRYPTO_PAIRS)){
      try{
        const cd=await fetchCryptoCandles(sym,'5')
        if(!cd||cd.length<20||isChoppy(cd)) continue
        const s=scoreSignal(cd)
        if(s.direction==='NONE') continue
        const last=cd[cd.length-1]
        res.push({pair:label,...s,timeframe:'5 MIN',
          volume:`${last.close>last.open?'Buyside':'Sellside'}`})
      }catch(e){}
    }
    res.sort((a,b)=>b.confidence-a.confidence)
    setTop3(res.slice(0,3))
    setLastScan(new Date().toLocaleTimeString())
  }

  useEffect(()=>{
    let id
    if(scanning){scanAll();id=setInterval(scanAll,60000)}
    return()=>clearInterval(id)
  },[scanning])

  return(
    <div style={{padding:20}}>
      <h2>GroWiz Market Scanner</h2>
      <p>5 MIN | Universal | Use with TradingView | Session: {getKillzone()}</p>
      <button onClick={()=>setScanning(!scanning)} style={{padding:12,width:'100%',fontSize:16}}>
        {scanning?'STOP SCAN':'START SCAN'}
      </button>
      {lastScan&&<p>Last: {lastScan}</p>}
      {top3.map((t,i)=>(
        <div key={i} style={{marginTop:12,padding:14,background:'#111',color:'#fff',borderRadius:8,borderLeft:`6px solid ${t.direction==='CALL'?'#00ff88':'#ff4444'}`}}>
          <h3>#{i+1} {t.pair} {t.direction} {t.confidence}%</h3>
          <div>Timeframe: {t.timeframe}</div>
          <div>Volume: {t.volume}</div>
          <div>Liquidity: {t.liq?t.liq.desc:'No sweep - SRM/BRM intact'}</div>
          <div>OB: {t.ob?`${t.ob.type} ${t.ob.bottom.toFixed(5)}-${t.ob.top.toFixed(5)}`:'No OB'}</div>
          <div>FVG: {t.fvg?`${t.fvg.type} ${t.fvg.bottom.toFixed(5)}-${t.fvg.top.toFixed(5)}`:'No FVG'}</div>
          <div>MS: {t.ms}</div>
          <ul>{t.reasons.map((r,j)=><li key={j}>{r}</li>)}</ul>
        </div>
      ))}
      {scanning&&top3.length===0&&<p>Scanning 22 markets... no A+ setup. Wait for killzone.</p>}
    </div>
  )
}

export default function App(){
  const [session,setSession]=useState(null)
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session))},[])
  if(!session) return <div style={{padding:40}}>Login to Supabase required</div>
  return <MarketScanner/>
}

import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'

const FOREX_PAIRS = {
  'EUR/USD OTC': 'EUR/USD',
  'GBP/USD OTC': 'GBP/USD',
  'USD/JPY OTC': 'USD/JPY',
  'USD/CHF OTC': 'USD/CHF',
  'AUD/USD OTC': 'AUD/USD',
  'USD/CAD OTC': 'USD/CAD',
  'NZD/USD OTC': 'NZD/USD',
  'EUR/GBP OTC': 'EUR/GBP',
  'EUR/JPY OTC': 'EUR/JPY',
  'EUR/CHF OTC': 'EUR/CHF',
  'EUR/AUD OTC': 'EUR/AUD',
  'EUR/CAD OTC': 'EUR/CAD',
  'EUR/NZD OTC': 'EUR/NZD',
  'GBP/JPY OTC': 'GBP/JPY',
  'GBP/CHF OTC': 'GBP/CHF',
  'GBP/AUD OTC': 'GBP/AUD',
  'GBP/CAD OTC': 'GBP/CAD',
  'GBP/NZD OTC': 'GBP/NZD',
  'AUD/JPY OTC': 'AUD/JPY',
  'AUD/CHF OTC': 'AUD/CHF',
  'AUD/CAD OTC': 'AUD/CAD',
  'AUD/NZD OTC': 'AUD/NZD',
  'CAD/JPY OTC': 'CAD/JPY',
  'CAD/CHF OTC': 'CAD/CHF',
  'NZD/JPY OTC': 'NZD/JPY',
  'NZD/CHF OTC': 'NZD/CHF',
  'CHF/JPY OTC': 'CHF/JPY',
  'USD/SGD OTC': 'USD/SGD',
  'USD/HKD OTC': 'USD/HKD',
  'USD/MXN OTC': 'USD/MXN',
  'USD/ZAR OTC': 'USD/ZAR',
  'USD/TRY OTC': 'USD/TRY',
  'EUR/TRY OTC': 'EUR/TRY',
  'GBP/TRY OTC': 'GBP/TRY',
  'USD/INR OTC': 'USD/INR',
}

const COMMODITY_PAIRS = {
  'GOLD OTC': 'XAU/USD',
  'SILVER OTC': 'XAG/USD',
  'OIL OTC': 'WTI/USD',
}

const CRYPTO_PAIRS = {
  'BTC/USD OTC': 'BTCUSDT',
}

const BROKERS = ['Quotex', 'IQ Option', 'Pocket Option', 'Expert Option']
const TIMEFRAMES = ['1', '3', '5', '15']

const TF_TO_STOOQ = { '1': '1', '3': '1', '5': '5', '15': '15' }
const TF_TO_BINANCE = { '1': '1m', '3': '3m', '5': '5m', '15': '15m' }

const STOOQ_MAP = {
  'EUR/USD': 'eurusd', 'GBP/USD': 'gbpusd', 'USD/JPY': 'usdjpy',
  'USD/CHF': 'usdchf', 'AUD/USD': 'audusd', 'USD/CAD': 'usdcad',
  'NZD/USD': 'nzdusd', 'EUR/GBP': 'eurgbp', 'EUR/JPY': 'eurjpy',
  'EUR/CHF': 'eurchf', 'EUR/AUD': 'euraud', 'EUR/CAD': 'eurcad',
  'EUR/NZD': 'eurnzd', 'GBP/JPY': 'gbpjpy', 'GBP/CHF': 'gbpchf',
  'GBP/AUD': 'gbpaud', 'GBP/CAD': 'gbpcad', 'GBP/NZD': 'gbpnzd',
  'AUD/JPY': 'audjpy', 'AUD/CHF': 'audchf', 'AUD/CAD': 'audcad',
  'AUD/NZD': 'audnzd', 'CAD/JPY': 'cadjpy', 'CAD/CHF': 'cadchf',
  'NZD/JPY': 'nzdjpy', 'NZD/CHF': 'nzdchf', 'CHF/JPY': 'chfjpy',
  'USD/SGD': 'usdsgd', 'USD/HKD': 'usdhkd', 'USD/MXN': 'usdmxn',
  'USD/ZAR': 'usdzar', 'USD/TRY': 'usdtry', 'EUR/TRY': 'eurtry',
  'GBP/TRY': 'gbptry', 'USD/INR': 'usdinr',
  'XAU/USD': 'xauusd', 'XAG/USD': 'xagusd', 'WTI/USD': 'wtiusd',
}

// --- ICT / SMC Engine ---

function getSwings(candles, l=3, r=3) {
  const highs=[], lows=[]
  for(let i=l; i<candles.length-r; i++){
    let sh=true, sl=true
    for(let j=1;j<=l;j++){
      if(candles[i-j].high > candles[i].high || candles[i+j].high > candles[i].high) sh=false
      if(candles[i-j].low < candles[i].low || candles[i+j].low < candles[i].low) sl=false
    }
    if(sh) highs.push({i, price:candles[i].high})
    if(sl) lows.push({i, price:candles[i].low})
  }
  return {highs, lows}
}

function getMarketStructure(candles){
  const {highs, lows} = getSwings(candles)
  if(highs.length<2 || lows.length<2) return {bias:'NEUTRAL', reason:'Not enough structure'}
  const lh1=highs[highs.length-2], lh2=highs[highs.length-1]
  const ll1=lows[lows.length-2], ll2=lows[lows.length-1]
  if(lh2.price > lh1.price && ll2.price > ll1.price) return {bias:'BULLISH', reason:'HH + HL - Market Structure Bullish'}
  if(lh2.price < lh1.price && ll2.price < ll1.price) return {bias:'BEARISH', reason:'LH + LL - Market Structure Bearish'}
  const recent=candles.slice(-20)
  const maxH=Math.max(...recent.map(c=>c.high))
  const minL=Math.min(...recent.map(c=>c.low))
  const lastClose=candles[candles.length-1].close
  if(lastClose > maxH) return {bias:'BULLISH', reason:'BOS up - price broke structure'}
  if(lastClose < minL) return {bias:'BEARISH', reason:'BOS down - price broke structure'}
  return {bias:'NEUTRAL', reason:'Ranging - no clear PD array bias'}
}

function findOrderBlock(candles){
  for(let i=candles.length-2; i>=Math.max(0,candles.length-20); i--){
    const curr=candles[i+1], prev=candles[i]
    const bullImp = curr.close > curr.open && (curr.close-curr.open) > (curr.high-curr.low)*0.55
    const bearImp = curr.close < curr.open && (curr.open-curr.close) > (curr.high-curr.low)*0.55
    if(bullImp && prev.close < prev.open) return {type:'BULLISH', top:prev.high, bottom:prev.low, idx:i}
    if(bearImp && prev.close > prev.open) return {type:'BEARISH', top:prev.high, bottom:prev.low, idx:i}
  }
  return null
}

function findFVG(candles){
  for(let i=candles.length-1; i>=2; i--){
    const c1=candles[i-2], c3=candles[i]
    if(c1.high < c3.low) return {type:'BULLISH', top:c3.low, bottom:c1.high}
    if(c1.low > c3.high) return {type:'BEARISH', top:c1.low, bottom:c3.high}
  }
  return null
}

function findLiquiditySweep(candles){
  const {highs, lows} = getSwings(candles)
  if(!highs.length ||!lows.length) return null
  const lastH=highs[highs.length-1], lastL=lows[lows.length-1]
  const c=candles[candles.length-1], p=candles[candles.length-2]
  if(p.high > lastH.price && c.close < lastH.price) return {type:'BEARISH', level:lastH.price, name:'Sell-side liquidity sweep'}
  if(p.low < lastL.price && c.close > lastL.price) return {type:'BULLISH', level:lastL.price, name:'Buy-side liquidity sweep'}
  return null
}

function volumeConfirm(candles){
  const ranges=candles.slice(-20).map(c=>c.high-c.low)
  const avg=ranges.reduce((a,b)=>a+b,0)/ranges.length
  const lastR=candles[candles.length-1].high-candles[candles.length-1].low
  return lastR > avg*1.3
}

function scoreSignal(candles) {
  const ms = getMarketStructure(candles)
  const reasons=[ms.reason]
  if(ms.bias==='NEUTRAL') return {direction:'NONE', confidence:0, reasons:[...reasons,'No trade - wait for structure']}

  const ob = findOrderBlock(candles)
  const fvg = findFVG(candles)
  const liq = findLiquiditySweep(candles)
  const vol = volumeConfirm(candles)

  let points=0
  if(ob && ob.type===ms.bias){
    points+=2; reasons.push(`${ob.type} Order Block at ${ob.top.toFixed(5)}-${ob.bottom.toFixed(5)}`)
  }
  if(fvg && fvg.type===ms.bias){
    points+=1.5; reasons.push(`${fvg.type} FVG ${fvg.bottom.toFixed(5)}-${fvg.top.toFixed(5)}`)
  }
  if(liq && liq.type===ms.bias){
    points+=1.5; reasons.push(liq.name)
  } else if(liq){
    points-=1; reasons.push(`Opposing liquidity - caution`)
  }
  if(vol){ points+=1; reasons.push('Volume / range expansion confirms impulse') }

  let direction='NONE', confidence=0
  if(ms.bias==='BULLISH' && points>=2.5){
    direction='CALL'; confidence=Math.min(95, Math.round(55 + points*8))
  } else if(ms.bias==='BEARISH' && points>=2.5){
    direction='PUT'; confidence=Math.min(95, Math.round(55 + points*8))
  } else {
    reasons.push('Not enough ICT confluence in bias direction')
  }
  return {direction, confidence, reasons}
}

// --- Data fetching: Stooq for Forex/Commodities, Binance for Crypto ---

function resampleCandles(candles, tf) {
  if (tf!== '3') return candles
  const out = []
  for (let i = 0; i < candles.length; i += 3) {
    const chunk = candles.slice(i, i + 3)
    if (chunk.length < 3) break
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[2].close,
    })
  }
  return out
}

async function fetchForexCandles(symbol, tf) {
  const stooqSym = STOOQ_MAP[symbol]
  if (!stooqSym) throw new Error('No Stooq mapping for ' + symbol)
  const interval = TF_TO_STOOQ[tf] || '1'
  const url = `https://stooq.com/q/d/l/?s=${stooqSym}&i=${interval}`
  const res = await fetch(url)
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 30) throw new Error('Stooq: no data for ' + symbol)
  let candles = lines.slice(1).map(line => {
    const [date, open, high, low, close] = line.split(',')
    return {
      time: new Date(date.replace(' ', 'T')).getTime(),
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
    }
  }).filter(c => c.open && c.high && c.low && c.close)
  candles = resampleCandles(candles, tf)
  if (candles.length < 25) throw new Error('Not enough Stooq data')
  return candles.slice(-100)
}

async function fetchCryptoCandles(symbol, tf) {
  const interval = TF_TO_BINANCE[tf] || '1m'
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
  const res = await fetch(url)
  const data = await res.json()
  return data.map((k) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    time: k[0],
  }))
}

// --- Components (unchanged) ---

function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Signup successful! Check your email to confirm, then log in.')
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>GroWiz OTC</h1>
      <h2>{isLogin? 'Login' : 'Sign Up'}</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: 10, marginBottom: 10 }} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: 10, marginBottom: 10 }} />
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading? 'Please wait...' : isLogin? 'Login' : 'Sign Up'}
        </button>
      </form>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
      <p style={{ marginTop: 20, cursor: 'pointer', color: 'blue' }} onClick={() => setIsLogin(!isLogin)}>
        {isLogin? "Don't have an account? Sign up" : 'Already have an account? Login'}
      </p>
    </div>
  )
}

function SignalGenerator({ userId }) {
  const allPairs = {...FOREX_PAIRS,...COMMODITY_PAIRS,...CRYPTO_PAIRS }
  const [broker, setBroker] = useState(BROKERS[0])
  const [pair, setPair] = useState(Object.keys(allPairs)[0])
  const [timeframe, setTimeframe] = useState('1')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const generateSignal = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      let candles
      if (FOREX_PAIRS[pair] || COMMODITY_PAIRS[pair]) {
        const sym = FOREX_PAIRS[pair] || COMMODITY_PAIRS[pair]
        candles = await fetchForexCandles(sym, timeframe)
      } else {
        candles = await fetchCryptoCandles(CRYPTO_PAIRS[pair], timeframe)
      }
      if (!candles || candles.length < 25) {
        setError('Not enough data returned to generate a signal. Try again.')
        setLoading(false)
        return
      }
      const scored = scoreSignal(candles)
      setResult(scored)
      await supabase.from('signals').insert({
        user_id: userId,
        broker,
        pair,
        timeframe: `${timeframe} MIN`,
        direction: scored.direction,
        confidence: scored.confidence,
      })
    } catch (err) {
      setError(err.message || 'Something went wrong fetching data.')
    }
    setLoading(false)
  }

  return (
    <div style={{ marginTop: 30, padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
      <h3>Generate Signal</h3>
      <label>Broker</label>
      <select value={broker} onChange={(e) => setBroker(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
        {BROKERS.map((b) => (<option key={b} value={b}>{b}</option>))}
      </select>
      <label>Pair</label>
      <select value={pair} onChange={(e) => setPair(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
        {Object.keys(allPairs).map((p) => (<option key={p} value={p}>{p}</option>))}
      </select>
      <label>Timeframe</label>
      <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
        {TIMEFRAMES.map((t) => (<option key={t} value={t}>{t} MIN</option>))}
      </select>
      <button onClick={generateSignal} disabled={loading} style={{ width: '100%', padding: 10, marginTop: 10 }}>
        {loading? 'Generating...' : 'Generate Signal'}
      </button>
      {error && <p style={{ color: 'red', marginTop: 15 }}>{error}</p>}
      {result && (
        <div style={{ marginTop: 20, padding: 15, background: '#f5f5f5', borderRadius: 6 }}>
          <h2 style={{ color: result.direction === 'CALL'? 'green' : result.direction === 'PUT'? 'red' : 'gray' }}>
            {result.direction === 'NONE'? 'No clear signal' : result.direction}
          </h2>
          {result.direction!== 'NONE' && <p>Confidence: {result.confidence}%</p>}
          <ul>{result.reasons.map((r, i) => (<li key={i}>{r}</li>))}</ul>
          <p style={{ fontSize: 12, color: '#666', marginTop: 10 }}>ICT/SMC based suggestion. Not financial advice.</p>
        </div>
      )}
    </div>
  )
}

function Dashboard({ session }) {
  const handleLogout = async () => { await supabase.auth.signOut() }
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>GroWiz OTC Dashboard</h1>
      <p>Logged in as: {session.user.email}</p>
      <button onClick={handleLogout}>Log out</button>
      <SignalGenerator userId={session.user.id} />
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session) })
    return () => listener.subscription.unsubscribe()
  }, [])
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session? <Dashboard session={session} /> : <Auth />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

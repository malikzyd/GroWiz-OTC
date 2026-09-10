import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'

const TWELVE_DATA_API_KEY = '6e77576aeef04ad29d9321db20d793c2'

const FOREX_PAIRS = {
  'EUR/USD OTC': 'EUR/USD',
  'GBP/USD OTC': 'GBP/USD',
  'USD/JPY OTC': 'USD/JPY',
  'EUR/JPY OTC': 'EUR/JPY',
  'GBP/JPY OTC': 'GBP/JPY',
  'AUD/USD OTC': 'AUD/USD',
  'USD/CHF OTC': 'USD/CHF',
  'NZD/USD OTC': 'NZD/USD',
  'USD/CAD OTC': 'USD/CAD',
}

const CRYPTO_PAIRS = {
  'BTC/USD OTC': 'BTCUSDT',
  'ETH/USD OTC': 'ETHUSDT',
  'SOL/USD OTC': 'SOLUSDT',
  'XRP/USD OTC': 'XRPUSDT',
  'DOGE/USD OTC': 'DOGEUSDT',
}

const BROKERS = ['Quotex', 'IQ Option', 'Pocket Option', 'Expert Option']
const TIMEFRAMES = ['1', '3', '5', '15']

const TF_TO_TWELVEDATA = { '1': '1min', '3': '3min', '5': '5min', '15': '15min' }
const TF_TO_BINANCE = { '1': '1m', '3': '3m', '5': '5m', '15': '15m' }

// --- Indicator math ---

function ema(values, period) {
  const k = 2 / (period + 1)
  const out = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(50)
  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  out[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9))
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9))
  }
  return out
}

function engulfingPattern(candles) {
  const n = candles.length
  if (n < 2) return null
  const prev = candles[n - 2]
  const curr = candles[n - 1]
  const prevBearish = prev.close < prev.open
  const currBullish = curr.close > curr.open
  if (prevBearish && currBullish && curr.close > prev.open && curr.open < prev.close) return 'bullish'
  const prevBullish = prev.close > prev.open
  const currBearish = curr.close < curr.open
  if (prevBullish && currBearish && curr.close < prev.open && curr.open > prev.close) return 'bearish'
  return null
}

function scoreSignal(candles) {
  const closes = candles.map((c) => c.close)
  const rsiSeries = rsi(closes, 14)
  const ema9 = ema(closes, 9)
  const ema21 = ema(closes, 21)

  const lastRsi = rsiSeries[rsiSeries.length - 1]
  const lastEma9 = ema9[ema9.length - 1]
  const lastEma21 = ema21[ema21.length - 1]
  const prevEma9 = ema9[ema9.length - 2]
  const prevEma21 = ema21[ema21.length - 2]
  const pattern = engulfingPattern(candles)

  let bullPoints = 0
  let bearPoints = 0
  const reasons = []

  if (lastRsi < 30) {
    bullPoints++
    reasons.push('RSI oversold (<30)')
  } else if (lastRsi > 70) {
    bearPoints++
    reasons.push('RSI overbought (>70)')
  }

  const crossedUp = prevEma9 <= prevEma21 && lastEma9 > lastEma21
  const crossedDown = prevEma9 >= prevEma21 && lastEma9 < lastEma21
  if (crossedUp) {
    bullPoints++
    reasons.push('EMA9 crossed above EMA21')
  } else if (crossedDown) {
    bearPoints++
    reasons.push('EMA9 crossed below EMA21')
  } else if (lastEma9 > lastEma21) {
    bullPoints += 0.5
    reasons.push('EMA9 above EMA21 (uptrend)')
  } else {
    bearPoints += 0.5
    reasons.push('EMA9 below EMA21 (downtrend)')
  }

  if (pattern === 'bullish') {
    bullPoints++
    reasons.push('Bullish engulfing candle')
  } else if (pattern === 'bearish') {
    bearPoints++
    reasons.push('Bearish engulfing candle')
  }

  let direction = 'NONE'
  let confidence = 0
  const maxPoints = 3

  if (bullPoints >= 2 && bullPoints > bearPoints) {
    direction = 'CALL'
    confidence = Math.min(95, Math.round((bullPoints / maxPoints) * 100))
  } else if (bearPoints >= 2 && bearPoints > bullPoints) {
    direction = 'PUT'
    confidence = Math.min(95, Math.round((bearPoints / maxPoints) * 100))
  }

  return { direction, confidence, reasons }
}

// --- Data fetching ---

async function fetchForexCandles(symbol, tf) {
  const interval = TF_TO_TWELVEDATA[tf] || '1min'
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    symbol
  )}&interval=${interval}&outputsize=100&apikey=${TWELVE_DATA_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.values) throw new Error(data.message || 'Twelve Data error')
  return data.values
    .map((v) => ({
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      time: new Date(v.datetime).getTime(),
    }))
    .reverse()
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

// --- Components ---

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
      <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Please wait...' : isLogin ? 'Login' : 'Sign Up'}
        </button>
      </form>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
      <p style={{ marginTop: 20, cursor: 'pointer', color: 'blue' }} onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
      </p>
    </div>
  )
}

function SignalGenerator({ userId }) {
  const allPairs = { ...FOREX_PAIRS, ...CRYPTO_PAIRS }
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
      if (FOREX_PAIRS[pair]) {
        candles = await fetchForexCandles(FOREX_PAIRS[pair], timeframe)
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

      // Save to Supabase
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
        {BROKERS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>

      <label>Pair</label>
      <select value={pair} onChange={(e) => setPair(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
        {Object.keys(allPairs).map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <label>Timeframe</label>
      <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
        {TIMEFRAMES.map((t) => (
          <option key={t} value={t}>{t} MIN</option>
        ))}
      </select>

      <button onClick={generateSignal} disabled={loading} style={{ width: '100%', padding: 10, marginTop: 10 }}>
        {loading ? 'Generating...' : 'Generate Signal'}
      </button>

      {error && <p style={{ color: 'red', marginTop: 15 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20, padding: 15, background: '#f5f5f5', borderRadius: 6 }}>
          <h2 style={{ color: result.direction === 'CALL' ? 'green' : result.direction === 'PUT' ? 'red' : 'gray' }}>
            {result.direction === 'NONE' ? 'No clear signal' : result.direction}
          </h2>
          {result.direction !== 'NONE' && <p>Confidence: {result.confidence}%</p>}
          <ul>
            {result.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <p style={{ fontSize: 12, color: '#666', marginTop: 10 }}>
            Analytical suggestion based on correlated real-market data. Not financial advice.
          </p>
        </div>
      )}
    </div>
  )
}

function Dashboard({ session }) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <Dashboard session={session} /> : <Auth />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

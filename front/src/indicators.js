/**
 * 计算单根移动平均线（MA）
 * @param {Array<{time: number, close: number}>} data - K线数据数组
 * @param {number} period - MA周期
 * @returns {Array<{time: number, value: number}>} MA数据数组
 */
export function calculateMA(data, period) {
  const result = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close
    }
    result.push({
      time: data[i].time,
      value: sum / period
    })
  }
  return result
}

/**
 * 计算成交量移动平均线
 * @param {Array<{time: number, volume: number}>} data - K线数据数组
 * @param {number} period - MA周期
 * @returns {Array<{time: number, value: number}>} 成交量MA数据数组
 */
export function calculateVolumeMA(data, period) {
  const result = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j].volume
    }
    result.push({
      time: data[i].time,
      value: sum / period
    })
  }
  return result
}

/**
 * 计算考夫曼自适应移动平均线（KAMA）
 * @param {Array<{time: number, close: number}>} data - K线数据数组
 * @param {number} erPeriod - 效率比率(ER)计算周期
 * @param {number} fastSmooth - 快速平滑常数周期（默认2）
 * @param {number} slowSmooth - 慢速平滑常数周期（默认30）
 * @returns {Array<{time: number, value: number}>} KAMA数据数组
 */
export function calculateKAMA(data, erPeriod, fastSmooth = 2, slowSmooth = 30) {
  const n = data.length
  if (n < erPeriod) return []

  const result = []
  const closes = data.map(d => d.close)
  const times = data.map(d => d.time)

  // 前 erPeriod-1 个为 NaN（不加入结果）
  const fastSC = 2.0 / (fastSmooth + 1)
  const slowSC = 2.0 / (slowSmooth + 1)
  const scDiff = fastSC - slowSC

  let kama = closes[erPeriod - 1]
  result.push({ time: times[erPeriod - 1], value: kama })

  for (let i = erPeriod; i < n; i++) {
    const change = Math.abs(closes[i] - closes[i - erPeriod])
    let volatility = 0
    for (let j = i - erPeriod + 1; j <= i; j++) {
      volatility += Math.abs(closes[j] - closes[j - 1])
    }
    const er = volatility === 0 ? 0 : change / volatility
    const sc = Math.pow(er * scDiff + slowSC, 2)
    kama = kama + sc * (closes[i] - kama)
    result.push({ time: times[i], value: kama })
  }

  return result
}

/**
 * 计算双MA交叉策略的买卖信号
 * @param {Array<{time: number, close: number}>} data - K线数据数组
 * @param {number} fastPeriod - 快线周期
 * @param {number} slowPeriod - 慢线周期
 * @returns {Array<{time: number, type: 'golden' | 'death', fastMA: number, slowMA: number}>} 交叉信号数组
 */
export function calculateMACross(data, fastPeriod, slowPeriod) {
  const signals = []
  const n = data.length
  if (n < slowPeriod) return signals

  const ma = (period, idx) => {
    if (idx < period - 1) return NaN
    let sum = 0
    for (let j = idx - period + 1; j <= idx; j++) {
      sum += data[j].close
    }
    return sum / period
  }

  for (let i = 1; i < n; i++) {
    const fastMA = ma(fastPeriod, i)
    const slowMA = ma(slowPeriod, i)
    const prevFast = ma(fastPeriod, i - 1)
    const prevSlow = ma(slowPeriod, i - 1)

    if (isNaN(fastMA) || isNaN(slowMA) || isNaN(prevFast) || isNaN(prevSlow)) continue

    if (prevFast <= prevSlow && fastMA > slowMA) {
      signals.push({ time: data[i].time, type: 'golden', fastMA, slowMA })
    } else if (prevFast >= prevSlow && fastMA < slowMA) {
      signals.push({ time: data[i].time, type: 'death', fastMA, slowMA })
    }
  }
  return signals
}

/**
 * 根据周期计算快线和慢线数据
 * @param {Array<{time: number, close: number}>} data - K线数据数组
 * @param {number} fastPeriod - 快线周期
 * @param {number} slowPeriod - 慢线周期
 * @returns {{fast: Array<{time: number, value: number}>, slow: Array<{time: number, value: number}>}}
 */
export function calculateFastSlowMA(data, fastPeriod, slowPeriod) {
  return {
    fast: calculateMA(data, fastPeriod),
    slow: calculateMA(data, slowPeriod)
  }
}

/**
 * 计算相对强弱指数（RSI）
 * @param {Array<{time: number, close: number}>} data - K线数据数组
 * @param {number} period - 计算周期（默认14）
 * @returns {Array<{time: number, value: number}>} RSI数据数组
 */
export function calculateRSI(data, period = 14) {
  const n = data.length
  if (n < period + 1) return []

  const result = []
  const closes = data.map(d => d.close)
  const times = data.map(d => d.time)

  // 前 period 个为 NaN
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) avgGain += change
    else avgLoss += -change
  }
  avgGain /= period
  avgLoss /= period

  // 第一个 RSI
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  result.push({ time: times[period], value: rsi })

  // Wilder 平滑
  for (let i = period + 1; i < n; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    result.push({ time: times[i], value: rsi })
  }

  return result
}

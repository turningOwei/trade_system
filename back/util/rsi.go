package util

import "math"

// CalculateRSI 计算相对强弱指数（RSI）
// period: 计算周期（通常取14）
// 返回与原始数据长度相同的数组，数据不足的位置为 NaN
func CalculateRSI(closes []float64, period int) []float64 {
	n := len(closes)
	if n < period+1 {
		result := make([]float64, n)
		for i := range result {
			result[i] = math.NaN()
		}
		return result
	}

	result := make([]float64, n)
	for i := 0; i < period; i++ {
		result[i] = math.NaN()
	}

	// 计算初始平均涨幅和平均跌幅
	var avgGain, avgLoss float64
	for i := 1; i <= period; i++ {
		change := closes[i] - closes[i-1]
		if change > 0 {
			avgGain += change
		} else {
			avgLoss += -change
		}
	}
	avgGain /= float64(period)
	avgLoss /= float64(period)

	// 计算第一个 RSI
	if avgLoss == 0 {
		result[period] = 100
	} else {
		rs := avgGain / avgLoss
		result[period] = 100 - 100/(1+rs)
	}

	// 使用 Wilder 平滑法计算后续 RSI
	for i := period + 1; i < n; i++ {
		change := closes[i] - closes[i-1]
		gain := 0.0
		if change > 0 {
			gain = change
		}
		loss := 0.0
		if change < 0 {
			loss = -change
		}

		avgGain = (avgGain*float64(period-1) + gain) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)

		if avgLoss == 0 {
			result[i] = 100
		} else {
			rs := avgGain / avgLoss
			result[i] = 100 - 100/(1+rs)
		}
	}

	return result
}

// RSIGridResult RSI 网格搜索结果
type RSIGridResult struct {
	Period    int     `json:"period"`
	AvgRSI    float64 `json:"avgRSI"`     // 平均 RSI 值
	OverboughtCount int `json:"overboughtCount"` // 超买次数（RSI > 70）
	OversoldCount   int `json:"oversoldCount"`   // 超卖次数（RSI < 30）
	Volatility  float64 `json:"volatility"`  // RSI 波动率（标准差）
}

// AnalyzeRSI 分析 RSI 特征
func AnalyzeRSI(closes []float64, period int) RSIGridResult {
	rsi := CalculateRSI(closes, period)
	var sum, sumSq float64
	var count, obCount, osCount int
	for _, v := range rsi {
		if math.IsNaN(v) {
			continue
		}
		sum += v
		sumSq += v * v
		count++
		if v > 70 {
			obCount++
		}
		if v < 30 {
			osCount++
		}
	}

	avg := 0.0
	std := 0.0
	if count > 0 {
		avg = sum / float64(count)
		variance := sumSq/float64(count) - avg*avg
		if variance > 0 {
			std = math.Sqrt(variance)
		}
	}

	return RSIGridResult{
		Period:          period,
		AvgRSI:          avg,
		OverboughtCount: obCount,
		OversoldCount:   osCount,
		Volatility:      std,
	}
}

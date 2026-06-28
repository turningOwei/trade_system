package util

import "math"

// CalculateMA 计算指定周期的移动平均线
// 返回与原始数据长度相同的数组，数据不足的位置为 NaN
func CalculateMA(closes []float64, period int) []float64 {
	n := len(closes)
	result := make([]float64, n)
	for i := 0; i < n; i++ {
		result[i] = math.NaN()
	}
	for i := period - 1; i < n; i++ {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += closes[j]
		}
		result[i] = sum / float64(period)
	}
	return result
}

// MACrossSignal MA交叉信号
type MACrossSignal struct {
	Index  int
	FastMA float64
	SlowMA float64
	IsLong bool // true=金叉(做多信号), false=死叉(做空信号)
}

// DetectMACross 检测双MA交叉信号，返回金叉/死叉列表
func DetectMACross(closes []float64, fastPeriod, slowPeriod int) []MACrossSignal {
	n := len(closes)
	if n < slowPeriod {
		return nil
	}
	fastMA := CalculateMA(closes, fastPeriod)
	slowMA := CalculateMA(closes, slowPeriod)

	var signals []MACrossSignal
	for i := 1; i < n; i++ {
		if math.IsNaN(fastMA[i]) || math.IsNaN(slowMA[i]) ||
			math.IsNaN(fastMA[i-1]) || math.IsNaN(slowMA[i-1]) {
			continue
		}
		// 金叉：快线上穿慢线
		if fastMA[i-1] <= slowMA[i-1] && fastMA[i] > slowMA[i] {
			signals = append(signals, MACrossSignal{Index: i, FastMA: fastMA[i], SlowMA: slowMA[i], IsLong: true})
		}
		// 死叉：快线下穿慢线
		if fastMA[i-1] >= slowMA[i-1] && fastMA[i] < slowMA[i] {
			signals = append(signals, MACrossSignal{Index: i, FastMA: fastMA[i], SlowMA: slowMA[i], IsLong: false})
		}
	}
	return signals
}

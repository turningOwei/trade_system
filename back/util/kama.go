package util

import "math"

// CalculateKAMA 计算考夫曼自适应移动平均线（KAMA）
// period: 效率比率(ER)的计算周期
// fastSmooth: 快速平滑常数的周期（通常取2）
// slowSmooth: 慢速平滑常数的周期（通常取30）
// 返回与原始数据长度相同的数组，数据不足的位置为 NaN
func CalculateKAMA(closes []float64, period, fastSmooth, slowSmooth int) []float64 {
	n := len(closes)
	if n < period {
		result := make([]float64, n)
		for i := range result {
			result[i] = math.NaN()
		}
		return result
	}

	result := make([]float64, n)
	for i := 0; i < period-1; i++ {
		result[i] = math.NaN()
	}

	// 预计算快速和慢速平滑常数
	fastSC := 2.0 / float64(fastSmooth+1)
	slowSC := 2.0 / float64(slowSmooth+1)
	scDiff := fastSC - slowSC

	// 从 period 位置开始计算
	result[period-1] = closes[period-1]

	for i := period; i < n; i++ {
		// 1. 计算价格变动（绝对值）
		change := math.Abs(closes[i] - closes[i-period])

		// 2. 计算波动率（逐段变动之和）
		volatility := 0.0
		for j := i - period + 1; j <= i; j++ {
			volatility += math.Abs(closes[j] - closes[j-1])
		}

		// 3. 计算效率比率 (ER)
		var er float64
		if volatility == 0 {
			er = 0
		} else {
			er = change / volatility
		}

		// 4. 计算平滑常数 (SC)
		sc := er*scDiff + slowSC
		sc = sc * sc

		// 5. 计算 KAMA
		result[i] = result[i-1] + sc*(closes[i]-result[i-1])
	}

	return result
}

// KAMACrossSignal KAMA 交叉信号
type KAMACrossSignal struct {
	Index    int
	FastKAMA float64
	SlowKAMA float64
	IsLong   bool // true=快线上穿慢线(做多信号), false=快线下穿慢线(做空信号)
}

// DetectKAMACross 检测快慢 KAMA 交叉信号（双 KAMA 线交叉，类似 MA 交叉策略）
// erFastPeriod: 快线 ER 周期
// erSlowPeriod: 慢线 ER 周期
// fastSmooth: 快速平滑常数周期（通常取2）
// slowSmooth: 慢速平滑常数周期（通常取30）
func DetectKAMACross(closes []float64, erFastPeriod, erSlowPeriod, fastSmooth, slowSmooth int) []KAMACrossSignal {
	n := len(closes)
	if n < erSlowPeriod {
		return nil
	}

	// 快线 KAMA：ER 周期 = erFastPeriod
	fastKAMA := CalculateKAMA(closes, erFastPeriod, fastSmooth, slowSmooth)

	// 慢线 KAMA：ER 周期 = erSlowPeriod
	slowKAMA := CalculateKAMA(closes, erSlowPeriod, fastSmooth, slowSmooth)

	var signals []KAMACrossSignal
	for i := 1; i < n; i++ {
		if math.IsNaN(fastKAMA[i]) || math.IsNaN(slowKAMA[i]) ||
			math.IsNaN(fastKAMA[i-1]) || math.IsNaN(slowKAMA[i-1]) {
			continue
		}
		// 金叉：快线上穿慢线
		if fastKAMA[i-1] <= slowKAMA[i-1] && fastKAMA[i] > slowKAMA[i] {
			signals = append(signals, KAMACrossSignal{Index: i, FastKAMA: fastKAMA[i], SlowKAMA: slowKAMA[i], IsLong: true})
		}
		// 死叉：快线下穿慢线
		if fastKAMA[i-1] >= slowKAMA[i-1] && fastKAMA[i] < slowKAMA[i] {
			signals = append(signals, KAMACrossSignal{Index: i, FastKAMA: fastKAMA[i], SlowKAMA: slowKAMA[i], IsLong: false})
		}
	}
	return signals
}

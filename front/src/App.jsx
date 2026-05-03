import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'

// 颜色配置
const COLORS = {
  background: '#000000',
  text: '#D1D4DC',
  up: '#FF5252',      // 上涨红色
  down: '#00FFFF',    // 下跌青色
  ma5: '#FFEB3B',     // MA5黄色
  ma10: '#FFFFFF',    // MA10白色
  volumeMa5: '#9C27B0', // 成交量MA5紫色
  grid: '#1e222d',
  crosshair: '#758696'
}

// 计算移动平均线
function calculateMA(data, period) {
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

// 计算成交量移动平均线
function calculateVolumeMA(data, period) {
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

function App() {
  const chartContainerRef = useRef(null)
  const volumeContainerRef = useRef(null)
  const chartRef = useRef(null)
  const volumeChartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const ma5SeriesRef = useRef(null)
  const ma10SeriesRef = useRef(null)
  const volumeMa5SeriesRef = useRef(null)
  const wsRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const dataRef = useRef([])

  // 初始化图表
  const initChart = useCallback(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current) return

    // 主图配置
    const chartOptions = {
      layout: {
        background: { color: COLORS.background },
        textColor: COLORS.text
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid }
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: COLORS.text
        },
        horzLine: {
          color: COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: COLORS.text
        }
      },
      rightPriceScale: {
        borderColor: COLORS.grid
      },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: true,
        secondsVisible: false
      },
      localization: {
        dateFormat: 'MM-dd',
        timeFormatter: (timestamp) => {
          const date = new Date(timestamp * 1000)
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          return `${month}-${day} ${hours}:${minutes}`
        }
      }
    }

    // 创建主图
    chartRef.current = createChart(chartContainerRef.current, {
      ...chartOptions,
      height: chartContainerRef.current.clientHeight,
      width: chartContainerRef.current.clientWidth
    })

    // 创建成交量图
    volumeChartRef.current = createChart(volumeContainerRef.current, {
      ...chartOptions,
      height: volumeContainerRef.current.clientHeight,
      width: volumeContainerRef.current.clientWidth
    })

    // K线系列
    candleSeriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      lastValueVisible: false,
      priceLineVisible: false
    })

    // 成交量系列
    volumeSeriesRef.current = volumeChartRef.current.addHistogramSeries({
      color: COLORS.up,
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: ''
    })

    // MA5
    ma5SeriesRef.current = chartRef.current.addLineSeries({
      color: COLORS.ma5,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false
    })

    // MA10
    ma10SeriesRef.current = chartRef.current.addLineSeries({
      color: COLORS.ma10,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false
    })

    // 成交量MA5
    volumeMa5SeriesRef.current = volumeChartRef.current.addLineSeries({
      color: COLORS.volumeMa5,
      lineWidth: 1
    })

    // 同步两个图表的时间范围
    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => {
      volumeChartRef.current.timeScale().setVisibleLogicalRange(range)
    })

    volumeChartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => {
      chartRef.current.timeScale().setVisibleLogicalRange(range)
    })

    // 窗口大小调整
    const handleResize = () => {
      if (chartRef.current && volumeChartRef.current) {
        chartRef.current.applyOptions({
          height: chartContainerRef.current.clientHeight,
          width: chartContainerRef.current.clientWidth
        })
        volumeChartRef.current.applyOptions({
          height: volumeContainerRef.current.clientHeight,
          width: volumeContainerRef.current.clientWidth
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.remove()
      }
      if (volumeChartRef.current) {
        volumeChartRef.current.remove()
      }
    }
  }, [])

  // 更新图表数据
  const updateChart = useCallback((data) => {
    if (!candleSeriesRef.current || data.length === 0) return

    dataRef.current = data

    // 更新K线
    candleSeriesRef.current.setData(data)

    // 更新成交量
    const volumeData = data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? COLORS.up : COLORS.down
    }))
    volumeSeriesRef.current.setData(volumeData)

    // 更新MA5和MA10
    const ma5Data = calculateMA(data, 5)
    const ma10Data = calculateMA(data, 10)
    ma5SeriesRef.current.setData(ma5Data)
    ma10SeriesRef.current.setData(ma10Data)

    // 更新成交量MA5
    const volumeMa5Data = calculateVolumeMA(data, 5)
    volumeMa5SeriesRef.current.setData(volumeMa5Data)
  }, [])

  // 追加新K线
  const appendTick = useCallback((tick) => {
    if (!candleSeriesRef.current) return

    const data = dataRef.current
    const lastIndex = data.length - 1
    const lastTick = data[lastIndex]

    if (lastTick && lastTick.time === tick.time) {
      // 更新当前K线
      data[lastIndex] = tick
      candleSeriesRef.current.update(tick)

      // 更新成交量
      volumeSeriesRef.current.update({
        time: tick.time,
        value: tick.volume,
        color: tick.close >= tick.open ? COLORS.up : COLORS.down
      })
    } else {
      // 添加新K线
      data.push(tick)
      candleSeriesRef.current.update(tick)

      volumeSeriesRef.current.update({
        time: tick.time,
        value: tick.volume,
        color: tick.close >= tick.open ? COLORS.up : COLORS.down
      })
    }

    // 更新MA线
    const ma5Data = calculateMA(data, 5)
    const ma10Data = calculateMA(data, 10)
    ma5SeriesRef.current.setData(ma5Data)
    ma10SeriesRef.current.setData(ma10Data)

    // 更新成交量MA5
    const volumeMa5Data = calculateVolumeMA(data, 5)
    volumeMa5SeriesRef.current.setData(volumeMa5Data)
  }, [])

  // WebSocket连接
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket已连接')
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'history') {
          // 接收历史数据
          updateChart(message.history)
        } else if (message.time) {
          // 接收实时K线
          appendTick(message)
        }
      } catch (error) {
        console.error('解析消息失败:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket错误:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket已断开')
      setIsConnected(false)
    }

    return () => {
      ws.close()
    }
  }, [updateChart, appendTick])

  // 初始化图表
  useEffect(() => {
    const cleanup = initChart()
    return cleanup
  }, [initChart])

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      backgroundColor: COLORS.background,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* 顶部状态栏 */}
      <div style={{
        height: '40px',
        borderBottom: '1px solid #1e222d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px'
      }}>
        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>交易终端</span>
        <span style={{
          marginLeft: '20px',
          fontSize: '12px',
          color: isConnected ? '#00FF00' : '#FF0000'
        }}>
          {isConnected ? '● 已连接' : '○ 未连接'}
        </span>
      </div>

      {/* 主图区域 - K线图 */}
      <div style={{ height: 'calc(75% - 20px)', position: 'relative' }}>
        <div
          ref={chartContainerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* 副图区域 - 成交量 */}
      <div style={{ height: '25%', position: 'relative' }}>
        <div
          ref={volumeContainerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

export default App
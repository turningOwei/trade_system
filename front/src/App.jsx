import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'

// 颜色配置
const COLORS = {
  background: '#000000',
  text: '#D1D4DC',
  up: '#FF5252',
  down: '#00FFFF',
  ma5: '#FFEB3B',
  ma10: '#FFFFFF',
  volumeMa5: '#9C27B0',
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
  const [isConnected, setIsConnected] = useState(false)
  const dataRef = useRef([])
  const crosshairMainRef = useRef(null)
  const crosshairVolumeRef = useRef(null)

  // 初始化图表
  const initChart = useCallback(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current) return

    // 图表配置
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
          visible: false,
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
      leftPriceScale: {
        visible: false
      },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const date = new Date(time * 1000)
          return date.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour: '2-digit',
            minute: '2-digit'
          })
        }
      },
      localization: {
        dateFormat: 'MM-dd',
        timeFormatter: (timestamp) => {
          const date = new Date(timestamp * 1000)
          return date.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }).replace(/\//g, '-')
        },
        dateFormatter: (timestamp) => {
          const date = new Date(timestamp * 1000)
          return date.toLocaleDateString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            month: '2-digit',
            day: '2-digit'
          }).replace(/\//g, '-')
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

    // 创建跨图表的十字垂直线
    const mainPane = chartContainerRef.current.parentElement
    const volumePane = volumeContainerRef.current.parentElement
    mainPane.style.position = 'relative'
    volumePane.style.position = 'relative'

    crosshairMainRef.current = document.createElement('div')
    crosshairMainRef.current.style.cssText = `position:absolute;top:0;bottom:0;width:1px;background:none;border-left:1px dashed ${COLORS.crosshair};pointer-events:none;display:none;z-index:100;`
    mainPane.appendChild(crosshairMainRef.current)

    crosshairVolumeRef.current = document.createElement('div')
    crosshairVolumeRef.current.style.cssText = `position:absolute;top:0;bottom:0;width:1px;background:none;border-left:1px dashed ${COLORS.crosshair};pointer-events:none;display:none;z-index:100;`
    volumePane.appendChild(crosshairVolumeRef.current)

    // 鼠标移动同步十字线
    const handleMouseMove = (e, container, line1, line2) => {
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      line1.style.left = x + 'px'
      line1.style.display = 'block'
      line2.style.left = x + 'px'
      line2.style.display = 'block'
    }

    const handleMouseLeave = () => {
      crosshairMainRef.current.style.display = 'none'
      crosshairVolumeRef.current.style.display = 'none'
    }

    chartContainerRef.current.addEventListener('mousemove', (e) => handleMouseMove(e, chartContainerRef.current, crosshairMainRef.current, crosshairVolumeRef.current))
    chartContainerRef.current.addEventListener('mouseleave', handleMouseLeave)
    volumeContainerRef.current.addEventListener('mousemove', (e) => handleMouseMove(e, volumeContainerRef.current, crosshairVolumeRef.current, crosshairMainRef.current))
    volumeContainerRef.current.addEventListener('mouseleave', handleMouseLeave)

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
      priceFormat: { type: 'volume' },
      lastValueVisible: true,
      priceLineVisible: false
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
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false
    })

    // 同步时间范围
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
      if (chartRef.current) chartRef.current.remove()
      if (volumeChartRef.current) volumeChartRef.current.remove()
    }
  }, [])

  // 更新图表数据
  const updateChart = useCallback((data) => {
    if (!candleSeriesRef.current || data.length === 0) return
    dataRef.current = data

    candleSeriesRef.current.setData(data)

    const volumeData = data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? COLORS.up : COLORS.down
    }))
    volumeSeriesRef.current.setData(volumeData)

    const ma5Data = calculateMA(data, 5)
    const ma10Data = calculateMA(data, 10)
    ma5SeriesRef.current.setData(ma5Data)
    ma10SeriesRef.current.setData(ma10Data)

    const volumeMa5Data = calculateVolumeMA(data, 5)
    volumeMa5SeriesRef.current.setData(volumeMa5Data)

    setTimeout(() => {
      if (chartRef.current && volumeChartRef.current) {
        const range = chartRef.current.timeScale().getVisibleLogicalRange()
        if (range) {
          volumeChartRef.current.timeScale().setVisibleLogicalRange(range)
        }
      }
    }, 100)
  }, [])

  // 追加新K线
  const appendTick = useCallback((tick) => {
    if (!candleSeriesRef.current) return

    const data = dataRef.current
    const lastIndex = data.length - 1
    const lastTick = data[lastIndex]

    if (lastTick && lastTick.time === tick.time) {
      data[lastIndex] = tick
      candleSeriesRef.current.update(tick)
      volumeSeriesRef.current.update({
        time: tick.time,
        value: tick.volume,
        color: tick.close >= tick.open ? COLORS.up : COLORS.down
      })
    } else {
      data.push(tick)
      candleSeriesRef.current.update(tick)
      volumeSeriesRef.current.update({
        time: tick.time,
        value: tick.volume,
        color: tick.close >= tick.open ? COLORS.up : COLORS.down
      })
    }

    const ma5Data = calculateMA(data, 5)
    const ma10Data = calculateMA(data, 10)
    ma5SeriesRef.current.setData(ma5Data)
    ma10SeriesRef.current.setData(ma10Data)

    const volumeMa5Data = calculateVolumeMA(data, 5)
    volumeMa5SeriesRef.current.setData(volumeMa5Data)
  }, [])

  // WebSocket连接
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws')
    ws.onopen = () => {
      console.log('WebSocket已连接')
      setIsConnected(true)
    }
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'history') {
          updateChart(message.history)
        } else if (message.time) {
          appendTick(message)
        }
      } catch (error) {
        console.error('解析消息失败:', error)
      }
    }
    ws.onerror = (error) => console.error('WebSocket错误:', error)
    ws.onclose = () => {
      console.log('WebSocket已断开')
      setIsConnected(false)
    }
    return () => ws.close()
  }, [updateChart, appendTick])

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

      <div style={{ height: 'calc(75% - 20px)', position: 'relative' }}>
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      <div style={{ height: '25%', position: 'relative' }}>
        <div ref={volumeContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

export default App
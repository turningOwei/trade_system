import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'
import { calculateKAMA, calculateVolumeMA } from './indicators'

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
  const [showMA5, setShowMA5] = useState(true)
  const [showMA10, setShowMA10] = useState(true)
  const [gridResults, setGridResults] = useState(null)
  const [gridLoading, setGridLoading] = useState(false)
  const [showBestSignals, setShowBestSignals] = useState(false)
  const showBestSignalsRef = useRef(false)
  const [showLongTrades, setShowLongTrades] = useState(true)
  const [showShortTrades, setShowShortTrades] = useState(true)
  const [selectedFast, setSelectedFast] = useState(null)
  const [selectedSlow, setSelectedSlow] = useState(null)
  const [selectedSlowSmooth, setSelectedSlowSmooth] = useState(30)
  const selectedFastRef = useRef(null)
  const selectedSlowRef = useRef(null)
  const selectedSlowSmoothRef = useRef(30)
  const showLongTradesRef = useRef(true)
  const showShortTradesRef = useRef(true)
  const gridResultsRef = useRef(null)
  const candleSeries = useRef(null)
  const dataRef = useRef([])
  const crosshairMainRef = useRef(null)
  const crosshairVolumeRef = useRef(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(350)
  const draggingRef = useRef(false)

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
    candleSeries.current = candleSeriesRef.current

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
      priceLineVisible: false,
      visible: showMA5
    })

    // MA10
    ma10SeriesRef.current = chartRef.current.addLineSeries({
      color: COLORS.ma10,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: showMA10
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

    const fast = selectedFastRef.current || 5
    const slow = selectedSlowRef.current || 10
    const slowSmooth = selectedSlowSmoothRef.current || 30
    const maFastData = calculateKAMA(data, fast, 2, slowSmooth)
    const maSlowData = calculateKAMA(data, slow, 2, slowSmooth)
    ma5SeriesRef.current.setData(maFastData)
    ma10SeriesRef.current.setData(maSlowData)

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

    const fast = selectedFastRef.current || 5
    const slow = selectedSlowRef.current || 10
    const slowSmooth = selectedSlowSmoothRef.current || 30
    const maFastData = calculateKAMA(data, fast, 2, slowSmooth)
    const maSlowData = calculateKAMA(data, slow, 2, slowSmooth)
    ma5SeriesRef.current.setData(maFastData)
    ma10SeriesRef.current.setData(maSlowData)

    const volumeMa5Data = calculateVolumeMA(data, 5)
    volumeMa5SeriesRef.current.setData(volumeMa5Data)
  }, [])

  // 根据选定周期重新计算 MA 线
  const recalculateMA = useCallback((fast, slow, slowSmooth) => {
    const data = dataRef.current
    if (!data.length) return
    const maFastData = calculateKAMA(data, fast, 2, slowSmooth)
    const maSlowData = calculateKAMA(data, slow, 2, slowSmooth)
    ma5SeriesRef.current?.setData(maFastData)
    ma10SeriesRef.current?.setData(maSlowData)
    const volumeMa5Data = calculateVolumeMA(data, 5)
    volumeMa5SeriesRef.current?.setData(volumeMa5Data)
  }, [])

  // 刷新数据
  const handleRefresh = useCallback(async () => {
    try {
      const res = await fetch('/refresh')
      const data = await res.json()
      console.log('刷新成功，加载了', data.count, '条K线数据')
    } catch (e) {
      console.error('刷新失败:', e)
    }
  }, [])

  // 网格搜索
  const handleGridSearch = useCallback(async () => {
    setGridLoading(true)
    setGridResults(null)
    setShowBestSignals(false)
    showBestSignalsRef.current = false
    gridResultsRef.current = null
    setShowLongTrades(true)
    showLongTradesRef.current = true
    setShowShortTrades(true)
    showShortTradesRef.current = true
    try {
      const res = await fetch('/grid-search')
      const data = await res.json()
      setGridResults(data)
      gridResultsRef.current = data
      setSidebarOpen(true)
      setSelectedFast(data.best.fast)
      selectedFastRef.current = data.best.fast
      setSelectedSlow(data.best.slow)
      selectedSlowRef.current = data.best.slow
      setSelectedSlowSmooth(data.best.slowSmooth || 30)
      selectedSlowSmoothRef.current = data.best.slowSmooth || 30
      // 重新计算 KAMA 线
      recalculateMA(data.best.fast, data.best.slow, data.best.slowSmooth || 30)
    } catch (e) {
      console.error('网格搜索失败:', e)
    }
    setGridLoading(false)
  }, [])

  // 切换多/空显示
  const toggleLong = useCallback(() => {
    console.log('toggleLong called, showBestSignals:', showBestSignalsRef.current)
    setShowLongTrades(prev => {
      if (!showBestSignalsRef.current) { console.log('blocked: no signals'); return prev }
      const next = !prev
      showLongTradesRef.current = next
      console.log('long toggled to:', next)
      return next
    })
  }, [])

  const toggleShort = useCallback(() => {
    console.log('toggleShort called, showBestSignals:', showBestSignalsRef.current)
    setShowShortTrades(prev => {
      if (!showBestSignalsRef.current) { console.log('blocked: no signals'); return prev }
      const next = !prev
      showShortTradesRef.current = next
      console.log('short toggled to:', next)
      return next
    })
  }, [])

  // 选择参数行
  const selectParamRow = useCallback((fast, slow, slowSmooth) => {
    setSelectedFast(fast)
    selectedFastRef.current = fast
    setSelectedSlow(slow)
    selectedSlowRef.current = slow
    setSelectedSlowSmooth(slowSmooth)
    selectedSlowSmoothRef.current = slowSmooth
    recalculateMA(fast, slow, slowSmooth)
  }, [recalculateMA])

  // 标记/取消买卖点
  const toggleBestSignals = useCallback(() => {
    const next = !showBestSignalsRef.current
    showBestSignalsRef.current = next
    setShowBestSignals(next)
  }, [])

  // 在状态变化时应用 markers（useEffect 确保在渲染完成后执行）
  useEffect(() => {
    if (!showBestSignalsRef.current) {
      candleSeriesRef.current?.setMarkers([])
      return
    }

    const buildMarkers = () => {
      if (!gridResultsRef.current?.trades) return []

      const candleData = dataRef.current
      const timeMap = new Map()
      for (const c of candleData) {
        timeMap.set(c.time, c.time)
      }

      // 收集所有 marker（含时间戳），然后处理同时间点冲突
      const rawMarkers = []
      for (const t of gridResultsRef.current.trades) {
        const isLong = t.direction === 'long'
        // 根据多空开关过滤（使用 ref 确保定时器读到最新值）
        if (isLong && !showLongTradesRef.current) continue
        if (!isLong && !showShortTradesRef.current) continue

        const buyTime = timeMap.get(t.buyTime)
        const sellTime = timeMap.get(t.sellTime)

        if (isLong) {
          // 做多：绿色 ↑ 开多，红色 ↓ 平多
          if (buyTime !== undefined) {
            rawMarkers.push({
              time: buyTime,
              position: 'belowBar',
              color: '#00FF00',
              shape: 'arrowUp',
              text: '开多',
            })
          }
          if (sellTime !== undefined) {
            rawMarkers.push({
              time: sellTime,
              position: 'aboveBar',
              color: '#FF4444',
              shape: 'arrowDown',
              text: '平多',
            })
          }
        } else {
          // 做空：蓝色 ↓ 开空，黄色 ↑ 平空
          if (buyTime !== undefined) {
            rawMarkers.push({
              time: buyTime,
              position: 'aboveBar',
              color: '#4488FF',
              shape: 'arrowDown',
              text: '开空',
            })
          }
          if (sellTime !== undefined) {
            rawMarkers.push({
              time: sellTime,
              position: 'belowBar',
              color: '#FFAA00',
              shape: 'arrowUp',
              text: '平空',
            })
          }
        }
      }

      // 合并同一时间戳的 marker（反手时平仓+开仓同时间，需合并显示）
      const timeGroupMap = new Map()
      for (const m of rawMarkers) {
        if (!timeGroupMap.has(m.time)) timeGroupMap.set(m.time, [])
        timeGroupMap.get(m.time).push(m)
      }

      const markers = []
      for (const [time, group] of timeGroupMap) {
        if (group.length === 1) {
          markers.push(group[0])
        } else {
          // 同一时间有多个 marker → 反手操作，合并为一个
          const hasClose = group.some(m => m.text.startsWith('平'))
          const hasOpen = group.some(m => m.text.startsWith('开'))

          if (hasClose && hasOpen) {
            // 根据平仓方向判断：平多→开空，平空→开多
            const closingLong = group.some(m => m.text === '平多')
            if (closingLong) {
              markers.push({
                time,
                position: 'aboveBar',
                color: '#4488FF',
                shape: 'arrowDown',
                text: '平多开空',
              })
            } else {
              markers.push({
                time,
                position: 'belowBar',
                color: '#00FF00',
                shape: 'arrowUp',
                text: '平空开多',
              })
            }
          } else {
            // 其他冲突取最后一个
            markers.push(group[group.length - 1])
          }
        }
      }

      markers.sort((a, b) => a.time - b.time)
      return markers
    }

    const markers = buildMarkers()
    console.log('标记: 预期', markers.length, '个')
    if (markers.length > 0) {
      console.log('前3个:', markers.slice(0, 3))
    }

    if (markers.length > 0) {
      candleSeriesRef.current?.setMarkers(markers)
      const after = candleSeriesRef.current?.markers()
      console.log('set markers:', markers.length, 'actual:', after?.length)
    } else {
      // 清除 markers 并强制重绘
      const range = chartRef.current?.timeScale().getVisibleLogicalRange()
      candleSeriesRef.current?.setMarkers([])
      // 恢复视图范围触发重绘
      if (range) {
        chartRef.current?.timeScale().setVisibleLogicalRange(range)
      }
    }

  }, [showBestSignals, showLongTrades, showShortTrades])

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

  // MA5显示/隐藏切换
  useEffect(() => {
    if (ma5SeriesRef.current) {
      ma5SeriesRef.current.applyOptions({ visible: showMA5 })
    }
  }, [showMA5])

  // MA10显示/隐藏切换
  useEffect(() => {
    if (ma10SeriesRef.current) {
      ma10SeriesRef.current.applyOptions({ visible: showMA10 })
    }
  }, [showMA10])

  // 侧边栏拖拽调整宽度
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingRef.current) return
      const newWidth = Math.max(300, Math.min(800, e.clientX))
      setSidebarWidth(newWidth)
    }
    const handleMouseUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // 拖拽过程中触发图表重绘
  useEffect(() => {
    if (!sidebarOpen || !draggingRef.current) return
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        height: chartContainerRef.current.clientHeight,
        width: chartContainerRef.current.clientWidth
      })
    }
    if (volumeChartRef.current && volumeContainerRef.current) {
      volumeChartRef.current.applyOptions({
        height: volumeContainerRef.current.clientHeight,
        width: volumeContainerRef.current.clientWidth
      })
    }
  }, [sidebarWidth])

  // 侧边栏开关/宽度变化时触发图表重绘
  useEffect(() => {
    setTimeout(() => {
      if (chartRef.current) {
        const container = chartContainerRef.current
        if (container) {
          chartRef.current.applyOptions({
            height: container.clientHeight,
            width: container.clientWidth
          })
        }
      }
      if (volumeChartRef.current) {
        const container = volumeContainerRef.current
        if (container) {
          volumeChartRef.current.applyOptions({
            height: container.clientHeight,
            width: container.clientWidth
          })
        }
      }
    }, 50)
  }, [sidebarOpen, sidebarWidth])

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      backgroundColor: COLORS.background,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{
        height: '40px',
        borderBottom: '1px solid #1e222d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        flexShrink: 0
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

      {/* 指标工具栏 */}
      <div style={{
        height: '30px',
        borderBottom: '1px solid #1e222d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        flexShrink: 0
      }}>
        <button
          onClick={() => setShowMA5(!showMA5)}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            border: '1px solid ' + (showMA5 ? COLORS.ma5 : COLORS.grid),
            backgroundColor: showMA5 ? COLORS.ma5 : 'transparent',
            color: showMA5 ? '#000' : COLORS.text,
            cursor: 'pointer',
            borderRadius: '4px'
          }}
        >
          KAMA{selectedFast || 5}
        </button>
        <button
          onClick={() => setShowMA10(!showMA10)}
          style={{
            marginLeft: '10px',
            padding: '4px 12px',
            fontSize: '12px',
            border: '1px solid ' + (showMA10 ? COLORS.ma10 : COLORS.grid),
            backgroundColor: showMA10 ? COLORS.ma10 : 'transparent',
            color: showMA10 ? '#000' : COLORS.text,
            cursor: 'pointer',
            borderRadius: '4px'
          }}
        >
          KAMA{selectedSlow || 10}
        </button>
        <button
          onClick={handleGridSearch}
          disabled={gridLoading}
          style={{
            marginLeft: '10px',
            padding: '4px 12px',
            fontSize: '12px',
            border: '1px solid ' + (gridResults ? COLORS.ma5 : COLORS.grid),
            backgroundColor: gridResults ? COLORS.ma5 : 'transparent',
            color: gridResults ? '#000' : COLORS.text,
            cursor: gridLoading ? 'default' : 'pointer',
            borderRadius: '4px',
            opacity: gridLoading ? 0.6 : 1
          }}
        >
          {gridLoading ? '搜索中...' : '网格搜索'}
        </button>
        <button onClick={handleRefresh}
          style={{
            marginLeft: '10px',
            padding: '4px 12px',
            fontSize: '12px',
            border: '1px solid ' + '#1890ff',
            backgroundColor: '#1890ff',
            color: '#fff',
            cursor: 'pointer',
            borderRadius: '4px'
          }}>
          刷新
        </button>
        {gridResults && !sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)}
            style={{
              marginLeft: '10px',
              padding: '4px 12px',
              fontSize: '12px',
              border: '1px solid ' + COLORS.ma5,
              backgroundColor: 'transparent',
              color: COLORS.ma5,
              cursor: 'pointer',
              borderRadius: '4px'
            }}>
            📊 查看结果
          </button>
        )}
      </div>

      {/* 主内容区：侧边栏 + 图表 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* 左侧侧边栏 */}
        {gridResults && sidebarOpen && (
          <>
            <div style={{
              width: sidebarWidth + 'px',
              minWidth: sidebarWidth + 'px',
              height: '100%',
              backgroundColor: '#131722',
              borderRight: '1px solid #2a2e39',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}>
              {/* 侧边栏头部 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2e39', flexShrink: 0 }}>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.text }}>网格搜索结果</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={toggleLong}
                    style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid ' + (showLongTrades ? COLORS.up : COLORS.grid), backgroundColor: showBestSignals ? (showLongTrades ? COLORS.up : 'transparent') : COLORS.grid, color: showBestSignals ? (showLongTrades ? '#fff' : COLORS.text) : '#555', cursor: showBestSignals ? 'pointer' : 'not-allowed', borderRadius: '4px', opacity: showBestSignals ? 1 : 0.5 }}>
                    多
                  </button>
                  <button onClick={toggleShort}
                    style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid ' + (showShortTrades ? COLORS.down : COLORS.grid), backgroundColor: showBestSignals ? (showShortTrades ? COLORS.down : 'transparent') : COLORS.grid, color: showBestSignals ? (showShortTrades ? '#000' : COLORS.text) : '#555', cursor: showBestSignals ? 'pointer' : 'not-allowed', borderRadius: '4px', opacity: showBestSignals ? 1 : 0.5 }}>
                    空
                  </button>
                  <button onClick={toggleBestSignals}
                    style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid ' + (showBestSignals ? COLORS.ma5 : COLORS.grid), backgroundColor: showBestSignals ? COLORS.ma5 : 'transparent', color: showBestSignals ? '#000' : COLORS.text, cursor: 'pointer', borderRadius: '4px' }}>
                    {showBestSignals ? '隐藏标记' : '标记买卖点'}
                  </button>
                  <button onClick={() => { setGridResults(null); setShowBestSignals(false); showBestSignalsRef.current = false; gridResultsRef.current = null; setSidebarOpen(false); showLongTradesRef.current = true; showShortTradesRef.current = true; setShowLongTrades(true); setShowShortTrades(true) }}
                    style={{ padding: '3px 8px', fontSize: '14px', border: '1px solid #333', backgroundColor: 'transparent', color: COLORS.text, cursor: 'pointer', borderRadius: '4px' }}>✕</button>
                </div>
              </div>

              {/* 最优参数摘要 */}
              <div style={{ padding: '12px 16px', backgroundColor: '#1e222d', borderBottom: '1px solid #2a2e39', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                <span style={{ color: COLORS.text, fontSize: '12px' }}>最优参数：</span>
                <span style={{ color: COLORS.ma5, fontWeight: 'bold', fontSize: '13px' }}>KAMA ER{gridResults.best.fast}/{gridResults.best.slow} S={gridResults.best.slowSmooth || 30}</span>
                <span style={{ color: gridResults.best.totalReturn >= 0 ? COLORS.up : COLORS.down, fontWeight: 'bold', fontSize: '14px' }}>
                  {(gridResults.best.totalReturn >= 0 ? '+' : '') + (gridResults.best.totalReturn * 100).toFixed(2)}%
                </span>
                <span style={{ color: COLORS.text, fontSize: '11px' }}>交易 {gridResults.best.numTrades} 次 | 胜率 {(gridResults.best.winRate * 100).toFixed(1)}%</span>
              </div>

              {/* 结果表格 */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2a2e39', position: 'sticky', top: 0, backgroundColor: '#131722' }}>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'center', width: '30px' }}>选择</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'center' }}>排名</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'center' }}>快线ER</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'center' }}>慢线ER</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'center' }}>S平滑</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'right' }}>期望值</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'right' }}>总收益率</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'center' }}>交易次数</th>
                      <th style={{ padding: '8px', color: '#787b86', textAlign: 'right' }}>胜率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridResults.results.map((r, i) => {
                      const isSelected = selectedFast === r.fast && selectedSlow === r.slow && selectedSlowSmooth === (r.slowSmooth || 30)
                      return (
                        <tr key={r.fast + '-' + r.slow + '-' + (r.slowSmooth || 30)} style={{
                          borderBottom: '1px solid #1e222d',
                          backgroundColor: isSelected ? '#2a2e39' : (i === 0 ? '#1e222d' : 'transparent'),
                          cursor: 'pointer'
                        }} onClick={() => selectParamRow(r.fast, r.slow, r.slowSmooth || 30)}>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <input type="radio" name="paramSelect" checked={isSelected} readOnly />
                          </td>
                          <td style={{ padding: '6px', color: isSelected ? COLORS.ma5 : (i === 0 ? COLORS.ma5 : COLORS.text), textAlign: 'center', fontWeight: i === 0 ? 'bold' : 'normal' }}>{i + 1}</td>
                          <td style={{ padding: '6px', color: COLORS.ma5, textAlign: 'center' }}>{r.fast}</td>
                          <td style={{ padding: '6px', color: COLORS.ma10, textAlign: 'center' }}>{r.slow}</td>
                          <td style={{ padding: '6px', color: COLORS.text, textAlign: 'center' }}>{r.slowSmooth || 30}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: r.expectancy >= 0 ? COLORS.up : COLORS.down, fontWeight: 'bold' }}>
                            {(r.expectancy >= 0 ? '+' : '') + (r.expectancy * 100).toFixed(2)}%
                          </td>
                          <td style={{ padding: '6px', textAlign: 'right', color: r.totalReturn >= 0 ? COLORS.up : COLORS.down, fontWeight: 'bold' }}>
                            {(r.totalReturn >= 0 ? '+' : '') + (r.totalReturn * 100).toFixed(2)}%
                          </td>
                          <td style={{ padding: '6px', color: COLORS.text, textAlign: 'center' }}>{r.numTrades}</td>
                          <td style={{ padding: '6px', color: COLORS.text, textAlign: 'right' }}>{(r.winRate * 100).toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* 拖拽调整宽度的边缘 */}
            <div
              onMouseDown={() => {
                draggingRef.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
              style={{
                width: '4px',
                cursor: 'col-resize',
                backgroundColor: '#2a2e39',
                position: 'relative',
                zIndex: 100,
                flexShrink: 0
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = COLORS.ma5}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2a2e39'}
            />
          </>
        )}

        {/* 图表区域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ flex: 3, position: 'relative', minHeight: 0 }}>
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <div ref={volumeContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

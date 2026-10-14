// Knowledge Graph Visualization - D3.js Force Directed Graph
// Obsidian-style graph view for Jekyll blog

(function() {
  // Configuration
  const CONFIG = {
    colors: {
      post: '#6366f1',
      tag: '#f59e0b',
      category: '#10b981',
      edge: {
        tag: '#f59e0b',
        category: '#10b981',
        similarity: '#8b5cf6',
        explicit: '#ef4444'
      }
    },
    nodeSize: {
      post: { base: 8, scale: 4 },
      tag: { base: 12, scale: 6 },
      category: { base: 16, scale: 8 }
    },
    forces: {
      force: { linkDistance: 80, charge: -300, centerForce: 0.3 },
      radial: { linkDistance: 100, charge: -200, centerForce: 0.1 },
      hierarchical: { linkDistance: 120, charge: -150, centerForce: 0.05 }
    }
  };

  // State
  let graphData = null;
  let simulation = null;
  let svg = null;
  let g = null;
  let tooltip = null;
  let currentLayout = 'force';
  let nodeFilter = 'all';
  let edgeFilter = 'all';
  let zoom = null;
  let selectedNode = null;
  let currentNodes = [];
  let currentEdges = [];

  // DOM Elements
  const svgEl = document.getElementById('graph-svg');
  const tooltipEl = document.getElementById('graph-tooltip');
  const statsEl = document.getElementById('graph-stats');
  const filterTypeEl = document.getElementById('filter-type');
  const filterConnectionEl = document.getElementById('filter-connection');
  const layoutTypeEl = document.getElementById('layout-type');
  const resetViewBtn = document.getElementById('reset-view');
  const fitViewBtn = document.getElementById('fit-view');

  if (!svgEl || !tooltipEl) {
    console.warn('Graph elements not found');
    return;
  }

  // Initialize
  async function init() {
    try {
      await loadGraphData();
      setupSVG();
      setupControls();
      renderGraph();
      updateStats();
    } catch (e) {
      console.error('Graph init failed:', e);
      showError('无法加载图谱数据');
    }
  }

  async function loadGraphData() {
    const baseUrl = window.location.pathname.includes('/Asahina.github.io/')
      ? '/Asahina.github.io'
      : '';
    const response = await fetch(`${baseUrl}/assets/data/graph.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    graphData = await response.json();
    console.log('Graph loaded:', graphData.meta);
  }

  function setupSVG() {
    const container = document.querySelector('.graph-canvas-wrapper');
    const rect = container.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    svg = d3.select('#graph-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('cursor', 'grab');

    // Define gradients and markers
    const defs = svg.append('defs');

    // Arrow markers for edges
    ['tag', 'category', 'similarity', 'explicit'].forEach(type => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', CONFIG.colors.edge[type]);
    });

    // Node gradients
    ['post', 'tag', 'category'].forEach(type => {
      const grad = defs.append('radialGradient')
        .attr('id', `grad-${type}`);
      grad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', CONFIG.colors[type])
        .attr('stop-opacity', 1);
      grad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', CONFIG.colors[type])
        .attr('stop-opacity', 0.3);
    });

    // Glow filter
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Main group for zoom/pan
    g = svg.append('g');

    // Zoom behavior
    zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Double-click to reset zoom
    svg.on('dblclick.zoom', null);
    svg.on('dblclick', () => {
      svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity
      );
    });

    // Drag to pan
    svg.call(d3.drag()
      .on('start', () => svg.style('cursor', 'grabbing'))
      .on('end', () => svg.style('cursor', 'grab'))
    );
  }

  function setupControls() {
    filterTypeEl?.addEventListener('change', (e) => {
      nodeFilter = e.target.value;
      restartSimulation();
    });

    filterConnectionEl?.addEventListener('change', (e) => {
      edgeFilter = e.target.value;
      restartSimulation();
    });

    layoutTypeEl?.addEventListener('change', (e) => {
      currentLayout = e.target.value;
      restartSimulation();
    });

    resetViewBtn?.addEventListener('click', () => {
      svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity
      );
    });

    fitViewBtn?.addEventListener('click', fitToView);
  }

  function renderGraph() {
    if (!graphData) return;
    if (simulation) simulation.stop();

    const { nodes, edges } = graphData;
    const width = +svg.attr('width');
    const height = +svg.attr('height');

    // Filter nodes
    let filteredNodes = nodes;
    if (nodeFilter !== 'all') {
      filteredNodes = nodes.filter(n => n.type === nodeFilter);
    }
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    // Filter edges
    // 注意：forceLink 会把 source/target 从 id 字符串替换为节点对象，
    // 二次渲染时必须先取出 id 再比对，否则连线会被全部过滤掉
    let filteredEdges = edges.filter(e => {
      const s = e.source.id || e.source;
      const t = e.target.id || e.target;
      return filteredNodeIds.has(s) && filteredNodeIds.has(t);
    });
    if (edgeFilter !== 'all') {
      filteredEdges = filteredEdges.filter(e => e.type === edgeFilter);
    }

    currentNodes = filteredNodes;
    currentEdges = filteredEdges;

    // Create simulation
    const forceConfig = CONFIG.forces[currentLayout];

    simulation = d3.forceSimulation(filteredNodes)
      .force('link', d3.forceLink(filteredEdges)
        .id(d => d.id)
        .distance(d => forceConfig.linkDistance / Math.sqrt(d.weight || 1))
        .strength(0.7))
      .force('charge', d3.forceManyBody()
        .strength(forceConfig.charge)
        .distanceMax(300))
      .force('center', d3.forceCenter(width / 2, height / 2)
        .strength(forceConfig.centerForce))
      .force('collision', d3.forceCollide()
        .radius(d => getNodeRadius(d) + 4)
        .strength(0.5))
      .on('tick', ticked);

    // Draw edges
    const link = g.selectAll('.graph-link')
      .data(filteredEdges, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    link.exit().remove();

    const linkEnter = link.enter()
      .append('line')
      .attr('class', 'graph-link')
      .on('mouseenter', (event, d) => highlightEdge(event.currentTarget, d, true))
      .on('mouseleave', (event, d) => highlightEdge(event.currentTarget, d, false));

    link.merge(linkEnter)
      .attr('stroke-width', d => Math.max(1, (d.weight || 1) * 1.5))
      .attr('stroke', d => CONFIG.colors.edge[d.type] || '#999')
      .attr('stroke-dasharray', d => d.type === 'similarity' ? '4,2' : 'none')
      .attr('marker-end', d => `url(#arrow-${d.type})`)
      .style('opacity', 0.6);

    // Draw nodes
    const node = g.selectAll('.graph-node')
      .data(filteredNodes, d => d.id);

    node.exit().remove();

    const nodeEnter = node.enter()
      .append('g')
      .attr('class', 'graph-node')
      .attr('data-id', d => d.id)
      .attr('data-type', d => d.type)
      .call(drag(simulation))
      .on('click', (event, d) => handleNodeClick(event, d))
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mouseleave', hideTooltip);

    nodeEnter.append('circle')
      .attr('stroke-width', 2)
      .style('filter', 'url(#glow)');

    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', d => getNodeRadius(d) + 14)
      .attr('font-size', '11px')
      .attr('pointer-events', 'none');

    const nodeAll = node.merge(nodeEnter);
    nodeAll.select('circle')
      .attr('r', getNodeRadius)
      .attr('fill', d => `url(#grad-${d.type})`)
      .attr('stroke', d => CONFIG.colors[d.type]);
    nodeAll.select('text')
      .text(d => d.label.length > 18 ? d.label.slice(0, 18) + '...' : d.label)
      .style('opacity', d => d.type === 'post' ? 0 : 1);

    function ticked() {
      // Update edges
      g.selectAll('.graph-link')
        .attr('x1', d => (d.source.x ?? 0))
        .attr('y1', d => (d.source.y ?? 0))
        .attr('x2', d => (d.target.x ?? 0))
        .attr('y2', d => (d.target.y ?? 0));

      // Update nodes
      g.selectAll('.graph-node')
        .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }

    function drag(sim) {
      return d3.drag()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });
    }

    function getNodeRadius(d) {
      const cfg = CONFIG.nodeSize[d.type] || CONFIG.nodeSize.post;
      const count = d.count || 1;
      return cfg.base + Math.min(cfg.scale, Math.log(count + 1) * 2);
    }
  }

  function restartSimulation() {
    if (simulation) {
      simulation.stop();
    }
    renderGraph();
  }

  function handleNodeClick(event, d) {
    event.stopPropagation();

    // Toggle selection
    if (selectedNode === d.id) {
      selectedNode = null;
      g.selectAll('.graph-node').classed('selected', false);
      g.selectAll('.graph-link').style('opacity', 0.6);
    } else {
      selectedNode = d.id;
      g.selectAll('.graph-node').classed('selected', n => n.id === d.id);
      highlightConnected(d.id, true);
    }

    // Navigate to post on double-click
    if (d.type === 'post' && d.url) {
      window.location.href = d.url;
    }
  }

  function highlightConnected(nodeId, on) {
    const opacity = on ? 0.1 : 0.6;
    g.selectAll('.graph-link')
      .style('opacity', l => {
        const connected = (l.source.id || l.source) === nodeId || (l.target.id || l.target) === nodeId;
        return connected ? 1 : opacity;
      });

    g.selectAll('.graph-node')
      .style('opacity', n => {
        if (n.id === nodeId) return 1;
        // Check if connected
        const linked = currentEdges.some(l =>
          ((l.source.id || l.source) === nodeId && (l.target.id || l.target) === n.id) ||
          ((l.target.id || l.target) === nodeId && (l.source.id || l.source) === n.id)
        );
        return linked ? 0.6 : opacity;
      });
  }

  function highlightEdge(element, edge, on) {
    if (on) {
      d3.select(element)
        .attr('stroke-width', 4)
        .style('opacity', 1);
      // Highlight connected nodes
      const sourceId = edge.source.id || edge.source;
      const targetId = edge.target.id || edge.target;
      g.selectAll('.graph-node')
        .style('opacity', n => n.id === sourceId || n.id === targetId ? 1 : 0.3);
    } else {
      d3.select(element)
        .attr('stroke-width', d => Math.max(1, (d.weight || 1) * 1.5))
        .style('opacity', 0.6);
      g.selectAll('.graph-node').style('opacity', 1);
    }
  }

  function showTooltip(event, d) {
    const tags = d.tags || [];
    const categories = d.categories || [];
    let html = '';
    if (d.type === 'post') {
      html = `
        <strong>${escapeHtml(d.label)}</strong>
        <div class="tooltip-meta">${d.date || ''}</div>
        <div class="tooltip-excerpt">${escapeHtml(d.excerpt)}</div>
        ${tags.length ? `<div class="tooltip-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${categories.length ? `<div class="tooltip-cats">${categories.map(c => `<span class="cat">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
        <div class="tooltip-action">点击查看详情</div>
      `;
    } else if (d.type === 'tag') {
      html = `<strong>#${escapeHtml(d.label)}</strong><div class="tooltip-meta">${d.count} 篇文章</div>`;
    } else if (d.type === 'category') {
      html = `<strong>${escapeHtml(d.label)}</strong><div class="tooltip-meta">${d.count} 篇文章</div>`;
    }

    tooltipEl.innerHTML = html;
    tooltipEl.style.opacity = '1';
    // tooltip 位于 .graph-canvas-wrapper（position: relative）内，
    // 必须把视口坐标换算为相对容器的坐标，否则页面滚动后会错位
    const wrap = document.querySelector('.graph-canvas-wrapper');
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      let left = event.clientX - rect.left + 12;
      if (left + 300 > rect.width) left = Math.max(4, event.clientX - rect.left - 312);
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${Math.max(4, event.clientY - rect.top - 12)}px`;
    }
  }

  function hideTooltip() {
    tooltipEl.style.opacity = '0';
  }

  function fitToView() {
    const nodes = currentNodes;
    if (nodes.length === 0) return;

    const bounds = nodes.reduce((acc, n) => {
      const r = getNodeRadius(n);
      return {
        minX: Math.min(acc.minX, (n.x || 0) - r),
        maxX: Math.max(acc.maxX, (n.x || 0) + r),
        minY: Math.min(acc.minY, (n.y || 0) - r),
        maxY: Math.max(acc.maxY, (n.y || 0) + r)
      };
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

    const width = +svg.attr('width');
    const height = +svg.attr('height');
    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    const scale = Math.min(width / dx, height / dy) * 0.85;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    svg.transition().duration(750).call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy)
    );
  }

  function getNodeRadius(d) {
    const cfg = CONFIG.nodeSize[d.type] || CONFIG.nodeSize.post;
    const count = d.count || 1;
    return cfg.base + Math.min(cfg.scale, Math.log(count + 1) * 2);
  }

  function updateStats() {
    if (!graphData || !statsEl) return;
    const { nodes, edges, meta } = graphData;
    statsEl.innerHTML = `
      <span>节点: <strong>${nodes.length}</strong> (文章: ${nodes.filter(n => n.type === 'post').length}, 标签: ${nodes.filter(n => n.type === 'tag').length}, 分类: ${nodes.filter(n => n.type === 'category').length})</span>
      <span>连接: <strong>${edges.length}</strong></span>
      <span>生成: ${new Date(meta.generated_at).toLocaleString()}</span>
    `;
  }

  function showError(msg) {
    const container = document.querySelector('.graph-canvas-wrapper');
    if (container) {
      container.innerHTML = `<div class="graph-error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${msg}</p></div>`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Load D3 if not present
  function loadD3() {
    return new Promise((resolve, reject) => {
      if (window.d3) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Start
  loadD3().then(init).catch(e => {
    console.error('D3 load failed:', e);
    showError('D3.js 加载失败，请检查网络');
  });
})();

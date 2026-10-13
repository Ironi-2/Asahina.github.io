---
layout: default
title: "知识图谱"
permalink: /graph/
---

<div id="graph-container" class="graph-container">
  <div class="graph-header">
    <h1>知识图谱</h1>
    <p class="graph-subtitle">文章、标签与分类的关联网络</p>
  </div>

  <div class="graph-controls">
    <div class="control-group">
      <label for="filter-type">节点类型</label>
      <select id="filter-type" class="control-select">
        <option value="all">全部</option>
        <option value="post">文章</option>
        <option value="tag">标签</option>
        <option value="category">分类</option>
      </select>
    </div>

    <div class="control-group">
      <label for="filter-connection">连接类型</label>
      <select id="filter-connection" class="control-select">
        <option value="all">全部连接</option>
        <option value="tag">标签关联</option>
        <option value="category">分类关联</option>
        <option value="similarity">内容相似</option>
        <option value="explicit">显式引用</option>
      </select>
    </div>

    <div class="control-group">
      <label for="layout-type">布局</label>
      <select id="layout-type" class="control-select">
        <option value="force">力导向</option>
        <option value="radial">放射状</option>
        <option value="hierarchical">层级</option>
      </select>
    </div>

    <button id="reset-view" class="btn btn-sm" title="重置视图">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M21 12a9 9 0 10-9 9 9.75 9.75 0 006.74-2.74L21 16"/></svg>
      重置
    </button>

    <button id="fit-view" class="btn btn-sm" title="适应视图">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      适应
    </button>
  </div>

  <div class="graph-canvas-wrapper">
    <svg id="graph-svg" class="graph-svg"></svg>
    <div id="graph-tooltip" class="graph-tooltip" role="tooltip"></div>
  </div>

  <div class="graph-legend">
    <div class="legend-item">
      <span class="legend-color" style="background: var(--color-post)"></span>
      <span>文章</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background: var(--color-tag)"></span>
      <span>标签</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background: var(--color-category)"></span>
      <span>分类</span>
    </div>
    <div class="legend-divider"></div>
    <div class="legend-item">
      <span class="legend-line" style="border-color: var(--color-edge-tag)"></span>
      <span>标签关联</span>
    </div>
    <div class="legend-item">
      <span class="legend-line" style="border-color: var(--color-edge-category)"></span>
      <span>分类关联</span>
    </div>
    <div class="legend-item">
      <span class="legend-line" style="border-color: var(--color-edge-similarity)"></span>
      <span>内容相似</span>
    </div>
    <div class="legend-item">
      <span class="legend-line" style="border-color: var(--color-edge-explicit)"></span>
      <span>显式引用</span>
    </div>
  </div>

  <div id="graph-stats" class="graph-stats"></div>
</div>

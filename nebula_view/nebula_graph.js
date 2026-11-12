/**
 * nebula_graph.js
 * Cosmic Nebula Force Simulation & Interactive Celestial Viewer Engine
 * Canvas 2D + D3.js Force Layout + Glassmorphism UI Controller
 */

(function() {
  'use strict';

  // --- Global State & Configuration ---
  const state = {
    data: null,
    nodes: [],
    links: [],
    nodeMap: new Map(),
    clusters: new Map(),
    transform: { x: 0, y: 0, k: 1 },
    targetTransform: null,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    hasDragged: false,
    hoveredNode: null,
    selectedNode: null,
    connectedNodeIds: new Set(),
    connectedLinkIds: new Set(),
    searchQuery: '',
    searchMatches: new Set(),
    currentFilter: 'all',
    dustParticles: [],
    photons: [],
    animFrameId: null,
    d3Sim: null
  };

  // DOM Elements
  const canvas = document.getElementById('nebula-canvas');
  const ctx = canvas.getContext('2d');
  const viewportContainer = document.getElementById('viewport-container');
  const hudTooltip = document.getElementById('hud-tooltip');
  const detailDrawer = document.getElementById('detail-drawer');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const searchCount = document.getElementById('search-results-count');
  const zoomDisplay = document.getElementById('zoom-level-display');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnResetView = document.getElementById('btn-reset-view');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const btnCopyPath = document.getElementById('btn-copy-path');
  const filterPillsContainer = document.getElementById('filter-pills');

  // --- Initialization ---
  async function init() {
    setupCanvas();
    window.addEventListener('resize', onResize);

    // 1. Load Data (Dual-mode: memory window.NEBULA_DATA first, then fetch)
    if (window.NEBULA_DATA) {
      loadGraphData(window.NEBULA_DATA);
    } else {
      try {
        const resp = await fetch('nebula_data.json');
        const data = await resp.json();
        loadGraphData(data);
      } catch (err) {
        console.error('Failed to load nebula graph data:', err);
      }
    }

    // 2. Setup Events
    setupEvents();
    initDustParticles(320);

    // 3. Start Animation Loop
    requestAnimationFrame(render);
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = viewportContainer.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    state.width = rect.width;
    state.height = rect.height;
  }

  function onResize() {
    setupCanvas();
    if (state.d3Sim) {
      state.d3Sim.alpha(0.1).restart();
    }
  }

  // --- Data Loading & Force Simulation ---
  function loadGraphData(rawData) {
    state.data = rawData;
    state.nodes = rawData.nodes.map(n => Object.assign({}, n));
    state.links = rawData.links.map(l => Object.assign({}, l));

    state.nodeMap.clear();
    state.nodes.forEach(n => state.nodeMap.set(n.id, n));

    state.clusters.clear();
    (rawData.clusters || []).forEach(c => state.clusters.set(c.id, c));

    // Update filter badges in DOM
    const badgeAll = document.getElementById('badge-all');
    const badgeDocs = document.getElementById('badge-docs');
    const badgeSkills = document.getElementById('badge-skills');
    const badgeModules = document.getElementById('badge-modules');

    if (badgeAll) badgeAll.textContent = state.nodes.length;
    if (badgeDocs) badgeDocs.textContent = state.nodes.filter(n => n.type === 'document').length;
    if (badgeSkills) badgeSkills.textContent = state.nodes.filter(n => n.type === 'skill').length;
    if (badgeModules) badgeModules.textContent = state.nodes.filter(n => n.type !== 'document' && n.type !== 'skill').length;

    const statsText = document.getElementById('stats-text');
    if (statsText) {
      statsText.textContent = `天体系统就绪: ${state.nodes.length} 恒星 · ${state.links.length} 引力连线`;
    }

    // Centering setup
    state.transform.x = state.width / 2;
    state.transform.y = state.height / 2;
    state.transform.k = 0.85;
    updateZoomDisplay();

    // D3 Force Simulation Setup
    const clusterPositions = {
      'galaxy-documents': { x: -320, y: -140 },
      'galaxy-skills': { x: 320, y: -80 },
      'galaxy-modules': { x: 0, y: 280 }
    };

    state.d3Sim = d3.forceSimulation(state.nodes)
      .force('link', d3.forceLink(state.links)
        .id(d => d.id)
        .distance(d => d.distance || 70)
        .strength(0.65)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => -Math.pow(d.size || 16, 1.35) * 18)
      )
      .force('collide', d3.forceCollide()
        .radius(d => (d.size || 16) + 12)
        .iterations(2)
      )
      .force('clusterX', d3.forceX(d => {
        const cp = clusterPositions[d.cluster] || { x: 0, y: 0 };
        return cp.x;
      }).strength(0.12))
      .force('clusterY', d3.forceY(d => {
        const cp = clusterPositions[d.cluster] || { x: 0, y: 0 };
        return cp.y;
      }).strength(0.12))
      .alpha(1)
      .alphaDecay(0.022);

    // Initial photons setup for luminous link animation
    initPhotons(25);
  }

  // --- Cosmic Dust & Photons Background ---
  function initDustParticles(count) {
    state.dustParticles = [];
    for (let i = 0; i < count; i++) {
      state.dustParticles.push({
        x: (Math.random() - 0.5) * 2600,
        y: (Math.random() - 0.5) * 2000,
        radius: Math.random() * 1.5 + 0.4,
        alpha: Math.random() * 0.7 + 0.2,
        speed: (Math.random() * 0.008 + 0.003),
        phase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.6 ? '#00f2fe' : (Math.random() > 0.3 ? '#b388ff' : '#ffffff')
      });
    }
  }

  function initPhotons(count) {
    state.photons = [];
    for (let i = 0; i < count; i++) {
      state.photons.push({
        linkIndex: Math.floor(Math.random() * (state.links.length || 1)),
        progress: Math.random(),
        speed: Math.random() * 0.008 + 0.004
      });
    }
  }

  // --- Rendering Loop ---
  function render(time) {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);

    // Smooth transform transition (tween)
    if (state.targetTransform) {
      const tt = state.targetTransform;
      const ease = 0.15;
      state.transform.x += (tt.x - state.transform.x) * ease;
      state.transform.y += (tt.y - state.transform.y) * ease;
      state.transform.k += (tt.k - state.transform.k) * ease;
      updateZoomDisplay();
      if (Math.abs(tt.x - state.transform.x) < 0.5 &&
          Math.abs(tt.y - state.transform.y) < 0.5 &&
          Math.abs(tt.k - state.transform.k) < 0.005) {
        state.transform.x = tt.x;
        state.transform.y = tt.y;
        state.transform.k = tt.k;
        state.targetTransform = null;
      }
    }

    // 1. Draw Deep Space Background
    drawSpaceBackground();

    // 2. Apply Camera Viewport Transform
    ctx.save();
    ctx.translate(state.transform.x, state.transform.y);
    ctx.scale(state.transform.k, state.transform.k);

    // 3. Draw Cosmic Nebula Gas Clouds
    drawNebulaClouds(time);

    // 4. Draw Cosmic Dust Particles
    drawDustParticles(time);

    // 5. Draw Gravitational Luminous Filaments (Links)
    drawLinks(time);

    // 6. Draw Celestial Stars (Nodes)
    drawNodes(time);

    ctx.restore();
    ctx.restore();

    state.animFrameId = requestAnimationFrame(render);
  }

  function drawSpaceBackground() {
    const bgGrad = ctx.createRadialGradient(
      state.width / 2, state.height / 2, 80,
      state.width / 2, state.height / 2, Math.max(state.width, state.height) * 0.85
    );
    bgGrad.addColorStop(0, '#0c122c');
    bgGrad.addColorStop(0.55, '#050817');
    bgGrad.addColorStop(1, '#010207');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawNebulaClouds(time) {
    const t = time * 0.0006;
    const clusters = [
      { x: -320, y: -140, r: 380, color: 'rgba(0, 242, 254, 0.055)' },
      { x: 320, y: -80, r: 420, color: 'rgba(179, 136, 255, 0.065)' },
      { x: 0, y: 280, r: 350, color: 'rgba(255, 209, 102, 0.048)' }
    ];

    clusters.forEach((c, idx) => {
      const pulse = Math.sin(t + idx * 2) * 20;
      const radius = c.r + pulse;
      const grad = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, radius);
      grad.addColorStop(0, c.color);
      grad.addColorStop(0.65, c.color.replace(/0\.\d+\)/, '0.02)'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawDustParticles(time) {
    const t = time * 0.001;
    ctx.save();
    for (let p of state.dustParticles) {
      const alpha = p.alpha * (0.6 + 0.4 * Math.sin(t * p.speed * 40 + p.phase));
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLinks(time) {
    const hasFocus = state.selectedNode || state.hoveredNode;
    ctx.save();

    state.links.forEach((link, idx) => {
      const s = link.source;
      const t = link.target;
      if (!s || !t || typeof s.x !== 'number' || typeof t.x !== 'number') return;

      const isConnected = state.connectedLinkIds.has(idx) ||
        (state.selectedNode && (s.id === state.selectedNode.id || t.id === state.selectedNode.id)) ||
        (state.hoveredNode && (s.id === state.hoveredNode.id || t.id === state.hoveredNode.id));

      let alpha = 0.22;
      let lineWidth = 1.0;

      if (hasFocus) {
        if (isConnected) {
          alpha = 0.85;
          lineWidth = 2.4;
        } else {
          alpha = 0.05;
        }
      }

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);

      if (isConnected) {
        // Gradient stroke between nodes
        const grad = ctx.createLinearGradient(s.x, s.y, t.x, t.y);
        grad.addColorStop(0, s.color || '#00f2fe');
        grad.addColorStop(1, t.color || '#b388ff');
        ctx.strokeStyle = grad;
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = s.color || '#00f2fe';
        ctx.shadowBlur = 8;
      } else {
        ctx.strokeStyle = link.color || 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 0;
      }

      ctx.stroke();
    });

    // Draw active photons along highlighted links
    if (hasFocus && state.connectedLinkIds.size > 0) {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00f2fe';
      ctx.fillStyle = '#ffffff';

      state.photons.forEach(photon => {
        const link = state.links[photon.linkIndex];
        if (link && state.connectedLinkIds.has(photon.linkIndex)) {
          photon.progress += photon.speed;
          if (photon.progress > 1) photon.progress = 0;

          const s = link.source;
          const t = link.target;
          if (s && t && typeof s.x === 'number') {
            const px = s.x + (t.x - s.x) * photon.progress;
            const py = s.y + (t.y - s.y) * photon.progress;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    ctx.restore();
  }

  function drawNodes(time) {
    const t = time * 0.002;
    const hasFocus = state.selectedNode || state.hoveredNode;
    const hasFilter = state.currentFilter !== 'all';
    const hasSearch = state.searchMatches.size > 0;

    state.nodes.forEach(node => {
      if (typeof node.x !== 'number') return;

      const isSelected = state.selectedNode && state.selectedNode.id === node.id;
      const isHovered = state.hoveredNode && state.hoveredNode.id === node.id;
      const isConnected = state.connectedNodeIds.has(node.id);
      const isSearchHit = state.searchMatches.has(node.id);
      const isFilterMatch = !hasFilter || (node.cluster === state.currentFilter);

      let alpha = 1.0;
      if (hasSearch) {
        alpha = isSearchHit ? 1.0 : 0.12;
      } else if (hasFilter && !isFilterMatch) {
        alpha = 0.12;
      } else if (hasFocus) {
        alpha = (isSelected || isHovered || isConnected) ? 1.0 : 0.16;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      const radius = node.size || 16;
      const pulse = node.isHub ? Math.sin(t + node.x * 0.05) * 2.5 : 0;
      const effectiveRadius = radius + pulse;

      // 1. Draw Multi-layer Outer Glow Halo
      const haloRadius = effectiveRadius * (isSelected || isHovered ? 2.8 : 2.0);
      const haloGrad = ctx.createRadialGradient(
        node.x, node.y, effectiveRadius * 0.4,
        node.x, node.y, haloRadius
      );
      haloGrad.addColorStop(0, node.color || '#00f2fe');
      haloGrad.addColorStop(0.5, (node.color || '#00f2fe') + '33');
      haloGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw Core Stellar Sphere
      const coreGrad = ctx.createRadialGradient(
        node.x - effectiveRadius * 0.3, node.y - effectiveRadius * 0.3, 1,
        node.x, node.y, effectiveRadius
      );
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, node.color || '#00f2fe');
      coreGrad.addColorStop(1, '#080d21');

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, effectiveRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Highlight Border / Hub Orbit Rings
      if (isSelected || isHovered || isSearchHit) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isSelected ? 2.5 : 1.8;
        ctx.shadowColor = node.color || '#00f2fe';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(node.x, node.y, effectiveRadius + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (node.isHub) {
        ctx.strokeStyle = (node.color || '#00f2fe') + '77';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, effectiveRadius + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. Draw Star Label when zoomed in or focused
      const showLabel = state.transform.k > 0.65 || isSelected || isHovered || isSearchHit || node.isHub;
      if (showLabel && alpha > 0.3) {
        ctx.font = `${node.isHub ? 'bold 12px' : '11px'} -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Text glow / outline
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#050814';
        ctx.strokeText(node.name, node.x, node.y + effectiveRadius + 5);

        ctx.fillStyle = isSelected || isHovered ? '#00f2fe' : (node.isHub ? '#ffffff' : '#e2e8f0');
        ctx.fillText(node.name, node.x, node.y + effectiveRadius + 5);
      }

      ctx.restore();
    });
  }

  // --- Interaction & Coordinate Mapping ---
  function getCanvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const graphX = (mouseX - state.transform.x) / state.transform.k;
    const graphY = (mouseY - state.transform.y) / state.transform.k;
    return { mouseX, mouseY, graphX, graphY };
  }

  function findNodeAt(graphX, graphY) {
    // Search in reverse order (top nodes first)
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const node = state.nodes[i];
      if (typeof node.x !== 'number') continue;
      const dx = graphX - node.x;
      const dy = graphY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = (node.size || 16) + 8;
      if (dist <= hitRadius) {
        return node;
      }
    }
    return null;
  }

  function updateConnectedNeighborhood(node) {
    state.connectedNodeIds.clear();
    state.connectedLinkIds.clear();

    if (!node) return;

    state.connectedNodeIds.add(node.id);
    state.links.forEach((link, idx) => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sId === node.id) {
        state.connectedNodeIds.add(tId);
        state.connectedLinkIds.add(idx);
      } else if (tId === node.id) {
        state.connectedNodeIds.add(sId);
        state.connectedLinkIds.add(idx);
      }
    });
  }

  // --- Tooltip & Detail Drawer Display ---
  function showHudTooltip(node, mouseX, mouseY) {
    if (!node || state.selectedNode) {
      hudTooltip.style.display = 'none';
      return;
    }

    const hudType = document.getElementById('hud-type');
    const hudDot = document.getElementById('hud-dot');
    const hudTitle = document.getElementById('hud-title');
    const hudDesc = document.getElementById('hud-desc');
    const hudLinks = document.getElementById('hud-links-count');

    hudType.textContent = (node.type || 'STAR').toUpperCase();
    hudDot.style.background = node.color || '#00f2fe';
    hudDot.style.boxShadow = `0 0 8px ${node.color || '#00f2fe'}`;
    hudTitle.textContent = node.name;
    hudDesc.textContent = node.description || '项目核心资产节点';

    const connCount = state.links.filter(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      return s === node.id || t === node.id;
    }).length;
    hudLinks.textContent = `${connCount} 条引力共振连线`;

    // Tooltip positioning
    let posX = mouseX + 16;
    let posY = mouseY + 16;
    if (posX + 280 > state.width) posX = mouseX - 280;
    if (posY + 160 > state.height) posY = mouseY - 160;

    hudTooltip.style.left = `${posX}px`;
    hudTooltip.style.top = `${posY}px`;
    hudTooltip.style.display = 'block';
  }

  function hideHudTooltip() {
    hudTooltip.style.display = 'none';
  }

  function openDetailDrawer(node) {
    if (!node) return;
    state.selectedNode = node;
    updateConnectedNeighborhood(node);
    hideHudTooltip();

    // Fill Drawer Content
    const typeBadge = document.getElementById('drawer-type-badge');
    const clusterName = document.getElementById('drawer-cluster-name');
    const title = document.getElementById('drawer-title');
    const displayName = document.getElementById('drawer-display-name');
    const path = document.getElementById('drawer-path');
    const desc = document.getElementById('drawer-desc');
    const tagsContainer = document.getElementById('drawer-tags');
    const fileSize = document.getElementById('drawer-file-size');
    const lineCount = document.getElementById('drawer-line-count');
    const linkCount = document.getElementById('drawer-link-count');
    const connList = document.getElementById('drawer-connections-list');
    const connCountBadge = document.getElementById('drawer-connections-count');

    typeBadge.textContent = node.type.toUpperCase();
    typeBadge.style.color = node.color || '#00f2fe';
    typeBadge.style.borderColor = (node.color || '#00f2fe') + '66';

    const clusterObj = state.clusters.get(node.cluster);
    clusterName.textContent = clusterObj ? clusterObj.name : node.category;

    title.textContent = node.name;
    displayName.textContent = node.displayName || node.name;
    path.textContent = node.path;
    desc.textContent = node.description || '无详细描述';

    // Tags
    tagsContainer.innerHTML = '';
    (node.tags || []).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag-badge';
      span.textContent = `#${tag}`;
      tagsContainer.appendChild(span);
    });

    // Metrics
    const meta = node.metadata || {};
    fileSize.textContent = meta.fileSize ? formatBytes(meta.fileSize) : '—';
    lineCount.textContent = meta.lineCount ? `${meta.lineCount} 行` : '—';

    // Connections List
    const connections = [];
    state.links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source : state.nodeMap.get(l.source);
      const t = typeof l.target === 'object' ? l.target : state.nodeMap.get(l.target);
      if (s && t) {
        if (s.id === node.id) {
          connections.push({ targetNode: t, relLabel: l.label, type: l.type });
        } else if (t.id === node.id) {
          connections.push({ targetNode: s, relLabel: l.label, type: l.type });
        }
      }
    });

    connCountBadge.textContent = connections.length;
    linkCount.textContent = `${connections.length} 条`;

    connList.innerHTML = '';
    connections.forEach(conn => {
      const item = document.createElement('div');
      item.className = 'connection-item';
      item.innerHTML = `
        <div class="conn-left">
          <span class="conn-dot" style="background: ${conn.targetNode.color || '#00f2fe'};"></span>
          <span class="conn-name" title="${conn.targetNode.name}">${conn.targetNode.name}</span>
        </div>
        <span class="conn-rel">${conn.relLabel || conn.type}</span>
      `;
      item.addEventListener('click', () => {
        selectNodeById(conn.targetNode.id);
      });
      connList.appendChild(item);
    });

    detailDrawer.classList.add('open');
  }

  function closeDetailDrawer() {
    detailDrawer.classList.remove('open');
    state.selectedNode = null;
    updateConnectedNeighborhood(state.hoveredNode);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- Viewport Navigation & Camera ---
  function zoomAt(factor, centerScreenX, centerScreenY) {
    const cx = centerScreenX !== undefined ? centerScreenX : state.width / 2;
    const cy = centerScreenY !== undefined ? centerScreenY : state.height / 2;

    const oldK = state.transform.k;
    let newK = oldK * factor;
    newK = Math.max(0.15, Math.min(6.0, newK));

    const graphX = (cx - state.transform.x) / oldK;
    const graphY = (cy - state.transform.y) / oldK;

    state.transform.k = newK;
    state.transform.x = cx - graphX * newK;
    state.transform.y = cy - graphY * newK;

    updateZoomDisplay();
  }

  function updateZoomDisplay() {
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(state.transform.k * 100)}%`;
    }
  }

  function transitionTo(targetX, targetY, targetK = 1.0) {
    state.targetTransform = {
      x: state.width / 2 - targetX * targetK,
      y: state.height / 2 - targetY * targetK,
      k: targetK
    };
  }

  function fitAllView() {
    if (!state.nodes.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      if (typeof n.x === 'number') {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
    });

    const padding = 120;
    const graphW = (maxX - minX) + padding * 2;
    const graphH = (maxY - minY) + padding * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const scaleX = state.width / graphW;
    const scaleY = state.height / graphH;
    const targetK = Math.max(0.2, Math.min(1.2, Math.min(scaleX, scaleY)));

    transitionTo(centerX, centerY, targetK);
  }

  function selectNodeById(nodeId) {
    const node = state.nodeMap.get(nodeId);
    if (!node) return;
    openDetailDrawer(node);
    if (typeof node.x === 'number') {
      // Shift slightly to left to accommodate drawer on right
      const offsetX = 120;
      transitionTo(node.x + offsetX, node.y, 1.4);
    }
  }

  function focusCluster(clusterId) {
    const clusterNodes = state.nodes.filter(n => n.cluster === clusterId);
    if (!clusterNodes.length) return;

    let sumX = 0, sumY = 0, count = 0;
    clusterNodes.forEach(n => {
      if (typeof n.x === 'number') {
        sumX += n.x;
        sumY += n.y;
        count++;
      }
    });

    if (count > 0) {
      transitionTo(sumX / count, sumY / count, 1.15);
    }
  }

  // --- Search & Filtering ---
  function handleSearch(query) {
    state.searchQuery = (query || '').trim().toLowerCase();
    state.searchMatches.clear();

    if (!state.searchQuery) {
      searchClearBtn.style.display = 'none';
      searchCount.style.display = 'none';
      return;
    }

    searchClearBtn.style.display = 'block';

    const matches = [];
    state.nodes.forEach(node => {
      const matchName = (node.name || '').toLowerCase().includes(state.searchQuery);
      const matchDisp = (node.displayName || '').toLowerCase().includes(state.searchQuery);
      const matchPath = (node.path || '').toLowerCase().includes(state.searchQuery);
      const matchDesc = (node.description || '').toLowerCase().includes(state.searchQuery);
      const matchTags = (node.tags || []).some(t => t.toLowerCase().includes(state.searchQuery));

      if (matchName || matchDisp || matchPath || matchDesc || matchTags) {
        state.searchMatches.add(node.id);
        matches.push(node);
      }
    });

    searchCount.style.display = 'block';
    searchCount.textContent = `探测到 ${matches.length} 颗星体`;

    // If exact or single match, focus it
    if (matches.length === 1 && typeof matches[0].x === 'number') {
      transitionTo(matches[0].x, matches[0].y, 1.3);
    }
  }

  function setFilter(filterType) {
    state.currentFilter = filterType;
    const buttons = filterPillsContainer.querySelectorAll('.pill');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-filter') === filterType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (filterType !== 'all') {
      focusCluster(filterType);
    } else {
      fitAllView();
    }
  }

  // --- Event Handlers Setup ---
  function setupEvents() {
    // 1. Canvas Pointer & Drag Events
    canvas.addEventListener('mousedown', e => {
      state.isDragging = true;
      state.hasDragged = false;
      state.dragStart.x = e.clientX;
      state.dragStart.y = e.clientY;
    });

    window.addEventListener('mousemove', e => {
      if (state.isDragging) {
        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          state.hasDragged = true;
        }
        state.transform.x += dx;
        state.transform.y += dy;
        state.dragStart.x = e.clientX;
        state.dragStart.y = e.clientY;
      } else {
        // Hover detection
        const coords = getCanvasCoords(e);
        const node = findNodeAt(coords.graphX, coords.graphY);
        if (node !== state.hoveredNode) {
          state.hoveredNode = node;
          if (!state.selectedNode) {
            updateConnectedNeighborhood(node);
          }
          if (node) {
            canvas.style.cursor = 'pointer';
            showHudTooltip(node, coords.mouseX, coords.mouseY);
          } else {
            canvas.style.cursor = 'grab';
            hideHudTooltip();
          }
        } else if (node) {
          showHudTooltip(node, coords.mouseX, coords.mouseY);
        }
      }
    });

    window.addEventListener('mouseup', e => {
      if (!state.isDragging) return;
      state.isDragging = false;

      // Handle Click on Node
      if (!state.hasDragged) {
        const coords = getCanvasCoords(e);
        const clickedNode = findNodeAt(coords.graphX, coords.graphY);
        if (clickedNode) {
          openDetailDrawer(clickedNode);
        } else {
          closeDetailDrawer();
        }
      }
    });

    // 2. Mouse Wheel Zoom
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.88;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      zoomAt(factor, mouseX, mouseY);
    }, { passive: false });

    // 3. Zoom Controls
    btnZoomIn.addEventListener('click', () => zoomAt(1.25));
    btnZoomOut.addEventListener('click', () => zoomAt(0.8));
    btnResetView.addEventListener('click', () => fitAllView());

    // 4. Cluster Focus Buttons
    const clusterBtns = document.querySelectorAll('.ctrl-cluster-btn');
    clusterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const clusterId = btn.getAttribute('data-cluster');
        focusCluster(clusterId);
      });
    });

    // 5. Drawer Close & Copy
    drawerCloseBtn.addEventListener('click', closeDetailDrawer);

    btnCopyPath.addEventListener('click', () => {
      const pathText = document.getElementById('drawer-path').textContent;
      navigator.clipboard.writeText(pathText).then(() => {
        btnCopyPath.textContent = '已复制!';
        setTimeout(() => { btnCopyPath.textContent = '复制'; }, 1500);
      }).catch(() => {
        btnCopyPath.textContent = '复制失败';
      });
    });

    // 6. Search Input
    searchInput.addEventListener('input', e => {
      handleSearch(e.target.value);
    });

    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      handleSearch('');
    });

    // Keyboard Shortcuts (Press '/' to search, 'Escape' to dismiss)
    window.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      } else if (e.key === 'Escape') {
        if (detailDrawer.classList.contains('open')) {
          closeDetailDrawer();
        } else if (searchInput.value) {
          searchInput.value = '';
          handleSearch('');
        }
      }
    });

    // 7. Filter Pills
    filterPillsContainer.addEventListener('click', e => {
      const btn = e.target.closest('.pill');
      if (btn) {
        const filterType = btn.getAttribute('data-filter');
        setFilter(filterType);
      }
    });
  }

  // --- Expose Public API for Programmatic Verification ---
  window.nebulaViewer = {
    selectNodeById: selectNodeById,
    focusCluster: focusCluster,
    setFilter: setFilter,
    search: handleSearch,
    resetView: fitAllView,
    getZoom: () => state.transform.k,
    getStats: () => ({
      nodes: state.nodes.length,
      links: state.links.length,
      clusters: state.clusters.size
    })
  };

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

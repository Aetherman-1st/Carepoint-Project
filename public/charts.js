(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#d62828', '#1d4ed8', '#15803d', '#b45309', '#7c3aed', '#6b7280'];

  function make(tag, attrs) {
    const element = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      element.setAttribute(key, attrs[key]);
    });
    return element;
  }

  function text(svg, x, y, value, attrs) {
    const node = make('text', Object.assign({ x: x, y: y, fill: '#6b7280', 'font-size': 11 }, attrs || {}));
    node.textContent = value;
    svg.appendChild(node);
    return node;
  }

  function normalize(data) {
    return (Array.isArray(data) ? data : []).map(function (item) {
      return {
        label: String(item && item.label != null ? item.label : ''),
        value: Number(item && item.value) || 0,
        color: item && item.color
      };
    });
  }

  function niceMax(value) {
    if (value <= 4) return 4;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / power;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * power;
  }

  function clear(host) {
    if (host) host.innerHTML = '';
  }

  function barChart(host, data, options) {
    if (!host) return;
    const items = normalize(data);
    const settings = options || {};
    const width = 640;
    const height = settings.height || 240;
    const pad = { top: 18, right: 12, bottom: 40, left: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = niceMax(Math.max.apply(null, [1].concat(items.map(function (item) { return item.value; }))));

    clear(host);
    const svg = make('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      role: 'img',
      'aria-label': settings.label || 'Bar chart',
      preserveAspectRatio: 'none'
    });
    svg.classList.add('cp-chart-svg');

    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (plotH / 4) * i;
      const value = Math.round(max - (max / 4) * i);
      svg.appendChild(
        make('line', {
          x1: pad.left,
          y1: y,
          x2: width - pad.right,
          y2: y,
          stroke: '#eef0f2',
          'stroke-width': 1
        })
      );
      text(svg, pad.left - 8, y + 4, String(value), { 'text-anchor': 'end' });
    }

    if (items.length === 0) {
      text(svg, width / 2, height / 2, 'No data yet', {
        'text-anchor': 'middle',
        'font-size': 13,
        fill: '#9ca3af'
      });
      host.appendChild(svg);
      return;
    }

    const slot = plotW / items.length;
    const barW = Math.min(48, slot * 0.56);
    const gap = Math.max(0, slot - barW);

    items.forEach(function (item, index) {
      const barH = max === 0 ? 0 : (item.value / max) * plotH;
      const x = pad.left + slot * index + gap / 2;
      const y = pad.top + plotH - barH;
      const color = item.color || settings.color || PALETTE[0];

      if (barH > 0) {
        const bar = make('rect', {
          x: x,
          y: y,
          width: barW,
          height: barH,
          rx: Math.min(6, barW / 2),
          fill: color
        });
        const title = make('title', {});
        title.textContent = item.label + ': ' + item.value;
        bar.appendChild(title);
        svg.appendChild(bar);
      }

      text(svg, x + barW / 2, pad.top + plotH + 18, item.label, {
        'text-anchor': 'middle',
        'font-size': 11,
        fill: '#6b7280'
      });

      if (item.value > 0) {
        text(svg, x + barW / 2, y - 7, String(item.value), {
          'text-anchor': 'middle',
          'font-size': 11,
          'font-weight': 600,
          fill: '#1f2328'
        });
      }
    });

    host.appendChild(svg);
  }

  function donutChart(host, data, options) {
    if (!host) return;
    const items = normalize(data);
    const settings = options || {};
    const size = settings.size || 210;
    const stroke = settings.stroke || 24;
    const cx = size / 2;
    const cy = size / 2;
    const radius = (size - stroke) / 2 - 2;
    const circumference = 2 * Math.PI * radius;
    const total = items.reduce(function (sum, item) { return sum + item.value; }, 0);

    clear(host);
    const svg = make('svg', {
      viewBox: '0 0 ' + size + ' ' + size,
      role: 'img',
      'aria-label': settings.label || 'Donut chart',
      width: size,
      height: size
    });
    svg.classList.add('cp-donut-svg');

    svg.appendChild(
      make('circle', {
        cx: cx,
        cy: cy,
        r: radius,
        fill: 'none',
        stroke: '#f1f2f4',
        'stroke-width': stroke
      })
    );

    if (total === 0) {
      text(svg, cx, cy - 2, 'No data', {
        'text-anchor': 'middle',
        'font-size': 13,
        fill: '#9ca3af'
      });
    } else {
      let offset = 0;
      items.forEach(function (item, index) {
        if (item.value <= 0) return;
        const portion = item.value / total;
        const length = portion * circumference;
        const color = item.color || PALETTE[index % PALETTE.length];
        const arc = make('circle', {
          cx: cx,
          cy: cy,
          r: radius,
          fill: 'none',
          stroke: color,
          'stroke-width': stroke,
          'stroke-dasharray': length + ' ' + (circumference - length),
          'stroke-dashoffset': -offset,
          'stroke-linecap': items.length > 1 ? 'butt' : 'round',
          transform: 'rotate(-90 ' + cx + ' ' + cy + ')'
        });
        const title = make('title', {});
        title.textContent = item.label + ': ' + item.value;
        arc.appendChild(title);
        svg.appendChild(arc);
        offset += length;
      });

      text(svg, cx, cy - 2, String(total), {
        'text-anchor': 'middle',
        'font-size': 28,
        'font-weight': 600,
        fill: '#1f2328'
      });
      text(svg, cx, cy + 18, settings.centerLabel || 'total', {
        'text-anchor': 'middle',
        'font-size': 11,
        fill: '#6b7280'
      });
    }

    const figure = document.createElement('div');
    figure.className = 'cp-donut';
    figure.appendChild(svg);

    const legend = document.createElement('div');
    legend.className = 'cp-donut-legend';

    items.forEach(function (item, index) {
      const row = document.createElement('div');
      row.className = 'cp-donut-legend-row';
      const dot = document.createElement('span');
      dot.className = 'cp-donut-dot';
      dot.style.background = item.color || PALETTE[index % PALETTE.length];
      const label = document.createElement('span');
      label.className = 'cp-donut-label';
      label.textContent = item.label;
      const value = document.createElement('strong');
      value.textContent = String(item.value);
      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(value);
      legend.appendChild(row);
    });

    figure.appendChild(legend);
    host.appendChild(figure);
  }

  window.CarePointCharts = {
    barChart: barChart,
    donutChart: donutChart
  };
})();

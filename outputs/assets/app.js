(function () {
  "use strict";

  const D = window.DIABETES_DATA;
  const d3 = window.d3;
  if (!D || !d3) return;

  const F = D.meta.features;
  const PRIMARY = D.meta.primary;
  const ROWS = D.rows;
  const ZERO_MISSING = new Set(["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]);
  const COLORS = {
    non: "#2f7d7a",
    teal: "#2f7d7a",
    diag: "#c24f3c",
    red: "#c24f3c",
    fp: "#d99b2b",
    fn: "#704f6b",
    ink: "#24312b",
    soft: "#53625b",
    line: "#b7c4bb",
    gold: "#d99b2b",
    blue: "#3d6e91",
  };
  const SERIES = ["#2f7d7a", "#c24f3c", "#d99b2b", "#3d6e91", "#704f6b", "#5b8c4e", "#c76f33"];
  const fmtInt = d3.format(",");

  function featureIndex(key) {
    return F.indexOf(key);
  }

  function featureLabel(key) {
    return key.replace("DiabetesPedigreeFunction", "Diabetes Pedigree Function");
  }

  function sigmoid(x) {
    if (x >= 0) {
      const z = Math.exp(-x);
      return 1 / (1 + z);
    }
    const z = Math.exp(x);
    return z / (1 + z);
  }

  function showTooltip(html, event) {
    const tip = document.getElementById("tooltip");
    tip.innerHTML = html;
    tip.classList.add("visible");
    const pad = 14;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 16, event.clientX + pad);
    const y = Math.min(window.innerHeight - tip.offsetHeight - 16, event.clientY + pad);
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }

  function hideTooltip() {
    document.getElementById("tooltip").classList.remove("visible");
  }

  function rowSummary(row) {
    return [
      "ID #" + (ROWS.indexOf(row) + 1),
      "Glucose " + row[1].toFixed(0) + " mg/dL",
      "BMI " + row[5].toFixed(1) + " kg/m\u00b2",
      "Age " + row[7].toFixed(0) + " yr",
      "Actual " + (row[8] ? "diabetic" : "non-diabetic"),
      "Predicted prob " + row[9].toFixed(3),
      "Model " + (row[10] ? "diabetic" : "non-diabetic"),
    ].join("<br>");
  }

  function initRail() {
    const sections = Array.from(document.querySelectorAll(".story-section"));
    const rail = document.getElementById("rail");
    const dots = sections.map((section) => {
      const a = document.createElement("a");
      a.href = "#" + section.id;
      a.className = "rail-dot";
      a.title = section.dataset.sectionTitle;
      a.setAttribute("aria-label", section.dataset.sectionTitle);
      rail.appendChild(a);
      return a;
    });

    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = sections.indexOf(entry.target);
          dots.forEach((dot, i) => dot.classList.toggle("active", i === idx));
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
  }

  function initScatterSteps(setScatterMode) {
    const steps = Array.from(document.querySelectorAll("#scatter .step"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          steps.forEach((step) => step.classList.toggle("active", step === entry.target));
          setScatterMode(Number(entry.target.dataset.step));
        });
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: 0 }
    );
    steps.forEach((step) => observer.observe(step));
  }

  function renderFeatureGrid() {
    const grid = document.getElementById("featureGrid");
    PRIMARY.forEach((key, i) => {
      const panel = document.createElement("article");
      panel.className = "panel feature-panel";
      const stat = D.stats.find((s) => s.key === key);
      const valid = ROWS.filter((r) => {
        const v = r[featureIndex(key)];
        return !ZERO_MISSING.has(key) || v > 0;
      }).length;
      panel.innerHTML =
        '<div class="panel-label"><span>' +
        featureLabel(key) +
        "</span><span>" +
        stat.unit +
        " · n=" +
        valid +
        "</span></div><svg viewBox='0 0 340 236'></svg>";
      grid.appendChild(panel);
      drawFeatureHistogram(panel.querySelector("svg"), key, i);
    });
  }

  function drawFeatureHistogram(svgEl, key, colorIdx) {
    const j = featureIndex(key);
    const margin = { top: 14, right: 12, bottom: 34, left: 34 };
    const width = 340 - margin.left - margin.right;
    const height = 236 - margin.top - margin.bottom;
    const color = SERIES[colorIdx % SERIES.length];

    const observed = ROWS.map((r, id) => ({ id, v: r[j], outcome: r[8] })).filter(
      (d) => !ZERO_MISSING.has(key) || d.v > 0
    );
    const min = d3.min(observed, (d) => d.v);
    const max = d3.max(observed, (d) => d.v);
    const x = d3.scaleLinear().domain([min, max]).range([0, width]);
    const binGen = d3
      .bin()
      .domain([min, max])
      .thresholds(Math.min(8, Math.max(4, Math.round(Math.sqrt(observed.length) / 3))))
      .value((d) => d.v);
    const binsAll = binGen(observed);
    const bins0 = binGen(observed.filter((d) => d.outcome === 0));
    const bins1 = binGen(observed.filter((d) => d.outcome === 1));
    const maxCount = d3.max(binsAll, (b) => b.length);
    const y = d3.scaleLinear().domain([0, maxCount]).nice().range([height, 0]);

    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    g.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).ticks(4).tickSize(-width))
      .call((sel) => {
        sel.select(".domain").remove();
        sel.selectAll(".tick line").attr("stroke", COLORS.line).attr("stroke-dasharray", "2 3");
        sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit");
      });

    g.append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x).ticks(4).tickFormat((v) => (v >= 1000 ? v / 1000 + "k" : v)))
      .call((sel) => {
        sel.select(".domain").attr("stroke", COLORS.line);
        sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit");
      });

    g.append("text")
      .attr("x", width / 2)
      .attr("y", height + 25)
      .attr("class", "axis-title")
      .attr("text-anchor", "middle")
      .text(featureLabel(key) + " (" + D.meta.units[key] + ")");

    g.append("text")
      .attr("transform", "rotate(-90 -14 " + height / 2 + ")")
      .attr("x", -height / 2)
      .attr("y", -22)
      .attr("class", "axis-title")
      .attr("text-anchor", "middle")
      .text("women");

    const band = d3.min(binsAll, (b) => (b.x1 - b.x0) / 2);
    binsAll.forEach((bin, idx) => {
      const cx = (x(bin.x0) + x(bin.x1)) / 2;
      const bw = Math.max(1, Math.min(x(bin.x1) - x(bin.x0) - 1, band - 1));
      const c0 = bins0[idx] ? bins0[idx].length : 0;
      const c1 = bins1[idx] ? bins1[idx].length : 0;
      g.append("rect")
        .attr("x", cx - bw / 2)
        .attr("y", y(c0))
        .attr("width", bw / 2 - 0.5)
        .attr("height", Math.max(0, y(0) - y(c0)))
        .attr("fill", COLORS.non)
        .attr("opacity", 0.82);
      g.append("rect")
        .attr("x", cx + 0.5)
        .attr("y", y(c1))
        .attr("width", bw / 2 - 0.5)
        .attr("height", Math.max(0, y(0) - y(c1)))
        .attr("fill", COLORS.diag)
        .attr("opacity", 0.92);
    });

    const stat = D.stats.find((s) => s.key === key);
    g.append("text")
      .attr("x", width)
      .attr("y", 4)
      .attr("text-anchor", "end")
      .attr("class", "axis-title")
      .text("median " + stat.median.toFixed(1));

    if (stat.prevalence_low !== null && stat.prevalence_high !== null) {
      const thresh = {
        Glucose: 126,
        BloodPressure: 80,
        SkinThickness: 40,
        Insulin: 100,
        BMI: 30,
        DiabetesPedigreeFunction: 0.7,
        Age: 40,
      }[key];
      g.append("line")
        .attr("x1", x(thresh))
        .attr("x2", x(thresh))
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", COLORS.gold)
        .attr("stroke-dasharray", "4 3")
        .attr("stroke-width", 1.4);
      g.append("text")
        .attr("x", x(thresh))
        .attr("y", height - 6)
        .attr("text-anchor", thresh > (min + max) / 2 ? "end" : "start")
        .attr("class", "axis-title")
        .text("rate " + stat.prevalence_low + "% / " + stat.prevalence_high + "%");
    }
  }

  function renderCorrelationStrip() {
    const container = document.getElementById("correlationStrip");
    container.style.cssText =
      "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 22px;font-family:var(--mono);font-size:12px;";
    D.correlations.slice(0, 10).forEach((pair) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--line);";
      const label = document.createElement("span");
      label.textContent = pair.a.replace("DiabetesPedigreeFunction", "DPF") + " × " + pair.b.replace("DiabetesPedigreeFunction", "DPF");
      label.style.flex = "1 1 100px";
      const barWrap = document.createElement("span");
      barWrap.style.cssText = "flex:1 1 120px;height:7px;background:var(--line);position:relative;border-radius:2px;overflow:hidden;";
      const bar = document.createElement("i");
      bar.style.cssText = "position:absolute;left:0;top:0;bottom:0;background:" + (pair.r >= 0 ? COLORS.teal : COLORS.red) + ";width:" + Math.min(100, Math.abs(pair.r) * 120) + "%;";
      barWrap.appendChild(bar);
      const val = document.createElement("b");
      val.textContent = pair.r.toFixed(2);
      val.style.cssText = "flex:0 0 34px;text-align:right;";
      row.appendChild(label);
      row.appendChild(barWrap);
      row.appendChild(val);
      container.appendChild(row);
    });
  }

  const scatter = {
    threshold: 0.5,
    mode: 1,
    data: ROWS.map((r, id) => ({
      id,
      glu: r[1],
      bmi: r[5],
      age: r[7],
      outcome: r[8],
      prob: r[9],
      pred: r[10],
    })),
  };

  function renderScatter() {
    const svg = d3.select("#scatterSvg");
    const margin = { top: 26, right: 34, bottom: 46, left: 50 };
    const width = 760 - margin.left - margin.right;
    const height = 620 - margin.top - margin.bottom;
    const x = d3.scaleLinear().domain([0, 200]).range([0, width]);
    const y = d3.scaleLinear().domain([0, 1]).range([height, 0]);
    const g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    g.append("g")
      .call(d3.axisBottom(x).ticks(6).tickFormat((v) => v))
      .call((sel) => {
        sel.select(".domain").attr("stroke", COLORS.line);
        sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit");
      });
    g.append("g")
      .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(".2f")))
      .call((sel) => {
        sel.select(".domain").attr("stroke", COLORS.line);
        sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit");
      });
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height + 34)
      .attr("class", "axis-title")
      .attr("text-anchor", "middle")
      .text("Plasma glucose (mg/dL)");
    g.append("text")
      .attr("transform", "rotate(-90 -18 " + height / 2 + ")")
      .attr("x", -height / 2)
      .attr("y", -36)
      .attr("class", "axis-title")
      .attr("text-anchor", "middle")
      .text("Logistic predicted probability");

    g.selectAll("rect.grid-h")
      .data([0.2, 0.4, 0.6, 0.8])
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", COLORS.line)
      .attr("stroke-dasharray", "2 4")
      .attr("opacity", 0.5);

    const dots = g
      .append("g")
      .selectAll("circle.dot")
      .data(scatter.data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => x(d.glu) + ((d.id % 7) - 3) * 0.8)
      .attr("cy", (d) => y(d.prob))
      .attr("r", 3.4)
      .attr("fill", (d) => (d.outcome ? COLORS.diag : COLORS.non))
      .attr("fill-opacity", 0.72)
      .attr("stroke", (d) => (d.outcome ? COLORS.red : COLORS.teal))
      .attr("stroke-width", 0.4);

    const ringGroup = g.append("g");
    const calloutGroup = g.append("g");

    const pins = [0.3, 0.5, 0.7].map((t) => {
      const pin = g
        .append("g")
        .attr("class", "threshold-pin")
        .attr("opacity", 0);
      pin
        .append("line")
        .attr("class", "pin-line")
        .attr("x1", 0)
        .attr("x2", width + 6)
        .attr("y1", y(t))
        .attr("y2", y(t))
        .attr("stroke", t === 0.5 ? COLORS.gold : COLORS.soft)
        .attr("stroke-width", t === 0.5 ? 2 : 1)
        .attr("stroke-dasharray", t === 0.5 ? "7 4" : "3 4");
      const label = pin
        .append("text")
        .attr("class", "pin-label")
        .attr("x", width + 7)
        .attr("y", y(t) + 3)
        .attr("text-anchor", "end")
        .attr("fill", t === 0.5 ? COLORS.ink : COLORS.soft)
        .attr("font-family", "inherit")
        .attr("font-size", 11)
        .text(t.toFixed(1));
      if (t === 0.5) {
        const handle = pin
          .append("rect")
          .attr("class", "drag-handle")
          .attr("x", width + 1)
          .attr("y", y(t) - 8)
          .attr("width", 12)
          .attr("height", 16)
          .attr("rx", 2)
          .attr("fill", COLORS.gold)
          .attr("stroke", COLORS.ink)
          .style("cursor", "ns-resize");
        handle.call(
          d3
            .drag()
            .on("drag", (event) => {
              scatter.threshold = Math.min(0.8, Math.max(0.2, y.invert(event.y)));
              updateScatter();
            })
        );
      }
      return pin;
    });

    const thresholdNote = g
      .append("g")
      .attr("class", "threshold-note");
    thresholdNote
      .append("rect")
      .attr("x", 8)
      .attr("y", 6)
      .attr("width", 230)
      .attr("height", 42)
      .attr("rx", 3)
      .attr("fill", "rgba(255,254,251,0.9)")
      .attr("stroke", COLORS.line);
    thresholdNote
      .append("text")
      .attr("class", "threshold-counts")
      .attr("x", 16)
      .attr("y", 20)
      .attr("font-family", "inherit")
      .attr("font-size", 11)
      .attr("fill", COLORS.ink);
    thresholdNote
      .append("text")
      .attr("class", "threshold-call")
      .attr("x", 16)
      .attr("y", 38)
      .attr("font-family", "inherit")
      .attr("font-size", 11)
      .attr("fill", COLORS.soft);

    function updateScatter() {
      const t = scatter.threshold;
      const mis = scatter.data.filter((d) => ((d.prob >= t ? 1 : 0) !== d.outcome));
      const rings = ringGroup.selectAll("circle.ring").data(mis, (d) => d.id);
      rings
        .join("circle")
        .attr("class", "ring")
        .attr("cx", (d) => x(d.glu) + ((d.id % 7) - 3) * 0.8)
        .attr("cy", (d) => y(d.prob))
        .attr("r", 6)
        .attr("fill", "none")
        .attr("stroke", (d) => d3.color(d.outcome ? COLORS.red : COLORS.teal).darker(0.4))
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "3 2")
        .attr("opacity", scatter.mode >= 2 ? 0.95 : 0);

      const fp = mis.filter((d) => !d.outcome).sort((a, b) => Math.abs(a.prob - t) - Math.abs(b.prob - t))[0];
      const fn = mis.filter((d) => d.outcome).sort((a, b) => Math.abs(a.prob - t) - Math.abs(b.prob - t))[0];
      calloutGroup.selectAll("*").remove();
      if (scatter.mode >= 2 && fp) {
        drawCallout(fp, "FP", "not diabetic", "pred diabetic", COLORS.fp, x, y);
      }
      if (scatter.mode >= 2 && fn) {
        drawCallout(fn, "FN", "diabetic", "pred not", COLORS.fn, x, y);
      }

      const counts = {
        fp: mis.filter((d) => !d.outcome).length,
        fn: mis.filter((d) => d.outcome).length,
        tp: scatter.data.filter((d) => d.outcome && d.prob >= t).length,
        tn: scatter.data.filter((d) => !d.outcome && d.prob < t).length,
      };
      thresholdNote.select(".threshold-counts").text(
        "At pin " + t.toFixed(2) + ": " + counts.fp + " FP · " + counts.fn + " FN · " + counts.tp + " TP · " + counts.tn + " TN"
      );
      thresholdNote.select(".threshold-call").text(
        t <= 0.35 ? "Lower pin favors catching more diabetic labels." : t >= 0.65 ? "Higher pin favors fewer false positives." : "Balanced trade zone."
      );

      pins.forEach((pin, i) => {
        const val = i === 1 ? t : [0.3, 0.5, 0.7][i];
        pin.select(".pin-line").attr("y1", y(val)).attr("y2", y(val));
        pin.select(".pin-label").attr("y", y(val) + 3).text(val.toFixed(1));
        pin.selectAll(".drag-handle").attr("y", y(t) - 8);
      });
    }

    function drawCallout(d, code, actual, predicted, color, xScale, yScale) {
      const dx = xScale(d.glu) + ((d.id % 7) - 3) * 0.8;
      const dy = yScale(d.prob);
      const right = dx < width * 0.72;
      const labelX = right ? Math.min(width - 8, dx + 24) : Math.max(8, dx - 24);
      const labelY = Math.max(18, Math.min(height - 12, dy + (right ? 8 : -8)));
      calloutGroup
        .append("line")
        .attr("x1", dx)
        .attr("y1", dy)
        .attr("x2", labelX)
        .attr("y2", labelY)
        .attr("stroke", color)
        .attr("stroke-width", 1);
      const bg = calloutGroup
        .append("text")
        .attr("x", labelX)
        .attr("y", labelY + 3)
        .attr("text-anchor", right ? "start" : "end")
        .attr("font-family", "inherit")
        .attr("font-size", 10)
        .attr("fill", color)
        .text(code + " #" + (d.id + 1) + " · glucose " + d.glu.toFixed(0));
      bg.clone()
        .attr("y", labelY + 16)
        .text(actual + " / " + predicted);
    }

    function setMode(mode) {
      scatter.mode = mode;
      svg.selectAll(".threshold-pin").attr("opacity", mode >= 2 ? 1 : 0);
      ringGroup.selectAll("circle").attr("opacity", mode >= 2 ? 0.95 : 0);
      calloutGroup.selectAll("*").attr("opacity", mode >= 2 ? 1 : 0);
      svg.selectAll(".drag-handle").style("pointer-events", mode === 3 ? "auto" : "none");
      if (mode >= 2) updateScatter();
    }

    scatter.svg = svg;
    scatter.update = updateScatter;
    scatter.setMode = setMode;
    updateScatter();
    setMode(1);

    const legend = document.getElementById("scatterLegend");
    legend.innerHTML =
      '<span class="legend-item"><span class="legend-swatch" style="background:' +
      COLORS.non +
      '"></span>actual non-diabetic</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="background:' +
      COLORS.diag +
      '"></span>actual diabetic</span>' +
      '<span class="legend-item"><span class="legend-swatch ring" style="background:transparent"></span>misclassified at active pin</span>' +
      '<span class="legend-item"><span style="color:' +
      COLORS.gold +
      '">◆</span>decision pin, draggable in step 3</span>';

    dots.on("pointerenter", (event, d) => {
      showTooltip(
        "ID #" + (d.id + 1) +
          "<br>Glucose " + d.glu.toFixed(0) + " mg/dL<br>BMI " + d.bmi.toFixed(1) + " kg/m\u00b2<br>Age " + d.age.toFixed(0) + " yr<br>Actual " + (d.outcome ? "diabetic" : "non-diabetic") +
          "<br>Predicted prob " + d.prob.toFixed(3),
        event
      );
    });
    dots.on("pointerleave", hideTooltip);
  }

  function renderTileWall() {
    const svg = d3.select("#tileSvg");
    const cols = 32;
    const rows = Math.ceil(ROWS.length / cols);
    const g = svg.append("g");
    const fateMap = [
      { key: "tn", label: "Non-diabetic", fill: COLORS.non },
      { key: "tp", label: "Diabetic", fill: COLORS.diag },
      { key: "fp", label: "False positive", fill: COLORS.fp },
      { key: "fn", label: "False negative", fill: COLORS.fn },
    ];
    const fate = (r) => {
      if (!r[8] && !r[10]) return "tn";
      if (r[8] && r[10]) return "tp";
      if (!r[8] && r[10]) return "fp";
      return "fn";
    };

    const tiles = g
      .selectAll("g.tile")
      .data(ROWS)
      .enter()
      .append("g")
      .attr("class", "tile")
      .attr("data-fate", fate)
      .attr("transform", (d, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return "translate(" + col * 30 + "," + row * 22 + ")";
      });
    tiles
      .append("rect")
      .attr("x", 1)
      .attr("y", 1)
      .attr("width", 28)
      .attr("height", 20)
      .attr("rx", 1)
      .attr("fill", (d) => fateMap.find((f) => f.key === fate(d)).fill)
      .attr("stroke", "rgba(36,49,43,0.15)")
      .attr("stroke-width", 0.6);
    tiles
      .append("title")
      .text((d, i) => "ID #" + (i + 1) + " " + fateMap.find((f) => f.key === fate(d)).label);
    tiles.on("pointerenter", function (event, d) {
      d3.select(this).select("rect").attr("stroke", COLORS.ink).attr("stroke-width", 1.4);
      showTooltip(rowSummary(d), event);
    });
    tiles.on("pointerleave", function () {
      d3.select(this).select("rect").attr("stroke", "rgba(36,49,43,0.15)").attr("stroke-width", 0.6);
      hideTooltip();
    });

    const c = D.confusion;
    const actions = [
      { key: "all", label: "All", count: ROWS.length, fill: null },
      { key: "tn", label: "Non-diabetic", count: c.tn, fill: COLORS.non },
      { key: "tp", label: "Diabetic", count: c.tp, fill: COLORS.diag },
      { key: "fp", label: "False positive", count: c.fp, fill: COLORS.fp },
      { key: "fn", label: "False negative", count: c.fn, fill: COLORS.fn },
    ];
    const actionWrap = document.getElementById("tileActions");
    actions.forEach((action, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seg-btn";
      btn.dataset.fate = action.key;
      btn.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
      btn.innerHTML = action.label + '<span class="count">' + fmtInt(action.count) + "</span>";
      if (action.fill) btn.style.borderLeftColor = action.fill;
      btn.addEventListener("click", () => {
        actionWrap.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        tiles.attr("opacity", action.key === "all" ? 1 : (d) => (fate(d) === action.key ? 1 : 0.1));
        document.getElementById("tileCount").textContent =
          action.key === "all" ? fmtInt(ROWS.length) + " records" : action.label + " · " + fmtInt(action.count);
      });
      actionWrap.appendChild(btn);
    });
  }

  function renderBins() {
    const grid = document.getElementById("binsGrid");
    const defs = [
      { key: "glucose", title: "Glucose bucket", note: "0 mg/dL treated as unrecorded." },
      { key: "bmi", title: "BMI band", note: "0 kg/m\u00b2 treated as unrecorded." },
      { key: "age", title: "Age decade", note: "Cohort entry is 21+." },
    ];
    defs.forEach((def) => {
      const panel = document.createElement("article");
      panel.className = "panel bins";
      panel.innerHTML = "<h4>" + def.title + '</h4><svg viewBox="0 0 370 340"></svg><p class="note">' + def.note + "</p>";
      grid.appendChild(panel);
      drawBinsPanel(panel.querySelector("svg"), D.bins[def.key]);
    });
  }

  function drawBinsPanel(svgEl, bins) {
    const margin = { top: 12, right: 64, bottom: 40, left: 94 };
    const width = 370 - margin.left - margin.right;
    const height = 340 - margin.top - margin.bottom;
    const maxN = d3.max(bins, (b) => b.n);
    const x = d3.scaleLinear().domain([0, maxN]).range([0, width]);
    const y = d3.scaleBand().domain(bins.map((b) => b.label)).range([0, height]).padding(0.28);
    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    g.append("g")
      .call(d3.axisBottom(x).ticks(4))
      .call((sel) => {
        sel.select(".domain").attr("stroke", COLORS.line);
        sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit").attr("font-size", 10);
      });
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height + 27)
      .attr("class", "axis-title")
      .attr("text-anchor", "middle")
      .text("women");

    bins.forEach((b) => {
      const non = b.n - b.positive;
      const yy = y(b.label);
      g.append("rect")
        .attr("x", 0)
        .attr("y", yy)
        .attr("width", x(non))
        .attr("height", y.bandwidth())
        .attr("fill", COLORS.non)
        .attr("opacity", 0.82);
      g.append("rect")
        .attr("x", x(non))
        .attr("y", yy)
        .attr("width", Math.max(0, x(b.positive)))
        .attr("height", y.bandwidth())
        .attr("fill", COLORS.diag)
        .attr("opacity", 0.94);
      g.append("text")
        .attr("x", -8)
        .attr("y", yy + y.bandwidth() / 2 + 4)
        .attr("text-anchor", "end")
        .attr("font-family", "inherit")
        .attr("font-size", 11)
        .attr("fill", COLORS.ink)
        .text(b.label);
      g.append("text")
        .attr("x", x(b.n) + 6)
        .attr("y", yy + y.bandwidth() / 2 + 4)
        .attr("font-family", "inherit")
        .attr("font-size", 11)
        .attr("fill", b.rate >= 50 ? COLORS.red : COLORS.teal)
        .text(b.rate.toFixed(1) + "%");
      g.append("text")
        .attr("x", x(b.n) + 6)
        .attr("y", yy + y.bandwidth() - 3)
        .attr("font-family", "inherit")
        .attr("font-size", 9)
        .attr("fill", COLORS.soft)
        .text("n=" + b.n);
    });
  }

  function renderIso() {
    const svg = d3.select("#isoSvg");
    const effects = D.effects;
    const positions = [
      [0, 2],
      [1, 1],
      [2, 0],
      [1, 2],
      [2, 1],
      [3, 0],
      [2, 2],
    ];
    const unit = 78;
    const zScale = 340;
    const cos30 = Math.sqrt(3) / 2;
    const iso = (x, y, z) => [(x - y) * cos30 * unit, (x + y) * 0.5 * unit - z * zScale];
    const cx = 470;
    const cy = 332;
    const g = svg.append("g").attr("transform", "translate(" + cx + "," + cy + ")");
    const diamond = (x, y, z, fill, stroke, sw) =>
      g
        .append("polygon")
        .attr("points", [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]
          .map(([a, b]) => iso(x + a, y + b, z).join(","))
          .join(" "))
        .attr("fill", fill)
        .attr("stroke", stroke || "none")
        .attr("stroke-width", sw || 0.5);

    g.append("polygon")
      .attr("points", [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ]
        .map(([a, b]) => iso(a, b, 0).join(","))
        .join(" "))
      .attr("fill", "rgba(47,125,122,0.08)")
      .attr("stroke", COLORS.line);
    for (let i = 0; i <= 3; i++) {
      g.append("line")
        .attr("x1", iso(i, 0, 0)[0])
        .attr("y1", iso(i, 0, 0)[1])
        .attr("x2", iso(i, 3, 0)[0])
        .attr("y2", iso(i, 3, 0)[1])
        .attr("stroke", COLORS.line)
        .attr("stroke-width", 0.6);
      g.append("line")
        .attr("x1", iso(0, i, 0)[0])
        .attr("y1", iso(0, i, 0)[1])
        .attr("x2", iso(3, i, 0)[0])
        .attr("y2", iso(3, i, 0)[1])
        .attr("stroke", COLORS.line)
        .attr("stroke-width", 0.6);
    }

    const baseline = 0.349;
    g.append("polygon")
      .attr("points", [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ]
        .map(([a, b]) => iso(a, b, baseline).join(","))
        .join(" "))
      .attr("fill", "rgba(217,155,43,0.13)")
      .attr("stroke", COLORS.gold)
      .attr("stroke-dasharray", "5 3")
      .attr("stroke-width", 1.2);

    const short = {
      Glucose: "GLU",
      BloodPressure: "BP",
      SkinThickness: "SKN",
      Insulin: "INS",
      BMI: "BMI",
      DiabetesPedigreeFunction: "DPF",
      Age: "AGE",
    };
    const order = effects
      .map((e, i) => ({ e, pos: positions[i], i }))
      .sort((a, b) => b.pos[0] + b.pos[1] - (a.pos[0] + a.pos[1]));

    order.forEach(({ e, pos, i }) => {
      const color = SERIES[i % SERIES.length];
      const c = d3.color(color);
      const p10 = e.prob10;
      const p90 = e.prob90;
      const low = Math.min(p10, p90);
      const high = Math.max(p10, p90);
      const face = (dx, dy, z0, z1, fill) =>
        g
          .append("polygon")
          .attr("points", [iso(pos[0], pos[1], z0), iso(pos[0] + dx, pos[1] + dy, z0), iso(pos[0] + dx, pos[1] + dy, z1), iso(pos[0], pos[1], z1)]
            .map((p) => p.join(","))
            .join(" "))
          .attr("fill", fill)
          .attr("stroke", fill);

      face(1, 0, 0, low, d3.color("#aebbb3").darker(0.15));
      face(0, 1, 0, low, d3.color("#aebbb3").darker(0.25));
      diamond(pos[0], pos[1], low, "#aebbb3", "#7e9187", 0.5);
      if (Math.abs(high - low) > 0.005) {
        face(1, 0, low, high, c.darker(0.32));
        face(0, 1, low, high, c.darker(0.5));
        diamond(pos[0], pos[1], high, c.brighter(0.1), d3.color(color).darker(0.5), 0.8);
        diamond(pos[0], pos[1], low, "#aebbb3", "#7e9187", 0.5);
      }

      const labelPos = iso(pos[0] + 0.5, pos[1] + 0.5, 0);
      g.append("text")
        .attr("x", labelPos[0])
        .attr("y", labelPos[1] + 18)
        .attr("text-anchor", "middle")
        .attr("font-family", "inherit")
        .attr("font-size", 11)
        .attr("font-weight", 700)
        .attr("fill", COLORS.ink)
        .text(short[e.key]);
      g.append("text")
        .attr("x", labelPos[0])
        .attr("y", labelPos[1] + 31)
        .attr("text-anchor", "middle")
        .attr("font-family", "inherit")
        .attr("font-size", 9)
        .attr("fill", COLORS.soft)
        .text((e.delta >= 0 ? "+" : "") + e.delta.toFixed(2));
    });

    const note = svg
      .append("text")
      .attr("x", 30)
      .attr("y", 28)
      .attr("font-family", "inherit")
      .attr("font-size", 11)
      .attr("fill", COLORS.soft)
      .text("Gold plane = cohort prevalence 34.9%. Prisms run from p10 to p90 probability.");

    const legend = document.createElement("div");
    legend.className = "iso-legend";
    legend.innerHTML = effects
      .map((e, i) => {
        const color = SERIES[i % SERIES.length];
        return (
          '<span><i style="background:' +
          color +
          '"></i><b>' +
          featureLabel(e.key) +
          "</b> " +
          e.p10.toFixed(1) +
          " " +
          e.unit +
          " → " +
          e.p90.toFixed(1) +
          " · " +
          (e.delta >= 0 ? "+" : "") +
          e.delta.toFixed(2) +
          " risk</span>"
        );
      })
      .join("");
    document.querySelector("#iso .iso-stage").appendChild(legend);
  }

  function renderThresholdDemo() {
    const model = D.model;
    const demoId = D.demo.id;
    const demoRow = ROWS[demoId];
    let feature = "Glucose";
    let currentValue = demoRow[featureIndex(feature)];

    function modelProb(row, key, value) {
      const z = F.map((f, j) => {
        let v = row[j];
        if (f === key) v = value;
        if (ZERO_MISSING.has(f) && v === 0) v = model.impute[f];
        return (v - model.means[j]) / model.scales[j];
      });
      let lin = model.intercept;
      model.coefs.forEach((coef, j) => (lin += coef * z[j]));
      return sigmoid(lin);
    }

    function quantile(key, q) {
      const vals = ROWS.map((r) => r[featureIndex(key)]).sort((a, b) => a - b);
      const idx = Math.min(vals.length - 1, Math.floor(q * vals.length));
      return vals[idx];
    }

    const svg = d3.select("#demoSvg");
    const margin = { top: 24, right: 30, bottom: 42, left: 50 };
    const width = 760 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    const g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    const xScale = d3.scaleLinear().range([0, width]);
    const yScale = d3.scaleLinear().domain([0, 1]).range([height, 0]);
    const line = d3
      .line()
      .x((d) => xScale(d.v))
      .y((d) => yScale(d.p));
    const path = g.append("path").attr("fill", "none").attr("stroke", COLORS.red).attr("stroke-width", 2);
    const decision = g
      .append("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", yScale(0.5))
      .attr("y2", yScale(0.5))
      .attr("stroke", COLORS.gold)
      .attr("stroke-dasharray", "6 4")
      .attr("stroke-width", 2);
    g.append("text")
      .attr("x", width - 4)
      .attr("y", yScale(0.5) - 6)
      .attr("text-anchor", "end")
      .attr("font-family", "inherit")
      .attr("font-size", 11)
      .attr("fill", COLORS.gold)
      .text("decision 0.50");
    const marker = g.append("circle").attr("r", 7).attr("fill", COLORS.red).attr("stroke", "#fff").attr("stroke-width", 2);
    const markerLine = g.append("line").attr("stroke", COLORS.soft).attr("stroke-dasharray", "2 3");
    const markerLine2 = g.append("line").attr("stroke", COLORS.soft).attr("stroke-dasharray", "2 3");

    const slider = document.getElementById("demoSlider");
    const animateBtn = document.getElementById("demoAnimate");
    const buttons = document.getElementById("demoFeatureButtons");
    PRIMARY.forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seg-btn";
      btn.dataset.feature = key;
      btn.textContent = featureLabel(key).replace("Diabetes Pedigree Function", "DPF");
      btn.setAttribute("aria-pressed", key === feature ? "true" : "false");
      btn.addEventListener("click", () => {
        feature = key;
        buttons.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        setupSlider();
      });
      buttons.appendChild(btn);
    });

    function setupSlider() {
      const lo = quantile(feature, 0.02);
      const hi = quantile(feature, 0.98);
      currentValue = Math.min(hi, Math.max(lo, demoRow[featureIndex(feature)]));
      slider.min = lo;
      slider.max = hi;
      slider.step = feature === "DiabetesPedigreeFunction" ? 0.005 : feature === "BMI" ? 0.1 : 1;
      slider.value = currentValue;
      draw();
    }

    function draw() {
      const lo = quantile(feature, 0.02);
      const hi = quantile(feature, 0.98);
      xScale.domain([lo, hi]);
      const samples = [];
      for (let i = 0; i <= 120; i++) {
        const v = lo + ((hi - lo) * i) / 120;
        samples.push({ v, p: modelProb(demoRow, feature, v) });
      }
      path.datum(samples).attr("d", line);
      currentValue = Number(slider.value);
      const prob = modelProb(demoRow, feature, currentValue);
      marker.attr("cx", xScale(currentValue)).attr("cy", yScale(prob));
      markerLine
        .attr("x1", xScale(currentValue))
        .attr("x2", xScale(currentValue))
        .attr("y1", yScale(prob))
        .attr("y2", yScale(0));
      markerLine2
        .attr("x1", 0)
        .attr("x2", xScale(currentValue))
        .attr("y1", yScale(prob))
        .attr("y2", yScale(prob));
      g.selectAll(".axis-demo").remove();
      g.append("g")
        .attr("class", "axis-demo")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(xScale).ticks(5).tickFormat((v) => (v >= 1000 ? v / 1000 + "k" : v)))
        .call((sel) => {
          sel.select(".domain").attr("stroke", COLORS.line);
          sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit").attr("font-size", 10);
        });
      g.append("g")
        .attr("class", "axis-demo")
        .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".1f")))
        .call((sel) => {
          sel.select(".domain").attr("stroke", COLORS.line);
          sel.selectAll(".tick text").attr("fill", COLORS.soft).attr("font-family", "inherit").attr("font-size", 10);
        });
      g.append("text")
        .attr("class", "axis-demo")
        .attr("x", width / 2)
        .attr("y", height + 31)
        .attr("text-anchor", "middle")
        .attr("fill", COLORS.soft)
        .attr("font-family", "inherit")
        .attr("font-size", 11)
        .text(featureLabel(feature) + " (" + D.meta.units[feature] + ")");
      g.append("text")
        .attr("class", "axis-demo")
        .attr("transform", "rotate(-90 -16 " + height / 2 + ")")
        .attr("x", -height / 2)
        .attr("y", -38)
        .attr("text-anchor", "middle")
        .attr("fill", COLORS.soft)
        .attr("font-family", "inherit")
        .attr("font-size", 11)
        .text("predicted probability");

      document.getElementById("demoSliderLabel").textContent = featureLabel(feature);
      document.getElementById("demoValue").textContent = currentValue.toFixed(feature === "DiabetesPedigreeFunction" ? 3 : feature === "BMI" ? 1 : 0) + " " + D.meta.units[feature];
      document.getElementById("demoFeatureValue").textContent = currentValue.toFixed(feature === "DiabetesPedigreeFunction" ? 3 : feature === "BMI" ? 1 : 0);
      document.getElementById("demoOutcome").textContent = demoRow[8] ? "Diabetic" : "Non-diabetic";
      document.getElementById("demoProb").textContent = prob.toFixed(3);
      document.getElementById("demoCall").textContent = prob >= 0.5 ? "Diabetic" : "Non-diabetic";
      document.getElementById("demoRecordLabel").textContent = "Record #" + (demoId + 1);
      const cross = findCross(feature, lo, hi, currentValue);
      const status = document.getElementById("demoStatus");
      if (cross === null) {
        status.innerHTML =
          "<b>No crossing in this window.</b><br>For record #" +
          (demoId + 1) +
          ", changing " +
          featureLabel(feature).toLowerCase() +
          " from " +
          lo.toFixed(1) +
          " to " +
          hi.toFixed(1) +
          " " +
          D.meta.units[feature] +
          " never flips the 0.50 call.";
        animateBtn.disabled = true;
      } else {
        const direction = cross > currentValue ? "raise" : "lower";
        status.innerHTML =
          "<b>Cross at " +
          cross.toFixed(feature === "DiabetesPedigreeFunction" ? 3 : 1) +
          " " +
          D.meta.units[feature] +
          ".</b><br>For record #" +
          (demoId + 1) +
          ", " +
          direction +
          " this field from " +
          currentValue.toFixed(1) +
          " to " +
          cross.toFixed(1) +
          " moves predicted probability across the line.";
        animateBtn.disabled = false;
        animateBtn.dataset.target = cross;
      }
    }

    function findCross(key, lo, hi, from) {
      const pLo = modelProb(demoRow, key, lo);
      const pHi = modelProb(demoRow, key, hi);
      if (pLo >= 0.5 && pHi >= 0.5) return pLo >= 0.5 ? lo : hi;
      if (pLo < 0.5 && pHi < 0.5) return null;
      let a = lo;
      let b = hi;
      const target = pLo < 0.5 ? 0.5 : -0.5;
      for (let i = 0; i < 60; i++) {
        const mid = (a + b) / 2;
        const p = modelProb(demoRow, key, mid);
        if ((p - 0.5) * target > 0) a = mid;
        else b = mid;
      }
      return (a + b) / 2;
    }

    slider.addEventListener("input", () => {
      currentValue = Number(slider.value);
      draw();
    });
    animateBtn.addEventListener("click", () => {
      const target = Number(animateBtn.dataset.target);
      if (!Number.isFinite(target)) return;
      const start = Number(slider.value);
      const t0 = performance.now();
      const duration = 1100;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      function frame(now) {
        const k = Math.min(1, (now - t0) / duration);
        slider.value = start + (target - start) * ease(k);
        currentValue = Number(slider.value);
        draw();
        if (k < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    setupSlider();
  }

  function renderBenchmark() {
    const body = document.getElementById("benchmarkBody");
    const metrics = ["accuracy", "precision", "recall", "auc"];
    const best = {};
    metrics.forEach((m) => (best[m] = d3.max(D.benchmark, (b) => b[m])));
    D.benchmark.forEach((model) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = model.name;
      tr.appendChild(th);
      metrics.forEach((m) => {
        const td = document.createElement("td");
        td.className = "metric-cell";
        td.innerHTML =
          '<div class="metric-bar"><i style="width:' +
          Math.round(model[m] * 100) +
          '%"></i></div><span class="' +
          (model[m] === best[m] ? "best" : "") +
          '">' +
          model[m].toFixed(3) +
          "</span>";
        tr.appendChild(td);
      });
      const trainTd = document.createElement("td");
      trainTd.textContent = model.train_accuracy.toFixed(3);
      tr.appendChild(trainTd);
      body.appendChild(tr);
    });
    const maxGap = d3.max(D.benchmark, (b) => b.train_accuracy - b.accuracy);
    const gapModel = D.benchmark.find((b) => b.train_accuracy - b.accuracy === maxGap);
    document.getElementById("benchmarkNote").textContent =
      "Protocol: 8 features (including Pregnancies) are model inputs; the seven headline panels omit Pregnancies for editorial focus. 5-fold stratified CV, median imputation for zero-as-missing values, standardization fit inside each fold, default 0.5 threshold. Largest train-to-CV accuracy gap: " +
      gapModel.name +
      " at " +
      maxGap.toFixed(3) +
      ". Metrics are benchmark summaries, not a clinical recommendation.";
  }

  function renderGauges() {
    const grid = document.getElementById("gaugeGrid");
    const defs = [
      {
        title: "Glucose",
        unit: "mg/dL",
        min: 0,
        max: 200,
        mean: 120.9,
        note: "Cohort mean 120.9 mg/dL · <100 normal · 100-125 IFG · >=126 diabetes range",
        zones: [
          { from: 0, to: 100, label: "normal", color: COLORS.non },
          { from: 100, to: 126, label: "IFG", color: COLORS.gold },
          { from: 126, to: 200, label: "diabetes", color: COLORS.diag },
        ],
      },
      {
        title: "BMI",
        unit: "kg/m\u00b2",
        min: 10,
        max: 70,
        mean: 32.0,
        note: "Cohort mean 32.0 kg/m\u00b2 · healthy 18.5-24.9 · overweight 25-29.9 · obese >=30",
        zones: [
          { from: 10, to: 18.5, label: "under", color: COLORS.blue },
          { from: 18.5, to: 25, label: "healthy", color: COLORS.non },
          { from: 25, to: 30, label: "over", color: COLORS.gold },
          { from: 30, to: 70, label: "obese", color: COLORS.diag },
        ],
      },
      {
        title: "Age",
        unit: "years",
        min: 20,
        max: 85,
        mean: 33.2,
        note: "Cohort mean 33.2 yr · cohort entry 21+ · ADA screening age 35 · higher-risk 45+",
        zones: [
          { from: 20, to: 35, label: "21+ cohort", color: COLORS.blue },
          { from: 35, to: 45, label: "screening", color: COLORS.gold },
          { from: 45, to: 65, label: "higher risk", color: COLORS.red },
          { from: 65, to: 85, label: "older", color: COLORS.fn },
        ],
      },
    ];

    defs.forEach((def) => {
      const panel = document.createElement("article");
      panel.className = "gauge";
      panel.innerHTML =
        "<h4>" +
        def.title +
        '</h4><svg viewBox="0 0 280 280" role="img" aria-label="' +
        def.title +
        ' gauge"></svg><div class="gauge-note">' +
        def.note +
        "</div>";
      grid.appendChild(panel);
      drawGauge(panel.querySelector("svg"), def);
    });
  }

  function drawGauge(svgEl, def) {
    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("transform", "translate(140,145)");
    const angle = (t) => -Math.PI * 0.85 + t * Math.PI * 1.7;
    const arc = d3
      .arc()
      .innerRadius(72)
      .outerRadius(92)
      .startAngle((d) => angle(d.from))
      .endAngle((d) => angle(d.to))
      .padAngle(0.012);
    g.selectAll("path.zone")
      .data(def.zones)
      .enter()
      .append("path")
      .attr("class", "zone")
      .attr("d", (d) => arc({ from: (d.from - def.min) / (def.max - def.min), to: (d.to - def.min) / (def.max - def.min) }))
      .attr("fill", (d) => d.color)
      .attr("opacity", 0.9)
      .attr("stroke", "#fff");

    const ticks = [0, 0.25, 0.5, 0.75, 1];
    g.selectAll("line.tick")
      .data(ticks)
      .enter()
      .append("line")
      .attr("x1", (d) => 96 * Math.cos(angle(d)))
      .attr("y1", (d) => 96 * Math.sin(angle(d)))
      .attr("x2", (d) => 104 * Math.cos(angle(d)))
      .attr("y2", (d) => 104 * Math.sin(angle(d)))
      .attr("stroke", COLORS.ink)
      .attr("stroke-width", 1);
    g.selectAll("text.tick")
      .data(ticks)
      .enter()
      .append("text")
      .attr("x", (d) => 108 * Math.cos(angle(d)))
      .attr("y", (d) => 108 * Math.sin(angle(d)) + 4)
      .attr("text-anchor", "middle")
      .attr("font-family", "inherit")
      .attr("font-size", 10)
      .attr("fill", COLORS.soft)
      .text((d) => Math.round(def.min + d * (def.max - def.min)));

    const t = (def.mean - def.min) / (def.max - def.min);
    const needX = 86 * Math.cos(angle(t));
    const needY = 86 * Math.sin(angle(t));
    g.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", needX)
      .attr("y2", needY)
      .attr("stroke", COLORS.ink)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    g.append("circle").attr("r", 5).attr("fill", COLORS.ink);
    g.append("text")
      .attr("y", -112)
      .attr("text-anchor", "middle")
      .attr("font-family", "inherit")
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .attr("fill", COLORS.ink)
      .text(def.mean.toFixed(1) + " " + def.unit);
  }

  function renderSignals() {
    const c = D.confusion;
    const t03 = D.thresholds.find((t) => t.threshold === 0.3);
    const t07 = D.thresholds.find((t) => t.threshold === 0.7);
    const maxGapRow = D.benchmark.reduce((a, b) => (b.train_accuracy - b.accuracy > a.train_accuracy - a.accuracy ? b : a));
    const zeroStat = (key) => D.stats.find((s) => s.key === key).zeros;
    const signals = [
      {
        title: "Class imbalance",
        tag: "watch",
        level: "warn",
        stats: ["500 non-diabetic", "268 diabetic", "34.9% positive"],
        threshold: "Watch when the minority class falls below ~20% or when accuracy can be inflated by predicting the majority class.",
        falsifier: "Reporting accuracy alone on an imbalanced file; a 65% all-negative model would look 'good'.",
      },
      {
        title: "Feature correlation",
        tag: "r",
        level: "warn",
        stats: D.correlations.slice(0, 4).map((p) => p.a.replace("DiabetesPedigreeFunction", "DPF") + "×" + p.b.replace("DiabetesPedigreeFunction", "DPF") + " " + p.r.toFixed(2)),
        threshold: "Above |r| > 0.7, treat coefficient attribution with suspicion; this file stays below that line, but correlations still shape trees and coefficients.",
        falsifier: "Calling a correlated predictor an independent cause because its model coefficient is nonzero.",
      },
      {
        title: "Decision-threshold sensitivity",
        tag: "0.3 / 0.7",
        level: "danger",
        stats: ["0.3 recall " + t03.recall.toFixed(2), "0.7 recall " + t07.recall.toFixed(2), "FN " + t03.fn + " vs " + t07.fn],
        threshold: "Watch how many false negatives move as the threshold changes; no threshold is fixed by the data.",
        falsifier: "Choosing one threshold on the full dataset, then pretending it was model-free.",
      },
      {
        title: "Data leakage",
        tag: "high",
        level: "danger",
        stats: ["Single-encounter rows", "No temporal split", "Outcome in same file"],
        threshold: "Any feature measured after the outcome, or any preprocessing done outside train folds, is leakage.",
        falsifier: "Using all 768 rows to select features or thresholds before measuring cross-validation.",
      },
      {
        title: "Population shift",
        tag: "1980s",
        level: "warn",
        stats: ["Glucose mean 120.9", "BMI mean 32.0", "Age mean 33.2"],
        threshold: "Deployment cohorts whose glucose/BMI/age distributions differ by more than ~1 SD need revalidation.",
        falsifier: "Assuming one decision curve transfers from 1980s Pima women to another population.",
      },
      {
        title: "Missing-value handling",
        tag: "zeros",
        level: "danger",
        stats: ["Insulin 0s " + zeroStat("Insulin"), "Skin 0s " + zeroStat("SkinThickness"), "BP 0s " + zeroStat("BloodPressure"), "Glucose 0s " + zeroStat("Glucose")],
        threshold: "With >10% zero-as-missing, imputation assumptions must be explicit; insulin (48.7%) and skin thickness (29.6%) exceed that line.",
        falsifier: "Deleting every zero row, or treating 0 as a measured physiological value.",
      },
      {
        title: "Overfitting gap",
        tag: "gap",
        level: "warn",
        stats: [
          "Best train acc " + maxGapRow.train_accuracy.toFixed(2),
          "CV acc " + maxGapRow.accuracy.toFixed(2),
          "Gap " + (maxGapRow.train_accuracy - maxGapRow.accuracy).toFixed(2),
        ],
        threshold: "A train-to-CV accuracy gap above ~0.10 means the model is memorizing the file.",
        falsifier: "Judging a model by training accuracy or by the best fold.",
      },
      {
        title: "Vintage / representativeness",
        tag: "1980s",
        level: "warn",
        stats: ["n = 768 women", "Age 21+", "No HbA1c", "No lipids"],
        threshold: "Claims stop at this cohort: 1980s adult Pima Indian women with glucose, BP, skin, insulin, BMI, pedigree, and age only.",
        falsifier: "Presenting the scorecard as a general diabetes screening product.",
      },
    ];

    const grid = document.getElementById("signalGrid");
    signals.forEach((signal) => {
      const card = document.createElement("article");
      card.className = "signal-card " + signal.level;
      card.innerHTML =
        '<div class="signal-top"><h3>' +
        signal.title +
        '</h3><span class="signal-tag">' +
        signal.tag +
        "</span></div>" +
        '<div class="signal-stat">' +
        signal.stats.map((s) => "<span>" + s + "</span>").join("") +
        '</div><p class="threshold">' +
        signal.threshold +
        '</p><p class="falsifier">' +
        signal.falsifier +
        "</p>";
      grid.appendChild(card);
    });
  }

  initRail();
  renderFeatureGrid();
  renderCorrelationStrip();
  renderScatter();
  initScatterSteps(scatter.setMode);
  renderTileWall();
  renderBins();
  renderIso();
  renderThresholdDemo();
  renderBenchmark();
  renderGauges();
  renderSignals();
})();
